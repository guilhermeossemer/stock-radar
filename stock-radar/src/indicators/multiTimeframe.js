import { calcEMA } from "./ema.js";
import { calcRSI } from "./rsi.js";

const MIN_LOOKBACK = 30;

function isAscending(values) {
  return values.slice(1).every((value, index) => value >= values[index]);
}

function isDescending(values) {
  return values.slice(1).every((value, index) => value <= values[index]);
}

function near(value, target, maxPct = 0.04) {
  if (!value || !target) return false;
  return Math.abs(value - target) / Math.abs(target) <= maxPct;
}

function last(array) {
  return array[array.length - 1];
}

export function classifyDaily(candles) {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const ema20 = calcEMA(closes, 20).at(-1);
  const ema50 = calcEMA(closes, 50).at(-1);
  const ema100 = calcEMA(closes, 100).at(-1);
  const price = last(closes);
  const recentHighs = highs.slice(-MIN_LOOKBACK);
  const recentLows = lows.slice(-MIN_LOOKBACK);
  const higherHighs = isAscending(recentHighs);
  const higherLows = isAscending(recentLows);
  const lowerHighs = isDescending(recentHighs);
  const lowerLows = isDescending(recentLows);

  let status = "neutral";
  if (ema20 && ema50 && ema100 && ema20 > ema50 && ema50 > ema100 && price > ema20 && higherHighs && higherLows) {
    status = "bullish";
  } else if (ema20 && ema50 && ema100 && ema20 < ema50 && ema50 < ema100 && price < ema50 && lowerHighs && lowerLows) {
    status = "bearish";
  }

  return {
    status,
    ema20,
    ema50,
    ema100,
    price,
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
  };
}

export function classify4H(candles, dailyStatus) {
  if (!candles || candles.length < 20) {
    return { status: "neutral" };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const ema20 = calcEMA(closes, 20).at(-1);
  const ema50 = calcEMA(closes, 50).at(-1);
  const ema100 = calcEMA(closes, 100).at(-1);
  const price = last(closes);
  const rsi = calcRSI(closes);

  const priceNearEma20 = near(price, ema20, 0.05);
  const priceNearEma50 = near(price, ema50, 0.05);
  const aboveEma100 = ema100 ? price > ema100 : true;
  const emaPreserved = ema50 && ema100 ? ema50 >= ema100 : true;
  const structureIntact = aboveEma100 && emaPreserved;

  const recent = candles.slice(-8);
  const recentHighs = recent.map((c) => c.high);
  const recentLows = recent.map((c) => c.low);
  const fallingHighs = recentHighs.slice(1).every((value, index) => value <= recentHighs[index]);
  const fallingLows = recentLows.slice(1).every((value, index) => value <= recentLows[index]);

  const avgVolume = volumes.slice(-20).reduce((sum, value) => sum + value, 0) / Math.min(20, volumes.length);
  const relativeVolume = avgVolume ? volumes.at(-1) / avgVolume : 1;
  const volumeRising = volumes.length > 2 ? volumes.at(-1) > volumes.at(-2) : false;

  const downCandles = candles.slice(-5).slice(1).filter((item, index, array) => item.close < candles.slice(-5)[index].close).length;
  const strongBearishCount = candles.slice(-5).slice(1).filter((item, index) => {
    const prev = candles.slice(-5)[index];
    const body = Math.abs(item.close - item.open);
    const range = item.high - item.low || 1;
    return item.close < prev.close && body > range * 0.5;
  }).length;
  const strongDownSequence = strongBearishCount >= 2 && volumeRising;
  const supportBreak = ema100 ? price < ema100 : false;
  const structuralWeakness = supportBreak || (fallingHighs && fallingLows && strongDownSequence);

  const moderatePullback = price > ema100 && (priceNearEma20 || priceNearEma50);
  const healthyPullback =
    dailyStatus === "bullish" &&
    emaPreserved &&
    price > ema100 &&
    moderatePullback &&
    rsi != null && rsi >= 30 && rsi <= 70 &&
    !strongDownSequence;

  let status = "neutral";
  if (healthyPullback) {
    status = "healthy_pullback";
  } else if (structuralWeakness) {
    status = "extended";
  } else if (!structureIntact && price < ema50 && (fallingHighs || fallingLows || strongDownSequence)) {
    status = "weak";
  }

  return {
    status,
    price,
    ema20,
    ema50,
    ema100,
    rsi,
    structureIntact,
    emaPreserved,
    fallingHighs,
    fallingLows,
    relativeVolume,
    volumeRising,
    priceNearEma20,
    priceNearEma50,
    strongDownSequence,
    supportBreak,
  };
}

export function classify1H(candles) {
  if (!candles || candles.length < 5) {
    return { status: "neutral" };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const opens = candles.map((c) => c.open);
  const volumes = candles.map((c) => c.volume);
  const ema20 = calcEMA(closes, 20).at(-1);
  const price = last(closes);
  const previous = candles.at(-2);
  const lastCandle = candles.at(-1);
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const range = lastCandle.high - lastCandle.low || 1;
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  const avgVolume = volumes.slice(-20).reduce((sum, value) => sum + value, 0) / Math.min(20, volumes.length);
  const relativeVolume = avgVolume ? lastCandle.volume / avgVolume : 1;
  const bullishCandle = lastCandle.close > lastCandle.open;
  const breakout = previous ? lastCandle.close > previous.high : false;
  const rejection = !bullishCandle && upperWick > body * 1.5;
  const supportLoss = previous ? lastCandle.close < previous.low : false;
  const recentCloses = closes.slice(-4);
  const strongDownSequence =
    recentCloses.length === 4 &&
    recentCloses[1] < recentCloses[0] &&
    recentCloses[2] < recentCloses[1] &&
    recentCloses[3] < recentCloses[2];
  const strongBearishCandle =
    !bullishCandle &&
    body > range * 0.5 &&
    previous &&
    lastCandle.close < previous.close;

  let status = "neutral";
  if (bullishCandle && price > ema20 && breakout && relativeVolume > 1.0) {
    status = "confirmed";
  } else if (bullishCandle && price > ema20 && relativeVolume >= 0.8) {
    status = "weak_confirmation";
  } else if (rejection || supportLoss || strongDownSequence || strongBearishCandle) {
    status = "rejected";
  }

  return {
    status,
    price,
    ema20,
    relativeVolume,
    breakout,
    rejection,
    supportLoss,
    bullishCandle,
  };
}

export function analyzeMultiTimeframe(dailyCandles, fourHourCandles, oneHourCandles) {
  const daily = classifyDaily(dailyCandles);
  const fourHour = classify4H(fourHourCandles, daily.status);
  const oneHour = classify1H(oneHourCandles);
  const aligned = daily.status === "bullish" && fourHour.status === "healthy_pullback" && oneHour.status === "confirmed";

  return {
    daily,
    fourHour,
    oneHour,
    aligned,
  };
}
