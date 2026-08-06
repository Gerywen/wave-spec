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
 * Per-channel STFT spectrogram (Hann window, magnitude spectrum).
 */
export class SpectrogramFrames {
  readonly channelCount: number;
  private readonly data: SpectrogramData[];

  constructor(
    buffer: AudioBuffer,
    options?: { fftSize?: number; hop?: number; maxFrames?: number },
  );
  constructor(precomputed: SpectrogramFramesPrecomputed);
  constructor(
    input: AudioBuffer | SpectrogramFramesPrecomputed,
    options: { fftSize?: number; hop?: number; maxFrames?: number } = {},
  ) {
    if ("data" in input && "channelCount" in input) {
      this.channelCount = input.channelCount;
      this.data = input.data;
      return;
    }

    const buffer = input;
    const fftSize = options.fftSize ?? 2048;
    const hop = options.hop ?? fftSize / 4;
    this.channelCount = buffer.numberOfChannels;
    this.data = [];

    for (let ch = 0; ch < this.channelCount; ch++) {
      const samples = buffer.getChannelData(ch);
      this.data.push(
        computeSpectrogram(samples, buffer.sampleRate, fftSize, hop, options.maxFrames),
      );
    }
  }

  get(channel: number): SpectrogramData {
    return this.data[channel]!;
  }
}

function computeSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  fftSize: number,
  hop: number,
  maxFrames?: number,
): SpectrogramData {
  const bins = fftSize / 2 + 1;
  const window = hann(fftSize);
  const totalFrames = Math.max(1, Math.floor((samples.length - fftSize) / hop) + 1);
  const frameStep =
    maxFrames && totalFrames > maxFrames ? Math.ceil(totalFrames / maxFrames) : 1;
  const frames = Math.ceil(totalFrames / frameStep);
  const magnitudes = new Float32Array(frames * bins);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let f = 0; f < frames; f++) {
    const frameIndex = f * frameStep;
    const start = frameIndex * hop;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const s = samples[start + i] ?? 0;
      re[i] = s * window[i]!;
    }
    fftRadix2(re, im);
    const base = f * bins;
    for (let b = 0; b < bins; b++) {
      const mag = Math.hypot(re[b]!, im[b]!);
      magnitudes[base + b] = mag;
    }
  }

  return { bins, frames, magnitudes, fftSize, hop: hop * frameStep, sampleRate };
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
  }
  return w;
}

/** In-place radix-2 Cooley–Tukey FFT */
function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error("fftSize must be power of 2");

  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * wRe - im[i + k + len / 2]! * wIm;
        const vIm = re[i + k + len / 2]! * wIm + im[i + k + len / 2]! * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
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
