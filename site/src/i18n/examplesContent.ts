import type { Locale, Msg } from "../i18n/types";
import { L } from "../i18n/types";

export type ExamplePageContent = {
  title: Msg;
  blurb: Msg;
  tips: Msg[];
  source: Record<Locale, string>;
};

export const basicExample: ExamplePageContent = {
  title: L("基础播放", "Basic Playback"),
  blurb: L(
    "左改代码、右看控件。全部参数与方法说明见侧栏「参数与方法」。",
    "Edit code on the left, player on the right. Full API lives under “API Reference”.",
  ),
  tips: [
    L(
      "打开「参数与方法」查看每个函数参数的用途与效果",
      "Open “API Reference” for every parameter’s purpose and effect",
    ),
    L(
      "空格：播放 / 暂停 · 滚轮：缩放 ·「适配」：全长",
      "Space: play/pause · Wheel: zoom · Fit: full length",
    ),
  ],
  source: {
    zh: `// 完整参数表见侧栏「参数与方法」(/api)
// 注入：AudioPlayerControl / container / loadDemo / createDemoTone

const player = new AudioPlayerControl({
  // skipSeconds: number = 5 — 快退/快进秒数
  skipSeconds: 5,
  // playbackRate: number = 1 — 初始倍速（WSOLA）
  playbackRate: 1,
  // followPlayhead: boolean = true — 播放时视口跟随游标
  followPlayhead: true,
  // snapToZeroCrossing: boolean = true — 选区吸附过零点
  snapToZeroCrossing: true,
  // toolbar: 只显示本模块相关按钮
  toolbar: ["transport", "volume", "follow"],
});

player.mount(container);
await loadDemo(player);
`,
    en: `// Full API: sidebar “API Reference” (/api)
// Injected: AudioPlayerControl / container / loadDemo / createDemoTone

const player = new AudioPlayerControl({
  // skipSeconds: number = 5 — skip step for fwd/back
  skipSeconds: 5,
  // playbackRate: number = 1 — initial WSOLA rate
  playbackRate: 1,
  // followPlayhead: boolean = true — viewport follows playhead
  followPlayhead: true,
  // snapToZeroCrossing: boolean = true — snap selection to ZC
  snapToZeroCrossing: true,
  // toolbar: show only groups for this example
  toolbar: ["transport", "volume", "follow"],
});

player.mount(container);
await loadDemo(player);
`,
  },
};

export const waveformExample: ExamplePageContent = {
  title: L("波形 ↔ 语谱", "Waveform ↔ Spectrogram"),
  blurb: L(
    "工具栏只留视图切换与 dB 调节；左侧改代码右侧重挂载。",
    "Toolbar keeps view toggle + dB range; edit code to remount.",
  ),
  tips: [
    L("快捷键 S 语谱、W 波形", "Shortcuts: S spectrogram, W waveform"),
    L("试把 spectrogramMinDb 改成 -60", "Try spectrogramMinDb = -60"),
  ],
  source: {
    zh: `const player = new AudioPlayerControl({
  // 本页：波形/语谱 + dB 映射
  toolbar: ["transport", "view", "spectrogram", "volume"],
  // spectrogramFftSize：仅构造时；越大频率更细、更慢
  spectrogramFftSize: 4096,
  spectrogramHop: 512,
});

player.mount(container);
await loadDemo(player);
player.setViewMode("spectrogram"); // 或 "waveform"

player.store.patch({
  // 语谱颜色动态范围（dB）
  spectrogramMinDb: -100,
  spectrogramMaxDb: -5,
});
`,
    en: `const player = new AudioPlayerControl({
  // This page: view toggle + dB mapping
  toolbar: ["transport", "view", "spectrogram", "volume"],
  // spectrogramFftSize: ctor-only; larger = finer freq, slower
  spectrogramFftSize: 4096,
  spectrogramHop: 512,
});

player.mount(container);
await loadDemo(player);
player.setViewMode("spectrogram"); // or "waveform"

player.store.patch({
  // Spectrogram color dynamic range (dB)
  spectrogramMinDb: -100,
  spectrogramMaxDb: -5,
});
`,
  },
};

export const selectionExample: ExamplePageContent = {
  title: L("选区与导航", "Selection & Navigation"),
  blurb: L(
    "工具栏只留吸附、跟随与清除选区。",
    "Toolbar keeps snap, follow, and clear-selection.",
  ),
  tips: [
    L("Shift + 拖拽划选", "Shift + drag to select"),
    L(
      "把 snapToZeroCrossing 改成 false 再划选",
      "Set snapToZeroCrossing to false and select again",
    ),
  ],
  source: {
    zh: `const player = new AudioPlayerControl({
  toolbar: ["transport", "snap", "follow", "selection", "volume"],
  // snapToZeroCrossing：吸附过零 → 剪切更干净
  snapToZeroCrossing: true,
  // followPlayhead：播放时视口跟随
  followPlayhead: true,
});

player.mount(container);
await loadDemo(player);
`,
    en: `const player = new AudioPlayerControl({
  toolbar: ["transport", "snap", "follow", "selection", "volume"],
  // snapToZeroCrossing: cleaner cuts when true
  snapToZeroCrossing: true,
  // followPlayhead: scroll viewport while playing
  followPlayhead: true,
});

player.mount(container);
await loadDemo(player);
`,
  },
};

export const rateExample: ExamplePageContent = {
  title: L("变速不变调", "Time-stretch (WSOLA)"),
  blurb: L(
    "工具栏只留倍速与播放控制。",
    "Toolbar keeps rate + transport only.",
  ),
  tips: [
    L("常用倍率二次切换更快", "Common rates are prewarmed for faster switches"),
    L("非 1× 时按约 45s 窗口分段拉伸", "Non-1× uses ~45s WSOLA windows"),
  ],
  source: {
    zh: `const player = new AudioPlayerControl({
  toolbar: ["transport", "rate", "volume"],
});

player.mount(container);
await loadDemo(player, 12);

player.store.patch({
  // playbackRate：WSOLA 变速不变调；可改 0.75 / 1 / 1.5 / 2
  playbackRate: 1.5,
});
`,
    en: `const player = new AudioPlayerControl({
  toolbar: ["transport", "rate", "volume"],
});

player.mount(container);
await loadDemo(player, 12);

player.store.patch({
  // playbackRate: WSOLA time-stretch; try 0.75 / 1 / 1.5 / 2
  playbackRate: 1.5,
});
`,
  },
};

export const channelsExample: ExamplePageContent = {
  title: L("通道路由", "Channel Routing"),
  blurb: L(
    "工具栏只留通道与增益相关项。",
    "Toolbar keeps channel routing and gain.",
  ),
  tips: [
    L("快捷键 O / M / 1 / 2", "Shortcuts: O / M / 1 / 2"),
    L("切换注释行试不同 mode", "Uncomment other modes to compare"),
  ],
  source: {
    zh: `const player = new AudioPlayerControl({
  toolbar: ["transport", "channel", "gain", "volume"],
});

player.mount(container);
await loadDemo(player);

// original | mono | solo(channel 从 0)
player.setPlayChannelMode({ kind: "solo", channel: 0 });
// player.setPlayChannelMode({ kind: "mono" });
// player.setPlayChannelMode({ kind: "original" });
`,
    en: `const player = new AudioPlayerControl({
  toolbar: ["transport", "channel", "gain", "volume"],
});

player.mount(container);
await loadDemo(player);

// original | mono | solo(channel from 0)
player.setPlayChannelMode({ kind: "solo", channel: 0 });
// player.setPlayChannelMode({ kind: "mono" });
// player.setPlayChannelMode({ kind: "original" });
`,
  },
};

export const playSelectionExample: ExamplePageContent = {
  title: L("仅播选区", "Play Selection Only"),
  blurb: L(
    "工具栏只留「仅播放选区 / 选区循环」与播放控制。",
    "Toolbar keeps play-selection / loop + transport.",
  ),
  tips: [
    L("预置选区约为整段 25%–55%", "Preset selection ≈ 25%–55% of the file"),
    L("关掉循环后播完选区会停住", "With loop off, playback stops at selection end"),
  ],
  source: {
    zh: `const player = new AudioPlayerControl({
  toolbar: ["transport", "selectionPlay", "selection", "volume"],
});

player.mount(container);
await loadDemo(player);

const len = player.store.getSnapshot().lengthSamples;
player.store.patch({
  selection: {
    startSample: Math.floor(len * 0.25),
    endSample: Math.floor(len * 0.55),
  },
  // playSelectionOnly：只播选区
  playSelectionOnly: true,
  // loopSelection：选区循环
  loopSelection: true,
});
`,
    en: `const player = new AudioPlayerControl({
  toolbar: ["transport", "selectionPlay", "selection", "volume"],
});

player.mount(container);
await loadDemo(player);

const len = player.store.getSnapshot().lengthSamples;
player.store.patch({
  selection: {
    startSample: Math.floor(len * 0.25),
    endSample: Math.floor(len * 0.55),
  },
  // playSelectionOnly: restrict transport to selection
  playSelectionOnly: true,
  // loopSelection: loop within selection
  loopSelection: true,
});
`,
  },
};

export const editExample: ExamplePageContent = {
  title: L("剪切粘贴删除", "Cut / Copy / Paste / Delete"),
  blurb: L(
    "工具栏只留编辑与选区相关按钮。",
    "Toolbar keeps edit + selection controls.",
  ),
  tips: [
    L("Ctrl/⌘+X / C / V、Delete", "Ctrl/⌘+X / C / V, Delete"),
    L(
      "有选区粘贴 = 替换；无选区 = 游标插入",
      "Paste with selection replaces; without selection inserts at playhead",
    ),
  ],
  source: {
    zh: `const player = new AudioPlayerControl({
  toolbar: ["transport", "edit", "snap", "selection", "volume"],
  snapToZeroCrossing: true,
});

player.mount(container);
await loadDemo(player);

// 需先划选：cutSelection / copySelection / pasteClipboard / deleteSelection / undo
`,
    en: `const player = new AudioPlayerControl({
  toolbar: ["transport", "edit", "snap", "selection", "volume"],
  snapToZeroCrossing: true,
});

player.mount(container);
await loadDemo(player);

// Select first: cutSelection / copySelection / pasteClipboard / deleteSelection / undo
`,
  },
};

export const exportExample: ExamplePageContent = {
  title: L("导出 WAV", "Export WAV"),
  blurb: L(
    "工具栏只留导出与清除选区。",
    "Toolbar keeps export + clear selection.",
  ),
  tips: [
    L("格式：16-bit PCM WAV", "Format: 16-bit PCM WAV"),
    L(
      "先划选再「导出选区」，或直接「导出整段」",
      "Select then Export Selection, or Export All",
    ),
  ],
  source: {
    zh: `const player = new AudioPlayerControl({
  toolbar: ["transport", "export", "selection", "volume"],
});

player.mount(container);
await loadDemo(player);

// player.exportSelection(); // 需先划选 → selection.wav
// player.exportAll();       // export.wav
`,
    en: `const player = new AudioPlayerControl({
  toolbar: ["transport", "export", "selection", "volume"],
});

player.mount(container);
await loadDemo(player);

// player.exportSelection(); // needs selection → selection.wav
// player.exportAll();       // export.wav
`,
  },
};

export const recordExample: ExamplePageContent = {
  title: L("固定时长录音", "Fixed-duration Record"),
  blurb: L(
    "工具栏只留录音与播放控制。",
    "Toolbar keeps record + transport.",
  ),
  tips: [
    L(
      "需要麦克风权限（HTTPS / localhost）",
      "Needs mic permission (HTTPS / localhost)",
    ),
    L("录满自动结束，或点「停录」", "Auto-stops when full, or click Stop Rec"),
  ],
  source: {
    zh: `const player = new AudioPlayerControl({
  toolbar: ["record", "transport", "volume"],
});

player.mount(container);

// setRecordDurationSec(sec)：固定时长，时间轴一屏
player.setRecordDurationSec(60);

// 点工具栏「录音」，或：
// await player.startRecording(60);
`,
    en: `const player = new AudioPlayerControl({
  toolbar: ["record", "transport", "volume"],
});

player.mount(container);

// setRecordDurationSec(sec): fixed length, full timeline on screen
player.setRecordDurationSec(60);

// Click toolbar Record, or:
// await player.startRecording(60);
`,
  },
};
