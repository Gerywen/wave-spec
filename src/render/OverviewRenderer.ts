import type { WaveformPeaks } from "../analysis/WaveformPeaks.js";

export class OverviewRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    peaks: WaveformPeaks,
    lengthSamples: number,
    viewportStart: number,
    viewportEnd: number,
    width: number,
    height: number,
    dpr: number,
  ): void {
    const canvas = ctx.canvas;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#12151a";
    ctx.fillRect(0, 0, width, height);

    // Mix channels for overview
    const cols = Math.max(1, Math.floor(width));
    const mid = height / 2;
    ctx.fillStyle = "rgba(80, 180, 255, 0.7)";

    for (let ch = 0; ch < peaks.channelCount; ch++) {
      const env = peaks.query(ch, 0, lengthSamples, cols);
      const alpha = 0.5 / peaks.channelCount;
      ctx.fillStyle = `rgba(80, 180, 255, ${alpha + 0.25})`;
      for (let c = 0; c < cols; c++) {
        const min = env[c * 2]!;
        const max = env[c * 2 + 1]!;
        const amp = (height / 2) * 0.85;
        const y1 = mid - max * amp;
        const y2 = mid - min * amp;
        ctx.fillRect(c, y1, 1, Math.max(1, y2 - y1));
      }
    }

    const x1 = (viewportStart / lengthSamples) * width;
    const x2 = (viewportEnd / lengthSamples) * width;
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(x1, 0, Math.max(2, x2 - x1), height);
    ctx.strokeStyle = "rgba(255, 220, 120, 0.9)";
    ctx.strokeRect(x1 + 0.5, 0.5, Math.max(2, x2 - x1) - 1, height - 1);
  }
}
