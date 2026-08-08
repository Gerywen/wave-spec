[English](./README.md) | 简体中文

# playback-controls / audio-player-control

多分轨波形 / 语谱音频播放控件（TypeScript 库 + Vite Demo + Rust/WASM 分析）。

仓库：https://gitee.com/lantuyuntuo/playback-controls

## 功能

- 单声道 / 立体声 / 多声道分轨显示（上 L / 下 R …）
- 波形 ↔ 语谱切换（语谱：一次烘焙 ImageBitmap，缩放/平移只做裁剪）
- 时间尺、缩放、平移、游标、选区
- 剪切 / 复制 / 粘贴 / 删除选区；撤销 / 重做（缓冲快照）
- 导出选区 / 整段为 WAV（16-bit PCM）
- 固定时长麦克风录音：整段时间轴一屏显示，波形从左向右生长；停录后进入编辑管线
- 波形模式底部概览条（语谱模式暂不显示 minimap）
- 播放 / 暂停 / 停止回 0 / 定步长快进快退
- Original / Mono / Solo 通道路由
- 变速不变调（WSOLA，Rust/WASM；按约 45s 窗口分段拉伸 + 常用倍率预热）
- 波形 peaks + 语谱 STFT 在 WebWorker + WASM 中计算

## 开发

```bash
npm install

# 原 demo 教程长页（单页）
npm run dev

# React 示例站：每个功能独立页（推荐讲解用）
npm run site:dev
```

### 在线演示（GitHub Pages）

在仓库 Settings → Pages → Source 选择 **GitHub Actions** 后，站点地址为：

**https://gerywen.github.io/wave-spec/**

推送到 `main` 会触发 `.github/workflows/deploy-pages.yml` 自动构建发布。

### React 示例站（`site/`）

类似 Wavesurfer Examples：左侧导航 + 右侧示例；首页概览 + 各功能独立路由。  
**中 / EN 切换**：侧栏顶部语言按钮（偏好写入 `localStorage`）。

| 路径 | 内容 |
|------|------|
| `/` | 示例目录 |
| `/api` | **完整 API**：构造选项 / 方法参数 / store / 事件 |
| `/examples/basic` | 基础播放 |
| `/examples/waveform-spectrogram` | 波形 / 语谱 |
| `/examples/selection` | 选区与导航 |
| `/examples/edit` | 剪切粘贴删除 |
| `/examples/export` | 导出 WAV |
| `/examples/rate` | 变速不变调 |
| `/examples/channels` | 通道路由 |
| `/examples/play-selection` | 仅播选区 |
| `/examples/record` | 固定时长录音 |

默认端口 `5174`。构建：`npm run site:build` → `dist-site/`。

日常改控件逻辑仍在 `src/`；单页长教程在 `demo/`。

### 重新构建 WASM（可选）

需要本机已安装 Rust 与 `wasm-pack`：

```bash
cd rust/crates/wasm-analyzer
wasm-pack build --target web --out-dir ../../../src/wasm
```

日常改 TS/渲染一般不必重建；改了 `rust/crates/dsp` 或 `wasm-analyzer` 后才需要。

## 构建

```bash
# Demo
npm run build

# 可发布库（输出 dist/）
npm run build:lib
```

## 使用

```ts
import { AudioPlayerControl } from "audio-player-control";
import "audio-player-control/style.css";

const player = new AudioPlayerControl({
  skipSeconds: 5,              // 快进/快退秒数，默认 5
  playbackRate: 1,             // 初始倍速，默认 1（WSOLA）
  followPlayhead: true,        // 播放时视口跟随游标
  snapToZeroCrossing: true,    // 选区吸附过零点
  spectrogramFftSize: 4096,    // 语谱 FFT（仅构造时）
  spectrogramHop: 512,         // 语谱 hop（仅构造时）
  toolbar: "all",              // 或 ["transport","rate",…] 只显示部分工具栏
});
player.mount(document.getElementById("root")!);
await player.load(file);       // File | Blob | URL | ArrayBuffer | AudioBuffer

await player.play();
player.setViewMode("spectrogram");
player.setPlayChannelMode({ kind: "solo", channel: 0 });
player.store.patch({ playbackRate: 1.5, playSelectionOnly: true });

player.bus.on("ready", () => { /* 可播 */ });
player.bus.on("loadprogress", (p) => { /* p.stage / p.progress */ });
player.bus.on("error", (err) => console.error(err));
```

完整参数表见示例站 **`/api`**（`npm run site:dev` → 侧栏「参数与方法」，可切换中英文）。

### 公开方法

| 方法 | 说明 |
|------|------|
| `mount(el)` | 挂载到 DOM |
| `load(source)` | 加载音频并分析 |
| `destroy()` | 销毁 |
| `play` / `pause` / `stop` / `togglePlay` | 运输控制 |
| `skipForward` / `skipBackward` | 按 `skipSeconds` 跳转 |
| `fit()` | 视口适配全长 |
| `setViewMode(mode)` | `waveform` \| `spectrogram` |
| `setPlayChannelMode(mode)` | original / mono / solo |
| `copySelection` / `cutSelection` / `pasteClipboard` / `deleteSelection` | 编辑 |
| `undo` / `redo` | 撤销 / 重做 |
| `exportSelection` / `exportAll` | 导出 16-bit WAV |
| `setRecordDurationSec(sec)` | 固定录音时长 |
| `startRecording(sec?)` / `stopRecording()` | 麦克风录音 |

### 主要快捷键

| 按键 | 作用 |
|------|------|
| Space | 播放/暂停 |
| ← / → | 微调游标 |
| Shift+← / → | 快退/快进 |
| Home / End | 到开头/结尾 |
| W / S | 波形 / 语谱 |
| O / M | Original / Mono |
| 1 / 2 | Solo Ch1 / Ch2 |
| Shift+拖拽 | 选区 |
| 空格+拖拽 / Alt+拖拽 | 平移 |
| 滚轮 | 缩放 |
| Ctrl/⌘+X | 剪切选区 |
| Ctrl/⌘+C | 复制选区 |
| Ctrl/⌘+V | 粘贴（有选区则替换，否则在游标插入） |
| Delete / Backspace | 删除选区 |
| Ctrl/⌘+Z | 撤销 |
| Ctrl/⌘+Shift+Z 或 Ctrl/⌘+Y | 重做 |

### 录音

工具栏选择「录音时长」（1 / 5 / 10 / 30 分钟），点「录音」授权麦克风后开始：

- 时间轴长度 = 所选固定时长，**始终一屏显示全长**
- 波形从左向右生长，游标跟随已录位置
- 录满自动结束，或点「停录」提前结束（裁切到实际长度）
- 结束后自动分析，可播放 / 编辑 / 导出

### 编辑说明

- 剪贴板为控件内部缓存（不写入系统剪贴板）；重新 `load` 会清空撤销历史。
- 编辑后会重新跑 worker 分析与语谱烘焙（后台进行）；若编辑前正在播放，会保持播放并续播。
- 导出为 16-bit PCM WAV，浏览器触发下载。

### 语谱 dB

工具栏「dB 最小 / dB 最大」控制动态范围映射：  
默认约 `-100` ~ `-5`。拉高最大值会减少“过热”的红白区域。

## 架构摘要

```
UI / 交互 / Canvas 渲染  ← TypeScript（主线程；语谱为 ImageBitmap blit）
        ↓
 analysis.worker.ts     ← WebWorker
        ↓
 Rust WASM              ← peaks 金字塔、STFT、WSOLA
```

长音频会自动加大 hop、降低 `maxFrames`，缩短分析时间。
