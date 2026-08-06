/**
 * Find nearest zero-crossing around `sample` within `windowSamples`.
 */
export function findZeroCrossing(
  channelData: Float32Array,
  sample: number,
  windowSamples = 256,
): number {
  const n = channelData.length;
  if (n === 0) return 0;
  const center = Math.min(n - 1, Math.max(0, Math.round(sample)));
  const lo = Math.max(1, center - windowSamples);
  const hi = Math.min(n - 1, center + windowSamples);

  let best = center;
  let bestDist = Infinity;

  for (let i = lo; i <= hi; i++) {
    const a = channelData[i - 1]!;
    const b = channelData[i]!;
    if ((a <= 0 && b >= 0) || (a >= 0 && b <= 0)) {
      const dist = Math.abs(i - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
  }
  return best;
}
