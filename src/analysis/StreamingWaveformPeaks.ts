/**
 * Coarse peak buckets for live recording display.
 * Full planned duration fits one screen; only written samples update buckets.
 */
export class StreamingWaveformPeaks {
  readonly channelCount: number;
  readonly lengthSamples: number;
  readonly hop: number;
  private readonly channels: Float32Array[];
  /** per channel: interleaved min/max, length = bucketCount * 2 */
  private readonly buckets: Float32Array[];
  private readonly bucketCount: number;

  constructor(buffer: AudioBuffer, hop = 512) {
    this.channelCount = buffer.numberOfChannels;
    this.lengthSamples = buffer.length;
    this.hop = Math.max(64, hop);
    this.bucketCount = Math.max(1, Math.ceil(buffer.length / this.hop));
    this.channels = [];
    this.buckets = [];
    for (let ch = 0; ch < this.channelCount; ch++) {
      this.channels.push(buffer.getChannelData(ch));
      const b = new Float32Array(this.bucketCount * 2);
      // silence → flat line at 0
      for (let i = 0; i < this.bucketCount; i++) {
        b[i * 2] = 0;
        b[i * 2 + 1] = 0;
      }
      this.buckets.push(b);
    }
  }

  /** Recompute buckets covering sample range [from, to). */
  updateRange(from: number, to: number): void {
    const lo = Math.max(0, Math.floor(from));
    const hi = Math.min(this.lengthSamples, Math.ceil(to));
    if (hi <= lo) return;
    const b0 = Math.floor(lo / this.hop);
    const b1 = Math.min(this.bucketCount - 1, Math.floor((hi - 1) / this.hop));
    for (let ch = 0; ch < this.channelCount; ch++) {
      const data = this.channels[ch]!;
      const buckets = this.buckets[ch]!;
      for (let b = b0; b <= b1; b++) {
        const a = b * this.hop;
        const z = Math.min(this.lengthSamples, a + this.hop);
        let min = 1;
        let max = -1;
        let any = false;
        for (let i = a; i < z; i++) {
          const v = data[i]!;
          if (v < min) min = v;
          if (v > max) max = v;
          any = true;
        }
        buckets[b * 2] = any ? min : 0;
        buckets[b * 2 + 1] = any ? max : 0;
      }
    }
  }

  query(
    channel: number,
    startSample: number,
    endSample: number,
    columns: number,
  ): Float32Array {
    const buckets = this.buckets[channel];
    const cols = Math.max(1, Math.floor(columns));
    const out = new Float32Array(cols * 2);
    if (!buckets) return out;

    const duration = Math.max(1, endSample - startSample);
    const samplesPerCol = duration / cols;

    for (let c = 0; c < cols; c++) {
      const a = startSample + c * samplesPerCol;
      const b = startSample + (c + 1) * samplesPerCol;
      const i0 = Math.max(0, Math.floor(a / this.hop));
      const i1 = Math.min(this.bucketCount - 1, Math.floor((b - 1e-6) / this.hop));
      let min = 1;
      let max = -1;
      let any = false;
      for (let i = i0; i <= i1; i++) {
        const mn = buckets[i * 2]!;
        const mx = buckets[i * 2 + 1]!;
        if (mn < min) min = mn;
        if (mx > max) max = mx;
        any = true;
      }
      out[c * 2] = any ? min : 0;
      out[c * 2 + 1] = any ? max : 0;
    }
    return out;
  }
}
