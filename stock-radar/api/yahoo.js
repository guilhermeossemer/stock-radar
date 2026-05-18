const YF_URL = (symbol, interval, range) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;

function normalizeTicker(ticker) {
  if (!ticker || typeof ticker !== 'string') {
    throw new Error('Ticker inválido');
  }
  const upper = ticker.toUpperCase().trim();
  return upper.endsWith('.SA') ? upper : `${upper}.SA`;
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
        date: new Date(ts[i] * 1000).toISOString(),
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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance returned ${res.status}`);
  }

  const json = await res.json();
  if (!json || !json.chart || !json.chart.result || !json.chart.result[0]) {
    throw new Error('Yahoo Finance retornou dados inválidos');
  }

  return json;
}

export async function fetchYahooHistory(ticker, interval = '1d', range = '6mo') {
  const symbol = normalizeTicker(ticker);
  const json = await fetchJson(YF_URL(symbol, interval, range));
  const result = json.chart.result[0];
  const candles = parseCandles(result);
  return {
    ticker,
    interval,
    range,
    candles,
    meta: result.meta || {},
  };
}

export async function fetchQuoteData(ticker) {
  const daily = await fetchYahooHistory(ticker, '1d', '6mo');
  const [fourHour, oneHour] = await Promise.allSettled([
    fetchYahooHistory(ticker, '4h', '3mo'),
    fetchYahooHistory(ticker, '1h', '1mo'),
  ]);

  if (!daily.candles || daily.candles.length < 20) {
    throw new Error('Histórico insuficiente');
  }

  const currentPrice = daily.meta.regularMarketPrice ?? daily.candles.at(-1)?.close;
  const prevClose =
    daily.meta.previousClose ?? daily.meta.chartPreviousClose ?? daily.candles.at(-2)?.close ?? currentPrice;
  const dayChange = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  return {
    ticker,
    longName: daily.meta.longName || daily.meta.shortName || ticker,
    currentPrice,
    dayChange,
    candles: daily.candles,
    candles4H: fourHour.status === 'fulfilled' ? fourHour.value.candles : [],
    candles1H: oneHour.status === 'fulfilled' ? oneHour.value.candles : [],
  };
}
