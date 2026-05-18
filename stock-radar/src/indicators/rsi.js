export function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = prices[i] - prices[i - 1];
    if (delta > 0) gain += delta;
    else loss -= delta;
  }
  gain /= period;
  loss /= period;

  for (let i = period + 1; i < prices.length; i += 1) {
    const delta = prices[i] - prices[i - 1];
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
  }

  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}
