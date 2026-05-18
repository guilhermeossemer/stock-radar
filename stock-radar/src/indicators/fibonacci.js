function findPivotPoints(candles, range = 4) {
  const pivots = [];
  for (let i = range; i < candles.length - range; i += 1) {
    const center = candles[i];
    const left = candles.slice(i - range, i).map((c) => c.high);
    const right = candles.slice(i + 1, i + range + 1).map((c) => c.high);
    if (center.high >= Math.max(...left) && center.high >= Math.max(...right)) {
      pivots.push({ type: "high", idx: i, price: center.high });
    }
    const leftLow = candles.slice(i - range, i).map((c) => c.low);
    const rightLow = candles.slice(i + 1, i + range + 1).map((c) => c.low);
    if (center.low <= Math.min(...leftLow) && center.low <= Math.min(...rightLow)) {
      pivots.push({ type: "low", idx: i, price: center.low });
    }
  }
  return pivots;
}

export function calcFibonacci(candles) {
  const pivots = findPivotPoints(candles.slice(-80), 3);
  if (pivots.length < 2) return null;

  const lows = pivots.filter((p) => p.type === "low");
  const highs = pivots.filter((p) => p.type === "high");
  if (!lows.length || !highs.length) return null;

  const lastLow = lows.at(-1);
  const lastHigh = highs.find((h) => h.idx > lastLow.idx) || highs.at(-1);
  const lastHighBeforeLow = highs.reverse().find((h) => h.idx < lastLow.idx);
  const pivotLow = lastLow.price;
  const pivotHigh = lastHigh ? lastHigh.price : lastHighBeforeLow?.price;
  if (!pivotHigh || pivotHigh <= pivotLow) return null;

  const size = pivotHigh - pivotLow;
  const levels = [0.382, 0.5, 0.618].map((ratio) => ({
    ratio,
    price: pivotHigh - size * ratio,
  }));
  const currentPrice = candles.at(-1).close;
  const retracement = (pivotHigh - currentPrice) / size;
  const inFibZone = retracement >= 0.34 && retracement <= 0.62;

  return {
    pivotLow,
    pivotHigh,
    levels,
    currentRetracement: retracement,
    inFibZone,
    depthLabel:
      retracement < 0.38 ? "Pullback raso" : retracement <= 0.5 ? "Zona de 50%" : "Pullback profundo",
  };
}
