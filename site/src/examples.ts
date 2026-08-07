import { L, type Msg } from "./i18n/types";

export type ExampleMeta = {
  path: string;
  tag: string;
  title: Msg;
  blurb: Msg;
};

export const EXAMPLES: ExampleMeta[] = [
  {
    path: "/examples/basic",
    tag: "Core",
    title: L("基础播放", "Basic Playback"),
    blurb: L(
      "加载音频、播放 / 暂停 / 停止、时间轴缩放平移。",
      "Load audio, play / pause / stop, zoom and pan the timeline.",
    ),
  },
  {
    path: "/examples/waveform-spectrogram",
    tag: "View",
    title: L("波形 ↔ 语谱", "Waveform ↔ Spectrogram"),
    blurb: L(
      "在波形与语谱视图间切换，观察一屏烘焙语谱。",
      "Switch waveform / spectrogram; spectrogram is baked once then cropped.",
    ),
  },
  {
    path: "/examples/selection",
    tag: "Nav",
    title: L("选区与导航", "Selection & Navigation"),
    blurb: L(
      "Shift 拖拽选区、过零吸附、跟随游标。",
      "Shift-drag selection, zero-crossing snap, follow playhead.",
    ),
  },
  {
    path: "/examples/edit",
    tag: "Edit",
    title: L("剪切粘贴删除", "Cut / Copy / Paste / Delete"),
    blurb: L(
      "选区编辑与撤销重做，播放中编辑会续播。",
      "Edit selection with undo/redo; editing while playing resumes playback.",
    ),
  },
  {
    path: "/examples/export",
    tag: "IO",
    title: L("导出 WAV", "Export WAV"),
    blurb: L(
      "导出选区或整段为 16-bit PCM WAV。",
      "Export selection or full buffer as 16-bit PCM WAV.",
    ),
  },
  {
    path: "/examples/rate",
    tag: "DSP",
    title: L("变速不变调", "Time-stretch (WSOLA)"),
    blurb: L(
      "WSOLA 分段拉伸，切换倍速听感与流畅度。",
      "Segmented WSOLA time-stretch — change rate, keep pitch.",
    ),
  },
  {
    path: "/examples/channels",
    tag: "Mix",
    title: L("通道路由", "Channel Routing"),
    blurb: L(
      "Original / Mono / Solo 与分轨显示。",
      "Original / Mono / Solo routing with per-lane display.",
    ),
  },
  {
    path: "/examples/play-selection",
    tag: "Transport",
    title: L("仅播选区", "Play Selection Only"),
    blurb: L("只播放选区，可选循环。", "Play only the selection, optionally loop."),
  },
  {
    path: "/examples/record",
    tag: "Record",
    title: L("固定时长录音", "Fixed-duration Record"),
    blurb: L(
      "麦克风录音，整段时间轴一屏，波形从左生长。",
      "Mic recording with full timeline on one screen; waveform grows left→right.",
    ),
  },
];
