import { L, type Msg, type Locale, tx } from "../i18n/types";

export type ApiParam = {
  name: string;
  type: string;
  defaultValue?: string;
  required?: boolean;
  purpose: Msg;
  effect: Msg;
};

export type ApiMethod = {
  signature: string;
  purpose: Msg;
  params: ApiParam[];
  returns?: Msg;
  notes?: Msg[];
};

export type ApiSection = {
  id: string;
  title: Msg;
  lead?: Msg;
  items?: ApiParam[];
  methods?: ApiMethod[];
};

/** Full site API docs (kept in sync with the public surface in src) */
export const API_SECTIONS: ApiSection[] = [
  {
    id: "ctor",
    title: L(
      "构造选项 new AudioPlayerControl(options)",
      "Constructor options new AudioPlayerControl(options)",
    ),
    lead: L(
      "全部可选。未传的项使用默认值；语谱 FFT 相关只在构造时生效，改后需重建实例。",
      "All optional. Omitted fields use defaults; spectrogram FFT options apply only at construction — recreate the instance to change them.",
    ),
    items: [
      {
        name: "skipSeconds",
        type: "number",
        defaultValue: "5",
        purpose: L(
          "快退 / 快进每次跳过的秒数。",
          "Seconds skipped on each rewind / fast-forward.",
        ),
        effect: L(
          "越大跳得越远；对应工具栏「快退」「快进」与 Shift+方向键。",
          "Larger values jump farther; used by toolbar Rewind / Forward and Shift+arrow keys.",
        ),
      },
      {
        name: "playbackRate",
        type: "number",
        defaultValue: "1",
        purpose: L(
          "初始播放倍速（WSOLA 变速不变调）。",
          "Initial playback rate (WSOLA time-stretch, pitch preserved).",
        ),
        effect: L(
          ">1 加快、<1 放慢；音高尽量保持。之后可用 store.patch 或工具栏「倍速」修改。",
          ">1 speeds up, <1 slows down; pitch is kept as steady as possible. Change later via store.patch or the Rate toolbar control.",
        ),
      },
      {
        name: "followPlayhead",
        type: "boolean",
        defaultValue: "true",
        purpose: L(
          "播放时视口是否跟随游标。",
          "Whether the viewport follows the playhead during playback.",
        ),
        effect: L(
          "true：游标靠近边缘时画面滚动；false：画面固定。",
          "true: scroll when the playhead nears an edge; false: keep the view fixed.",
        ),
      },
      {
        name: "snapToZeroCrossing",
        type: "boolean",
        defaultValue: "true",
        purpose: L(
          "选区 / 点击定位是否吸附到过零点。",
          "Whether selection / click seeks snap to zero-crossings.",
        ),
        effect: L(
          "true：剪切更干净；false：像素级自由选（可能咔哒声）。",
          "true: cleaner cuts; false: free pixel-level selection (may cause clicks).",
        ),
      },
      {
        name: "spectrogramFftSize",
        type: "number",
        defaultValue: "4096",
        purpose: L(
          "语谱 STFT 的 FFT 窗口大小（仅构造时）。",
          "FFT window size for spectrogram STFT (constructor only).",
        ),
        effect: L(
          "越大频率分辨率越高、时间分辨率越低，分析更慢。",
          "Larger → better frequency resolution, worse time resolution, slower analysis.",
        ),
      },
      {
        name: "spectrogramHop",
        type: "number",
        defaultValue: "fftSize / 8",
        purpose: L(
          "相邻 STFT 帧之间的 hop（采样点，仅构造时）。",
          "Hop between adjacent STFT frames (samples, constructor only).",
        ),
        effect: L(
          "越小时间更密、烘焙更重；越大更稀疏、更快。",
          "Smaller → denser time axis, heavier bake; larger → sparser and faster.",
        ),
      },
      {
        name: "toolbar",
        type: 'ToolbarGroup[] | "all"',
        defaultValue: '"all"',
        purpose: L(
          "控制工具栏显示哪些功能分组。",
          "Which toolbar feature groups to show.",
        ),
        effect: L(
          '传入数组则只显示列出的分组；"all" 显示全部。分组见下方 ToolbarGroup。',
          'Pass an array to show only listed groups; "all" shows every group. See ToolbarGroup below.',
        ),
      },
    ],
  },
  {
    id: "toolbar-groups",
    title: L("ToolbarGroup 取值", "ToolbarGroup values"),
    lead: L(
      "用于 options.toolbar 数组。",
      "Used in the options.toolbar array.",
    ),
    items: [
      {
        name: "transport",
        type: "group",
        purpose: L(
          "播放 / 停止 / 快退 / 快进 / 适配",
          "Play / Stop / Rewind / Forward / Fit",
        ),
        effect: L("基础运输控制。", "Basic transport controls."),
      },
      {
        name: "record",
        type: "group",
        purpose: L(
          "录音时长 / 录音 / 停录",
          "Record duration / Record / Stop recording",
        ),
        effect: L(
          "麦克风固定时长录音。",
          "Fixed-duration microphone recording.",
        ),
      },
      {
        name: "view",
        type: "group",
        purpose: L("波形 / 语谱按钮", "Waveform / Spectrogram buttons"),
        effect: L("切换主视图。", "Switch the main view."),
      },
      {
        name: "channel",
        type: "group",
        purpose: L("通道路由下拉", "Channel routing dropdown"),
        effect: L(
          "Original / Mono / Solo。",
          "Original / Mono / Solo.",
        ),
      },
      {
        name: "rate",
        type: "group",
        purpose: L("倍速下拉", "Playback rate dropdown"),
        effect: L("切换 playbackRate。", "Changes playbackRate."),
      },
      {
        name: "volume",
        type: "group",
        purpose: L("音量滑条 / 静音", "Volume slider / Mute"),
        effect: L(
          "只影响监听，不改波形数据。",
          "Affects monitoring only; does not change waveform data.",
        ),
      },
      {
        name: "follow",
        type: "group",
        purpose: L("跟随勾选", "Follow checkbox"),
        effect: L("followPlayhead。", "followPlayhead."),
      },
      {
        name: "snap",
        type: "group",
        purpose: L("过零吸附勾选", "Zero-crossing snap checkbox"),
        effect: L("snapToZeroCrossing。", "snapToZeroCrossing."),
      },
      {
        name: "selectionPlay",
        type: "group",
        purpose: L(
          "仅播选区 / 选区循环",
          "Play selection only / Loop selection",
        ),
        effect: L(
          "playSelectionOnly / loopSelection。",
          "playSelectionOnly / loopSelection.",
        ),
      },
      {
        name: "gain",
        type: "group",
        purpose: L("联动增益 / 增益滑条", "Linked gain / Gain slider"),
        effect: L(
          "波形垂直放大。",
          "Vertical waveform amplification.",
        ),
      },
      {
        name: "spectrogram",
        type: "group",
        purpose: L("dB 最小 / 最大", "dB min / max"),
        effect: L(
          "语谱颜色映射范围。",
          "Spectrogram color-mapping range.",
        ),
      },
      {
        name: "edit",
        type: "group",
        purpose: L(
          "剪切粘贴删除撤销重做",
          "Cut / Paste / Delete / Undo / Redo",
        ),
        effect: L("非线性编辑。", "Non-linear editing."),
      },
      {
        name: "export",
        type: "group",
        purpose: L("导出选区 / 整段", "Export selection / entire buffer"),
        effect: L("下载 WAV。", "Download WAV."),
      },
      {
        name: "selection",
        type: "group",
        purpose: L("清除选区", "Clear selection"),
        effect: L("selection = null。", "selection = null."),
      },
    ],
  },
  {
    id: "lifecycle",
    title: L("生命周期", "Lifecycle"),
    methods: [
      {
        signature: "mount(el: HTMLElement): void",
        purpose: L(
          "把控件挂到 DOM 节点，创建工具栏与画布。",
          "Mount the control onto a DOM node; creates toolbar and canvas.",
        ),
        params: [
          {
            name: "el",
            type: "HTMLElement",
            required: true,
            purpose: L("宿主容器。", "Host container."),
            effect: L(
              "会清空 el 内容并写入 .apc-root 结构；重复 mount 会先销毁旧 DOM。",
              "Clears el and writes the .apc-root structure; remounting destroys the previous DOM first.",
            ),
          },
        ],
      },
      {
        signature: "destroy(): void",
        purpose: L(
          "销毁控件、释放 AudioContext 与监听。",
          "Destroy the control; release AudioContext and listeners.",
        ),
        params: [],
        notes: [
          L(
            "页面卸载或示例重跑前务必调用，避免泄漏。",
            "Always call before unload or when re-running an example to avoid leaks.",
          ),
        ],
      },
      {
        signature:
          "load(source: File | Blob | string | ArrayBuffer | AudioBuffer): Promise<void>",
        purpose: L(
          "加载并解码音频，跑 peaks / 语谱分析后进入可播状态。",
          "Load and decode audio, run peaks / spectrogram analysis, then become playable.",
        ),
        params: [
          {
            name: "source",
            type: "File | Blob | string | ArrayBuffer | AudioBuffer",
            required: true,
            purpose: L("音频来源。", "Audio source."),
            effect: L(
              "string 当作 URL fetch；File/Blob/ArrayBuffer 解码；AudioBuffer 直接使用。会清空撤销历史与剪贴板。",
              "string is fetched as a URL; File/Blob/ArrayBuffer are decoded; AudioBuffer is used directly. Clears undo history and clipboard.",
            ),
          },
        ],
        returns: L(
          "Promise<void>，完成后触发 bus「ready」。",
          "Promise<void>; emits bus \"ready\" when done.",
        ),
        notes: [
          L(
            "加载中通过 bus「loadprogress」回报进度；失败触发「error」。",
            "Progress via bus \"loadprogress\"; failures emit \"error\".",
          ),
        ],
      },
    ],
  },
  {
    id: "transport",
    title: L("播放控制", "Transport"),
    methods: [
      {
        signature: "play(): Promise<void>",
        purpose: L(
          "从当前游标开始播放。",
          "Start playback from the current playhead.",
        ),
        params: [],
        returns: L(
          "Promise，底层 AudioContext resume 完成。",
          "Promise that resolves after AudioContext.resume completes.",
        ),
      },
      {
        signature: "pause(): void",
        purpose: L(
          "暂停，保留游标位置。",
          "Pause while keeping the playhead position.",
        ),
        params: [],
      },
      {
        signature: "stop(): void",
        purpose: L(
          "停止并把游标回到 0。",
          "Stop and reset the playhead to 0.",
        ),
        params: [],
      },
      {
        signature: "togglePlay(): Promise<void>",
        purpose: L(
          "播放中则暂停，否则播放。",
          "Pause if playing; otherwise play.",
        ),
        params: [],
      },
      {
        signature: "skipForward(): void",
        purpose: L(
          "按 skipSeconds 快进。",
          "Fast-forward by skipSeconds.",
        ),
        params: [],
      },
      {
        signature: "skipBackward(): void",
        purpose: L(
          "按 skipSeconds 快退。",
          "Rewind by skipSeconds.",
        ),
        params: [],
      },
      {
        signature: "fit(): void",
        purpose: L(
          "视口适配整段音频。",
          "Fit the viewport to the entire buffer.",
        ),
        params: [],
      },
      {
        signature: 'setViewMode(mode: "waveform" | "spectrogram"): void',
        purpose: L(
          "切换主画布视图。",
          "Switch the main canvas view.",
        ),
        params: [
          {
            name: "mode",
            type: '"waveform" | "spectrogram"',
            required: true,
            purpose: L("波形或语谱。", "Waveform or spectrogram."),
            effect: L(
              "语谱缩放用已烘焙位图裁剪，不必重算 STFT。",
              "Spectrogram zoom crops the baked bitmap; no STFT recompute.",
            ),
          },
        ],
      },
      {
        signature: "setPlayChannelMode(mode: PlayChannelMode): void",
        purpose: L(
          "设置监听通道路由。",
          "Set monitoring channel routing.",
        ),
        params: [
          {
            name: "mode",
            type: "PlayChannelMode",
            required: true,
            purpose: L("路由模式。", "Routing mode."),
            effect: L(
              '{ kind: "original" } 立体声原样；{ kind: "mono" } 混单声道；{ kind: "solo", channel: n } 只听第 n 轨（0 起），其它轨显示变暗。',
              '{ kind: "original" } keeps stereo; { kind: "mono" } mixes to mono; { kind: "solo", channel: n } solos lane n (0-based) and dims other lanes.',
            ),
          },
        ],
      },
    ],
  },
  {
    id: "edit",
    title: L("编辑 / 导出", "Edit / Export"),
    methods: [
      {
        signature: "copySelection(): boolean",
        purpose: L(
          "复制当前选区到内部剪贴板（非系统剪贴板）。",
          "Copy the current selection to the internal clipboard (not the system clipboard).",
        ),
        params: [],
        returns: L(
          "成功 true；无选区 / 无缓冲 false。",
          "true on success; false if no selection / no buffer.",
        ),
      },
      {
        signature: "cutSelection(): Promise<boolean>",
        purpose: L(
          "剪切 = 复制 + 删除选区。",
          "Cut = copy + delete selection.",
        ),
        params: [],
        returns: L("Promise<boolean>", "Promise<boolean>"),
      },
      {
        signature: "deleteSelection(): Promise<boolean>",
        purpose: L(
          "删除选区，缩短缓冲。",
          "Delete the selection and shorten the buffer.",
        ),
        params: [],
        returns: L("Promise<boolean>", "Promise<boolean>"),
      },
      {
        signature: "pasteClipboard(): Promise<boolean>",
        purpose: L("粘贴剪贴板。", "Paste from the clipboard."),
        params: [],
        returns: L("Promise<boolean>", "Promise<boolean>"),
        notes: [
          L(
            "有选区：替换选区内容。",
            "With a selection: replace the selected range.",
          ),
          L(
            "无选区：在游标处插入。",
            "Without a selection: insert at the playhead.",
          ),
          L(
            "采样率必须与当前缓冲一致。",
            "Sample rate must match the current buffer.",
          ),
          L(
            "播放中编辑会尝试续播。",
            "Edits during playback attempt to continue playing.",
          ),
        ],
      },
      {
        signature: "undo(): Promise<boolean> / redo(): Promise<boolean>",
        purpose: L(
          "撤销 / 重做（缓冲快照栈）。",
          "Undo / redo (buffer snapshot stack).",
        ),
        params: [],
        returns: L("Promise<boolean>", "Promise<boolean>"),
        notes: [
          L(
            "重新 load 会清空历史。",
            "Calling load again clears history.",
          ),
        ],
      },
      {
        signature: "exportSelection(): boolean",
        purpose: L(
          "导出选区为 16-bit PCM WAV 并触发下载。",
          "Export the selection as 16-bit PCM WAV and trigger download.",
        ),
        params: [],
        returns: L(
          "成功 true；无选区 false。",
          "true on success; false if no selection.",
        ),
        notes: [L("文件名 selection.wav", "Filename: selection.wav")],
      },
      {
        signature: "exportAll(): boolean",
        purpose: L(
          "导出整段（含编辑结果）为 WAV。",
          "Export the entire buffer (including edits) as WAV.",
        ),
        params: [],
        returns: L("成功 true", "true on success"),
        notes: [L("文件名 export.wav", "Filename: export.wav")],
      },
    ],
  },
  {
    id: "record",
    title: L("录音", "Recording"),
    methods: [
      {
        signature: "setRecordDurationSec(sec: number): void",
        purpose: L(
          "设置固定录音总时长（秒），并同步工具栏下拉。",
          "Set the fixed recording duration in seconds and sync the toolbar dropdown.",
        ),
        params: [
          {
            name: "sec",
            type: "number",
            required: true,
            purpose: L(
              "时长，秒。常用 60 / 300 / 600 / 1800。",
              "Duration in seconds. Common values: 60 / 300 / 600 / 1800.",
            ),
            effect: L(
              "时间轴按此时长铺满一屏；波形从左往右生长。",
              "The timeline fills one screen for this duration; the waveform grows left to right.",
            ),
          },
        ],
      },
      {
        signature: "startRecording(durationSec?: number): Promise<void>",
        purpose: L(
          "请求麦克风并开始写入固定长度缓冲。",
          "Request the microphone and start writing into a fixed-length buffer.",
        ),
        params: [
          {
            name: "durationSec",
            type: "number",
            required: false,
            defaultValue: "当前 setRecordDurationSec 值",
            purpose: L("本次录音时长。", "Duration for this recording."),
            effect: L(
              "需用户手势 + HTTPS/localhost；录满自动停。",
              "Requires a user gesture and HTTPS/localhost; stops automatically when full.",
            ),
          },
        ],
        returns: L("Promise<void>", "Promise<void>"),
      },
      {
        signature: "stopRecording(): Promise<void>",
        purpose: L(
          "提前结束录音并进入分析 / 可播管线。",
          "End recording early and enter the analyze / playable pipeline.",
        ),
        params: [],
      },
      {
        signature: "isRecording(): boolean",
        purpose: L("是否正在录音。", "Whether recording is in progress."),
        params: [],
        returns: L("boolean", "boolean"),
      },
    ],
  },
  {
    id: "store",
    title: L(
      "状态 store.patch / getSnapshot",
      "State store.patch / getSnapshot",
    ),
    lead: L(
      "player.store.getSnapshot() 读当前状态；player.store.patch({ ... }) 局部更新。下列为常用可写字段。",
      "player.store.getSnapshot() reads state; player.store.patch({ ... }) applies a partial update. Common writable fields below.",
    ),
    items: [
      {
        name: "viewMode",
        type: '"waveform" | "spectrogram"',
        defaultValue: '"waveform"',
        purpose: L("主视图。", "Main view."),
        effect: L("同 setViewMode。", "Same as setViewMode."),
      },
      {
        name: "playbackRate",
        type: "number",
        defaultValue: "1",
        purpose: L("倍速。", "Playback rate."),
        effect: L(
          "触发 WSOLA；播放中改会续播。",
          "Triggers WSOLA; changing while playing continues playback.",
        ),
      },
      {
        name: "volume",
        type: "number 0–1",
        defaultValue: "1",
        purpose: L("输出音量。", "Output volume."),
        effect: L("只影响监听。", "Affects monitoring only."),
      },
      {
        name: "muted",
        type: "boolean",
        defaultValue: "false",
        purpose: L("静音。", "Mute."),
        effect: L(
          "听不到声音，进度照常。",
          "No audible output; progress continues.",
        ),
      },
      {
        name: "followPlayhead",
        type: "boolean",
        defaultValue: "true",
        purpose: L("跟随游标。", "Follow playhead."),
        effect: L("见构造选项。", "See constructor options."),
      },
      {
        name: "snapToZeroCrossing",
        type: "boolean",
        defaultValue: "true",
        purpose: L("过零吸附。", "Zero-crossing snap."),
        effect: L("见构造选项。", "See constructor options."),
      },
      {
        name: "playSelectionOnly",
        type: "boolean",
        defaultValue: "false",
        purpose: L(
          "是否只播放选区。",
          "Whether to play only the selection.",
        ),
        effect: L(
          "true 时运输限制在 selection 内。",
          "When true, transport is limited to selection.",
        ),
      },
      {
        name: "loopSelection",
        type: "boolean",
        defaultValue: "false",
        purpose: L(
          "选区播完是否循环。",
          "Whether to loop when the selection ends.",
        ),
        effect: L(
          "常与 playSelectionOnly 联用。",
          "Often used with playSelectionOnly.",
        ),
      },
      {
        name: "selection",
        type: "{ startSample, endSample } | null",
        defaultValue: "null",
        purpose: L(
          "当前选区（采样点坐标）。",
          "Current selection (sample coordinates).",
        ),
        effect: L(
          "编辑 / 导出 / 仅播都依赖它；null 表示无选区。",
          "Edit / export / selection-only play depend on it; null means no selection.",
        ),
      },
      {
        name: "playheadSample",
        type: "number",
        purpose: L(
          "游标位置（采样点）。",
          "Playhead position (samples).",
        ),
        effect: L(
          "seek / 点击时间轴会改它。",
          "Changed by seek / clicking the timeline.",
        ),
      },
      {
        name: "viewport",
        type: "{ startSample, endSample }",
        purpose: L(
          "当前可见时间范围。",
          "Currently visible time range.",
        ),
        effect: L(
          "缩放 / 平移改此字段。",
          "Zoom / pan updates this field.",
        ),
      },
      {
        name: "playChannelMode",
        type: "PlayChannelMode",
        defaultValue: '{ kind: "original" }',
        purpose: L("通道路由。", "Channel routing."),
        effect: L(
          "建议用 setPlayChannelMode；也可 patch。",
          "Prefer setPlayChannelMode; patch also works.",
        ),
      },
      {
        name: "waveformGain",
        type: "number[]",
        defaultValue: "每轨 1",
        purpose: L(
          "各轨波形垂直增益。",
          "Per-lane waveform vertical gain.",
        ),
        effect: L(
          "联动开启时改一轨会同步其它轨。",
          "When linked, changing one lane syncs the others.",
        ),
      },
      {
        name: "waveformGainLinked",
        type: "boolean",
        defaultValue: "true",
        purpose: L("增益是否联动。", "Whether gains are linked."),
        effect: L(
          "false 可分轨不同增益。",
          "false allows per-lane gains.",
        ),
      },
      {
        name: "spectrogramMinDb / spectrogramMaxDb",
        type: "number",
        defaultValue: "-100 / -5",
        purpose: L(
          "语谱颜色动态范围。",
          "Spectrogram color dynamic range.",
        ),
        effect: L(
          "抬高 Min 压噪声；拉低 Max 让强能量更快顶满。",
          "Raise Min to suppress noise; lower Max so loud energy saturates sooner.",
        ),
      },
      {
        name: "skipSeconds",
        type: "number",
        defaultValue: "5",
        purpose: L("快进快退步长。", "Skip step size."),
        effect: L(
          "运行时也可改。",
          "Can also be changed at runtime.",
        ),
      },
    ],
  },
  {
    id: "events",
    title: L("事件 player.bus.on(...)", "Events player.bus.on(...)"),
    lead: L(
      "EventBus：player.bus.on(name, handler) 订阅；返回取消函数。",
      "EventBus: subscribe with player.bus.on(name, handler); returns an unsubscribe function.",
    ),
    items: [
      {
        name: "ready",
        type: "()",
        purpose: L(
          "音频加载并分析完成（或录音结束就绪）。",
          "Audio loaded and analyzed (or recording finished and ready).",
        ),
        effect: L(
          "可安全 play / 编辑。",
          "Safe to play / edit.",
        ),
      },
      {
        name: "loadprogress",
        type: "(p: LoadProgress)",
        purpose: L("加载进度。", "Load progress."),
        effect: L(
          "p.stage: fetch | decode | analyze | done；p.progress 0–1；可选 p.message。",
          "p.stage: fetch | decode | analyze | done; p.progress 0–1; optional p.message.",
        ),
      },
      {
        name: "error",
        type: "(err: Error)",
        purpose: L(
          "加载或录音等失败。",
          "Load, recording, or similar failure.",
        ),
        effect: L(
          "同时会更新状态栏文案。",
          "Also updates the status-bar text.",
        ),
      },
      {
        name: "change",
        type: "()",
        purpose: L(
          "store 状态变化后的轻量通知。",
          "Lightweight notice after store state changes.",
        ),
        effect: L(
          '细粒度请用 store.bus.on("change", (state, patch) => ...)。',
          'For fine-grained updates use store.bus.on("change", (state, patch) => ...).',
        ),
      },
    ],
  },
  {
    id: "playground",
    title: L("示例站代码块注入", "Example-site code injectables"),
    lead: L(
      "左侧可编辑代码里可直接使用下列注入名（无需 import）。",
      "These names are injected into the left editable code (no import needed).",
    ),
    items: [
      {
        name: "AudioPlayerControl",
        type: "class",
        purpose: L("控件类。", "Control class."),
        effect: L(
          "new AudioPlayerControl(options)",
          "new AudioPlayerControl(options)",
        ),
      },
      {
        name: "container",
        type: "HTMLElement",
        purpose: L(
          "右侧预览挂载点。",
          "Right-hand preview mount point.",
        ),
        effect: L(
          "必须 player.mount(container)",
          "Must call player.mount(container)",
        ),
      },
      {
        name: "loadDemo",
        type: "(player, seconds?) => Promise<void>",
        purpose: L(
          "加载内置立体声测试音。",
          "Load the built-in stereo demo tone.",
        ),
        effect: L(
          "默认约 8 秒；第二参可改时长。",
          "Defaults to ~8 seconds; second arg overrides duration.",
        ),
      },
      {
        name: "createDemoTone",
        type: "(durationSec?, sampleRate?) => AudioBuffer",
        purpose: L(
          "生成测试 AudioBuffer。",
          "Create a demo AudioBuffer.",
        ),
        effect: L(
          "可 player.load(createDemoTone(10))",
          "e.g. player.load(createDemoTone(10))",
        ),
      },
    ],
  },
];

/** Map all Msg fields to locale strings for convenient rendering. */
export function resolveApiSections(locale: Locale): Array<{
  id: string;
  title: string;
  lead?: string;
  items?: Array<{
    name: string;
    type: string;
    defaultValue?: string;
    required?: boolean;
    purpose: string;
    effect: string;
  }>;
  methods?: Array<{
    signature: string;
    purpose: string;
    params: Array<{
      name: string;
      type: string;
      defaultValue?: string;
      required?: boolean;
      purpose: string;
      effect: string;
    }>;
    returns?: string;
    notes?: string[];
  }>;
}> {
  return API_SECTIONS.map((section) => ({
    id: section.id,
    title: tx(section.title, locale),
    lead: section.lead != null ? tx(section.lead, locale) : undefined,
    items: section.items?.map((item) => ({
      name: item.name,
      type: item.type,
      defaultValue: item.defaultValue,
      required: item.required,
      purpose: tx(item.purpose, locale),
      effect: tx(item.effect, locale),
    })),
    methods: section.methods?.map((method) => ({
      signature: method.signature,
      purpose: tx(method.purpose, locale),
      params: method.params.map((p) => ({
        name: p.name,
        type: p.type,
        defaultValue: p.defaultValue,
        required: p.required,
        purpose: tx(p.purpose, locale),
        effect: tx(p.effect, locale),
      })),
      returns:
        method.returns != null ? tx(method.returns, locale) : undefined,
      notes: method.notes?.map((n) => tx(n, locale)),
    })),
  }));
}
