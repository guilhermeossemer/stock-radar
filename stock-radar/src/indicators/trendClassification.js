import { calcEMA } from "./ema.js";

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isSlopePositive(values) {
  if (values.length < 2) return false;
  return values.at(-1) > values[0] && values.at(-1) - values[0] > values[0] * 0.01;
}

export function classifyTrend(candles) {
  const closes = candles.map((c) => c.close);
  const ema20 = calcEMA(closes, 20).at(-1);
  const ema50 = calcEMA(closes, 50).at(-1);
  const ema100 = calcEMA(closes, 100).at(-1);
  const ema20_10 = calcEMA(closes.slice(0, -10), 20).at(-1);
  const ema50_10 = calcEMA(closes.slice(0, -10), 50).at(-1);

  const price = closes.at(-1);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const recentHighs = highs.slice(-30);
  const recentLows = lows.slice(-30);

  const higherHighs = recentHighs.slice(1).every((value, index) => value >= recentHighs[index]);
  const higherLows = recentLows.slice(1).every((value, index) => value >= recentLows[index]);
  const lowerHighs = recentHighs.slice(1).every((value, index) => value <= recentHighs[index]);
  const lowerLows = recentLows.slice(1).every((value, index) => value <= recentLows[index]);

  let context = "TRANSITION";
  if (ema20 && ema50 && ema100 && ema20 > ema50 && ema50 > ema100 && price > ema50 && higherHighs && higherLows) {
    context = "TREND_UP";
  } else if (ema20 && ema50 && ema100 && ema20 < ema50 && ema50 < ema100 && price < ema50 && lowerHighs && lowerLows) {
    context = "TREND_DOWN";
  } else if (
    ema20 && ema50 && ema100 &&
    Math.abs(ema20 - ema50) / ema50 < 0.015 &&
    Math.abs(ema50 - ema100) / ema100 < 0.015 &&
    !higherHighs && !lowerLows
  ) {
    context = "RANGE";
  }

  const slopeUp = isSlopePositive(ema20_10 && ema20 ? [ema20_10, ema20] : [price, price]);
  const slopeDown = !slopeUp;

  return {
    context,
    ema20,
    ema50,
    ema100,
    slopeUp,
    slopeDown,
  };
}
