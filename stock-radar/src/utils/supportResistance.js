function clusterLevels(levels, tolerance = 0.015) {
  if (!levels.length) return [];
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clusters = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const group = clusters.at(-1);
    const avg = group.reduce((sum, item) => sum + item.price, 0) / group.length;
    if (Math.abs(current.price - avg) / avg < tolerance) {
      group.push(current);
    } else {
      clusters.push([current]);
    }
  }
  return clusters.map((group) => {
    const price = group.reduce((sum, item) => sum + item.price, 0) / group.length;
    return {
      price,
      strength: group.length,
      min: Math.min(...group.map((item) => item.price)),
      max: Math.max(...group.map((item) => item.price)),
    };
  });
}

export function getSupportResistanceZones(candles) {
  const recent = candles.slice(-90);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);
  const pivH = [];
  const pivL = [];
  const win = 3;

  for (let i = win; i < recent.length - win; i += 1) {
    const isHigh = highs.slice(i - win, i).every((value) => value <= highs[i]) &&
      highs.slice(i + 1, i + win + 1).every((value) => value <= highs[i]);
    const isLow = lows.slice(i - win, i).every((value) => value >= lows[i]) &&
      lows.slice(i + 1, i + win + 1).every((value) => value >= lows[i]);
    if (isHigh) pivH.push({ price: highs[i] });
    if (isLow) pivL.push({ price: lows[i] });
  }

  const resistances = clusterLevels(pivH, 0.02).filter((item) => item.price > recent.at(-1).close);
  const supports = clusterLevels(pivL, 0.02).filter((item) => item.price < recent.at(-1).close);
  const price = recent.at(-1).close;

  const nearestResistance = resistances.length ? resistances[0] : null;
  const nearestSupport = supports.length ? supports[0] : null;
  const nearSupport = nearestSupport ? (price - nearestSupport.price) / price < 0.03 : false;
  const nearResistance = nearestResistance ? (nearestResistance.price - price) / price < 0.03 : false;

  return {
    supports,
    resistances,
    nearestSupport,
    nearestResistance,
    nearSupport,
    nearResistance,
  };
}
