import { calcEMA, emaDistance } from "../indicators/ema.js";
import { calcRSI } from "../indicators/rsi.js";
import { calcStochastic } from "../indicators/stochastic.js";
import { calcFibonacci } from "../indicators/fibonacci.js";
import { volumeConfirmation } from "../indicators/volume.js";
import { classifyTrend } from "../indicators/trendClassification.js";
import { analyzeMultiTimeframe } from "../indicators/multiTimeframe.js";
import { analyzeCandlePatterns } from "../indicators/candles.js";
import { explainAnalysis } from "./explanationEngine.js";
import { getSupportResistanceZones } from "./supportResistance.js";

function formatScore(value) {
  return Math.min(Math.max(Math.round(value), 0), 10);
}

export function analyzeStock(raw) {
  const candles = raw.candles;
  const prices = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const trend = classifyTrend(candles);
  const fib = calcFibonacci(candles) || {};
  const stochastic = calcStochastic(highs, lows, prices);
  const rsi = calcRSI(prices);
  const volume = volumeConfirmation(candles);
  const patterns = analyzeCandlePatterns(candles);
  const sr = getSupportResistanceZones(candles);
  const mtf = analyzeMultiTimeframe(candles, raw.candles4H || [], raw.candles1H || []);
  const candleSignals = analyzeCandlePatterns(raw.candles1H && raw.candles1H.length >= 3 ? raw.candles1H : candles);

  const currentPrice = raw.currentPrice;
  const ema20 = trend.ema20;
  const ema50 = trend.ema50;
  const ema100 = trend.ema100;
  const ema20Dist = emaDistance(currentPrice, ema20);

  const distanceToEma20 = ema20Dist != null ? parseFloat(ema20Dist.toFixed(1)) : null;
  const overStretched = distanceToEma20 != null && distanceToEma20 > 6;
  const tooFarFromEma20 = distanceToEma20 != null && distanceToEma20 > 10;
  const nearEma20 = distanceToEma20 != null && Math.abs(distanceToEma20) <= 2;
  const priceAboveEma20 = ema20 ? currentPrice > ema20 : false;

  const rsiHealthy = rsi != null && rsi >= 35 && rsi <= 65;
  const rsiHigh = rsi != null && rsi > 70;
  const stochHealthy = stochastic && stochastic.k < 80 && stochastic.d < 80 && stochastic.k > 20;
  const supportZone = sr.nearestSupport;
  const resistanceZone = sr.nearestResistance;
  const inFibZone = fib.inFibZone;
  const healthyPullback =
    mtf.fourHour?.status === "healthy_pullback" ||
    (trend.context === "TREND_UP" && priceAboveEma20 && inFibZone && distanceToEma20 != null && distanceToEma20 <= 6 && sr.nearSupport);

  const stopPrice = supportZone ? supportZone.price * 0.992 : Math.max(currentPrice * 0.94, currentPrice - currentPrice * 0.04);
  const targetPrice = resistanceZone ? resistanceZone.price * 0.998 : currentPrice * 1.05;
  const risk = currentPrice - stopPrice;
  const reward = targetPrice - currentPrice;
  const riskReward = risk > 0 ? reward / risk : null;

  let score = 0;
  if (mtf.daily?.status === "bullish") score += 20;
  if (mtf.fourHour?.status === "healthy_pullback") score += 15;
  if (mtf.oneHour?.status === "confirmed") score += 15;
  if (candleSignals.bullishEngulfing) score += 10;
  if (candleSignals.hammer || candleSignals.supportRejection) score += 8;
  if (candleSignals.insideBreakout) score += 6;
  if (volume.relative > 1.5) score += 10;
  else if (volume.relative > 1) score += 5;
  if (mtf.oneHour?.status === "rejected") score -= 10;
  if (mtf.fourHour?.status === "extended") score -= 4;
  if (candleSignals.rejected) score -= 8;
  if (overStretched) score -= 10;
  if (tooFarFromEma20) score -= 8;
  if (mtf.daily?.status === "bearish") score -= 15;
  if (rsiHigh) score -= 2;
  if (stochHealthy) score += 1;
  if (sr.nearSupport) score += 2;
  if (sr.nearResistance) score -= 1;
  if (healthyPullback) score += 2;
  if (inFibZone) score += 1;
  if (riskReward != null) {
    if (riskReward >= 3) score += 3;
    else if (riskReward >= 2) score += 2;
    else if (riskReward < 1) score -= 2;
  }

  const normalizedScore = formatScore(score / 6 + 4);

  const isTrueRange =
    trend.context === "RANGE" &&
    mtf.daily?.status !== "bullish" &&
    mtf.fourHour?.status !== "healthy_pullback" &&
    mtf.oneHour?.status !== "confirmed" &&
    !healthyPullback &&
    !inFibZone &&
    !sr.nearSupport;

  const isStructuralExhaustion =
    (tooFarFromEma20 || overStretched) &&
    (rsiHigh || candleSignals.strongCandle || candleSignals.bullishEngulfing || mtf.oneHour?.status === "rejected");

  const isAvoidCondition =
    mtf.daily?.status === "bearish" ||
    trend.context === "TREND_DOWN" ||
    mtf.oneHour?.status === "rejected";

  const isBuyStrong =
    mtf.daily?.status === "bullish" &&
    mtf.fourHour?.status === "healthy_pullback" &&
    mtf.oneHour?.status === "confirmed" &&
    volume.relative > 1 &&
    riskReward >= 2;

  const isBuy =
    mtf.daily?.status === "bullish" &&
    (mtf.fourHour?.status === "healthy_pullback" || mtf.oneHour?.status === "confirmed" || volume.relative > 1 || healthyPullback);

  let category = "ATENÇÃO";
  if (isAvoidCondition) {
    category = "EVITAR";
  } else if (isStructuralExhaustion) {
    category = "ESTICADO";
  } else if (isTrueRange) {
    category = "RANGE";
  } else if (normalizedScore >= 8 || isBuyStrong) {
    category = "COMPRA_FORTE";
  } else if (normalizedScore >= 7 || isBuy) {
    category = "COMPRA";
  } else if (normalizedScore >= 4) {
    category = "ATENÇÃO";
  } else if (normalizedScore >= 2) {
    category = "RANGE";
  } else {
    category = "EVITAR";
  }

  if (riskReward != null && category !== "EVITAR" && category !== "ESTICADO") {
    if (riskReward < 1) {
      category = "ATENÇÃO";
    } else if (riskReward < 2 && category === "COMPRA_FORTE") {
      category = "COMPRA";
    }
  }

  const badges = [];
  if (mtf.aligned) badges.push("MTF ALINHADO");
  if (mtf.fourHour?.status === "healthy_pullback") badges.push("PULLBACK SAUDÁVEL");
  if (mtf.oneHour?.status === "confirmed") badges.push("CONFIRMAÇÃO 1H");
  if (volume.relative > 1.5) badges.push("VOLUME FORTE");
  else if (volume.relative > 1) badges.push("VOLUME MODERADO");
  if (candleSignals.confirmed) badges.push("CANDLE CONFIRMADO");
  if (mtf.oneHour?.status === "rejected" || candleSignals.rejected) badges.push("ROMPIMENTO FRACO");
  if (patterns.names.length) badges.push(...patterns.names.slice(0, 2));
  if (sr.nearSupport) badges.push("Suporte relevante");
  if (sr.nearResistance) badges.push("Resistência próxima");

  const explanation = explainAnalysis({
    category,
    multiTimeframe: mtf,
    candleSignals,
    volume,
    riskReward,
    trend,
    sr,
    overStretched,
    healthyPullback,
    inFibZone,
  });

  const heat = normalizedScore >= 8 ? "high" : normalizedScore >= 6 ? "medium" : "low";

  return {
    ...raw,
    candles,
    prices,
    ema20,
    ema50,
    ema100,
    distanceToEma20,
    priceAboveEma20,
    rsi: rsi != null ? parseFloat(rsi.toFixed(1)) : null,
    stochK: stochastic?.k ?? null,
    stochD: stochastic?.d ?? null,
    rsiHealthy,
    stochHealthy,
    patterns,
    candleSignals,
    multiTimeframe: mtf,
    volume,
    fib,
    trend,
    sr,
    riskReward: riskReward != null ? parseFloat(riskReward.toFixed(1)) : null,
    stopPrice: parseFloat(stopPrice.toFixed(2)),
    targetPrice: parseFloat(targetPrice.toFixed(2)),
    score: normalizedScore,
    category,
    heat,
    badges,
    overStretched,
    healthyPullback,
    inFibZone,
    supportZone,
    resistanceZone,
    explanation,
  };
}
