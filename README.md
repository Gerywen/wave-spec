English | [简体中文](./README.zh-CN.md)

# playback-controls / audio-player-control

Multi-lane waveform / spectrogram audio player control (TypeScript library + Vite demos + Rust/WASM analysis).

Repository: https://gitee.com/lantuyuntuo/playback-controls

## Features

- Mono / stereo / multi-channel lane display (L on top / R below, …)
- Waveform ↔ spectrogram (spectrogram baked once to `ImageBitmap`; zoom/pan only crops)
- Time ruler, zoom, pan, playhead, selection
- Cut / copy / paste / delete selection; undo / redo (buffer snapshots)
- Export selection or full buffer as 16-bit PCM WAV
- Fixed-duration mic recording: full timeline on one screen, waveform grows left→right; enters edit pipeline after stop
- Overview minimap in waveform mode (hidden in spectrogram mode)
- Play / pause / stop-to-0 / stepped skip forward & back
- Original / Mono / Solo channel routing
- Time-stretch without pitch shift (WSOLA via Rust/WASM; ~45s windows + common-rate prewarm)
- Waveform peaks + spectrogram STFT in WebWorker + WASM

## Development

```bash
npm install

# Legacy single-page demo tutorial
npm run dev

# React examples site: one page per feature (recommended for demos)
npm run site:dev
```

### React examples site (`site/`)

Similar to Wavesurfer Examples: left nav + right demo; overview home + per-feature routes.  
**zh / EN toggle**: language buttons at the top of the sidebar (preference saved in `localStorage`).

| Path | Content |
|------|---------|
| `/` | Overview |
| `/api` | **Full API reference** (constructor options, method params, store, events) |
| `/examples/basic` | Basic playback |
| `/examples/waveform-spectrogram` | Waveform / spectrogram |
| `/examples/selection` | Selection & navigation |
| `/examples/edit` | Cut / copy / paste / delete |
| `/examples/export` | Export WAV |
| `/examples/rate` | Time-stretch (WSOLA) |
| `/examples/channels` | Channel routing |
| `/examples/play-selection` | Play selection only |
| `/examples/record` | Fixed-duration recording |

Default port `5174`. Build: `npm run site:build` → `dist-site/`.

Control logic lives in `src/`; the long single-page tutorial is under `demo/`.

### Rebuild WASM (optional)

Requires Rust and `wasm-pack` locally:

```bash
cd rust/crates/wasm-analyzer
wasm-pack build --target web --out-dir ../../../src/wasm
```

Usually unnecessary for TS/render changes; rebuild after editing `rust/crates/dsp` or `wasm-analyzer`.

## Build

```bash
# Demo
npm run build

# Publishable library → dist/
npm run build:lib
```

## Usage

```ts
import { AudioPlayerControl } from "audio-player-control";
import "audio-player-control/style.css";

const player = new AudioPlayerControl({
  skipSeconds: 5,              // skip step in seconds (default 5)
  playbackRate: 1,             // initial rate (default 1, WSOLA)
  followPlayhead: true,        // viewport follows playhead while playing
  snapToZeroCrossing: true,    // snap selection/clicks to zero-crossings
  spectrogramFftSize: 4096,    // spectrogram FFT (ctor-only)
  spectrogramHop: 512,         // spectrogram hop (ctor-only)
  toolbar: "all",              // or ["transport","rate",…] to show a subset
});
player.mount(document.getElementById("root")!);
await player.load(file);       // File | Blob | URL | ArrayBuffer | AudioBuffer

await player.play();
player.setViewMode("spectrogram");
player.setPlayChannelMode({ kind: "solo", channel: 0 });
player.store.patch({ playbackRate: 1.5, playSelectionOnly: true });

player.bus.on("ready", () => { /* ready to play */ });
player.bus.on("loadprogress", (p) => { /* p.stage / p.progress */ });
player.bus.on("error", (err) => console.error(err));
```

Full parameter tables live at **`/api`** on the examples site (`npm run site:dev` → sidebar **API Reference**, switchable zh/EN).

### Public methods

| Method | Description |
|--------|-------------|
| `mount(el)` | Mount into a DOM host |
| `load(source)` | Load and analyze audio |
| `destroy()` | Dispose DOM, transport, and `AudioContext` |
| `play` / `pause` / `stop` / `togglePlay` | Transport |
| `skipForward` / `skipBackward` | Jump by `skipSeconds` |
| `fit()` | Fit viewport to full length |
| `setViewMode(mode)` | `"waveform"` \| `"spectrogram"` |
| `setPlayChannelMode(mode)` | original / mono / solo |
| `copySelection` / `cutSelection` / `pasteClipboard` / `deleteSelection` | Edit |
| `undo` / `redo` | Undo / redo |
| `exportSelection` / `exportAll` | Export 16-bit WAV |
| `setRecordDurationSec(sec)` | Fixed recording duration |
| `startRecording(sec?)` / `stopRecording()` | Microphone recording |

### Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / pause |
| ← / → | Nudge playhead |
| Shift+← / → | Skip back / forward |
| Home / End | Start / end |
| W / S | Waveform / spectrogram |
| O / M | Original / Mono |
| 1 / 2 | Solo Ch1 / Ch2 |
| Shift+drag | Selection |
| Space+drag / Alt+drag | Pan |
| Wheel | Zoom |
| Ctrl/⌘+X | Cut selection |
| Ctrl/⌘+C | Copy selection |
| Ctrl/⌘+V | Paste (replace selection, or insert at playhead) |
| Delete / Backspace | Delete selection |
| Ctrl/⌘+Z | Undo |
| Ctrl/⌘+Shift+Z or Ctrl/⌘+Y | Redo |

### Recording

Pick a duration in the toolbar (1 / 5 / 10 / 30 minutes), then click **Record** and allow the mic:

- Timeline length = chosen fixed duration, **always shown full-width on one screen**
- Waveform grows left→right; playhead follows the write head
- Stops automatically when full, or click **Stop Rec** early (trimmed to actual length)
- After stop, analysis runs; then you can play / edit / export

### Editing notes

- Clipboard is internal to the control (not the system clipboard); calling `load` again clears undo history.
- After an edit, worker analysis and spectrogram bake run in the background; if playback was active, it tries to keep playing.
- Export is 16-bit PCM WAV and triggers a browser download.

### Spectrogram dB

Toolbar **dB min / dB max** map the color dynamic range (defaults about `-100` ~ `-5`). Raising the max reduces “overheated” red/white regions.

## Architecture

```
UI / interaction / Canvas render  ← TypeScript (main thread; spectrogram = ImageBitmap blit)
        ↓
 analysis.worker.ts               ← WebWorker
        ↓
 Rust WASM                        ← peaks pyramid, STFT, WSOLA
```

Longer audio automatically increases hop and lowers `maxFrames` to keep analysis time reasonable.
