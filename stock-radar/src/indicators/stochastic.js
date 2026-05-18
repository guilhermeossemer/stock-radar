export function calcStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  if (closes.length < kPeriod) return null;
  const ks = [];
  for (let i = kPeriod - 1; i < closes.length; i += 1) {
    const windowHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    const windowLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    ks.push(windowHigh === windowLow ? 50 : ((closes[i] - windowLow) / (windowHigh - windowLow)) * 100);
  }
  if (ks.length < dPeriod) return null;
  const ds = [];
  for (let i = dPeriod - 1; i < ks.length; i += 1) {
    ds.push(ks.slice(i - dPeriod + 1, i + 1).reduce((sum, value) => sum + value, 0) / dPeriod);
  }
  return { k: ks.at(-1), d: ds.at(-1) };
}
