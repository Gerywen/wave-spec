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
  drawFrequencyAxis?: boolean;
};

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

      // putImageData 使用的是“设备像素坐标/尺寸”，不受 ctx transform 缩放影响；
      // 因此需要把宽高与偏移按 dpr 修正。
      const plotW = Math.max(1, Math.floor(plotWcss * dpr));
      const imgH = Math.max(1, Math.floor(lane.height * dpr));
      const img = ctx.createImageData(plotW, imgH);
      const { bins, frames, magnitudes, hop, fftSize, sampleRate } = data;

      // STFT 帧当前以“窗起点”计算，但可视时间轴通常更贴近“窗中心”。
      // 用窗中心对齐后，语谱在全时长/缩放下会更接近 Cool Edit 的时间定位观感。
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

      // CoolEdit-like look usually relies on log-frequency mapping + better interpolation.
      const hzMin = 20;
      const hzMax = sampleRate / 2;
      const yMaxIdx = Math.max(1, img.height - 1);
      const yBin = new Int32Array(img.height);
      for (let y = 0; y < img.height; y++) {
        // r=0 top -> high frequency; r=1 bottom -> low frequency
        const r = y / yMaxIdx;
        // Flip orientation: low frequency on top, high frequency on bottom.
        const hz = hzMax * Math.pow(hzMin / hzMax, 1 - r);
        const bin = Math.round((hz * fftSize) / sampleRate);
        yBin[y] = Math.min(bins - 1, Math.max(0, bin));
      }

      const binSmooth = 1; // light band averaging to reduce vertical stair steps

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

      // putImageData 使用设备像素坐标：偏移也按 dpr 修正
      ctx.putImageData(img, Math.floor(offsetX * dpr), Math.floor(lane.y * dpr));

      if (options.drawFrequencyAxis && offsetX > 0) {
        drawFreqAxis(ctx, lane, offsetX, sampleRate, fftSize);
      }

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

function drawFreqAxis(
  ctx: CanvasRenderingContext2D,
  lane: LaneRect,
  axisW: number,
  sampleRate: number,
  fftSize: number,
): void {
  ctx.fillStyle = "#141820";
  ctx.fillRect(0, lane.y, axisW, lane.height);
  const nyquist = sampleRate / 2;
  const hzMin = 20;
  const hzMax = nyquist;
  const ratios = [0, 0.25, 0.5, 0.75, 1];
  // Keep the same flipped orientation as the main spectrogram rendering.
  const ticks = ratios.map((r) => hzMax * Math.pow(hzMin / hzMax, 1 - r));
  ctx.fillStyle = "#8b95a8";
  ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i < ticks.length; i++) {
    const hz = ticks[i]!;
    const r = ratios[i]!;
    const y = lane.y + r * lane.height;
    const label = hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`;
    ctx.fillText(label, axisW - 4, y);
    ctx.strokeStyle = "#2a303c";
    ctx.beginPath();
    ctx.moveTo(axisW - 3, y + 0.5);
    ctx.lineTo(axisW, y + 0.5);
    ctx.stroke();
  }
  void fftSize;
  ctx.textAlign = "left";
}
