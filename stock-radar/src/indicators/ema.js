export function calcEMA(prices, period) {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const out = [ema];
  for (let i = period; i < prices.length; i += 1) {
    ema = prices[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

export function emaDistance(price, ema) {
  if (!ema || ema <= 0) return null;
  return ((price - ema) / ema) * 100;
}
