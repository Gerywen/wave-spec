import type { ViewportMapper } from "../timeline/ViewportMapper.js";
import type { SelectionRange } from "../types.js";

export class PlayheadOverlay {
  render(
    ctx: CanvasRenderingContext2D,
    mapper: ViewportMapper,
    playheadSample: number,
    selection: SelectionRange | null,
    height: number,
  ): void {
    const left = mapper.offsetX;
    const right = mapper.plotRight;

    if (selection) {
      const a = Math.min(selection.startSample, selection.endSample);
      const b = Math.max(selection.startSample, selection.endSample);
      const x1 = Math.max(left, mapper.sampleToX(a));
      const x2 = Math.min(right, mapper.sampleToX(b));
      if (x2 > x1) {
        ctx.fillStyle = "rgba(255, 196, 64, 0.18)";
        ctx.fillRect(x1, 0, x2 - x1, height);
        ctx.strokeStyle = "rgba(255, 196, 64, 0.7)";
        ctx.beginPath();
        ctx.moveTo(x1 + 0.5, 0);
        ctx.lineTo(x1 + 0.5, height);
        ctx.moveTo(x2 + 0.5, 0);
        ctx.lineTo(x2 + 0.5, height);
        ctx.stroke();
      }
    }

    const x = mapper.sampleToX(playheadSample);
    if (x >= left - 1 && x <= right + 1) {
      ctx.strokeStyle = "#ff5a5a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
  }
}
