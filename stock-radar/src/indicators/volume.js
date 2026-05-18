export function calcAverage(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

export function calcVolumeMetrics(candles, period = 20) {
  const volumes = candles.map((c) => c.volume);
  const avg = calcAverage(volumes, period);
  const lastVolume = volumes.at(-1) ?? 0;
  return {
    avg20: avg,
    lastVolume,
    relative: avg ? lastVolume / avg : 1,
    aboveAverage: avg ? lastVolume >= avg : false,    rising: volumes.length > 1 ? lastVolume > volumes.at(-2) : false,
  };
}

export function volumeConfirmation(candles, period = 20) {
  const metrics = calcVolumeMetrics(candles, period);
  let strength = "moderate";
  if (metrics.relative > 1.5) strength = "strong";
  else if (metrics.relative < 1) strength = "weak";
  return {
    ...metrics,
    strength,
    confirmed: metrics.relative >= 1,
    strongConfirmation: metrics.relative > 1.5,
    moderateConfirmation: metrics.relative > 1,
    weakConfirmation: metrics.relative < 1,  };
}
