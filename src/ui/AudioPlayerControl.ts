import "./styles.css";
import type {
  AudioPlayerControlOptions,
  LoadProgress,
  PlayChannelMode,
  ViewMode,
} from "../types.js";
import { PlayerStateStore } from "../core/PlayerStateStore.js";
import { TimelineController } from "../timeline/TimelineController.js";
import { TimeRuler, formatClock } from "../timeline/TimeRuler.js";
import { ViewportMapper } from "../timeline/ViewportMapper.js";
import { AudioLoader } from "../audio/AudioLoader.js";
import { TransportController } from "../audio/TransportController.js";
import { TimeStretchEngineWasm } from "../audio/TimeStretchEngineWasm.js";
import { WaveformPeaks } from "../analysis/WaveformPeaks.js";
import { SpectrogramFrames } from "../analysis/SpectrogramFrames.js";
import { LaneLayout, type LaneRect } from "../render/LaneLayout.js";
import { WaveformLaneRenderer } from "../render/WaveformLaneRenderer.js";
import { SpectrogramLaneRenderer } from "../render/SpectrogramLaneRenderer.js";
import { WebGL2SpectrogramRenderer } from "../render/WebGL2SpectrogramRenderer.js";
import { PlayheadOverlay } from "../render/PlayheadOverlay.js";
import { OverviewRenderer } from "../render/OverviewRenderer.js";
import { InteractionController } from "../interaction/InteractionController.js";
import { EventBus } from "../core/EventBus.js";

export type ControlEvents = {
  loadprogress: [LoadProgress];
  error: [Error];
  ready: [];
  change: [];
};

export class AudioPlayerControl {
  readonly store: PlayerStateStore;
  readonly bus = new EventBus<ControlEvents>();

  private readonly options: Required<
    Pick<AudioPlayerControlOptions, "skipSeconds">
  > &
    AudioPlayerControlOptions;
  private root: HTMLElement | null = null;
  private rulerCanvas: HTMLCanvasElement | null = null;
  private mainCanvas: HTMLCanvasElement | null = null;
  private glCanvas: HTMLCanvasElement | null = null;
  private axisCanvas: HTMLCanvasElement | null = null;
  private overviewCanvas: HTMLCanvasElement | null = null;
  private clockEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  private audioContext: AudioContext;
  private loader: AudioLoader;
  private transport: TransportController;
  private timeline: TimelineController;
  private laneLayout = new LaneLayout();
  private waveformRenderer = new WaveformLaneRenderer();
  private spectrogramRenderer = new SpectrogramLaneRenderer();
  private playheadOverlay = new PlayheadOverlay();
  private overviewRenderer = new OverviewRenderer();
  private timeRuler: TimeRuler | null = null;
  private interaction: InteractionController | null = null;

  private peaks: WaveformPeaks | null = null;
  private spectrograms: SpectrogramFrames | null = null;
  private lanes: LaneRect[] = [];
  private mapper: ViewportMapper | null = null;
  private raf = 0;
  private needRender = true;
  private isLoading = false;
  private loadingStage: LoadProgress["stage"] | null = null;
  private loadingMessage = "";
  private loadingProgress = 0;
  private unsubLoadProgress: (() => void) | null = null;
  private unsubStore: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private fftSize: number;
  private hop: number;

  private webglSpectrogram: WebGL2SpectrogramRenderer | null = null;
  private webglTexturesBuilt = false;

  constructor(options: AudioPlayerControlOptions = {}) {
    this.options = { skipSeconds: options.skipSeconds ?? 5, ...options };
    // Higher FFT + reasonable hop gives noticeably better CoolEdit-like spectrogram.
    this.fftSize = options.spectrogramFftSize ?? 4096;
    this.hop = options.spectrogramHop ?? Math.floor(this.fftSize / 8);
    this.store = new PlayerStateStore(this.options);
    this.audioContext = new AudioContext();
    this.loader = new AudioLoader(this.audioContext);
    this.transport = new TransportController(this.store, this.audioContext);
    this.timeline = new TimelineController(this.store);
  }

  mount(el: HTMLElement): void {
    this.destroyDom();
    this.root = el;
    el.classList.add("apc-root");
    el.innerHTML = "";
    el.appendChild(this.buildDom());

    this.rulerCanvas = el.querySelector(".apc-ruler");
    this.mainCanvas = el.querySelector(".apc-main-2d");
    this.glCanvas = el.querySelector(".apc-main-gl");
    this.axisCanvas = el.querySelector(".apc-axis-2d");
    this.overviewCanvas = el.querySelector(".apc-overview");
    this.clockEl = el.querySelector(".apc-clock");
    this.statusEl = el.querySelector(".apc-status");

    if (this.rulerCanvas) this.timeRuler = new TimeRuler(this.rulerCanvas);

    this.interaction = new InteractionController(
      this.mainCanvas!,
      this.overviewCanvas,
      this.store,
      this.timeline,
      this.laneLayout,
      {
        getMapper: () => this.mapper,
        getPeaks: () => this.peaks,
        getLanes: () => this.lanes,
        seek: (sample) => this.transport.seek(sample),
      },
    );

    this.unsubStore = this.store.bus.on("change", (state, patch) => {
      this.syncTransportFromState();
      if (
        patch.playChannelMode ||
        patch.selection !== undefined ||
        patch.playSelectionOnly !== undefined ||
        patch.loopSelection !== undefined
      ) {
        this.transport.setSelectionOptions({
          selection: state.selection,
          playSelectionOnly: state.playSelectionOnly,
          loopSelection: state.loopSelection,
        });
      }
      if (patch.playChannelMode) {
        this.transport.setChannelMode(state.playChannelMode);
      }
      if (patch.volume !== undefined || patch.muted !== undefined) {
        this.transport.setVolume(state.volume, state.muted);
      }
      if (patch.playbackRate !== undefined) {
        void this.transport.setPlaybackRate(state.playbackRate);
      }
      this.timeline.followIfNeeded();
      const patchKeys = Object.keys(patch);
      if (patchKeys.includes("viewMode")) {
        this.needRender = true;
      } else {
        // 仅波形播放时允许 playhead-only；语谱播放由 startLoop 强制全量 render。
        const onlyPlayhead =
          patchKeys.length === 1 &&
          patchKeys[0] === "playheadSample" &&
          state.transport === "playing" &&
          state.viewMode === "waveform";
        this.needRender = !onlyPlayhead;
      }
      this.bus.emit("change");
      this.updateChrome();
    });

    // 将 loadprogress 的每一步显示到画布上（而不仅是 DOM 文本）。
    this.unsubLoadProgress = this.bus.on("loadprogress", (p) => {
      this.loadingStage = p.stage;
      this.loadingMessage = p.message ?? "";
      this.loadingProgress = p.progress;
      this.isLoading = p.stage !== "done";
      this.needRender = true;
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.needRender = true;
    });
    this.resizeObserver.observe(el);

    this.keyHandler = (e) => this.onKeyDown(e);
    window.addEventListener("keydown", this.keyHandler);

    this.bindToolbar(el);
    this.startLoop();
    this.updateChrome();
  }

  async load(source: File | Blob | string | ArrayBuffer | AudioBuffer): Promise<void> {
    try {
      this.isLoading = true;
      this.loadingStage = null;
      this.loadingMessage = "";
      this.loadingProgress = 0;
      this.setStatus("Loading…");
      const buffer = await this.loader.load(source, {
        onProgress: (p) => {
          this.bus.emit("loadprogress", p);
          this.setStatus(p.message ?? p.stage);
        },
      });

      this.bus.emit("loadprogress", {
        stage: "analyze",
        progress: 0.85,
        message: "Analyzing…",
      });
      this.setStatus("Analyzing (worker)…");

      // 预热 WSOLA/WASM 初始化：避免首次切倍速时再触发额外加载延迟。
      const wasmWarmPromise = TimeStretchEngineWasm.ensureWasm();

      // Keep buffer for playback on main thread; worker will compute heavy peaks/spectrogram.
      this.store.resetForBuffer(buffer);
      this.transport.setBuffer(buffer);

      const channelCount = buffer.numberOfChannels;
      const channelData: Float32Array[] = [];
      const transferables: Transferable[] = [];
      for (let ch = 0; ch < channelCount; ch++) {
        const copy = new Float32Array(buffer.getChannelData(ch)); // safe copy (does not detach AudioBuffer)
        channelData.push(copy);
        transferables.push(copy.buffer);
      }

      type SpectrogramDataPayload = {
        bins: number;
        frames: number;
        magnitudes: Float32Array;
        fftSize: number;
        hop: number;
        sampleRate: number;
      };

      type WorkerResponse = {
        peaks: { peaksLevels: Float32Array[][] };
        spectrogram: { channelCount: number; data: SpectrogramDataPayload[] };
      };

      const worker = new Worker(
        new URL("../workers/analysis.worker.ts", import.meta.url),
        { type: "module" },
      );

      const response = (await new Promise<WorkerResponse>((resolve, reject) => {
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => resolve(ev.data);
        worker.onerror = (err) => reject(err);
        worker.postMessage(
          {
            kind: "analyze",
            channelData,
            sampleRate: buffer.sampleRate,
            fftSize: this.fftSize,
            hop: this.hop,
            maxFrames: 8192,
          },
          transferables,
        );
      })) as WorkerResponse;

      worker.terminate();

      // 确保 WSOLA/WASM 已就绪（不在首次倍速时才初始化）。
      await wasmWarmPromise;

      this.peaks = new WaveformPeaks(buffer, { levels: response.peaks.peaksLevels });
      this.spectrograms = new SpectrogramFrames({
        channelCount: response.spectrogram.channelCount,
        data: response.spectrogram.data,
      });
      this.webglTexturesBuilt = false;

      this.bus.emit("loadprogress", { stage: "done", progress: 1 });
      this.bus.emit("ready");
      this.setStatus(
        `${buffer.numberOfChannels} ch · ${buffer.sampleRate} Hz · ${buffer.duration.toFixed(2)}s`,
      );
      this.needRender = true;
      this.updateChrome();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.bus.emit("error", error);
      this.setStatus(error.message);
      throw error;
    } finally {
      // 无论成功/失败，都关闭 overlay，避免卡住在“Loading…”。
      this.isLoading = false;
    }
  }

  destroy(): void {
    this.destroyDom();
    this.transport.dispose();
    void this.audioContext.close();
  }

  // —— Public transport API ——
  play(): Promise<void> {
    return this.transport.play();
  }
  pause(): void {
    this.transport.pause();
  }
  stop(): void {
    this.transport.stop();
  }
  togglePlay(): Promise<void> {
    const t = this.store.getSnapshot().transport;
    if (t === "playing") {
      this.pause();
      return Promise.resolve();
    }
    return this.play();
  }
  skipForward(): void {
    this.transport.skipForward();
  }
  skipBackward(): void {
    this.transport.skipBackward();
  }
  setViewMode(mode: ViewMode): void {
    this.store.patch({ viewMode: mode });
  }
  setPlayChannelMode(mode: PlayChannelMode): void {
    this.transport.setChannelMode(mode);
  }
  fit(): void {
    this.timeline.fitAll();
  }

  private destroyDom(): void {
    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    this.interaction?.destroy();
    this.interaction = null;
    this.unsubStore?.();
    this.unsubStore = null;
    this.unsubLoadProgress?.();
    this.unsubLoadProgress = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.stopLoop();
    if (this.root) {
      this.root.innerHTML = "";
      this.root.classList.remove("apc-root");
    }
    this.root = null;
    this.webglSpectrogram = null;
    this.webglTexturesBuilt = false;
  }

  private buildDom(): DocumentFragment {
    const frag = document.createDocumentFragment();
    const toolbar = document.createElement("div");
    toolbar.className = "apc-toolbar";
    toolbar.innerHTML = `
      <button type="button" data-act="play" title="播放/暂停（空格）">播放</button>
      <button type="button" data-act="stop" title="停止（回到 0）">停止</button>
      <button type="button" data-act="back" title="快退（Shift+←）">快退</button>
      <button type="button" data-act="fwd" title="快进（Shift+→）">快进</button>
      <button type="button" data-act="fit" title="适配全长">适配</button>
      <button type="button" data-act="wave" data-view="waveform" class="active">波形</button>
      <button type="button" data-act="spec" data-view="spectrogram">语谱</button>
      <label>通道
        <select data-act="channel">
          <option value="original">原声</option>
          <option value="mono">单声道</option>
          <option value="solo-0">独奏 左（Ch1）</option>
          <option value="solo-1">独奏 右（Ch2）</option>
        </select>
      </label>
      <label>倍速
        <select data-act="rate">
          <option value="0.5">0.5×</option>
          <option value="0.75">0.75×</option>
          <option value="1" selected>1×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
      </label>
      <label>音量 <input data-act="volume" type="range" min="0" max="1" step="0.01" value="1" /></label>
      <label><input data-act="mute" type="checkbox" /> 静音</label>
      <label><input data-act="follow" type="checkbox" checked /> 跟随</label>
      <label><input data-act="snap" type="checkbox" checked /> 吸附到过零点</label>
      <label><input data-act="selonly" type="checkbox" /> 仅播放选区</label>
      <label><input data-act="loop" type="checkbox" /> 选区循环</label>
      <label><input data-act="gainlink" type="checkbox" checked /> 联动增益</label>
      <label>增益 <input data-act="gain" type="range" min="0.2" max="4" step="0.05" value="1" /></label>
      <label>dB 最小 <input data-act="mindb" type="number" value="-90" style="width:56px" /></label>
      <label>dB 最大 <input data-act="maxdb" type="number" value="-10" style="width:56px" /></label>
      <button type="button" data-act="clear-sel">清除选区</button>
      <span class="apc-clock">00:00.000</span>
    `;
    const status = document.createElement("div");
    status.className = "apc-status";
    status.textContent = "Load an audio file to begin";

    const ruler = document.createElement("canvas");
    ruler.className = "apc-ruler";

    const wrap = document.createElement("div");
    wrap.className = "apc-main-wrap";
    // WebGL spectrogram layer (behind)
    const gl = document.createElement("canvas");
    gl.className = "apc-main apc-main-gl";
    wrap.appendChild(gl);
    // Axis/label static 2D layer (keeps frequency axis + lane labels stable)
    const axis = document.createElement("canvas");
    axis.className = "apc-main apc-axis-2d";
    wrap.appendChild(axis);
    // 2D overlay layer (waveform / cursor overlays)
    const main = document.createElement("canvas");
    main.className = "apc-main apc-main-2d";
    wrap.appendChild(main);

    const overview = document.createElement("canvas");
    overview.className = "apc-overview";

    frag.append(toolbar, status, ruler, wrap, overview);
    return frag;
  }

  private bindToolbar(root: HTMLElement): void {
    root.querySelector('[data-act="play"]')?.addEventListener("click", () => {
      void this.togglePlay();
    });
    root.querySelector('[data-act="stop"]')?.addEventListener("click", () => this.stop());
    root.querySelector('[data-act="back"]')?.addEventListener("click", () => this.skipBackward());
    root.querySelector('[data-act="fwd"]')?.addEventListener("click", () => this.skipForward());
    root.querySelector('[data-act="fit"]')?.addEventListener("click", () => this.fit());
    root.querySelector('[data-act="wave"]')?.addEventListener("click", () =>
      this.setViewMode("waveform"),
    );
    root.querySelector('[data-act="spec"]')?.addEventListener("click", () =>
      this.setViewMode("spectrogram"),
    );
    root.querySelector('[data-act="clear-sel"]')?.addEventListener("click", () => {
      this.store.patch({ selection: null });
    });

    const channel = root.querySelector('[data-act="channel"]') as HTMLSelectElement | null;
    channel?.addEventListener("change", () => {
      const v = channel.value;
      if (v === "original") this.setPlayChannelMode({ kind: "original" });
      else if (v === "mono") this.setPlayChannelMode({ kind: "mono" });
      else if (v.startsWith("solo-")) {
        this.setPlayChannelMode({ kind: "solo", channel: Number(v.slice(5)) });
      }
    });

    const rate = root.querySelector('[data-act="rate"]') as HTMLSelectElement | null;
    rate?.addEventListener("change", () => {
      this.store.patch({ playbackRate: Number(rate.value) });
    });

    const volume = root.querySelector('[data-act="volume"]') as HTMLInputElement | null;
    volume?.addEventListener("input", () => {
      this.store.patch({ volume: Number(volume.value) });
    });

    const bindCheck = (act: string, key: "muted" | "followPlayhead" | "snapToZeroCrossing" | "playSelectionOnly" | "loopSelection" | "waveformGainLinked") => {
      const el = root.querySelector(`[data-act="${act}"]`) as HTMLInputElement | null;
      el?.addEventListener("change", () => {
        this.store.patch({ [key]: el.checked } as never);
      });
    };
    bindCheck("mute", "muted");
    bindCheck("follow", "followPlayhead");
    bindCheck("snap", "snapToZeroCrossing");
    bindCheck("selonly", "playSelectionOnly");
    bindCheck("loop", "loopSelection");
    bindCheck("gainlink", "waveformGainLinked");

    const gain = root.querySelector('[data-act="gain"]') as HTMLInputElement | null;
    gain?.addEventListener("input", () => {
      const state = this.store.getSnapshot();
      const g = Number(gain.value);
      if (state.waveformGainLinked || state.waveformGain.length === 0) {
        this.store.patch({
          waveformGain: Array.from({ length: Math.max(1, state.channelCount) }, () => g),
        });
      } else {
        const next = [...state.waveformGain];
        next[0] = g;
        this.store.patch({ waveformGain: next });
      }
    });

    const minDb = root.querySelector('[data-act="mindb"]') as HTMLInputElement | null;
    const maxDb = root.querySelector('[data-act="maxdb"]') as HTMLInputElement | null;
    minDb?.addEventListener("change", () => {
      this.store.patch({ spectrogramMinDb: Number(minDb.value) });
    });
    maxDb?.addEventListener("change", () => {
      this.store.patch({ spectrogramMaxDb: Number(maxDb.value) });
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.root) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    const state = this.store.getSnapshot();
    if (e.code === "Space") {
      e.preventDefault();
      void this.togglePlay();
    } else if (e.code === "Home") {
      this.transport.seek(0);
    } else if (e.code === "End") {
      this.transport.seek(state.lengthSamples);
    } else if (e.code === "ArrowLeft" && e.shiftKey) {
      this.skipBackward();
    } else if (e.code === "ArrowRight" && e.shiftKey) {
      this.skipForward();
    } else if (e.code === "ArrowLeft") {
      this.transport.seek(state.playheadSample - state.sampleRate * 0.05);
    } else if (e.code === "ArrowRight") {
      this.transport.seek(state.playheadSample + state.sampleRate * 0.05);
    } else if (e.key === "w" || e.key === "W") {
      this.setViewMode("waveform");
    } else if (e.key === "s" || e.key === "S") {
      this.setViewMode("spectrogram");
    } else if (e.key === "m" || e.key === "M") {
      this.setPlayChannelMode({ kind: "mono" });
    } else if (e.key === "o" || e.key === "O") {
      this.setPlayChannelMode({ kind: "original" });
    } else if (e.key === "1") {
      this.setPlayChannelMode({ kind: "solo", channel: 0 });
    } else if (e.key === "2") {
      this.setPlayChannelMode({ kind: "solo", channel: 1 });
    }
  }

  private syncTransportFromState(): void {
    const state = this.store.getSnapshot();
    this.transport.setSelectionOptions({
      selection: state.selection,
      playSelectionOnly: state.playSelectionOnly,
      loopSelection: state.loopSelection,
    });
  }

  private lastChannelUiKey = "";

  private updateChrome(): void {
    const state = this.store.getSnapshot();
    if (this.clockEl) {
      this.clockEl.textContent = formatClock(state.playheadSample, state.sampleRate || 1);
    }
    const playBtn = this.root?.querySelector('[data-act="play"]') as HTMLButtonElement | null;
    if (playBtn) playBtn.textContent = state.transport === "playing" ? "暂停" : "播放";

    const waveBtn = this.root?.querySelector('[data-act="wave"]');
    const specBtn = this.root?.querySelector('[data-act="spec"]');
    waveBtn?.classList.toggle("active", state.viewMode === "waveform");
    specBtn?.classList.toggle("active", state.viewMode === "spectrogram");

    const select = this.root?.querySelector('[data-act="channel"]') as HTMLSelectElement | null;
    if (select && state.channelCount > 0) {
      const mode = state.playChannelMode;
      const modeKey =
        mode.kind === "solo" ? `solo-${mode.channel}` : mode.kind;
      const uiKey = `${state.channelCount}:${modeKey}`;
      if (uiKey !== this.lastChannelUiKey) {
        this.lastChannelUiKey = uiKey;
        const opts: string[] = [
          `<option value="original">原声</option>`,
          `<option value="mono">单声道</option>`,
        ];
        for (let i = 0; i < state.channelCount; i++) {
          const label =
            state.channelCount === 2
              ? i === 0
                ? "独奏 左（Ch1）"
                : "独奏 右（Ch2）"
              : `独奏 通道${i + 1}`;
          opts.push(`<option value="solo-${i}">${label}</option>`);
        }
        select.innerHTML = opts.join("");
        select.value = modeKey;
      }
    }

    // 只移除语谱图模式的 minimap：波形模式仍保留概览条。
    if (this.overviewCanvas) {
      const hide = state.viewMode === "spectrogram";
      this.overviewCanvas.style.display = hide ? "none" : "";
      this.overviewCanvas.style.pointerEvents = hide ? "none" : "";
    }
  }

  private setStatus(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  private drawLoadingOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const stage = this.loadingStage ?? "加载中";
    const msg = this.loadingMessage;
    const progress = Math.max(0, Math.min(1, this.loadingProgress));

    // full-canvas dim overlay
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, width, height);

    const pad = 14;
    const boxW = Math.min(width - pad * 2, 520);
    const boxH = 96;
    const x = Math.max(pad, width - boxW - pad);
    const y = pad;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, boxW, boxH);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    ctx.fillStyle = "#e8eef8";
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`阶段：${stage}`, x + 12, y + 12);
    if (msg) ctx.fillText(`信息：${msg}`, x + 12, y + 30);

    // progress bar
    const barX = x + 12;
    const barY = y + 56;
    const barW = boxW - 24;
    const barH = 10;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "rgba(80,170,255,0.9)";
    ctx.fillRect(barX, barY, Math.floor(barW * progress), barH);

    ctx.fillStyle = "#b9d7ff";
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`进度：${Math.round(progress * 100)}%`, barX + 2, barY + 14);
  }

  private startLoop(): void {
    const loop = () => {
      const playing = this.store.getSnapshot().transport === "playing";
      const spectrogram = this.store.getSnapshot().viewMode === "spectrogram";
      if (this.needRender || (playing && spectrogram)) {
        // 语谱 + 播放：始终全量渲染，避免 overlay-only 清掉可见内容。
        this.render();
        this.needRender = false;
      } else if (playing) {
        // 波形播放仍可用轻量 overlay 路径。
        this.renderOverlaysOnly();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private render(): void {
    if (!this.mainCanvas || !this.rulerCanvas || !this.overviewCanvas) return;
    const state = this.store.getSnapshot();
    if (!this.peaks || state.channelCount === 0) {
      const ctx = this.mainCanvas.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = this.mainCanvas.clientWidth;
        const h = this.mainCanvas.clientHeight;
        this.mainCanvas.width = Math.max(1, Math.floor(w * dpr));
        this.mainCanvas.height = Math.max(1, Math.floor(h * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#0e1116";
        ctx.fillRect(0, 0, w, h);
        if (this.isLoading) {
          this.drawLoadingOverlay(ctx, w, h);
        }
      }
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = this.mainCanvas.clientWidth;
    const height = this.mainCanvas.clientHeight;
    this.mainCanvas.width = Math.max(1, Math.floor(width * dpr));
    this.mainCanvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = this.mainCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const axisW = state.viewMode === "spectrogram" ? 36 : 0;
    this.mapper = new ViewportMapper({
      sampleRate: state.sampleRate,
      startSample: state.viewport.startSample,
      endSample: state.viewport.endSample,
      width: Math.max(1, width - axisW),
      offsetX: axisW,
    });

    this.lanes = this.laneLayout.compute(state.laneHeights, height);
    this.timeRuler?.render(this.mapper, dpr);

    let dimChannels: Set<number> | null = null;
    if (state.playChannelMode.kind === "solo") {
      dimChannels = new Set<number>();
      for (let i = 0; i < state.channelCount; i++) {
        if (i !== state.playChannelMode.channel) dimChannels.add(i);
      }
    }

    if (state.viewMode === "waveform") {
      if (this.glCanvas) this.glCanvas.style.visibility = "hidden";
      if (this.axisCanvas) this.axisCanvas.style.visibility = "hidden";
      this.waveformRenderer.render(ctx, this.peaks, this.mapper, this.lanes, {
        gains: state.waveformGain,
        dimChannels,
        channelCount: state.channelCount,
      });
    } else if (this.spectrograms) {
      // === WebGL2 spectrogram pixels (GPU) ===
      if (!this.glCanvas || !this.axisCanvas) return;
      this.glCanvas.style.visibility = "visible";
      this.axisCanvas.style.visibility = "visible";

      // Sync GL canvas size only when needed (resize clears the buffer).
      const glW = Math.max(1, Math.floor(width * dpr));
      const glH = Math.max(1, Math.floor(height * dpr));
      if (this.glCanvas.width !== glW) this.glCanvas.width = glW;
      if (this.glCanvas.height !== glH) this.glCanvas.height = glH;

      if (!this.webglSpectrogram) {
        try {
          this.webglSpectrogram = new WebGL2SpectrogramRenderer(this.glCanvas, {
            freqBinsLog: 512,
          });
        } catch {
          // WebGL2 失败则回退到 CPU 渲染（画在最上层 2d canvas，保证可见）
          this.spectrogramRenderer.render(ctx, this.spectrograms, this.mapper, this.lanes, {
            minDb: state.spectrogramMinDb,
            maxDb: state.spectrogramMaxDb,
            dimChannels,
            channelCount: state.channelCount,
            drawFrequencyAxis: true,
          });
          if (state.channelCount > 1) {
            ctx.fillStyle = "#2a303c";
            for (const s of this.laneLayout.hitSplitters(this.lanes)) {
              ctx.fillRect(0, s.y - 1, width, 2);
            }
          }
          this.playheadOverlay.render(
            ctx,
            this.mapper,
            state.playheadSample,
            state.selection,
            height,
          );
          this.updateChrome();
          return;
        }
      }

      if (!this.webglTexturesBuilt) {
        this.webglSpectrogram.buildTextures(this.spectrograms);
        this.webglTexturesBuilt = true;
      }

      this.webglSpectrogram.clear();
      ctx.clearRect(0, 0, width, height);

      // 语谱图画在频率轴右侧的 plot 区，与时间刻度/游标共用同一套坐标
      const plotX0 = Math.floor(axisW * dpr);
      const plotW = Math.max(1, glW - plotX0);
      for (const lane of this.lanes) {
        const dim = dimChannels?.has(lane.channel) ?? false;
        const laneH = Math.max(1, Math.floor(lane.height * dpr));
        const laneYTop = Math.floor(lane.y * dpr);
        const laneYGl = Math.max(0, glH - laneYTop - laneH);
        this.webglSpectrogram.renderLane({
          channel: lane.channel,
          viewportStartSample: state.viewport.startSample,
          viewportEndSample: state.viewport.endSample,
          lanePlotXDevice: plotX0,
          lanePlotYDevice: laneYGl,
          lanePlotWDevice: plotW,
          lanePlotHDevice: laneH,
          minDb: state.spectrogramMinDb,
          maxDb: state.spectrogramMaxDb,
          dim,
        });
      }

      // 频率轴只占左侧 gutter，不覆盖语谱/时间映射区域
      const axisCtx = this.axisCanvas.getContext("2d");
      if (axisCtx) {
        const aw = Math.max(1, Math.floor(width * dpr));
        const ah = Math.max(1, Math.floor(height * dpr));
        if (this.axisCanvas.width !== aw) this.axisCanvas.width = aw;
        if (this.axisCanvas.height !== ah) this.axisCanvas.height = ah;
        axisCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        axisCtx.clearRect(0, 0, width, height);

        const hzMin = 20;
        const hzMax = state.sampleRate / 2;
        const ratios = [0, 0.25, 0.5, 0.75, 1];

        for (const lane of this.lanes) {
          const dim = dimChannels?.has(lane.channel) ?? false;

          axisCtx.fillStyle = "#141820";
          axisCtx.fillRect(0, lane.y, axisW, lane.height);

          axisCtx.fillStyle = "#8b95a8";
          axisCtx.font = "9px ui-sans-serif, system-ui, sans-serif";
          axisCtx.textAlign = "right";
          axisCtx.textBaseline = "middle";
          for (let i = 0; i < ratios.length; i++) {
            const r = ratios[i]!;
            const hz = hzMax * Math.pow(hzMin / hzMax, 1 - r);
            const y = lane.y + r * lane.height;
            const label = hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`;
            axisCtx.fillText(label, axisW - 4, y);
            axisCtx.strokeStyle = "#2a303c";
            axisCtx.beginPath();
            axisCtx.moveTo(axisW - 3, y + 0.5);
            axisCtx.lineTo(axisW, y + 0.5);
            axisCtx.stroke();
          }

          // 通道名放在 gutter 内，避免伸进时间轴
          axisCtx.textAlign = "left";
          axisCtx.fillStyle = dim ? "#667084" : "#e8eef8";
          axisCtx.font = "10px ui-sans-serif, system-ui, sans-serif";
          axisCtx.textBaseline = "top";
          axisCtx.fillText(
            lane.channel === 0 && state.channelCount === 2
              ? "L"
              : lane.channel === 1 && state.channelCount === 2
                ? "R"
                : `Ch${lane.channel + 1}`,
            4,
            lane.y + 4,
          );
        }
      }
    }

    // splitters visual
    if (state.channelCount > 1) {
      ctx.fillStyle = "#2a303c";
      for (const s of this.laneLayout.hitSplitters(this.lanes)) {
        ctx.fillRect(0, s.y - 1, width, 2);
      }
    }

    this.playheadOverlay.render(
      ctx,
      this.mapper,
      state.playheadSample,
      state.selection,
      height,
    );

    const octx = this.overviewCanvas.getContext("2d");
    if (octx) {
      // 语谱图模式不渲染 minimap（renderer 清掉旧内容，避免切换瞬间残影）。
      if (state.viewMode === "waveform") {
        this.overviewRenderer.render(
          octx,
          this.peaks,
          state.lengthSamples,
          state.viewport.startSample,
          state.viewport.endSample,
          this.overviewCanvas.clientWidth,
          this.overviewCanvas.clientHeight,
          dpr,
        );
      } else {
        octx.clearRect(0, 0, this.overviewCanvas.clientWidth, this.overviewCanvas.clientHeight);
      }
    }

    this.updateChrome();
  }

  private renderOverlaysOnly(): void {
    // 波形图与游标共用同一 canvas，只能全量重绘。
    // 语谱播放路径已在 startLoop 中强制走 render()，不会进入这里。
    this.needRender = true;
  }
}
