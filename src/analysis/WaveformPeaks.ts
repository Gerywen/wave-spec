export type WaveformPeaksPrecomputed = {
  /** levels[channel][levelIndex] = interleaved min/max per column */
  levels: Float32Array[][];
};

/**
 * Multi-resolution peak pyramid for waveform drawing.
 */
export class WaveformPeaks {
  readonly channelCount: number;
  readonly lengthSamples: number;
  private readonly channels: Float32Array[];
  /** levels[channel][levelIndex] = interleaved min/max per column */
  private readonly levels: Float32Array[][];

  constructor(buffer: AudioBuffer, precomputed?: WaveformPeaksPrecomputed) {
    this.channelCount = buffer.numberOfChannels;
    this.lengthSamples = buffer.length;
    this.channels = [];
    for (let ch = 0; ch < this.channelCount; ch++) {
      this.channels.push(buffer.getChannelData(ch).slice());
    }
    this.levels = precomputed?.levels?.length
      ? precomputed.levels
      : this.channels.map((data) => buildPyramid(data));
  }

  /**
   * Query envelope for a viewport into `columns` min/max pairs.
   */
  query(
    channel: number,
    startSample: number,
    endSample: number,
    columns: number,
  ): Float32Array {
    const data = this.channels[channel];
    if (!data) return new Float32Array(Math.max(0, columns) * 2);

    const cols = Math.max(1, Math.floor(columns));
    const out = new Float32Array(cols * 2);
    const duration = Math.max(1, endSample - startSample);
    const samplesPerCol = duration / cols;

    // Pick pyramid level closest to samplesPerCol
    const pyramid = this.levels[channel]!;
    let level = 0;
    let block = 1;
    while (level + 1 < pyramid.length && block * 2 <= samplesPerCol) {
      level++;
      block *= 2;
    }

    if (samplesPerCol <= 1 || level === 0) {
      for (let c = 0; c < cols; c++) {
        const a = Math.floor(startSample + c * samplesPerCol);
        const b = Math.floor(startSample + (c + 1) * samplesPerCol);
        let min = 1;
        let max = -1;
        const lo = Math.max(0, a);
        const hi = Math.min(data.length, Math.max(lo + 1, b));
        for (let i = lo; i < hi; i++) {
          const v = data[i]!;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (lo >= hi) {
          min = 0;
          max = 0;
        }
        out[c * 2] = min;
        out[c * 2 + 1] = max;
      }
      return out;
    }

    const levelData = pyramid[level]!;
    const levelCols = levelData.length / 2;
    for (let c = 0; c < cols; c++) {
      const a = (startSample + c * samplesPerCol) / block;
      const b = (startSample + (c + 1) * samplesPerCol) / block;
      let min = 1;
      let max = -1;
      const lo = Math.max(0, Math.floor(a));
      const hi = Math.min(levelCols, Math.max(lo + 1, Math.ceil(b)));
      for (let i = lo; i < hi; i++) {
        const mn = levelData[i * 2]!;
        const mx = levelData[i * 2 + 1]!;
        if (mn < min) min = mn;
        if (mx > max) max = mx;
      }
      if (lo >= hi) {
        min = 0;
        max = 0;
      }
      out[c * 2] = min;
      out[c * 2 + 1] = max;
    }
    return out;
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel]!;
  }
}

function buildPyramid(data: Float32Array): Float32Array[] {
  const levels: Float32Array[] = [];
  // level 0 unused (raw); start from block=1 peaks
  let block = 1;
  let prev: Float32Array | null = null;

  while (block < data.length) {
    const cols = Math.ceil(data.length / block);
    const level = new Float32Array(cols * 2);
    if (block === 1) {
      for (let c = 0; c < cols; c++) {
        const v = data[c] ?? 0;
        level[c * 2] = v;
        level[c * 2 + 1] = v;
      }
    } else if (prev) {
      const prevCols = prev.length / 2;
      for (let c = 0; c < cols; c++) {
        const i0 = c * 2;
        const i1 = Math.min(prevCols - 1, c * 2 + 1);
        let min = prev[i0 * 2]!;
        let max = prev[i0 * 2 + 1]!;
        for (let i = i0; i <= i1; i++) {
          min = Math.min(min, prev[i * 2]!);
          max = Math.max(max, prev[i * 2 + 1]!);
        }
        level[c * 2] = min;
        level[c * 2 + 1] = max;
      }
    }
    levels.push(level);
    prev = level;
    block *= 2;
    if (levels.length > 24) break;
  }
  return levels;
}
