export type ViewMode = "waveform" | "spectrogram";

/** Original = file channels as-is; Mono = mixdown; Solo = one channel */
export type PlayChannelMode =
  | { kind: "original" }
  | { kind: "mono" }
  | { kind: "solo"; channel: number };

export type TransportState = "idle" | "playing" | "paused";

export type SelectionRange = {
  startSample: number;
  endSample: number;
};

export type ViewportRange = {
  startSample: number;
  endSample: number;
};

export type PlayerState = {
  sampleRate: number;
  lengthSamples: number;
  channelCount: number;
  viewMode: ViewMode;
  viewport: ViewportRange;
  playheadSample: number;
  selection: SelectionRange | null;
  playChannelMode: PlayChannelMode;
  /** Relative heights per lane; length === channelCount; sums to 1 */
  laneHeights: number[];
  /** Per-channel waveform gain; linked when waveformGainLinked */
  waveformGain: number[];
  waveformGainLinked: boolean;
  spectrogramMinDb: number;
  spectrogramMaxDb: number;
  skipSeconds: number;
  followPlayhead: boolean;
  snapToZeroCrossing: boolean;
  loopSelection: boolean;
  playSelectionOnly: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  transport: TransportState;
};

export type PlayerStatePatch = Partial<
  Omit<PlayerState, "laneHeights" | "waveformGain" | "viewport" | "selection" | "playChannelMode">
> & {
  laneHeights?: number[];
  waveformGain?: number[];
  viewport?: ViewportRange;
  selection?: SelectionRange | null;
  playChannelMode?: PlayChannelMode;
};

export type AudioPlayerControlOptions = {
  skipSeconds?: number;
  playbackRate?: number;
  followPlayhead?: boolean;
  snapToZeroCrossing?: boolean;
  spectrogramFftSize?: number;
  spectrogramHop?: number;
};

export type LoadProgress = {
  stage: "fetch" | "decode" | "analyze" | "done";
  progress: number;
  message?: string;
};

export type ChannelLabel = string;

export function defaultChannelLabel(channel: number, channelCount: number): ChannelLabel {
  if (channelCount === 2) return channel === 0 ? "L" : "R";
  return `Ch${channel + 1}`;
}

export function createInitialState(options: AudioPlayerControlOptions = {}): PlayerState {
  return {
    sampleRate: 44100,
    lengthSamples: 0,
    channelCount: 0,
    viewMode: "waveform",
    viewport: { startSample: 0, endSample: 1 },
    playheadSample: 0,
    selection: null,
    playChannelMode: { kind: "original" },
    laneHeights: [],
    waveformGain: [],
    waveformGainLinked: true,
    spectrogramMinDb: -100,
    spectrogramMaxDb: -5,
    skipSeconds: options.skipSeconds ?? 5,
    followPlayhead: options.followPlayhead ?? true,
    snapToZeroCrossing: options.snapToZeroCrossing ?? true,
    loopSelection: false,
    playSelectionOnly: false,
    playbackRate: options.playbackRate ?? 1,
    volume: 1,
    muted: false,
    transport: "idle",
  };
}
