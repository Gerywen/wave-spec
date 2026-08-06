import type { PlayerStateStore } from "../core/PlayerStateStore.js";
import type { ViewportRange } from "../types.js";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export class TimelineController {
  constructor(private readonly store: PlayerStateStore) {}

  private length(): number {
    return Math.max(1, this.store.getSnapshot().lengthSamples);
  }

  fitAll(): void {
    const length = this.length();
    this.store.patch({
      viewport: { startSample: 0, endSample: length },
    });
  }

  /**
   * Zoom around an anchor sample. factor > 1 zooms in.
   */
  zoomAt(anchorSample: number, factor: number): void {
    const state = this.store.getSnapshot();
    const length = this.length();
    const { startSample, endSample } = state.viewport;
    const duration = endSample - startSample;
    if (!(duration > 0) || !(factor > 0)) return;

    const minDuration = Math.max(8, state.sampleRate * 0.005);
    const maxDuration = length;
    let nextDuration = clamp(duration / factor, minDuration, maxDuration);

    const ratio = (anchorSample - startSample) / duration;
    let start = anchorSample - ratio * nextDuration;
    let end = start + nextDuration;

    if (start < 0) {
      start = 0;
      end = nextDuration;
    }
    if (end > length) {
      end = length;
      start = Math.max(0, end - nextDuration);
    }

    this.store.patch({
      viewport: { startSample: start, endSample: end },
    });
  }

  panBySamples(deltaSamples: number): void {
    const state = this.store.getSnapshot();
    const length = this.length();
    const duration = state.viewport.endSample - state.viewport.startSample;
    let start = state.viewport.startSample + deltaSamples;
    let end = start + duration;
    if (start < 0) {
      start = 0;
      end = duration;
    }
    if (end > length) {
      end = length;
      start = Math.max(0, end - duration);
    }
    this.store.patch({
      viewport: { startSample: start, endSample: end },
    });
  }

  setViewport(viewport: ViewportRange): void {
    const length = this.length();
    let start = clamp(viewport.startSample, 0, length - 1);
    let end = clamp(viewport.endSample, start + 1, length);
    this.store.patch({ viewport: { startSample: start, endSample: end } });
  }

  setPlayhead(sample: number): void {
    const length = this.length();
    const playheadSample = clamp(sample, 0, length);
    this.store.patch({ playheadSample });
  }

  /** Keep playhead visible near the right edge while following. */
  followIfNeeded(marginRatio = 0.15): void {
    const state = this.store.getSnapshot();
    if (!state.followPlayhead || state.transport !== "playing") return;

    const { startSample, endSample } = state.viewport;
    const duration = endSample - startSample;
    const margin = duration * marginRatio;
    const playhead = state.playheadSample;

    if (playhead < startSample || playhead > endSample - margin) {
      let start = playhead - duration * (1 - marginRatio);
      let end = start + duration;
      const length = this.length();
      if (start < 0) {
        start = 0;
        end = duration;
      }
      if (end > length) {
        end = length;
        start = Math.max(0, end - duration);
      }
      this.store.patch({ viewport: { startSample: start, endSample: end } });
    }
  }
}
