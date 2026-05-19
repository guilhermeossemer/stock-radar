import { calcEMA, emaDistance } from "../indicators/ema.js";
import { calcRSI } from "../indicators/rsi.js";
import { calcStochastic } from "../indicators/stochastic.js";
import { calcFibonacci } from "../indicators/fibonacci.js";
import { volumeConfirmation } from "../indicators/volume.js";
import { analyzeCandlePatterns } from "../indicators/candles.js";
import { explainAnalysis } from "./explanationEngine.js";
import { getSupportResistanceZones } from "./supportResistance.js";

function formatScore(value) {
  return Math.min(Math.max(Math.round(value), 0), 10);
}

function last(array) {
  return array?.length ? array[array.length - 1] : null;
}

function isAscending(values) {
  return values.length > 1 && values.slice(1).every((value, index) => value >= values[index]);
}

function isDescending(values) {
  return values.length > 1 && values.slice(1).every((value, index) => value <= values[index]);
}

function classifyCrypto4H(candles) {
  if (!candles || candles.length < 20) {
    return {
      status: "neutral",
      ema20: null,
      ema50: null,
      ema100: null,
      price: null,
      rsi: null,
      relativeVolume: 1,
      structureIntact: false,
      priceAbove20: false,
      priceAbove50: false,
      priceAbove100: false,
    };
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

  const priceAbove20 = ema20 != null ? price > ema20 : false;
  const priceAbove50 = ema50 != null ? price > ema50 : false;
  const priceAbove100 = ema100 != null ? price > ema100 : false;
  const emaPreserved = ema20 && ema50 && ema100 ? ema20 > ema50 && ema50 > ema100 : false;
  const structureIntact = priceAbove100 && emaPreserved;

  const recent = candles.slice(-8);
  const recentHighs = recent.map((c) => c.high);
  const recentLows = recent.map((c) => c.low);
  const higherHighs = isAscending(recentHighs);
  const higherLows = isAscending(recentLows);
  const fallingHighs = isDescending(recentHighs);
  const fallingLows = isDescending(recentLows);

  const avgVolume = volumes.slice(-20).reduce((sum, value) => sum + value, 0) / Math.min(20, volumes.length);
  const relativeVolume = avgVolume ? volumes.at(-1) / avgVolume : 1;

  const strongBearishSequence =
    recentLows.length === 4 &&
    recentLows[1] < recentLows[0] &&
    recentLows[2] < recentLows[1] &&
    recentLows[3] < recentLows[2] &&
    candles.slice(-4).every((c) => c.close < c.open && Math.abs(c.close - c.open) > (c.high - c.low) * 0.35);

  const moderatePullback =
    priceAbove100 &&
    emaPreserved &&
    price > ema100 &&
    rsi != null &&
    rsi >= 30 &&
    rsi <= 70;

  const correctivePriceAction =
    !strongBearishSequence &&
    !(fallingHighs && fallingLows) &&
    (higherHighs || higherLows || priceAbove50);

  const healthyPullback = moderatePullback && correctivePriceAction;
  const bearishConfirmed =
    fallingHighs &&
    fallingLows &&
    price < ema100 &&
    relativeVolume < 0.95;

  const structuralWeakness =
    strongBearishSequence ||
    bearishConfirmed ||
    (!priceAbove100 && !emaPreserved && price < ema100) ||
    (fallingHighs && fallingLows && relativeVolume < 0.75);

  let status = "neutral";
  if (healthyPullback) {
    status = "healthy_pullback";
  } else if (structureIntact && higherHighs && higherLows) {
    status = "bullish";
  } else if (structuralWeakness) {
    status = "extended";
  }

  return {
    status,
    price,
    ema20,
    ema50,
    ema100,
    rsi,
    relativeVolume,
    structureIntact,
    priceAbove20,
    priceAbove50,
    priceAbove100,
    healthyPullback,
    fallingHighs,
    fallingLows,
    strongBearishSequence,
    bearishConfirmed,
    emaPreserved,
  };
}

function classifyCrypto1H(candles) {
  if (!candles || candles.length < 5) {
    return {
      status: "neutral",
      price: null,
      ema20: null,
      relativeVolume: 1,
    };
  }

  const closes = candles.map((c) => c.close);
  const opens = candles.map((c) => c.open);
  const highs = candles.map((c) => c.high);
  const volumes = candles.map((c) => c.volume);
  const ema20 = calcEMA(closes, 20).at(-1);
  const price = last(closes);
  const previous = candles.at(-2);
  const lastCandle = candles.at(-1);
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const range = Math.max(lastCandle.high - lastCandle.low, 1);
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
    recentCloses[3] < recentCloses[2] &&
    body > range * 0.35;
  const strongBearishCandle =
    !bullishCandle &&
    body > range * 0.5 &&
    previous &&
    lastCandle.close < previous.close;

  const bearishAcceleration = supportLoss || strongDownSequence || strongBearishCandle;

  let status = "neutral";
  if (bullishCandle && price > ema20 && breakout && relativeVolume > 0.8) {
    status = "confirmed";
  } else if (bullishCandle && price > ema20 && relativeVolume >= 0.65) {
    status = "weak_confirmation";
  } else if (bearishAcceleration) {
    status = "rejected";
  } else if (rejection) {
    status = "weak_rejection";
  }

  return {
    status,
    price,
    ema20,
    relativeVolume,
    breakout,
    rejection,
    supportLoss,
    bearishAcceleration,
    strongDownSequence,
    strongBearishCandle,
    bullishCandle,
  };
}

export function analyzeCrypto(raw) {
  const fourHour = raw.candles4H || [];
  const oneHour = raw.candles1H || [];
  const trend = classifyCrypto4H(fourHour);
  const mtfOneHour = classifyCrypto1H(oneHour);
  const fib = calcFibonacci(fourHour) || {};
  const volume = volumeConfirmation(fourHour);
  const candleSignals = analyzeCandlePatterns(fourHour);
  const candleSignals1H = analyzeCandlePatterns(oneHour.slice(-10));
  const sr = getSupportResistanceZones(fourHour);
  const currentPrice = raw.currentPrice;
  const ema20 = trend.ema20;
  const ema50 = trend.ema50;
  const ema100 = trend.ema100;
  const distanceToEma20 = emaDistance(currentPrice, ema20);

  const overStretched = distanceToEma20 != null && distanceToEma20 > 10;
  const inFibZone = fib.inFibZone;
  const nearEma20 = distanceToEma20 != null && Math.abs(distanceToEma20) <= 4;
  const healthyPullback = trend.healthyPullback || (trend.status === "bullish" && trend.priceAbove100 && inFibZone && sr.nearSupport);

  const stopPrice = sr.nearestSupport ? sr.nearestSupport.price * 0.993 : Math.max(currentPrice * 0.94, currentPrice - currentPrice * 0.06);
  const targetPrice = sr.nearestResistance ? sr.nearestResistance.price * 0.999 : currentPrice * 1.08;
  const risk = currentPrice - stopPrice;
  const reward = targetPrice - currentPrice;
  const riskReward = risk > 0 ? reward / risk : null;

  let score = 0;
  if (trend.status === "bullish") score += 18;
  if (trend.status === "healthy_pullback") score += 16;
  if (mtfOneHour.status === "confirmed") score += 14;
  if (mtfOneHour.status === "weak_confirmation") score += 8;
  if (candleSignals.bullishEngulfing) score += 8;
  if (candleSignals.hammer || candleSignals.supportRejection) score += 6;
  if (candleSignals.insideBreakout) score += 5;
  if (volume.relative > 1.4) score += 10;
  else if (volume.relative > 1.1) score += 6;
  else if (volume.relative > 0.9) score += 3;
  else if (volume.relative > 0.75) score += 1;
  if (trend.priceAbove20) score += 2;
  if (trend.priceAbove50) score += 3;
  if (nearEma20) score += 1;
  if (inFibZone) score += 2;
  if (sr.nearSupport) score += 2;
  if (healthyPullback) score += 5;
  if (mtfOneHour.status === "rejected") score -= 10;
  if (trend.status === "extended") score -= 6;
  if (overStretched) score -= 6;
  if (trend.rsi != null && trend.rsi < 30 && !trend.priceAbove50) score -= 2;
  if (trend.rsi != null && trend.rsi > 75) score -= 1;
  if (riskReward != null) {
    if (riskReward >= 2) score += 4;
    else if (riskReward >= 1.5) score += 3;
    else if (riskReward < 0.9) score -= 2;
  }

  const normalizedScore = formatScore(score / 5 + 4.5);

  const isTrueRange =
    trend.status === "neutral" &&
    mtfOneHour.status !== "confirmed" &&
    mtfOneHour.status !== "weak_confirmation" &&
    !healthyPullback &&
    !inFibZone &&
    !sr.nearSupport;

  const isStructuralExhaustion = overStretched || trend.status === "extended";

  const isStrong4HBearish =
    trend.status === "extended" ||
    trend.bearishConfirmed ||
    (trend.fallingHighs && trend.fallingLows && !trend.priceAbove100 && trend.relativeVolume < 0.95);

  const hasStrong1HBearish =
    mtfOneHour.supportLoss ||
    mtfOneHour.strongDownSequence ||
    mtfOneHour.strongBearishCandle;

  const isAvoidCondition =
    isStrong4HBearish ||
    hasStrong1HBearish;

  const isBuyStrong =
    trend.status !== "neutral" &&
    mtfOneHour.status === "confirmed" &&
    volume.relative > 1.2 &&
    riskReward >= 1.5;

  const isBuy =
    (trend.status === "bullish" || trend.status === "healthy_pullback") &&
    mtfOneHour.status !== "rejected" &&
    (mtfOneHour.status === "confirmed" || healthyPullback || volume.relative >= 0.9);

  const isPullback =
    trend.status === "healthy_pullback" &&
    !isBuyStrong &&
    normalizedScore >= 5;

  let category = "ATENÇÃO";
  if (isAvoidCondition) {
    category = "EVITAR";
  } else if (isStructuralExhaustion) {
    category = "ESTICADO";
  } else if (isPullback) {
    category = "PULLBACK";
  } else if (isTrueRange) {
    category = "RANGE";
  } else if (normalizedScore >= 9 || isBuyStrong) {
    category = "COMPRA_FORTE";
  } else if (normalizedScore >= 7 || isBuy) {
    category = "COMPRA";
  } else if (normalizedScore >= 5) {
    category = "OBSERVACAO";
  } else if (normalizedScore >= 3) {
    category = "PULLBACK";
  } else {
    category = "EVITAR";
  }

  if (riskReward != null && category !== "EVITAR" && category !== "ESTICADO") {
    if (riskReward < 1) {
      category = "ATENÇÃO";
    } else if (riskReward < 1.5 && category === "COMPRA_FORTE") {
      category = "COMPRA";
    }
  }

  const badges = [];
  if (trend.status === "bullish") badges.push("4H BULLISH");
  if (trend.status === "healthy_pullback") badges.push("PULLBACK SAUDÁVEL");
  if (mtfOneHour.status === "confirmed") badges.push("CONFIRMAÇÃO 1H");
  if (volume.relative > 1.4) badges.push("VOLUME FORTE");
  else if (volume.relative > 1.1) badges.push("VOLUME MODERADO");
  if (candleSignals.confirmed || candleSignals1H.confirmed) badges.push("CANDLE CONFIRMADO");
  if (mtfOneHour.status === "rejected" || candleSignals.rejected || candleSignals1H.rejected) badges.push("ROMPIMENTO FRACO");
  if (candleSignals.names.length) badges.push(...candleSignals.names.slice(0, 2));
  if (sr.nearSupport) badges.push("Suporte relevante");
  if (sr.nearResistance) badges.push("Resistência próxima");

  const explanation = explainAnalysis({
    category,
    multiTimeframe: { fourHour: trend, oneHour: mtfOneHour },
    candleSignals,
    volume,
    riskReward,
    trend,
    sr,
    overStretched,
    healthyPullback,
    inFibZone,
  });

  return {
    ...raw,
    candles4H: fourHour,
    candles1H: oneHour,
    ema20,
    ema50,
    ema100,
    distanceToEma20,
    rsi: trend.rsi != null ? parseFloat(trend.rsi.toFixed(1)) : null,
    stochK: calcStochastic(fourHour.map((c) => c.high), fourHour.map((c) => c.low), fourHour.map((c) => c.close))?.k ?? null,
    stochD: calcStochastic(fourHour.map((c) => c.high), fourHour.map((c) => c.low), fourHour.map((c) => c.close))?.d ?? null,
    candleSignals,
    multiTimeframe: { daily: { status: "neutral" }, fourHour: trend, oneHour: mtfOneHour, aligned: false },
    volume,
    fib,
    trend,
    sr,
    riskReward: riskReward != null ? parseFloat(riskReward.toFixed(1)) : null,
    stopPrice: parseFloat(stopPrice.toFixed(2)),
    targetPrice: parseFloat(targetPrice.toFixed(2)),
    score: normalizedScore,
    category,
    heat: normalizedScore >= 8 ? "high" : normalizedScore >= 6 ? "medium" : "low",
    badges,
    overStretched,
    healthyPullback,
    inFibZone,
    supportZone: sr.nearestSupport,
    resistanceZone: sr.nearestResistance,
    explanation,
    currencySymbol: raw.currencySymbol || "$",
  };
}
