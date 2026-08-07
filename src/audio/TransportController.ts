import type { PlayerStateStore } from "../core/PlayerStateStore.js";
import type { PlayChannelMode, SelectionRange } from "../types.js";
import { ChannelRouter } from "./ChannelRouter.js";
import { TimeStretchEngineWasm } from "./TimeStretchEngineWasm.js";

export type TransportEvents = {
  ended: [];
  timeupdate: [sample: number];
};

type Listener = () => void;

type StretchCacheEntry = {
  key: string;
  buffer: AudioBuffer;
};

/** Source-seconds stretched per chunk (pitch-preserving path). */
const STRETCH_WINDOW_SEC = 45;
const STRETCH_CACHE_MAX = 12;
const PREWARM_RATES = [0.5, 0.75, 1.25, 1.5, 2];

export class TransportController {
  readonly audioContext: AudioContext;
  private buffer: AudioBuffer | null = null;
  private stretchCache: StretchCacheEntry[] = [];
  private source: AudioBufferSourceNode | null = null;
  private readonly router: ChannelRouter;
  private readonly masterGain: GainNode;
  private readonly stretcher = new TimeStretchEngineWasm();
  private anchorContextTime = 0;
  private anchorSample = 0;
  private playing = false;
  private rate = 1;
  private selection: SelectionRange | null = null;
  private playSelectionOnly = false;
  private loopSelection = false;
  private endedListeners = new Set<Listener>();
  private suppressEnded = false;
  private raf = 0;

  /** Original-timeline end of the currently playing stretched chunk. */
  private playSegEnd = 0;
  private playRangeEnd = 0;

  private bufferEpoch = 0;
  private warmEpoch = 0;

  constructor(
    private readonly store: PlayerStateStore,
    audioContext?: AudioContext,
  ) {
    this.audioContext = audioContext ?? new AudioContext();
    this.router = new ChannelRouter(this.audioContext);
    this.masterGain = this.audioContext.createGain();
    this.router.output.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  onEnded(listener: Listener): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  setBuffer(buffer: AudioBuffer, opts?: { syncTransport?: boolean }): void {
    this.stopInternal(true);
    this.buffer = buffer;
    this.bufferEpoch++;
    this.stretchCache = [];
    const state = this.store.getSnapshot();
    this.router.configure(buffer.numberOfChannels, state.playChannelMode);
    this.applyVolume();
    // 默认把 playing 同步成 paused；编辑续播路径会传 syncTransport:false 后自行 play()。
    if (opts?.syncTransport !== false && state.transport === "playing") {
      this.store.patch({ transport: "paused" });
    }
  }

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setChannelMode(mode: PlayChannelMode): void {
    this.router.setMode(mode);
    const cur = this.store.getSnapshot().playChannelMode;
    const same =
      cur.kind === mode.kind &&
      (mode.kind !== "solo" || (cur.kind === "solo" && cur.channel === mode.channel));
    if (!same) {
      this.store.patch({ playChannelMode: mode });
    }
  }

  setSelectionOptions(opts: {
    selection: SelectionRange | null;
    playSelectionOnly: boolean;
    loopSelection: boolean;
  }): void {
    this.selection = opts.selection;
    this.playSelectionOnly = opts.playSelectionOnly;
    this.loopSelection = opts.loopSelection;
  }

  setVolume(volume: number, muted: boolean): void {
    this.store.patch({ volume, muted });
    this.applyVolume();
  }

  private applyVolume(): void {
    const { volume, muted } = this.store.getSnapshot();
    this.masterGain.gain.value = muted ? 0 : volume;
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (!(rate > 0)) throw new Error("playbackRate must be positive");
    if (Math.abs(rate - this.rate) < 1e-9) return;
    const sample = this.getCurrentSample();
    this.rate = rate;
    if (this.store.getSnapshot().playbackRate !== rate) {
      this.store.patch({ playbackRate: rate });
    }
    if (this.playing) {
      await this.play(sample);
    }
  }

  getCurrentSample(): number {
    const state = this.store.getSnapshot();
    if (!this.playing || !this.buffer) return state.playheadSample;
    const elapsed = (this.audioContext.currentTime - this.anchorContextTime) * this.rate;
    const sample = this.anchorSample + elapsed * this.buffer.sampleRate;
    return Math.min(this.buffer.length, Math.max(0, sample));
  }

  async play(fromSample?: number): Promise<void> {
    if (!this.buffer) return;
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const state = this.store.getSnapshot();
    let start = fromSample ?? state.playheadSample;
    let end = this.buffer.length;

    if (this.playSelectionOnly && this.selection) {
      const sel = normalizeSelection(this.selection);
      start = Math.max(sel.startSample, Math.min(start, sel.endSample));
      end = sel.endSample;
      if (start >= end) start = sel.startSample;
    }

    start = Math.max(0, Math.min(this.buffer.length, start));
    end = Math.max(start, Math.min(this.buffer.length, end));
    // 若游标已在结尾（或未归零的旧状态），从开头 / 选区起点重播
    if (start >= end - 1) {
      if (this.playSelectionOnly && this.selection) {
        start = normalizeSelection(this.selection).startSample;
        end = normalizeSelection(this.selection).endSample;
      } else {
        start = 0;
        end = this.buffer.length;
      }
    }
    if (start >= end) return;

    this.stopInternal(true);
    this.playRangeEnd = end;

    const rate = this.rate;
    const useSegment = Math.abs(rate - 1) >= 1e-3;

    let playBuffer: AudioBuffer;
    let offsetSeconds: number;
    let durationSeconds: number;

    if (!useSegment) {
      playBuffer = this.buffer;
      offsetSeconds = start / playBuffer.sampleRate;
      durationSeconds = (end - start) / playBuffer.sampleRate;
      this.playSegEnd = end;
    } else {
      const win = Math.max(1, Math.floor(STRETCH_WINDOW_SEC * this.buffer.sampleRate));
      const segStart = Math.floor(start);
      const segEnd = Math.min(end, segStart + win);
      playBuffer = this.getStretchedSegment(rate, segStart, segEnd);
      // Chunk always starts at segStart → play from 0 of stretched buffer.
      offsetSeconds = 0;
      durationSeconds = playBuffer.duration;
      this.playSegEnd = segEnd;
      // Prefetch next chunk while this one plays.
      this.prefetchSegment(rate, segEnd, end);
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = playBuffer;
    source.connect(this.router.input);
    this.suppressEnded = false;
    source.onended = () => {
      if (this.suppressEnded) return;
      if (this.loopSelection && this.playSelectionOnly && this.selection) {
        void this.play(normalizeSelection(this.selection).startSample);
        return;
      }
      // Chain next stretch window when pitch-preserving rate uses segments.
      if (Math.abs(this.rate - 1) >= 1e-3 && this.playSegEnd < this.playRangeEnd - 1) {
        void this.play(this.playSegEnd);
        return;
      }
      this.playing = false;
      this.source = null;
      // 播完自动归位，便于直接再点播放（停在末尾会导致 start>=end 无法开播）
      const resetSample =
        this.playSelectionOnly && this.selection
          ? normalizeSelection(this.selection).startSample
          : 0;
      this.store.patch({ transport: "paused", playheadSample: resetSample });
      for (const l of this.endedListeners) l();
    };

    this.source = source;
    this.anchorSample = start;
    this.anchorContextTime = this.audioContext.currentTime;
    this.playing = true;
    this.store.patch({ transport: "playing", playheadSample: start });
    source.start(0, offsetSeconds, Math.max(0, durationSeconds));
    this.startClock();
  }

  pause(): void {
    if (!this.playing) return;
    const sample = this.getCurrentSample();
    this.stopInternal(true);
    this.store.patch({ transport: "paused", playheadSample: sample });
  }

  /** Stop and seek to 0 (product decision). */
  stop(): void {
    this.stopInternal(true);
    this.store.patch({ transport: "idle", playheadSample: 0 });
  }

  skipForward(seconds?: number): void {
    const state = this.store.getSnapshot();
    const sec = seconds ?? state.skipSeconds;
    const delta = sec * state.sampleRate;
    this.seek(state.playheadSample + delta);
  }

  skipBackward(seconds?: number): void {
    const state = this.store.getSnapshot();
    const sec = seconds ?? state.skipSeconds;
    const delta = sec * state.sampleRate;
    this.seek(state.playheadSample - delta);
  }

  seek(sample: number): void {
    const state = this.store.getSnapshot();
    const clamped = Math.min(state.lengthSamples, Math.max(0, sample));
    const wasPlaying = this.playing;
    if (wasPlaying) {
      void this.play(clamped);
    } else {
      this.store.patch({ playheadSample: clamped });
    }
  }

  /**
   * Idle-prewarm common rates for a window starting at `fromSample`.
   * Call after load / edit; safe to overlap — older runs are cancelled via epoch.
   */
  async prewarmRates(fromSample = 0, rates: number[] = PREWARM_RATES): Promise<void> {
    const buffer = this.buffer;
    if (!buffer) return;
    await TimeStretchEngineWasm.ensureWasm();

    const epoch = ++this.warmEpoch;
    const bufferEpoch = this.bufferEpoch;
    const win = Math.max(1, Math.floor(STRETCH_WINDOW_SEC * buffer.sampleRate));
    const lo = Math.max(0, Math.min(buffer.length - 1, Math.floor(fromSample)));
    const hi = Math.min(buffer.length, lo + win);
    if (hi <= lo) return;

    for (const rate of rates) {
      if (epoch !== this.warmEpoch || bufferEpoch !== this.bufferEpoch) return;
      if (Math.abs(rate - 1) < 1e-3) continue;
      this.getStretchedSegment(rate, lo, hi);
      await yieldToMain();
    }
  }

  private getStretchedSegment(rate: number, lo: number, hi: number): AudioBuffer {
    if (!this.buffer) throw new Error("No buffer");
    const key = `${rate.toFixed(4)}:${lo}:${hi}`;
    const hit = this.stretchCache.find((e) => e.key === key);
    if (hit) {
      // LRU bump
      this.stretchCache = this.stretchCache.filter((e) => e.key !== key);
      this.stretchCache.push(hit);
      return hit.buffer;
    }

    const slice = sliceAudioBuffer(this.audioContext, this.buffer, lo, hi);
    const stretched = this.stretcher.stretch(slice, rate, this.audioContext);
    this.stretchCache.push({ key, buffer: stretched });
    while (this.stretchCache.length > STRETCH_CACHE_MAX) {
      this.stretchCache.shift();
    }
    return stretched;
  }

  private prefetchSegment(rate: number, nextStart: number, rangeEnd: number): void {
    if (!this.buffer || nextStart >= rangeEnd - 1) return;
    const bufferEpoch = this.bufferEpoch;
    const win = Math.max(1, Math.floor(STRETCH_WINDOW_SEC * this.buffer.sampleRate));
    const lo = nextStart;
    const hi = Math.min(rangeEnd, lo + win);
    const key = `${rate.toFixed(4)}:${lo}:${hi}`;
    if (this.stretchCache.some((e) => e.key === key)) return;

    void (async () => {
      await yieldToMain();
      if (!this.buffer || bufferEpoch !== this.bufferEpoch) return;
      if (Math.abs(this.rate - rate) > 1e-9) return;
      try {
        this.getStretchedSegment(rate, lo, hi);
      } catch {
        /* ignore prefetch errors */
      }
    })();
  }

  private stopInternal(suppressEnded: boolean): void {
    this.suppressEnded = suppressEnded;
    this.stopClock();
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
        this.source.disconnect();
      } catch {
        /* ignore */
      }
      this.source = null;
    }
    this.playing = false;
  }

  private startClock(): void {
    this.stopClock();
    const tick = () => {
      if (!this.playing) return;
      const sample = this.getCurrentSample();
      this.store.patch({ playheadSample: sample });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopClock(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  dispose(): void {
    this.warmEpoch++;
    this.stopInternal(true);
    this.router.dispose();
    try {
      this.masterGain.disconnect();
    } catch {
      /* ignore */
    }
  }
}

function normalizeSelection(sel: SelectionRange): SelectionRange {
  if (sel.startSample <= sel.endSample) return sel;
  return { startSample: sel.endSample, endSample: sel.startSample };
}

function sliceAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  lo: number,
  hi: number,
): AudioBuffer {
  const start = Math.max(0, Math.min(buffer.length, Math.floor(lo)));
  const end = Math.max(start + 1, Math.min(buffer.length, Math.ceil(hi)));
  const n = end - start;
  const out = ctx.createBuffer(buffer.numberOfChannels, n, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(start, end));
  }
  return out;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 32 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
