const BINANCE_BASE = "https://api.binance.com/api/v3";
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;

const _quoteCache = new Map();
const _klinesCache = new Map();
const _tickerCache = new Map();
const _queue = [];
let _activeRequests = 0;
const MAX_CONCURRENCY = 1;
const MIN_DELAY_MS = 700;

function enqueueRequest(fn) {
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  if (_activeRequests >= MAX_CONCURRENCY) return;
  const item = _queue.shift();
  if (!item) return;
  _activeRequests++;
  Promise.resolve()
    .then(() => item.fn())
    .then((r) => {
      setTimeout(() => {
        _activeRequests--;
        processQueue();
      }, MIN_DELAY_MS);
      item.resolve(r);
    })
    .catch((err) => {
      setTimeout(() => {
        _activeRequests--;
        processQueue();
      }, MIN_DELAY_MS);
      item.reject(err);
    });
}

function formatTicker(ticker) {
  if (!ticker || typeof ticker !== "string") {
    throw new Error("Ticker inválido");
  }
  const symbol = ticker.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6,12}$/.test(symbol)) {
    throw new Error("Ticker de cripto inválido");
  }
  return symbol;
}

function parseKlines(rows) {
  return rows.map((row) => ({
    date: new Date(row[0]).toISOString(),
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[5]),
  }));
}

function cacheGet(cache, key, ttlMs) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function cacheSet(cache, key, data) {
  cache.set(key, { ts: Date.now(), data });
}

async function fetchJson(url) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        'X-MBX-APIKEY': process.env.BINANCE_API_KEY,
      },
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      try {
        return await res.json();
      } catch (err) {
        throw new Error("JSON parse error from Binance");
      }
    }

    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
      const wait = res.status === 429 ? 1000 * attempt * attempt : 300 * attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    throw new Error(`Binance returned ${res.status}`);
  }
}

function limitedFetchJson(url) {
  return enqueueRequest(() => fetchJson(url));
}

async function fetchBinanceKlines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}:klines:${interval}`;
  const cached = cacheGet(_klinesCache, cacheKey, 1000 * 60);
  if (cached) return cached;

  const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const data = await limitedFetchJson(url);
  if (!Array.isArray(data)) {
    throw new Error("Dados de candle inválidos");
  }

  const parsed = parseKlines(data);
  cacheSet(_klinesCache, cacheKey, parsed);
  return parsed;
}

async function fetchBinanceTicker(symbol) {
  const cacheKey = `${symbol}:ticker`;
  const cached = cacheGet(_tickerCache, cacheKey, 1000 * 60);
  if (cached) return cached;

  const url = `${BINANCE_BASE}/ticker/24hr?symbol=${symbol}`;
  const data = await limitedFetchJson(url);
  if (!data || typeof data.lastPrice === "undefined") {
    throw new Error("Dados de ticker inválidos");
  }

  cacheSet(_tickerCache, cacheKey, data);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Método não permitido" });
  }

  const ticker = Array.isArray(req.query.ticker) ? req.query.ticker[0] : req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ success: false, error: "Parâmetro ticker é obrigatório" });
  }

  if (!BINANCE_API_KEY) {
    console.error("[api/cryptoQuote] BINANCE_API_KEY is not configured");
    return res.status(500).json({ success: false, error: "Binance API key não configurada" });
  }

  try {
    const data = await fetchCryptoQuoteData(ticker);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[api/cryptoQuote]", error);
    return res.status(500).json({ success: false, error: error.message || "Erro interno" });
  }
}

export async function fetchCryptoQuoteData(ticker) {
  const symbol = formatTicker(ticker);
  const cacheKey = `quote:${symbol}`;
  const cachedQuote = cacheGet(_quoteCache, cacheKey, 1000 * 60);
  if (cachedQuote) return cachedQuote;

  try {
    const [fourHour, oneHour, tickerDetails] = await Promise.all([
      fetchBinanceKlines(symbol, "4h", 120),
      fetchBinanceKlines(symbol, "1h", 240),
      fetchBinanceTicker(symbol),
    ]);

    const currentPrice = parseFloat(tickerDetails.lastPrice);
    const prevClose = parseFloat(tickerDetails.prevClosePrice ?? tickerDetails.lastPrice);
    const dayChange = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    const result = {
      ticker: symbol,
      longName: `${symbol} (Binance)`,
      currentPrice,
      dayChange,
      candles4H: fourHour,
      candles1H: oneHour,
      currencySymbol: "$",
    };

    cacheSet(_quoteCache, cacheKey, result);
    return result;
  } catch (error) {
    if (cachedQuote) {
      console.warn(`[api/cryptoQuote] Binance fetch failed for ${symbol}, returning cached quote`);
      return cachedQuote;
    }
    throw error;
  }
}
