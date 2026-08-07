import type { PlayerState, PlayerStatePatch } from "../types.js";
import { createInitialState, type AudioPlayerControlOptions } from "../types.js";
import { EventBus } from "./EventBus.js";

export type StoreEvents = {
  change: [PlayerState, PlayerStatePatch];
};

function equalViewport(
  a: PlayerState["viewport"],
  b: PlayerState["viewport"],
): boolean {
  return a.startSample === b.startSample && a.endSample === b.endSample;
}

function equalSelection(
  a: PlayerState["selection"],
  b: PlayerState["selection"],
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.startSample === b.startSample && a.endSample === b.endSample;
}

function equalChannelMode(
  a: PlayerState["playChannelMode"],
  b: PlayerState["playChannelMode"],
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "solo" && b.kind === "solo") return a.channel === b.channel;
  return true;
}

export class PlayerStateStore {
  readonly bus = new EventBus<StoreEvents>();
  private state: PlayerState;

  constructor(options: AudioPlayerControlOptions = {}) {
    this.state = createInitialState(options);
  }

  getSnapshot(): PlayerState {
    return this.state;
  }

  patch(partial: PlayerStatePatch): PlayerState {
    const next: PlayerState = { ...this.state, ...partial };

    if (partial.viewport) {
      next.viewport = { ...partial.viewport };
    }
    if (partial.selection !== undefined) {
      next.selection = partial.selection
        ? { ...partial.selection }
        : null;
    }
    if (partial.playChannelMode) {
      next.playChannelMode = { ...partial.playChannelMode } as PlayerState["playChannelMode"];
    }
    if (partial.laneHeights) {
      next.laneHeights = [...partial.laneHeights];
    }
    if (partial.waveformGain) {
      next.waveformGain = [...partial.waveformGain];
    }

    const changed: PlayerStatePatch = {};
    let dirty = false;
    for (const key of Object.keys(partial) as (keyof PlayerStatePatch)[]) {
      const prevVal = this.state[key as keyof PlayerState];
      const nextVal = next[key as keyof PlayerState];
      if (key === "viewport") {
        if (!equalViewport(this.state.viewport, next.viewport)) {
          changed.viewport = next.viewport;
          dirty = true;
        }
      } else if (key === "selection") {
        if (!equalSelection(this.state.selection, next.selection)) {
          changed.selection = next.selection;
          dirty = true;
        }
      } else if (key === "playChannelMode") {
        if (!equalChannelMode(this.state.playChannelMode, next.playChannelMode)) {
          changed.playChannelMode = next.playChannelMode;
          dirty = true;
        }
      } else if (key === "laneHeights" || key === "waveformGain") {
        const a = prevVal as number[];
        const b = nextVal as number[];
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
          (changed as Record<string, unknown>)[key] = b;
          dirty = true;
        }
      } else if (prevVal !== nextVal) {
        (changed as Record<string, unknown>)[key] = nextVal;
        dirty = true;
      }
    }

    if (!dirty) return this.state;
    this.state = next;
    this.bus.emit("change", this.state, changed);
    return this.state;
  }

  resetForBuffer(buffer: AudioBuffer): void {
    const channelCount = buffer.numberOfChannels;
    const lengthSamples = buffer.length;
    const equal = 1 / Math.max(1, channelCount);
    this.patch({
      sampleRate: buffer.sampleRate,
      lengthSamples,
      channelCount,
      viewport: { startSample: 0, endSample: Math.max(1, lengthSamples) },
      playheadSample: 0,
      selection: null,
      playChannelMode: { kind: "original" },
      laneHeights: Array.from({ length: channelCount }, () => equal),
      waveformGain: Array.from({ length: channelCount }, () => 1),
      transport: "idle",
      viewMode: "waveform",
    });
  }
}
