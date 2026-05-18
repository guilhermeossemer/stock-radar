export function analyzeCandlePatterns(candles) {
  const last = candles.at(-1);
  const prev = candles.at(-2);
  const prev2 = candles.at(-3);
  if (!last || !prev) return { names: [], bullish: false, bearish: false, confirmed: false, rejected: false, insideBreakout: false };

  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low || 1;
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const prevBody = Math.abs(prev.close - prev.open);
  const isBullish = last.close > last.open;

  const isHammer = isBullish && lowerWick > body * 1.8 && upperWick < body * 0.7;
  const isInvertedHammer = isBullish && upperWick > body * 1.8 && lowerWick < body * 0.7;
  const isBullishEngulfing =
    prev && prev.close < prev.open &&
    last.close > last.open &&
    last.close > prev.open &&
    last.open < prev.close;
  const isBearishEngulfing =
    prev && prev.close > prev.open &&
    last.close < last.open &&
    last.open > prev.close &&
    last.close < prev.open;
  const isMorningStar =
    prev2 &&
    prev2.close < prev2.open &&
    Math.abs(prev.close - prev.open) < (Math.abs(prev2.close - prev2.open) * 0.5) &&
    isBullish &&
    last.close > prev2.close;
  const isHarami =
    prev &&
    Math.abs(last.close - last.open) < Math.abs(prev.close - prev.open) &&
    last.high < prev.high &&
    last.low > prev.low;
  const isStrongCandle = isBullish && body > range * 0.6;
  const isRejection =
    !isBullish && upperWick > body * 1.5 && upperWick > lowerWick;
  const isInsideBar =
    prev2 &&
    prev.high < prev2.high &&
    prev.low > prev2.low &&
    last.close > prev.high;
  const isSupportRejection =
    isBullish && lowerWick > body * 1.5 && last.close > prev?.low;

  const names = [];
  if (isHammer) names.push("Martelo");
  if (isInvertedHammer) names.push("Martelo invertido");
  if (isBullishEngulfing) names.push("Engolfo de alta");
  if (isBearishEngulfing) names.push("Engolfo de baixa");
  if (isMorningStar) names.push("Morning star");
  if (isHarami) names.push("Harami");
  if (isStrongCandle) names.push("Candle de força");
  if (isSupportRejection) names.push("Rejeição de suporte");
  if (isInsideBar) names.push("Inside bar");

  const confirmed = isBullishEngulfing || isHammer || isSupportRejection || isStrongCandle || isMorningStar || isInsideBar;
  const rejected = isRejection || isBearishEngulfing;

  return {
    names,
    bullish: isBullish,
    bearish: !isBullish,
    confirmed,
    rejected,
    insideBreakout: isInsideBar,
    hammer: isHammer,
    invertedHammer: isInvertedHammer,
    bullishEngulfing: isBullishEngulfing,
    bearishEngulfing: isBearishEngulfing,
    supportRejection: isSupportRejection,
    strongCandle: isStrongCandle,
  };
}
