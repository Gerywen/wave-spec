import type { SpectrogramData } from "../analysis/SpectrogramFrames.js";
import { magnitudeToDb, normalizeDb, spectrogramColor } from "../analysis/SpectrogramFrames.js";

export class SpectrogramOverviewRenderer {
  render(params: {
    ctx: CanvasRenderingContext2D;
    spectrograms: { channelCount: number; get: (ch: number) => SpectrogramData };
    lengthSamples: number;
    viewportStart: number;
    viewportEnd: number;
    width: number; // CSS px
    height: number; // CSS px
    dpr: number;
    minDb: number;
    maxDb: number;
  }): void {
    const { ctx, spectrograms, lengthSamples, viewportStart, viewportEnd, dpr, minDb, maxDb } = params;
    const widthCss = params.width;
    const heightCss = params.height;
    const widthPx = Math.max(1, Math.floor(widthCss * dpr));
    const heightPx = Math.max(1, Math.floor(heightCss * dpr));

    const canvas = ctx.canvas;
    canvas.width = widthPx;
    canvas.height = heightPx;

    const spec0 = spectrograms.get(0);
    const specs: SpectrogramData[] = [];
    for (let ch = 0; ch < spectrograms.channelCount; ch++) {
      specs.push(spectrograms.get(ch));
    }
    const bins = spec0.bins;
    const frames = spec0.frames;
    const hop = spec0.hop;
    const fftSize = spec0.fftSize;
    const sampleRate = spec0.sampleRate;

    const hzMin = 20;
    const hzMax = sampleRate / 2;

    // Pre-fill background
    ctx.clearRect(0, 0, widthPx, heightPx);
    const img = ctx.createImageData(widthPx, heightPx);

    for (let y = 0; y < heightPx; y++) {
      // low freq on top, high freq on bottom
      const yRatio = y / Math.max(1, heightPx - 1); // top->bottom
      const hz = hzMax * Math.pow(hzMin / hzMax, 1 - yRatio);
      const binFloat = (hz * fftSize) / sampleRate;
      const b0 = Math.max(0, Math.min(bins - 1, Math.floor(binFloat)));
      const b1 = Math.max(0, Math.min(bins - 1, b0 + 1));
      const t = binFloat - b0;

      for (let x = 0; x < widthPx; x++) {
        const xRatio = x / Math.max(1, widthPx - 1);
        const sample = lengthSamples * xRatio;
        const frameFloat = sample / Math.max(1e-6, hop);
        const f0 = Math.max(0, Math.min(frames - 1, Math.floor(frameFloat)));
        const f1 = Math.max(0, Math.min(frames - 1, f0 + 1));
        const tf = frameFloat - f0;

        // Use max across channels for better contrast
        let mag = 0;
        for (let ch = 0; ch < specs.length; ch++) {
          const spec = specs[ch]!;
          const base0 = f0 * spec.bins;
          const base1 = f1 * spec.bins;
          const m00 = spec.magnitudes[base0 + b0] ?? 0;
          const m01 = spec.magnitudes[base0 + b1] ?? 0;
          const m10 = spec.magnitudes[base1 + b0] ?? 0;
          const m11 = spec.magnitudes[base1 + b1] ?? 0;
          const m0 = m00 * (1 - t) + m01 * t;
          const m1 = m10 * (1 - t) + m11 * t;
          const m = m0 * (1 - tf) + m1 * tf;
          if (m > mag) mag = m;
        }

        const db = magnitudeToDb(mag);
        const tn = normalizeDb(db, minDb, maxDb);
        const [r, g, b] = spectrogramColor(tn);
        const idx = (y * widthPx + x) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    // Draw viewport rectangle
    const x1 = (viewportStart / Math.max(1, lengthSamples)) * widthPx;
    const x2 = (viewportEnd / Math.max(1, lengthSamples)) * widthPx;
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);

    ctx.strokeStyle = "rgba(255, 220, 120, 0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, 0.5, Math.max(1, right - left), heightPx - 1);
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(left, 0, Math.max(1, right - left), heightPx);
  }
}

