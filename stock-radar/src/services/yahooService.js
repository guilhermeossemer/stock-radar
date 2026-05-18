const YF_URL = (symbol, interval, range) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;

const PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
  (url) => url,
];

export async function fetchWithFallback(rawUrl) {
  for (const makeProxy of PROXIES) {
    const proxyUrl = makeProxy(rawUrl);
    try {
      const res = await fetch(proxyUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.trim().startsWith("<!")) continue;
      const json = JSON.parse(text);
      if (json?.chart?.result?.[0]) return json;
    } catch (_) {
      // tenta próximo proxy
    }
  }
  throw new Error("Todos os proxies falharam");
}

function parseCandles(result) {
  const q = result.indicators?.quote?.[0] || {};
  const ts = result.timestamp || [];
  const closes = q.close || [];
  const highs = q.high || [];
  const lows = q.low || [];
  const opens = q.open || [];
  const volumes = q.volume || [];
  const candles = [];

  for (let i = 0; i < closes.length; i++) {
    if (closes[i] != null && highs[i] != null && lows[i] != null) {
      candles.push({
        date: new Date(ts[i] * 1000),
        open: opens[i] ?? closes[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i] ?? 0,
      });
    }
  }

  return candles;
}

export async function fetchQuote(ticker) {
  const symbol = ticker.toUpperCase().endsWith(".SA") ? ticker : `${ticker}.SA`;
  const dailyJson = await fetchWithFallback(YF_URL(symbol, "1d", "6mo"));
  const [fourHourResult, oneHourResult] = await Promise.allSettled([
    fetchWithFallback(YF_URL(symbol, "4h", "3mo")),
    fetchWithFallback(YF_URL(symbol, "1h", "1mo")),
  ]);

  const dailyResult = dailyJson.chart.result[0];
  const dailyCandles = parseCandles(dailyResult);
  const candles4H = fourHourResult.status === "fulfilled" ? parseCandles(fourHourResult.value.chart.result[0]) : [];
  const candles1H = oneHourResult.status === "fulfilled" ? parseCandles(oneHourResult.value.chart.result[0]) : [];

  if (dailyCandles.length < 20) throw new Error("Histórico insuficiente");

  const meta = dailyResult.meta || {};
  const currentPrice = meta.regularMarketPrice ?? dailyCandles.at(-1).close;
  const prevClose =
    meta.previousClose ?? meta.chartPreviousClose ?? dailyCandles.at(-2)?.close ?? currentPrice;
  const dayChange = ((currentPrice - prevClose) / prevClose) * 100;

  return {
    ticker,
    longName: meta.longName || meta.shortName || ticker,
    currentPrice,
    dayChange,
    candles: dailyCandles,
    candles4H,
    candles1H,
  };
}
