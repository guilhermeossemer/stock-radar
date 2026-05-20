import Binance from 'binance-api-node';

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
  const symbol = ticker.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6,12}$/.test(symbol)) {
    throw new Error("Ticker de cripto inválido");
  }
  return symbol;
}

function parseKlines(rows) {
  return rows.map((candle) => ({
    date: new Date(candle.openTime).toISOString(),
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume),
  }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Método não permitido" });
  }

  const ticker = Array.isArray(req.query.ticker) ? req.query.ticker[0] : req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ success: false, error: "Parâmetro ticker é obrigatório" });
  }

  if (!process.env.BINANCE_API_KEY) {
    console.error("[api/cryptoQuote] BINANCE_API_KEY is not configured");
    return res.status(500).json({ success: false, error: "Binance API key não configurada" });
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
    const client = Binance({
      apiKey: process.env.BINANCE_API_KEY,
      apiSecret: '', // não usamos secret para leitura de dados públicos
    });

    // Fetch candles para 4H e 1H
    const [fourHourData, oneHourData, tickerInfo] = await Promise.all([
      client.candles({ symbol, interval: '4h', limit: 120 }),
      client.candles({ symbol, interval: '1h', limit: 240 }),
      client.allBookTickers().then(tickers => tickers.find(t => t.symbol === symbol)),
    ]);

    // Se candles vazios, tenta usar cache antigo
    if (!fourHourData || fourHourData.length === 0 || !oneHourData || oneHourData.length === 0) {
      if (cachedQuote) {
        console.warn(`[api/cryptoQuote] Empty candles for ${symbol}, using cached quote`);
        return cachedQuote;
      }
      throw new Error('Dados de candles indisponíveis');
    }

    const fourHour = parseKlines(fourHourData);
    const oneHour = parseKlines(oneHourData);

    // Extrair preço atual do último candle 1H e calcular dayChange
    const lastPrice = parseFloat(oneHour[oneHour.length - 1].close);
    
    // Calcular dayChange: comparar com preço de ~24h atrás (máx 24 velas de 1h)
    let prevPrice = lastPrice;
    if (oneHour.length >= 24) {
      prevPrice = parseFloat(oneHour[oneHour.length - 24].open);
    } else if (oneHour.length > 1) {
      prevPrice = parseFloat(oneHour[0].open);
    }
    const dayChange = prevPrice ? ((lastPrice - prevPrice) / prevPrice) * 100 : 0;

    const result = {
      ticker: symbol,
      longName: `${symbol} (Binance)`,
      currentPrice: lastPrice,
      dayChange,
      candles4H: fourHour,
      candles1H: oneHour,
      currencySymbol: "$",
    };

    cacheSet(_quoteCache, cacheKey, result);
    return result;
  } catch (error) {
    console.error(`[api/cryptoQuote] SDK error for ${symbol}:`, error.message);
    // Tenta retornar cache mesmo que expirado
    const expired = _quoteCache.get(cacheKey);
    if (expired && expired.data) {
      console.warn(`[api/cryptoQuote] Returning stale cached quote for ${symbol}`);
      return expired.data;
    }
    throw error;
  }
}
