const BYBIT_BASE = "https://api.bybit.com/v5/market";
const _quoteCache = new Map();
const _klinesCache = new Map();

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

function formatTicker(ticker) {
  if (!ticker || typeof ticker !== "string") {
    throw new Error("Ticker inválido");
  }
  let symbol = ticker.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{3,}$/.test(symbol)) {
    throw new Error("Ticker de cripto inválido");
  }
  // Remove USDT se já estiver no final e adiciona novamente
  symbol = symbol.replace(/USDT$/, "");
  return symbol + "USDT";
}

function parseKlinesBybit(rows) {
  // Formato Bybit: [timestamp, open, high, low, close, volume, quoteAssetVolume]
  return rows.map((row) => ({
    date: new Date(parseInt(row[0])).toISOString(),
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[5]),
  }));
}

async function fetchJson(url) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.retCode === 0 || json.retCode === "0") {
          return json.result;
        }
        throw new Error(`Bybit API error: ${json.retMsg || "unknown"}`);
      }

      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        const wait = res.status === 429 ? 1000 * attempt * attempt : 300 * attempt;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      throw new Error(`Bybit returned ${res.status}`);
    } catch (err) {
      if (attempt < maxAttempts && (err.message.includes("429") || err.message.includes("500"))) {
        const wait = 500 * attempt;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

async function fetchBybitKlines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}:klines:${interval}`;
  const cached = cacheGet(_klinesCache, cacheKey, 1000 * 60);
  if (cached) return cached;

  const intervalMap = { "4h": "240", "1h": "60" };
  const bybitInterval = intervalMap[interval] || interval;
  const url = `${BYBIT_BASE}/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`;
  
  const data = await fetchJson(url);
  if (!data || !data.list || !Array.isArray(data.list)) {
    throw new Error("Dados de candle inválidos");
  }

  const parsed = parseKlinesBybit(data.list.reverse()); // Bybit retorna invertido
  cacheSet(_klinesCache, cacheKey, parsed);
  return parsed;
}

async function fetchBybitTicker(symbol) {
  const url = `${BYBIT_BASE}/tickers?category=spot&symbol=${symbol}`;
  const data = await fetchJson(url);
  if (!data || !data.list || !data.list[0]) {
    throw new Error("Dados de ticker inválidos");
  }
  return data.list[0];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Método não permitido" });
  }

  const ticker = Array.isArray(req.query.ticker) ? req.query.ticker[0] : req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ success: false, error: "Parâmetro ticker é obrigatório" });
  }

  try {
    const data = await fetchCryptoQuoteData(ticker);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[api/cryptoQuote]", error.message);
    return res.status(500).json({ success: false, error: error.message || "Erro interno" });
  }
}

export async function fetchCryptoQuoteData(ticker) {
  const symbol = formatTicker(ticker);
  const cacheKey = `quote:${symbol}`;
  const cachedQuote = cacheGet(_quoteCache, cacheKey, 1000 * 60);
  if (cachedQuote) return cachedQuote;

  try {
    const [fourHourData, oneHourData, tickerDetails] = await Promise.all([
      fetchBybitKlines(symbol, "4h", 120),
      fetchBybitKlines(symbol, "1h", 240),
      fetchBybitTicker(symbol),
    ]);

    if (!fourHourData || fourHourData.length === 0 || !oneHourData || oneHourData.length === 0) {
      if (cachedQuote) {
        console.warn(`[api/cryptoQuote] Empty candles for ${symbol}, using cached quote`);
        return cachedQuote;
      }
      throw new Error("Dados de candles indisponíveis");
    }

    const lastPrice = parseFloat(tickerDetails.lastPrice);
    const prevClose = parseFloat(tickerDetails.prevPrice24h ?? lastPrice);
    const dayChange = prevClose ? ((lastPrice - prevClose) / prevClose) * 100 : 0;

    const result = {
      ticker: symbol,
      longName: `${symbol} (Bybit)`,
      currentPrice: lastPrice,
      dayChange,
      candles4H: fourHourData,
      candles1H: oneHourData,
      currencySymbol: "$",
    };

    cacheSet(_quoteCache, cacheKey, result);
    return result;
  } catch (error) {
    console.error(`[api/cryptoQuote] Bybit error for ${symbol}:`, error.message);
    const expired = _quoteCache.get(cacheKey);
    if (expired && expired.data) {
      console.warn(`[api/cryptoQuote] Returning stale cached quote for ${symbol}`);
      return expired.data;
    }
    throw error;
  }
}
