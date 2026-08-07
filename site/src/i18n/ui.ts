import { L } from "./types";

/** 站点通用 UI 文案 */
export const ui = {
  docs: L("文档", "Docs"),
  overview: L("概览", "Overview"),
  apiNavTag: L("API", "API"),
  apiNavTitle: L("参数与方法", "API Reference"),
  examples: L("示例", "Examples"),
  viewRepo: L("查看仓库 ↗", "Repository ↗"),
  langZh: L("中文", "中文"),
  langEn: L("EN", "EN"),
  langSwitchAria: L("切换语言", "Switch language"),

  homeKicker: L("Audio Player Control", "Audio Player Control"),
  homeLead: L(
    "多轨波形 / 语谱编辑控件的功能示例站。左侧选功能，右侧即时演示。",
    "Multi-lane waveform / spectrogram player examples. Pick a feature on the left, try it on the right.",
  ),
  homeStart: L("从「{title}」开始", "Start with “{title}”"),
  homeApi: L("查看完整 API", "Full API reference"),
  homeBrowse: L("浏览全部示例", "Browse all examples"),
  homePreviewAlt: L(
    "Audio Player Control：工具栏、双轨波形、选区与概览条",
    "Audio Player Control: toolbar, stereo waveform, selection, and overview",
  ),
  homePreviewCaption: L(
    "播放控件本体示意（工具栏 · 双轨波形 · 游标 / 选区 · 底部概览）。真实交互请进入各示例页。",
    "Player chrome preview (toolbar · stereo waveform · playhead / selection · overview). Open an example for live interaction.",
  ),
  homeHighlight1Title: L("一功能一页", "One feature per page"),
  homeHighlight1Body: L(
    "每个示例只演示一件事，方便对着控件讲解。",
    "Each example focuses on one topic — easy to demo against the control.",
  ),
  homeHighlight2Title: L("即开即播", "Ready to play"),
  homeHighlight2Body: L(
    "多数页面自动加载测试音，录音页除外。",
    "Most pages auto-load a demo tone (except recording).",
  ),
  homeHighlight3Title: L("左栏常驻", "Persistent nav"),
  homeHighlight3Body: L(
    "侧栏随时跳转，返回概览也不丢路径。",
    "Sidebar stays available; jump between examples anytime.",
  ),
  homeIndexTitle: L("全部示例", "All examples"),

  howToTry: L("怎么试", "Try this"),
  editableCode: L("可编辑代码", "Editable code"),
  codeHint: L(
    "参数说明见行内注释 · 完整 API 见「参数与方法」· 改代码约 0.5s 右侧更新",
    "See inline comments · full API under “API Reference” · auto-reruns ~0.5s after edits",
  ),
  runNow: L("立即运行", "Run"),
  reset: L("重置", "Reset"),
  statusReady: L("已运行", "Ready"),
  statusRunning: L("运行中…", "Loading…"),
  statusError: L("运行失败", "Failed"),
  statusIdle: L("等待输入", "Idle"),
  runningOverlay: L("正在运行示例…", "Running example…"),
  codeAria: L("示例源代码", "Example source"),
  needPlayer: L(
    "示例需创建 `const player = new AudioPlayerControl(...)` 并 mount 到 container。",
    "Create `const player = new AudioPlayerControl(...)` and mount it to container.",
  ),

  apiKicker: L("Reference", "Reference"),
  apiTitle: L("API 参考", "API Reference"),
  apiLead: L(
    "构造选项、公开方法参数、store 可写字段与事件说明。示例页左侧代码可直接改参试效果；完整签名以本页为准。",
    "Constructor options, method parameters, writable store fields, and events. Edit the left-hand code in examples to experiment; this page is the source of truth.",
  ),
  apiStartLink: L("从基础播放示例开始 →", "Start with Basic Playback →"),
  apiColName: L("名称", "Name"),
  apiColType: L("类型", "Type"),
  apiColDefault: L("默认", "Default"),
  apiColPurpose: L("用途", "Purpose"),
  apiColEffect: L("效果 / 说明", "Effect / notes"),
  apiColParam: L("参数", "Param"),
  apiRequired: L("必填", "Required"),
  apiReturns: L("返回", "Returns"),
  apiToc: L("本页目录", "On this page"),
} as const;
