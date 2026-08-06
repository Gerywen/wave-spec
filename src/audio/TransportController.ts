import type { PlayerStateStore } from "../core/PlayerStateStore.js";
import type { PlayChannelMode, SelectionRange } from "../types.js";
import { ChannelRouter } from "./ChannelRouter.js";
import { TimeStretchEngineWasm } from "./TimeStretchEngineWasm.js";

export type TransportEvents = {
  ended: [];
  timeupdate: [sample: number];
};

type Listener = () => void;

export class TransportController {
  readonly audioContext: AudioContext;
  private buffer: AudioBuffer | null = null;
  private stretchedCache = new Map<string, AudioBuffer>();
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

  setBuffer(buffer: AudioBuffer): void {
    this.stopInternal(false);
    this.buffer = buffer;
    this.stretchedCache.clear();
    const state = this.store.getSnapshot();
    this.router.configure(buffer.numberOfChannels, state.playChannelMode);
    this.applyVolume();
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

    this.stopInternal(true);
    const playBuffer = this.getPlayBuffer(this.rate);
    // Map samples: stretched buffer timeline is compressed by rate
    const rate = this.rate;
    const srcStart = start / rate;
    const srcDuration = (end - start) / rate;

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
      this.playing = false;
      this.source = null;
      const finalSample =
        this.playSelectionOnly && this.selection
          ? normalizeSelection(this.selection).endSample
          : this.buffer?.length ?? 0;
      this.store.patch({ transport: "paused", playheadSample: finalSample });
      for (const l of this.endedListeners) l();
    };

    this.source = source;
    this.anchorSample = start;
    this.anchorContextTime = this.audioContext.currentTime;
    this.playing = true;
    this.store.patch({ transport: "playing", playheadSample: start });
    source.start(0, srcStart / playBuffer.sampleRate, Math.max(0, srcDuration / playBuffer.sampleRate));
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

  private getPlayBuffer(rate: number): AudioBuffer {
    if (!this.buffer) throw new Error("No buffer");
    const key = rate.toFixed(4);
    let cached = this.stretchedCache.get(key);
    if (!cached) {
      cached = this.stretcher.stretch(this.buffer, rate, this.audioContext);
      this.stretchedCache.set(key, cached);
      // Limit cache size
      if (this.stretchedCache.size > 4) {
        const first = this.stretchedCache.keys().next().value;
        if (first) this.stretchedCache.delete(first);
      }
    }
    return cached;
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
