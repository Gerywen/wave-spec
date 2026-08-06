# audio-player-control

多分轨波形 / 语谱音频播放控件（TypeScript 库 + Vite Demo）。

## 功能概要

- 单声道 / 立体声 / 多声道分轨显示（上 L / 下 R …）
- 波形 ↔ 语谱切换
- 时间尺、缩放、平移、游标、选区、概览条
- 播放 / 暂停 / 停止回 0 / 定步长快进快退
- Original / Mono / Solo 通道路由
- 变速不变调（WSOLA）

## 开发

```bash
npm install
npm run dev
```

## 构建库

```bash
npm run build:lib
```

## 使用

```ts
import { AudioPlayerControl } from "audio-player-control";
import "audio-player-control/style.css";

const player = new AudioPlayerControl({ skipSeconds: 5 });
player.mount(document.getElementById("root")!);
await player.load(file);
```
