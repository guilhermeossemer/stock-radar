const BINANCE_BASE = "https://api.binance.com/api/v3";

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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Binance returned ${res.status}`);
  }

  return res.json();
}

async function fetchBinanceKlines(symbol, interval, limit = 200) {
  const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) {
    throw new Error("Dados de candle inválidos");
  }
  return parseKlines(data);
}

async function fetchBinanceTicker(symbol) {
  const url = `${BINANCE_BASE}/ticker/24hr?symbol=${symbol}`;
  const data = await fetchJson(url);
  if (!data || typeof data.lastPrice === "undefined") {
    throw new Error("Dados de ticker inválidos");
  }
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
  const [fourHour, oneHour, tickerDetails] = await Promise.all([
    fetchBinanceKlines(symbol, "4h", 120),
    fetchBinanceKlines(symbol, "1h", 240),
    fetchBinanceTicker(symbol),
  ]);

  const currentPrice = parseFloat(tickerDetails.lastPrice);
  const prevClose = parseFloat(tickerDetails.prevClosePrice ?? tickerDetails.lastPrice);
  const dayChange = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  return {
    ticker: symbol,
    longName: `${symbol} (Binance)`,
    currentPrice,
    dayChange,
    candles4H: fourHour,
    candles1H: oneHour,
    currencySymbol: "$",
  };
}
