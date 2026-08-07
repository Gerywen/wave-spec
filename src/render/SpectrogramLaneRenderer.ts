import type { SpectrogramFrames } from "../analysis/SpectrogramFrames.js";
import {
  magnitudeToDb,
  normalizeDb,
  spectrogramColor,
} from "../analysis/SpectrogramFrames.js";
import type { ViewportMapper } from "../timeline/ViewportMapper.js";
import type { LaneRect } from "./LaneLayout.js";
import { defaultChannelLabel } from "../types.js";

export type SpectrogramLaneRenderOptions = {
  minDb: number;
  maxDb: number;
  dimChannels?: Set<number> | null;
  channelCount: number;
};

/** CPU fallback while bitmap bake is in progress. */
export class SpectrogramLaneRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    spectrograms: SpectrogramFrames,
    mapper: ViewportMapper,
    lanes: LaneRect[],
    options: SpectrogramLaneRenderOptions,
  ): void {
    const dpr = ctx.getTransform?.()?.a ?? 1;
    const plotWcss = Math.max(1, Math.floor(mapper.width));
    const offsetX = mapper.offsetX;

    for (const lane of lanes) {
      const data = spectrograms.get(lane.channel);
      const dim = options.dimChannels?.has(lane.channel) ?? false;
      ctx.fillStyle = "#0c0e12";
      ctx.fillRect(offsetX, lane.y, plotWcss, lane.height);

      const plotW = Math.max(1, Math.floor(plotWcss * dpr));
      const imgH = Math.max(1, Math.floor(lane.height * dpr));
      const img = ctx.createImageData(plotW, imgH);
      const { bins, frames, magnitudes, hop, fftSize, sampleRate } = data;

      const windowCenter = fftSize / 2;
      const startFrame = Math.max(
        0,
        Math.floor((mapper.startSample - windowCenter) / hop),
      );
      const endFrame = Math.min(
        frames,
        Math.ceil((mapper.endSample - windowCenter) / hop) + 1,
      );
      const frameSpan = Math.max(1, endFrame - startFrame);

      const hzMin = 20;
      const hzMax = sampleRate / 2;
      const yMaxIdx = Math.max(1, img.height - 1);
      const yBin = new Int32Array(img.height);
      for (let y = 0; y < img.height; y++) {
        const r = y / yMaxIdx;
        const hz = hzMax * Math.pow(hzMin / hzMax, 1 - r);
        const bin = Math.round((hz * fftSize) / sampleRate);
        yBin[y] = Math.min(bins - 1, Math.max(0, bin));
      }

      const binSmooth = 1;

      for (let x = 0; x < plotW; x++) {
        const fx = startFrame + (x / plotW) * frameSpan;
        const f0 = Math.min(frames - 1, Math.max(0, Math.floor(fx)));
        const f1 = Math.min(frames - 1, f0 + 1);
        const tFrame = fx - f0;

        const base0 = f0 * bins;
        const base1 = f1 * bins;

        for (let y = 0; y < img.height; y++) {
          const binCenter = yBin[y]!;

          let sum0 = 0;
          let sum1 = 0;
          let count = 0;
          const lo = Math.max(0, binCenter - binSmooth);
          const hi = Math.min(bins - 1, binCenter + binSmooth);
          for (let b = lo; b <= hi; b++) {
            sum0 += magnitudes[base0 + b]!;
            sum1 += magnitudes[base1 + b]!;
            count++;
          }
          const mag0 = sum0 / Math.max(1, count);
          const mag1 = sum1 / Math.max(1, count);
          const mag = mag0 * (1 - tFrame) + mag1 * tFrame;

          const db = magnitudeToDb(mag);
          let t = normalizeDb(db, options.minDb, options.maxDb);
          if (dim) t *= 0.35;

          const [r, g, b] = spectrogramColor(t);
          const idx = (y * plotW + x) * 4;
          img.data[idx] = r;
          img.data[idx + 1] = g;
          img.data[idx + 2] = b;
          img.data[idx + 3] = 255;
        }
      }

      ctx.putImageData(img, Math.floor(offsetX * dpr), Math.floor(lane.y * dpr));

      ctx.fillStyle = dim ? "#667084" : "#e8eef8";
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(
        defaultChannelLabel(lane.channel, options.channelCount),
        Math.max(4, offsetX > 0 ? 4 : 6),
        lane.y + 4,
      );
    }
  }
}
