/** Stereo demo tone for the tutorial playground. */
export function createDemoTone(durationSec = 8, sampleRate = 44100): AudioBuffer {
  const length = Math.floor(sampleRate * durationSec);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    const f0 = ch === 0 ? 220 : 330;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t * 4) * Math.min(1, (durationSec - t) * 4);
      data[i] =
        env *
        (0.45 * Math.sin(2 * Math.PI * f0 * t) +
          0.2 * Math.sin(2 * Math.PI * f0 * 2 * t) +
          0.1 * Math.sin(2 * Math.PI * (f0 * (1 + t * 0.15)) * t));
    }
  }
  return buffer;
}
