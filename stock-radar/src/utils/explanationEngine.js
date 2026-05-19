export function explainAnalysis(analysis) {
  const positives = [];
  const negatives = [];

  const { category, multiTimeframe, candleSignals, volume, riskReward, trend, sr, overStretched, healthyPullback, inFibZone } = analysis;

  if (multiTimeframe.daily?.status === "bullish") positives.push("Tendência forte no diário");
  if (multiTimeframe.fourHour?.status === "healthy_pullback") positives.push("Pullback saudável no 4H");
  if (multiTimeframe.oneHour?.status === "confirmed") positives.push("Confirmação 1H");
  if (volume.relative > 1.5) positives.push("Volume forte acima da média");
  else if (volume.relative > 1) positives.push("Volume moderado");
  if (candleSignals.bullishEngulfing) positives.push("Engolfo de alta");
  if (candleSignals.hammer) positives.push("Martelo de suporte");
  if (candleSignals.insideBreakout) positives.push("Inside bar breakout");
  if (healthyPullback) positives.push("Pullback organizado próximo a suporte");
  if (inFibZone) positives.push("Zona Fibonacci");
  if (riskReward >= 2) positives.push("R/R favorável");
  if (category === "OBSERVACAO") positives.push("Aguardando reação estrutural");
  if (category === "PULLBACK") positives.push("Pullback em andamento");

  if (category === "EVITAR") negatives.push("Deterioração estrutural real");
  if (multiTimeframe.daily?.status === "bearish") negatives.push("Tendência diária negativa");
  if (multiTimeframe.fourHour?.status === "extended") negatives.push("Perda estrutural ou aceleração bearish no 4H");
  if (multiTimeframe.oneHour?.status === "rejected") negatives.push("Momentum 1H enfraquecido ou suporte perdido");
  if (volume.relative < 0.9) negatives.push("Momentum enfraquecido");
  if (overStretched) negatives.push("Ativo esticado longe da EMA20");
  if (sr?.nearResistance) negatives.push("Resistência próxima");

  const summaryParts = [];
  if (positives.length) summaryParts.push(positives[0]);
  if (positives.length > 1) summaryParts.push(positives[1]);
  if (negatives.length) summaryParts.push(negatives[0]);

  const summary = summaryParts.join(". ") + (summaryParts.length ? "." : "");

  return {
    summary,
    positives: positives.slice(0, 3),
    negatives: negatives.slice(0, 2),
    reasoning: {
      positives,
      negatives,
    },
  };
}
