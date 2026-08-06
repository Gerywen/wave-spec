# playback-controls / audio-player-control

多分轨波形 / 语谱音频播放控件（TypeScript 库 + Vite Demo + Rust/WASM 分析）。

仓库：https://gitee.com/lantuyuntuo/playback-controls

## 功能

- 单声道 / 立体声 / 多声道分轨显示（上 L / 下 R …）
- 波形 ↔ 语谱切换（语谱：WebGL2 渲染）
- 时间尺、缩放、平移、游标、选区
- 波形模式底部概览条（语谱模式暂不显示 minimap）
- 播放 / 暂停 / 停止回 0 / 定步长快进快退
- Original / Mono / Solo 通道路由
- 变速不变调（WSOLA，Rust/WASM）
- 波形 peaks + 语谱 STFT 在 WebWorker + WASM 中计算

## 开发

```bash
npm install
npm run dev
```

浏览器打开后可「打开音频」或点「生成测试音」。

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
  skipSeconds: 5,
  spectrogramFftSize: 4096,
});
player.mount(document.getElementById("root")!);
await player.load(file);
```

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

### 语谱 dB

工具栏「dB 最小 / dB 最大」控制动态范围映射：  
默认约 `-100` ~ `-5`。拉高最大值会减少“过热”的红白区域。

## 架构摘要

```
UI / 交互 / WebGL 渲染  ← TypeScript（主线程）
        ↓
 analysis.worker.ts     ← WebWorker
        ↓
 Rust WASM              ← peaks 金字塔、STFT、WSOLA
```

长音频会自动加大 hop、降低 `maxFrames`，缩短分析时间。
