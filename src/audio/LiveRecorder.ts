import { StreamingWaveformPeaks } from "../analysis/StreamingWaveformPeaks.js";

export type LiveRecorderOptions = {
  /** Planned recording length in seconds (full timeline on one screen). */
  durationSec: number;
  channelCount?: 1 | 2;
  sampleRate?: number;
  onProgress?: (writtenSamples: number, totalSamples: number) => void;
  onComplete?: (buffer: AudioBuffer) => void;
  onError?: (err: Error) => void;
};

/**
 * Fixed-duration mic recording into a preallocated buffer.
 * Timeline length is fixed from the start; samples grow from left to right.
 */
export class LiveRecorder {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private peaks: StreamingWaveformPeaks | null = null;
  private writeHead = 0;
  private running = false;
  private opts: LiveRecorderOptions | null = null;

  constructor(private readonly ctx: AudioContext) {}

  get isRecording(): boolean {
    return this.running;
  }

  getWriteHead(): number {
    return this.writeHead;
  }

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  getPeaks(): StreamingWaveformPeaks | null {
    return this.peaks;
  }

  getPlannedSamples(): number {
    return this.buffer?.length ?? 0;
  }

  async start(options: LiveRecorderOptions): Promise<void> {
    if (this.running) await this.stop({ finalize: false });

    const durationSec = Math.max(1, options.durationSec);
    const channelCount = options.channelCount ?? 1;
    if (this.ctx.state === "suspended") await this.ctx.resume();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: channelCount },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);
      throw error;
    }

    const sampleRate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(durationSec * sampleRate));
    const buffer = this.ctx.createBuffer(channelCount, length, sampleRate);
    // createBuffer is already zero-filled

    const peaks = new StreamingWaveformPeaks(buffer, 512);
    const processor = this.ctx.createScriptProcessor(4096, channelCount, channelCount);
    const source = this.ctx.createMediaStreamSource(stream);
    const mute = this.ctx.createGain();
    mute.gain.value = 0;

    this.stream = stream;
    this.source = source;
    this.processor = processor;
    this.mute = mute;
    this.buffer = buffer;
    this.peaks = peaks;
    this.writeHead = 0;
    this.running = true;
    this.opts = options;

    processor.onaudioprocess = (ev) => {
      if (!this.running || !this.buffer || !this.peaks) return;
      const input = ev.inputBuffer;
      const frames = input.length;
      const remain = this.buffer.length - this.writeHead;
      if (remain <= 0) {
        void this.stop({ finalize: true });
        return;
      }
      const n = Math.min(frames, remain);
      const prev = this.writeHead;
      for (let ch = 0; ch < this.buffer.numberOfChannels; ch++) {
        const dest = this.buffer.getChannelData(ch);
        const srcCh = Math.min(ch, input.numberOfChannels - 1);
        const src = input.getChannelData(srcCh);
        dest.set(src.subarray(0, n), this.writeHead);
      }
      this.writeHead += n;
      this.peaks.updateRange(prev, this.writeHead);
      options.onProgress?.(this.writeHead, this.buffer.length);
      if (this.writeHead >= this.buffer.length) {
        void this.stop({ finalize: true });
      }
    };

    source.connect(processor);
    processor.connect(mute);
    mute.connect(this.ctx.destination);
  }

  /**
   * Stop recording.
   * @param finalize if true, trim to written samples and invoke onComplete
   */
  async stop(opts?: { finalize?: boolean }): Promise<AudioBuffer | null> {
    const finalize = opts?.finalize !== false;
    const wasRunning = this.running;
    this.running = false;

    if (this.processor) {
      this.processor.onaudioprocess = null;
      try {
        this.processor.disconnect();
      } catch {
        /* ignore */
      }
      this.processor = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* ignore */
      }
      this.source = null;
    }
    if (this.mute) {
      try {
        this.mute.disconnect();
      } catch {
        /* ignore */
      }
      this.mute = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }

    if (!wasRunning || !this.buffer) return null;

    const written = Math.max(1, this.writeHead);
    let out = this.buffer;
    if (finalize && written < this.buffer.length) {
      out = trimBuffer(this.ctx, this.buffer, written);
    }

    this.buffer = null;
    this.peaks = null;
    this.writeHead = 0;
    const cb = this.opts?.onComplete;
    this.opts = null;
    if (finalize) cb?.(out);
    return finalize ? out : null;
  }
}

function trimBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, length: number): AudioBuffer {
  const n = Math.max(1, Math.min(buffer.length, length));
  const out = ctx.createBuffer(buffer.numberOfChannels, n, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(0, n));
  }
  return out;
}
