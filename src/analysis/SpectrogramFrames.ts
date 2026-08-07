export type SpectrogramData = {
  bins: number;
  frames: number;
  /** frames * bins, linear magnitude */
  magnitudes: Float32Array;
  fftSize: number;
  hop: number;
  sampleRate: number;
};

export type SpectrogramFramesPrecomputed = {
  channelCount: number;
  data: SpectrogramData[];
};

/**
 * Per-channel STFT spectrogram (produced by WASM worker; main thread only holds data).
 */
export class SpectrogramFrames {
  readonly channelCount: number;
  private readonly data: SpectrogramData[];

  constructor(precomputed: SpectrogramFramesPrecomputed) {
    this.channelCount = precomputed.channelCount;
    this.data = precomputed.data;
  }

  get(channel: number): SpectrogramData {
    return this.data[channel]!;
  }
}

export function magnitudeToDb(mag: number): number {
  return 20 * Math.log10(Math.max(mag, 1e-12));
}

export function normalizeDb(db: number, minDb: number, maxDb: number): number {
  if (maxDb <= minDb) return 0;
  return Math.min(1, Math.max(0, (db - minDb) / (maxDb - minDb)));
}

/** Audition / Cool Edit style spectral colors with darker floor and hotter peaks. */
export function spectrogramColor(t: number): [number, number, number] {
  // Compress lows, stretch highs → quieter areas stay dark, peaks pop.
  const x = Math.pow(Math.min(1, Math.max(0, t)), 1.15);
  // Stops inspired by classic Spectral Frequency Display.
  const stops: Array<[number, number, number, number]> = [
    [0.0, 0, 0, 0],
    [0.12, 12, 0, 48],
    [0.28, 20, 40, 160],
    [0.42, 0, 140, 180],
    [0.55, 40, 190, 40],
    [0.68, 220, 210, 0],
    [0.82, 255, 110, 0],
    [0.93, 255, 30, 20],
    [1.0, 255, 255, 255],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (x >= a[0] && x <= b[0]) {
      const u = (x - a[0]) / Math.max(1e-9, b[0] - a[0]);
      return [
        Math.round(a[1] + (b[1] - a[1]) * u),
        Math.round(a[2] + (b[2] - a[2]) * u),
        Math.round(a[3] + (b[3] - a[3]) * u),
      ];
    }
  }
  return [255, 255, 255];
}
