import type { WaveformPeaks } from "../analysis/WaveformPeaks.js";
import type { ViewportMapper } from "../timeline/ViewportMapper.js";
import type { LaneRect } from "./LaneLayout.js";
import { defaultChannelLabel } from "../types.js";

export type WaveformLaneRenderOptions = {
  gains: number[];
  dimChannels?: Set<number> | null;
  channelCount: number;
};

export class WaveformLaneRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    peaks: WaveformPeaks,
    mapper: ViewportMapper,
    lanes: LaneRect[],
    options: WaveformLaneRenderOptions,
  ): void {
    const width = mapper.width;
    const x0 = mapper.offsetX;
    for (const lane of lanes) {
      const gain = options.gains[lane.channel] ?? 1;
      const dim = options.dimChannels?.has(lane.channel) ?? false;
      // Slight oversampling + continuous envelope fill helps avoid the "discrete dots" look.
      const oversample = 2;
      const queryCols = Math.max(2, Math.floor(width * oversample));
      const env = peaks.query(
        lane.channel,
        mapper.startSample,
        mapper.endSample,
        queryCols,
      );

      // lane background
      ctx.fillStyle = dim ? "#12151a" : "#161a22";
      ctx.fillRect(x0, lane.y, width, lane.height);

      // mid line
      const mid = lane.y + lane.height / 2;
      ctx.strokeStyle = "#2a303c";
      ctx.beginPath();
      ctx.moveTo(x0, mid + 0.5);
      ctx.lineTo(x0 + width, mid + 0.5);
      ctx.stroke();

      const amp = (lane.height / 2) * 0.92 * gain;
      const cols = env.length / 2;
      const xAt = (c: number): number =>
        x0 + (cols <= 1 ? 0 : (c / (cols - 1)) * width);

      const yTop = new Float32Array(cols);
      const yBottom = new Float32Array(cols);
      for (let c = 0; c < cols; c++) {
        const min = env[c * 2]!;
        const max = env[c * 2 + 1]!;
        yTop[c] = mid - max * amp;
        yBottom[c] = mid - min * amp;
      }

      // Fill between envelope bounds.
      ctx.fillStyle = dim
        ? "rgba(90, 160, 220, 0.25)"
        : "rgba(80, 180, 255, 0.35)";
      ctx.beginPath();
      ctx.moveTo(xAt(0), yBottom[0]!);
      for (let c = 1; c < cols; c++) ctx.lineTo(xAt(c), yBottom[c]!);
      for (let c = cols - 1; c >= 0; c--) ctx.lineTo(xAt(c), yTop[c]!);
      ctx.closePath();
      ctx.fill();

      // Subtle strokes for crispness.
      ctx.strokeStyle = dim ? "rgba(90, 160, 220, 0.55)" : "rgba(140, 215, 255, 0.85)";
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.moveTo(xAt(0), yTop[0]!);
      for (let c = 1; c < cols; c++) ctx.lineTo(xAt(c), yTop[c]!);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(xAt(0), yBottom[0]!);
      for (let c = 1; c < cols; c++) ctx.lineTo(xAt(c), yBottom[c]!);
      ctx.stroke();

      // label
      ctx.fillStyle = dim ? "#667084" : "#c5cedd";
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(
        defaultChannelLabel(lane.channel, options.channelCount),
        x0 + 6,
        lane.y + 4,
      );
    }
  }
}
