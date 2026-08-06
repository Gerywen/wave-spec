import type { SpectrogramFrames } from "../analysis/SpectrogramFrames.js";
import {
  magnitudeToDb,
  normalizeDb,
  spectrogramColor,
} from "../analysis/SpectrogramFrames.js";
import type { LaneRect } from "./LaneLayout.js";

/**
 * 把整段语谱一次性烘焙成 ImageBitmap。
 * 之后缩放/平移/跟随播放只做 drawImage 裁剪，不再按视口重算颜色。
 */
export class SpectrogramBitmapCache {
  private bitmaps: ImageBitmap[] = [];
  private hops: number[] = [];
  private framesArr: number[] = [];
  private bakedKey = "";
  private baking: Promise<void> | null = null;
  private bakeToken = 0;

  get ready(): boolean {
    return this.bitmaps.length > 0;
  }

  needsBake(minDb: number, maxDb: number, channelCount: number): boolean {
    return (
      this.bakedKey !== `${channelCount}:${minDb}:${maxDb}` ||
      this.bitmaps.length !== channelCount
    );
  }

  async bake(
    spectrograms: SpectrogramFrames,
    minDb: number,
    maxDb: number,
    freqBins = 256,
  ): Promise<void> {
    const key = `${spectrograms.channelCount}:${minDb}:${maxDb}`;
    if (this.bakedKey === key && this.bitmaps.length === spectrograms.channelCount) {
      return;
    }

    if (this.baking) {
      await this.baking;
      if (this.bakedKey === key && this.bitmaps.length === spectrograms.channelCount) return;
    }

    const token = ++this.bakeToken;
    this.baking = this.bakeInternal(spectrograms, minDb, maxDb, freqBins, key, token);
    try {
      await this.baking;
    } finally {
      this.baking = null;
    }
  }

  private async bakeInternal(
    spectrograms: SpectrogramFrames,
    minDb: number,
    maxDb: number,
    freqBins: number,
    key: string,
    token: number,
  ): Promise<void> {
    const next: ImageBitmap[] = [];
    const hops: number[] = [];
    const framesArr: number[] = [];

    for (let ch = 0; ch < spectrograms.channelCount; ch++) {
      if (token !== this.bakeToken) return;

      const spec = spectrograms.get(ch);
      const { frames, bins, magnitudes, hop, fftSize, sampleRate } = spec;
      const w = Math.max(1, frames);
      const h = Math.max(1, freqBins);
      const img = new ImageData(w, h);

      const hzMin = 20;
      const hzMax = sampleRate / 2;
      const yMax = Math.max(1, h - 1);

      // ImageData 行 0 在顶部；与频率轴一致：顶=低频，底=高频
      const bin0 = new Float32Array(h);
      const bin1 = new Int32Array(h);
      const binT = new Float32Array(h);
      for (let y = 0; y < h; y++) {
        const r = y / yMax;
        const hz = hzMax * Math.pow(hzMin / hzMax, 1 - r);
        const binFloat = (hz * fftSize) / sampleRate;
        const b0 = Math.max(0, Math.min(bins - 1, Math.floor(binFloat)));
        bin0[y] = b0;
        bin1[y] = Math.max(0, Math.min(bins - 1, b0 + 1));
        binT[y] = binFloat - b0;
      }

      const data = img.data;
      for (let y = 0; y < h; y++) {
        const b0 = bin0[y]!;
        const b1 = bin1[y]!;
        const tBin = binT[y]!;
        const row = y * w * 4;
        for (let f = 0; f < w; f++) {
          const base = f * bins;
          const mag =
            (magnitudes[base + b0] ?? 0) * (1 - tBin) + (magnitudes[base + b1] ?? 0) * tBin;
          const db = magnitudeToDb(mag);
          const t = normalizeDb(db, minDb, maxDb);
          const [cr, cg, cb] = spectrogramColor(t);
          const idx = row + f * 4;
          data[idx] = cr;
          data[idx + 1] = cg;
          data[idx + 2] = cb;
          data[idx + 3] = 255;
        }
        // 让出主线程，避免长音频烘焙时卡死 UI
        if ((y & 31) === 31) {
          await new Promise<void>((r) => setTimeout(r, 0));
          if (token !== this.bakeToken) return;
        }
      }

      next.push(await createImageBitmap(img));
      hops.push(hop);
      framesArr.push(frames);
    }

    if (token !== this.bakeToken) {
      for (const b of next) {
        try {
          b.close();
        } catch {
          /* ignore */
        }
      }
      return;
    }

    this.dispose();
    this.bitmaps = next;
    this.hops = hops;
    this.framesArr = framesArr;
    this.bakedKey = key;
  }

  drawLane(
    ctx: CanvasRenderingContext2D,
    channel: number,
    lane: LaneRect,
    plotX: number,
    plotW: number,
    startSample: number,
    endSample: number,
    dim: boolean,
  ): void {
    const bmp = this.bitmaps[channel];
    const hop = this.hops[channel];
    const frames = this.framesArr[channel];
    if (!bmp || !hop || !frames) return;

    const sx = Math.max(0, Math.min(frames - 1e-3, startSample / hop));
    const ex = Math.max(sx + 1e-3, Math.min(frames, endSample / hop));
    const sw = Math.max(1e-3, ex - sx);

    if (dim) ctx.globalAlpha = 0.35;
    ctx.drawImage(bmp, sx, 0, sw, bmp.height, plotX, lane.y, plotW, lane.height);
    if (dim) ctx.globalAlpha = 1;
  }

  dispose(): void {
    this.bakeToken++;
    for (const b of this.bitmaps) {
      try {
        b.close();
      } catch {
        /* ignore */
      }
    }
    this.bitmaps = [];
    this.hops = [];
    this.framesArr = [];
    this.bakedKey = "";
  }
}
