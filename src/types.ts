export type ViewMode = "waveform" | "spectrogram";

/** Original = 原声；Mono = 混单声道；Solo = 独奏某一轨（channel 从 0 起） */
export type PlayChannelMode =
  | { kind: "original" }
  | { kind: "mono" }
  | { kind: "solo"; channel: number };

export type TransportState = "idle" | "playing" | "paused";

export type SelectionRange = {
  /** 选区起点（采样点） */
  startSample: number;
  /** 选区终点（采样点） */
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
  /** 快退/快进步长（秒）。默认 5。 */
  skipSeconds?: number;
  /** 初始播放倍速（WSOLA）。默认 1。之后可 store.patch 修改。 */
  playbackRate?: number;
  /** 播放时视口是否跟随游标。默认 true。 */
  followPlayhead?: boolean;
  /** 选区/点击是否吸附过零点。默认 true。 */
  snapToZeroCrossing?: boolean;
  /** 语谱 STFT FFT 窗口（仅构造时）。默认 4096。越大频率更细、更慢。 */
  spectrogramFftSize?: number;
  /** 语谱 hop（采样点，仅构造时）。默认 fftSize/8。 */
  spectrogramHop?: number;
  /**
   * 工具栏显示哪些分组。默认 `"all"` 全部显示。
   * 示例页可只开当前模块相关项，减少干扰。
   */
  toolbar?: ToolbarGroup[] | "all";
};

/** 工具栏功能分组（对应 DOM 的 data-group） */
export type ToolbarGroup =
  | "transport" // 播放 / 停止 / 快退 / 快进 / 适配
  | "record" // 录音时长 / 录音 / 停录
  | "view" // 波形 / 语谱
  | "channel" // 通道路由
  | "rate" // 倍速
  | "volume" // 音量 / 静音
  | "follow" // 跟随游标
  | "snap" // 过零吸附
  | "selectionPlay" // 仅播放选区 / 选区循环
  | "gain" // 联动增益 / 增益
  | "spectrogram" // dB 最小 / 最大
  | "edit" // 剪切粘贴删除撤销重做
  | "export" // 导出
  | "selection"; // 清除选区

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
