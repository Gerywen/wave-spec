export type ViewportRange = {
  sampleRate: number;
  startSample: number;
  endSample: number;
  /** Plot area width in CSS pixels (excludes left axis gutter). */
  width: number;
  /** Left gutter width in CSS pixels (frequency axis). Default 0. */
  offsetX?: number;
};

function assertViewport(range: ViewportRange): void {
  if (!(range.sampleRate > 0)) throw new Error("sampleRate must be positive");
  if (!(range.width > 0)) throw new Error("width must be positive");
  if (!(range.endSample > range.startSample)) {
    throw new Error("endSample must be greater than startSample");
  }
}

export class ViewportMapper {
  readonly sampleRate: number;
  readonly startSample: number;
  readonly endSample: number;
  /** Plot area width (time-mapped region). */
  readonly width: number;
  /** Left gutter before the plot (e.g. frequency axis). */
  readonly offsetX: number;

  constructor(range: ViewportRange) {
    assertViewport(range);
    this.sampleRate = range.sampleRate;
    this.startSample = range.startSample;
    this.endSample = range.endSample;
    this.width = range.width;
    this.offsetX = range.offsetX ?? 0;
  }

  get durationSamples(): number {
    return this.endSample - this.startSample;
  }

  get samplesPerPixel(): number {
    return this.durationSamples / this.width;
  }

  get plotRight(): number {
    return this.offsetX + this.width;
  }

  /** Convert sample → canvas X (includes offsetX). */
  sampleToX(sample: number): number {
    return this.offsetX + ((sample - this.startSample) / this.durationSamples) * this.width;
  }

  /** Convert canvas X → sample (subtracts offsetX). */
  xToSample(x: number): number {
    const local = x - this.offsetX;
    return this.startSample + (local / this.width) * this.durationSamples;
  }

  sampleToTime(sample: number): number {
    return sample / this.sampleRate;
  }
}
