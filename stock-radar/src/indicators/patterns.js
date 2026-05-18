export function detectPatterns(candles) {
  const last = candles.at(-1);
  const prev = candles.at(-2);
  const before = candles.at(-3);
  if (!last || !prev) return { names: [], bullish: false, compression: false };

  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const prevBody = Math.abs(prev.close - prev.open);

  const isHammer = last.close > last.open && lowerWick > body * 1.8 && upperWick < body * 0.7;
  const isBullishEngulfing =
    prev.close < prev.open &&
    last.close > last.open &&
    last.close > prev.open &&
    last.open < prev.close;
  const isInsideBar =
    prev.high > last.high && prev.low < last.low &&
    body <= prevBody * 0.7;
  const isBullishRejection =
    last.close > last.open &&
    lowerWick > body * 1.5 &&
    upperWick < body * 0.8;
  const recentRanges = candles.slice(-10).map((c) => c.high - c.low);
  const avgRange = recentRanges.reduce((sum, value) => sum + value, 0) / recentRanges.length;
  const compact = candles.slice(-5).every((c) => c.high - c.low < avgRange * 0.85);

  const names = [];
  if (isHammer) names.push("Martelo");
  if (isBullishEngulfing) names.push("Engolfo de alta");
  if (isInsideBar) names.push("Inside bar");
  if (isBullishRejection) names.push("Rejeição bullish");
  if (compact) names.push("Compressão");

  return {
    names,
    bullish: isHammer || isBullishEngulfing || isBullishRejection,
    confirmation: isHammer || isBullishEngulfing || isBullishRejection,
    compression: compact,
  };
}
