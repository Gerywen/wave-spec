import { ViewportMapper } from "./ViewportMapper.js";

export type TimeTick = {
  sample: number;
  major: boolean;
  label: string;
};

function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const n = raw / base;
  let nice: number;
  if (n <= 1) nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const s = Math.abs(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${sign}${h}:${String(m).padStart(2, "0")}:${sec.toFixed(s < 10 ? 2 : 1).padStart(4, "0")}`;
  }
  if (m > 0 || s >= 60) {
    const whole = Math.floor(sec);
    const frac = sec - whole;
    if (frac < 0.001) return `${sign}${m}:${String(whole).padStart(2, "0")}`;
    return `${sign}${m}:${sec.toFixed(2).padStart(5, "0")}`;
  }
  if (s >= 1) return `${sign}${sec.toFixed(2)}s`;
  return `${sign}${(sec * 1000).toFixed(0)}ms`;
}

export function computeTicks(mapper: ViewportMapper, targetMajorPx = 100): TimeTick[] {
  const spp = mapper.samplesPerPixel;
  const majorSamples = niceStep((targetMajorPx * spp) || 1);
  const minorSamples = majorSamples / 5;
  const start = Math.floor(mapper.startSample / minorSamples) * minorSamples;
  const ticks: TimeTick[] = [];

  for (let sample = start; sample <= mapper.endSample + minorSamples * 0.5; sample += minorSamples) {
    if (sample < mapper.startSample - minorSamples || sample > mapper.endSample + minorSamples) continue;
    const major = Math.abs(sample / majorSamples - Math.round(sample / majorSamples)) < 1e-6;
    ticks.push({
      sample,
      major,
      label: major ? formatTime(mapper.sampleToTime(sample)) : "",
    });
  }
  return ticks;
}

export function formatClock(sample: number, sampleRate: number): string {
  if (!(sampleRate > 0)) return "00:00.000";
  const totalMs = Math.max(0, (sample / sampleRate) * 1000);
  const ms = Math.floor(totalMs % 1000);
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const body = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  return h > 0 ? `${h}:${body}` : body;
}

export class TimeRuler {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  render(mapper: ViewportMapper, dpr: number): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const bw = Math.max(1, Math.floor(width * dpr));
    const bh = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#1a1d23";
    ctx.fillRect(0, 0, width, height);

    // 左侧频率轴 gutter：时间刻度从 plot 区开始，不挤进 gutter
    if (mapper.offsetX > 0) {
      ctx.fillStyle = "#141820";
      ctx.fillRect(0, 0, mapper.offsetX, height);
    }

    const ticks = computeTicks(mapper);
    ctx.strokeStyle = "#4a5160";
    ctx.fillStyle = "#a8b0c0";
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";

    for (const tick of ticks) {
      const x = mapper.sampleToX(tick.sample);
      if (x < mapper.offsetX - 1 || x > mapper.plotRight + 1) continue;
      const h = tick.major ? height * 0.55 : height * 0.3;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, height);
      ctx.lineTo(x + 0.5, height - h);
      ctx.stroke();
      if (tick.major && tick.label) {
        ctx.fillText(tick.label, x + 4, 4);
      }
    }

    ctx.strokeStyle = "#2e3440";
    ctx.beginPath();
    ctx.moveTo(mapper.offsetX, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();
  }
}
