import "./styles.css";
import type {
  AudioPlayerControlOptions,
  LoadProgress,
  PlayChannelMode,
  ToolbarGroup,
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
import { SpectrogramBitmapCache } from "../render/SpectrogramBitmapCache.js";
import { PlayheadOverlay } from "../render/PlayheadOverlay.js";
import { OverviewRenderer } from "../render/OverviewRenderer.js";
import { InteractionController } from "../interaction/InteractionController.js";
import { EventBus } from "../core/EventBus.js";
import { EditHistory } from "../core/EditHistory.js";
import {
  type AudioClipboard,
  copyRange,
  deleteRange,
  insertAt,
  normalizeEditRange,
  replaceRange,
} from "../audio/BufferEdit.js";
import { downloadBlob, encodeWavPcm16 } from "../audio/WavExport.js";
import { LiveRecorder } from "../audio/LiveRecorder.js";
import type { PeaksQueryable } from "../render/WaveformLaneRenderer.js";

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
  private spectrogramCanvas: HTMLCanvasElement | null = null;
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

  /** 整段语谱烘焙成图片后，缩放/跟随只做 drawImage。 */
  private spectrogramBitmaps = new SpectrogramBitmapCache();
  private spectrogramBakePending = false;
  /** 语谱模式下仅 viewport 变化时走快路径（跳过频率轴重绘）。 */
  private spectrogramViewportOnly = false;
  private axisLayoutKey = "";

  private editHistory: EditHistory;
  private clipboard: AudioClipboard | null = null;
  private editBusy = false;

  private recorder: LiveRecorder;
  private recording = false;
  /** Planned mic session length in seconds (full timeline on one screen). */
  private recordDurationSec = 300;

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
    this.editHistory = new EditHistory(this.audioContext, 20);
    this.recorder = new LiveRecorder(this.audioContext);
  }

  /**
   * 挂载到 DOM。会清空 el 并写入工具栏/画布。
   * @param el 宿主元素
   */
  mount(el: HTMLElement): void {
    this.destroyDom();
    this.root = el;
    el.classList.add("apc-root");
    el.innerHTML = "";
    el.appendChild(this.buildDom());

    this.rulerCanvas = el.querySelector(".apc-ruler");
    this.mainCanvas = el.querySelector(".apc-main-2d");
    this.spectrogramCanvas = el.querySelector(".apc-main-spec");
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
        this.spectrogramViewportOnly = false;
      } else {
        const onlyPlayhead =
          patchKeys.length === 1 &&
          patchKeys[0] === "playheadSample" &&
          state.transport === "playing";
        const onlyViewport =
          patchKeys.length === 1 &&
          patchKeys[0] === "viewport" &&
          state.viewMode === "spectrogram";
        if (onlyPlayhead) {
          // 语谱：游标在独立 overlay，可只重画上层。
          // 波形：游标与波形同 canvas，必须全量重绘；若置 false 会被 transport 时钟反复冲掉。
          this.needRender = state.viewMode !== "spectrogram";
        } else if (onlyViewport) {
          this.needRender = true;
          this.spectrogramViewportOnly = true;
        } else {
          this.needRender = true;
          this.spectrogramViewportOnly = false;
        }
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

  /**
   * 加载音频并分析。
   * @param source File / Blob / URL 字符串 / ArrayBuffer / AudioBuffer
   */
  async load(source: File | Blob | string | ArrayBuffer | AudioBuffer): Promise<void> {
    if (this.recording) {
      await this.recorder.stop({ finalize: false });
      this.recording = false;
    }
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

      // 预热 WSOLA/WASM 初始化：避免首次切倍速时再触发额外加载延迟。
      const wasmWarmPromise = TimeStretchEngineWasm.ensureWasm();

      this.editHistory.clear();
      this.clipboard = null;
      this.store.resetForBuffer(buffer);
      this.transport.setBuffer(buffer);

      await wasmWarmPromise;
      await this.reanalyzeAndBake(buffer);

      this.bus.emit("loadprogress", { stage: "done", progress: 1 });
      this.bus.emit("ready");
      this.setStatus(this.formatBufferStatus(buffer));
      this.needRender = true;
      this.updateChrome();
      // 空闲预热常用倍率（仅首段窗口），切速时尽量命中缓存
      void this.transport.prewarmRates(0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.bus.emit("error", error);
      this.setStatus(error.message);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /** 销毁 DOM、运输与 AudioContext。 */
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
  /**
   * 切换主视图。
   * @param mode `"waveform"` | `"spectrogram"`
   */
  setViewMode(mode: ViewMode): void {
    this.store.patch({ viewMode: mode });
  }
  /**
   * 设置通道路由。
   * @param mode `{ kind:"original" }` | `{ kind:"mono" }` | `{ kind:"solo", channel:number }`
   */
  setPlayChannelMode(mode: PlayChannelMode): void {
    this.transport.setChannelMode(mode);
  }
  fit(): void {
    this.timeline.fitAll();
  }

  isRecording(): boolean {
    return this.recording;
  }

  /**
   * 设置固定录音时长（秒），并同步工具栏下拉。
   * @param sec 如 60 / 300 / 600 / 1800
   */
  setRecordDurationSec(sec: number): void {
    if (!(sec > 0)) return;
    this.recordDurationSec = sec;
    const sel = this.root?.querySelector('[data-act="rec-dur"]') as HTMLSelectElement | null;
    if (sel && ![...sel.options].some((o) => Number(o.value) === sec)) {
      // keep custom via number input if present
    }
    this.updateChrome();
  }

  /**
   * 开始麦克风录音（需用户手势 + HTTPS/localhost）。
   * @param durationSec 可选；默认用 setRecordDurationSec 的值
   */
  async startRecording(durationSec?: number): Promise<void> {
    if (this.recording || this.editBusy) return;
    const dur = Math.max(1, durationSec ?? this.recordDurationSec);
    this.recordDurationSec = dur;

    this.transport.stop();
    this.editHistory.clear();
    this.clipboard = null;
    this.peaks = null;
    this.spectrograms = null;
    this.spectrogramBitmaps.dispose();
    this.axisLayoutKey = "";

    try {
      await this.recorder.start({
        durationSec: dur,
        channelCount: 1,
        onProgress: (written, total) => {
          this.store.patch({ playheadSample: written });
          this.needRender = true;
          const sec = written / (this.audioContext.sampleRate || 1);
          const totalSec = total / (this.audioContext.sampleRate || 1);
          this.setStatus(
            `录音中… ${sec.toFixed(1)}s / ${totalSec.toFixed(0)}s（一屏显示全时长）`,
          );
        },
        onComplete: (buffer) => {
          void this.finalizeRecording(buffer);
        },
        onError: (err) => {
          this.recording = false;
          this.setStatus(err.message);
          this.bus.emit("error", err);
          this.updateChrome();
        },
      });
    } catch (err) {
      this.recording = false;
      const error = err instanceof Error ? err : new Error(String(err));
      this.setStatus(error.message);
      throw error;
    }

    const buf = this.recorder.getBuffer();
    if (!buf) return;

    this.recording = true;
    const ch = buf.numberOfChannels;
    const equal = 1 / Math.max(1, ch);
    this.store.patch({
      sampleRate: buf.sampleRate,
      lengthSamples: buf.length,
      channelCount: ch,
      viewMode: "waveform",
      viewport: { startSample: 0, endSample: buf.length },
      playheadSample: 0,
      selection: null,
      playChannelMode: { kind: "original" },
      laneHeights: Array.from({ length: ch }, () => equal),
      waveformGain: Array.from({ length: ch }, () => 1),
      transport: "idle",
      followPlayhead: false,
    });
    this.setStatus(`录音中… 0s / ${dur}s（一屏显示全时长）`);
    this.needRender = true;
    this.updateChrome();
  }

  async stopRecording(): Promise<void> {
    if (!this.recording) return;
    await this.recorder.stop({ finalize: true });
    // onComplete → finalizeRecording
  }

  private async finalizeRecording(buffer: AudioBuffer): Promise<void> {
    this.recording = false;
    this.isLoading = true;
    try {
      this.editHistory.clear();
      this.store.resetForBuffer(buffer);
      this.transport.setBuffer(buffer);
      await this.reanalyzeAndBake(buffer);
      this.bus.emit("ready");
      this.setStatus(this.formatBufferStatus(buffer));
      this.needRender = true;
      void this.transport.prewarmRates(0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.bus.emit("error", error);
      this.setStatus(error.message);
    } finally {
      this.isLoading = false;
      this.updateChrome();
    }
  }

  // —— Public edit API ——
  copySelection(): boolean {
    if (this.recording) return false;
    const buffer = this.transport.getBuffer();
    if (!buffer) {
      this.setStatus("没有可编辑的音频");
      return false;
    }
    const range = normalizeEditRange(this.store.getSnapshot().selection, buffer.length);
    if (!range) {
      this.setStatus("请先选择一段区域");
      return false;
    }
    this.clipboard = {
      sampleRate: buffer.sampleRate,
      channels: copyRange(buffer, range.lo, range.hi),
    };
    this.setStatus(`已复制 ${((range.hi - range.lo) / buffer.sampleRate).toFixed(3)}s`);
    this.updateChrome();
    return true;
  }

  async cutSelection(): Promise<boolean> {
    if (this.recording) return false;
    if (!this.copySelection()) return false;
    return this.deleteSelection();
  }

  async deleteSelection(): Promise<boolean> {
    if (this.recording) return false;
    const buffer = this.transport.getBuffer();
    if (!buffer || this.editBusy) return false;
    const range = normalizeEditRange(this.store.getSnapshot().selection, buffer.length);
    if (!range) {
      this.setStatus("请先选择一段区域");
      return false;
    }
    const next = deleteRange(this.audioContext, buffer, range.lo, range.hi);
    await this.applyEditedBuffer(next, {
      recordHistory: true,
      playheadSample: range.lo,
      selection: null,
    });
    this.setStatus("已删除选区");
    return true;
  }

  async pasteClipboard(): Promise<boolean> {
    if (this.recording) return false;
    const buffer = this.transport.getBuffer();
    if (!buffer || this.editBusy) return false;
    if (!this.clipboard || this.clipboard.channels.length === 0) {
      this.setStatus("剪贴板为空");
      return false;
    }
    if (this.clipboard.sampleRate !== buffer.sampleRate) {
      this.setStatus(
        `采样率不匹配（剪贴板 ${this.clipboard.sampleRate} Hz / 当前 ${buffer.sampleRate} Hz）`,
      );
      return false;
    }

    const state = this.store.getSnapshot();
    const sel = normalizeEditRange(state.selection, buffer.length);
    const insertLen = this.clipboard.channels[0]?.length ?? 0;
    let next: AudioBuffer;
    let pasteLo: number;

    if (sel) {
      pasteLo = sel.lo;
      next = replaceRange(
        this.audioContext,
        buffer,
        sel.lo,
        sel.hi,
        this.clipboard.channels,
      );
    } else {
      pasteLo = Math.max(0, Math.min(buffer.length, Math.floor(state.playheadSample)));
      next = insertAt(this.audioContext, buffer, pasteLo, this.clipboard.channels);
    }

    const pasteHi = pasteLo + insertLen;
    await this.applyEditedBuffer(next, {
      recordHistory: true,
      playheadSample: pasteHi,
      selection:
        insertLen > 0
          ? { startSample: pasteLo, endSample: pasteHi }
          : null,
    });
    this.setStatus("已粘贴");
    return true;
  }

  async undo(): Promise<boolean> {
    if (this.recording) return false;
    const buffer = this.transport.getBuffer();
    if (!buffer || this.editBusy || !this.editHistory.canUndo) {
      if (!this.editHistory.canUndo) this.setStatus("没有可撤销的操作");
      return false;
    }
    const prev = this.editHistory.undo(buffer);
    if (!prev) return false;
    await this.applyEditedBuffer(prev, {
      recordHistory: false,
      playheadSample: Math.min(this.store.getSnapshot().playheadSample, prev.length),
      selection: null,
    });
    this.setStatus("已撤销");
    return true;
  }

  async redo(): Promise<boolean> {
    if (this.recording) return false;
    const buffer = this.transport.getBuffer();
    if (!buffer || this.editBusy || !this.editHistory.canRedo) {
      if (!this.editHistory.canRedo) this.setStatus("没有可重做的操作");
      return false;
    }
    const next = this.editHistory.redo(buffer);
    if (!next) return false;
    await this.applyEditedBuffer(next, {
      recordHistory: false,
      playheadSample: Math.min(this.store.getSnapshot().playheadSample, next.length),
      selection: null,
    });
    this.setStatus("已重做");
    return true;
  }

  exportSelection(): boolean {
    const buffer = this.transport.getBuffer();
    if (!buffer) {
      this.setStatus("没有可导出的音频");
      return false;
    }
    const range = normalizeEditRange(this.store.getSnapshot().selection, buffer.length);
    if (!range) {
      this.setStatus("请先选择一段区域");
      return false;
    }
    const blob = encodeWavPcm16(buffer, range.lo, range.hi);
    downloadBlob(blob, "selection.wav");
    this.setStatus("已导出选区 WAV");
    return true;
  }

  exportAll(): boolean {
    const buffer = this.transport.getBuffer();
    if (!buffer) {
      this.setStatus("没有可导出的音频");
      return false;
    }
    const blob = encodeWavPcm16(buffer);
    downloadBlob(blob, "export.wav");
    this.setStatus("已导出整段 WAV");
    return true;
  }

  private formatBufferStatus(buffer: AudioBuffer): string {
    return `${buffer.numberOfChannels} ch · ${buffer.sampleRate} Hz · ${buffer.duration.toFixed(2)}s`;
  }

  private async applyEditedBuffer(
    next: AudioBuffer,
    opts: {
      recordHistory: boolean;
      playheadSample?: number;
      selection?: { startSample: number; endSample: number } | null;
    },
  ): Promise<void> {
    const current = this.transport.getBuffer();
    if (!current || this.editBusy) return;

    const stateBefore = this.store.getSnapshot();
    const wasPlaying =
      this.transport.isPlaying() || stateBefore.transport === "playing";
    // 播放中用实时游标，避免时钟与 store 有一帧偏差
    const livePlayhead = wasPlaying
      ? this.transport.getCurrentSample()
      : stateBefore.playheadSample;

    this.editBusy = true;
    try {
      if (opts.recordHistory) {
        this.editHistory.push(current);
      }

      this.transport.setBuffer(next, { syncTransport: false });

      const length = next.length;
      let vpStart = stateBefore.viewport.startSample;
      let vpEnd = stateBefore.viewport.endSample;
      const vpDur = Math.max(1, vpEnd - vpStart);
      if (vpEnd > length) {
        vpEnd = length;
        vpStart = Math.max(0, vpEnd - vpDur);
      }
      if (vpStart >= length) {
        vpStart = 0;
        vpEnd = length;
      }
      if (vpEnd <= vpStart) {
        vpStart = 0;
        vpEnd = Math.max(1, length);
      }

      const playhead = Math.max(
        0,
        Math.min(length, opts.playheadSample ?? livePlayhead),
      );

      this.store.patch({
        lengthSamples: length,
        channelCount: next.numberOfChannels,
        sampleRate: next.sampleRate,
        playheadSample: playhead,
        viewport: { startSample: vpStart, endSample: vpEnd },
        selection: opts.selection === undefined ? stateBefore.selection : opts.selection,
        transport: wasPlaying ? "playing" : stateBefore.transport === "playing" ? "paused" : stateBefore.transport,
      });

      // 换 buffer 会短暂打断声源；若原先在播，立刻从新游标续播，再后台重分析。
      if (wasPlaying) {
        await this.transport.play(playhead);
      }

      // 分析在后台进行，不打断播放；不置 isLoading，避免全屏遮罩
      await this.reanalyzeAndBake(next);
      this.setStatus(this.formatBufferStatus(next));
      this.needRender = true;
      this.updateChrome();
      void this.transport.prewarmRates(playhead);
    } finally {
      this.editBusy = false;
    }
  }

  private async reanalyzeAndBake(buffer: AudioBuffer): Promise<void> {
    this.bus.emit("loadprogress", {
      stage: "analyze",
      progress: 0.85,
      message: "Analyzing…",
    });
    this.setStatus("Analyzing (worker)…");

    const channelCount = buffer.numberOfChannels;
    const channelData: Float32Array[] = [];
    const transferables: Transferable[] = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const copy = new Float32Array(buffer.getChannelData(ch));
      channelData.push(copy);
      transferables.push(copy.buffer);
    }

    const durationSec = buffer.duration;
    let analyzeHop = this.hop;
    let maxFrames = 4096;
    if (durationSec > 600) {
      analyzeHop = Math.max(analyzeHop, Math.floor(this.fftSize / 4));
      maxFrames = 2048;
    } else if (durationSec > 180) {
      analyzeHop = Math.max(analyzeHop, Math.floor(this.fftSize / 6));
      maxFrames = 3072;
    } else if (durationSec > 60) {
      maxFrames = 4096;
    } else {
      maxFrames = 6144;
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
          hop: analyzeHop,
          maxFrames,
        },
        transferables,
      );
    })) as WorkerResponse;

    worker.terminate();

    this.peaks = new WaveformPeaks(buffer, { levels: response.peaks.peaksLevels });
    this.spectrograms = new SpectrogramFrames({
      channelCount: response.spectrogram.channelCount,
      data: response.spectrogram.data,
    });
    this.spectrogramBitmaps.dispose();
    this.axisLayoutKey = "";

    const stateAfter = this.store.getSnapshot();
    this.bus.emit("loadprogress", {
      stage: "analyze",
      progress: 0.95,
      message: "Baking spectrogram…",
    });
    this.setStatus("Baking spectrogram…");
    await this.spectrogramBitmaps.bake(
      this.spectrograms,
      stateAfter.spectrogramMinDb,
      stateAfter.spectrogramMaxDb,
    );
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
    this.spectrogramBitmaps.dispose();
    this.axisLayoutKey = "";
    if (this.recording) {
      void this.recorder.stop({ finalize: false });
      this.recording = false;
    }
  }

  private applyToolbarVisibility(toolbar: HTMLElement): void {
    const cfg = this.options.toolbar ?? "all";
    if (cfg === "all") return;
    const allowed = new Set(cfg);
    for (const el of toolbar.querySelectorAll<HTMLElement>("[data-group]")) {
      const group = el.dataset.group;
      if (!group || !allowed.has(group as ToolbarGroup)) {
        el.hidden = true;
      }
    }
  }

  private buildDom(): DocumentFragment {
    const frag = document.createDocumentFragment();
    const toolbar = document.createElement("div");
    toolbar.className = "apc-toolbar";
    toolbar.innerHTML = `
      <button type="button" data-group="transport" data-act="play" title="播放/暂停（空格）">播放</button>
      <button type="button" data-group="transport" data-act="stop" title="停止（回到 0）">停止</button>
      <button type="button" data-group="transport" data-act="back" title="快退（Shift+←）">快退</button>
      <button type="button" data-group="transport" data-act="fwd" title="快进（Shift+→）">快进</button>
      <button type="button" data-group="transport" data-act="fit" title="适配全长">适配</button>
      <label data-group="record">录音时长
        <select data-act="rec-dur" title="固定时长：整段一屏显示，波形从左生长">
          <option value="60">1 分钟</option>
          <option value="300" selected>5 分钟</option>
          <option value="600">10 分钟</option>
          <option value="1800">30 分钟</option>
        </select>
      </label>
      <button type="button" data-group="record" data-act="rec-start" title="开始麦克风录音">录音</button>
      <button type="button" data-group="record" data-act="rec-stop" title="停止录音" disabled>停录</button>
      <button type="button" data-group="view" data-act="wave" data-view="waveform" class="active" title="切换到波形视图（W）">波形</button>
      <button type="button" data-group="view" data-act="spec" data-view="spectrogram" title="切换到语谱视图（S）">语谱</button>
      <label data-group="channel" title="监听模式：原声立体声 / 单声道混音 / 独奏某一轨（非独奏轨会变暗）">通道
        <select data-act="channel">
          <option value="original">原声</option>
          <option value="mono">单声道</option>
          <option value="solo-0">独奏 左（Ch1）</option>
          <option value="solo-1">独奏 右（Ch2）</option>
        </select>
      </label>
      <label data-group="rate" title="WSOLA 变速：改变速度，尽量保持音高">倍速
        <select data-act="rate">
          <option value="0.5">0.5×</option>
          <option value="0.75">0.75×</option>
          <option value="1" selected>1×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
      </label>
      <label data-group="volume" title="输出音量（不影响波形数据本身）">音量 <input data-act="volume" type="range" min="0" max="1" step="0.01" value="1" /></label>
      <label data-group="volume" title="静音：听不到声音，播放进度照常">
        <input data-act="mute" type="checkbox" /> 静音
      </label>
      <label data-group="follow" title="播放时视口是否跟随游标：开=画面跟着滚，关=画面固定">
        <input data-act="follow" type="checkbox" checked /> 跟随
      </label>
      <label data-group="snap" title="选区/点击是否吸附过零点：开=剪切更干净，关=自由像素选">
        <input data-act="snap" type="checkbox" checked /> 吸附到过零点
      </label>
      <label data-group="selectionPlay" title="开启后只播放选区范围内的音频">
        <input data-act="selonly" type="checkbox" /> 仅播放选区
      </label>
      <label data-group="selectionPlay" title="选区播完是否从头循环（常与「仅播放选区」联用）">
        <input data-act="loop" type="checkbox" /> 选区循环
      </label>
      <label data-group="gain" title="各声道波形增益是否共用同一数值">
        <input data-act="gainlink" type="checkbox" checked /> 联动增益
      </label>
      <label data-group="gain" title="波形垂直放大，便于看小信号">
        增益 <input data-act="gain" type="range" min="0.2" max="4" step="0.05" value="1" />
      </label>
      <label data-group="spectrogram" title="语谱颜色映射下限（dB）：抬高可压掉弱噪声">
        dB 最小 <input data-act="mindb" type="number" value="-100" style="width:56px" />
      </label>
      <label data-group="spectrogram" title="语谱颜色映射上限（dB）：降低会让强能量更快顶满色阶">
        dB 最大 <input data-act="maxdb" type="number" value="-5" style="width:56px" />
      </label>
      <button type="button" data-group="edit" data-act="cut" title="剪切选区（Ctrl/⌘+X）">剪切</button>
      <button type="button" data-group="edit" data-act="copy" title="复制选区（Ctrl/⌘+C）">复制</button>
      <button type="button" data-group="edit" data-act="paste" title="粘贴（Ctrl/⌘+V）">粘贴</button>
      <button type="button" data-group="edit" data-act="delete-sel" title="删除选区（Delete）">删除</button>
      <button type="button" data-group="edit" data-act="undo" title="撤销（Ctrl/⌘+Z）">撤销</button>
      <button type="button" data-group="edit" data-act="redo" title="重做（Ctrl/⌘+Shift+Z）">重做</button>
      <button type="button" data-group="export" data-act="export-sel" title="导出选区 WAV">导出选区</button>
      <button type="button" data-group="export" data-act="export-all" title="导出整段 WAV">导出整段</button>
      <button type="button" data-group="selection" data-act="clear-sel">清除选区</button>
      <span class="apc-clock">00:00.000</span>
    `;
    this.applyToolbarVisibility(toolbar);
    const status = document.createElement("div");
    status.className = "apc-status";
    status.textContent = "Load an audio file to begin";

    const ruler = document.createElement("canvas");
    ruler.className = "apc-ruler";

    const wrap = document.createElement("div");
    wrap.className = "apc-main-wrap";
    // Spectrogram bitmap layer (behind): zoom/pan = drawImage crop
    const spec = document.createElement("canvas");
    spec.className = "apc-main apc-main-spec";
    wrap.appendChild(spec);
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
    root.querySelector('[data-act="rec-start"]')?.addEventListener("click", () => {
      void this.startRecording(this.recordDurationSec);
    });
    root.querySelector('[data-act="rec-stop"]')?.addEventListener("click", () => {
      void this.stopRecording();
    });
    const recDur = root.querySelector('[data-act="rec-dur"]') as HTMLSelectElement | null;
    recDur?.addEventListener("change", () => {
      this.recordDurationSec = Number(recDur.value) || 300;
    });
    root.querySelector('[data-act="wave"]')?.addEventListener("click", () =>
      this.setViewMode("waveform"),
    );
    root.querySelector('[data-act="spec"]')?.addEventListener("click", () =>
      this.setViewMode("spectrogram"),
    );
    root.querySelector('[data-act="clear-sel"]')?.addEventListener("click", () => {
      this.store.patch({ selection: null });
    });
    root.querySelector('[data-act="cut"]')?.addEventListener("click", () => {
      void this.cutSelection();
    });
    root.querySelector('[data-act="copy"]')?.addEventListener("click", () => {
      this.copySelection();
    });
    root.querySelector('[data-act="paste"]')?.addEventListener("click", () => {
      void this.pasteClipboard();
    });
    root.querySelector('[data-act="delete-sel"]')?.addEventListener("click", () => {
      void this.deleteSelection();
    });
    root.querySelector('[data-act="undo"]')?.addEventListener("click", () => {
      void this.undo();
    });
    root.querySelector('[data-act="redo"]')?.addEventListener("click", () => {
      void this.redo();
    });
    root.querySelector('[data-act="export-sel"]')?.addEventListener("click", () => {
      this.exportSelection();
    });
    root.querySelector('[data-act="export-all"]')?.addEventListener("click", () => {
      this.exportAll();
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
      void this.rebakeSpectrogramBitmaps();
    });
    maxDb?.addEventListener("change", () => {
      this.store.patch({ spectrogramMaxDb: Number(maxDb.value) });
      void this.rebakeSpectrogramBitmaps();
    });
  }

  private async rebakeSpectrogramBitmaps(): Promise<void> {
    if (!this.spectrograms || this.spectrogramBakePending) return;
    const state = this.store.getSnapshot();
    if (
      !this.spectrogramBitmaps.needsBake(
        state.spectrogramMinDb,
        state.spectrogramMaxDb,
        this.spectrograms.channelCount,
      )
    ) {
      return;
    }
    this.spectrogramBakePending = true;
    try {
      this.setStatus("Baking spectrogram…");
      await this.spectrogramBitmaps.bake(
        this.spectrograms,
        state.spectrogramMinDb,
        state.spectrogramMaxDb,
      );
      this.needRender = true;
      this.setStatus(
        `${state.channelCount} ch · ${state.sampleRate} Hz · ${(
          state.lengthSamples / state.sampleRate
        ).toFixed(2)}s`,
      );
    } finally {
      this.spectrogramBakePending = false;
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.root) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    const mod = e.metaKey || e.ctrlKey;
    const state = this.store.getSnapshot();

    if (mod && e.code === "KeyX") {
      e.preventDefault();
      void this.cutSelection();
      return;
    }
    if (mod && e.code === "KeyC") {
      e.preventDefault();
      this.copySelection();
      return;
    }
    if (mod && e.code === "KeyV") {
      e.preventDefault();
      void this.pasteClipboard();
      return;
    }
    if (mod && e.code === "KeyZ" && e.shiftKey) {
      e.preventDefault();
      void this.redo();
      return;
    }
    if (mod && e.code === "KeyY") {
      e.preventDefault();
      void this.redo();
      return;
    }
    if (mod && e.code === "KeyZ") {
      e.preventDefault();
      void this.undo();
      return;
    }
    if (e.code === "Delete" || e.code === "Backspace") {
      if (state.selection) {
        e.preventDefault();
        void this.deleteSelection();
      }
      return;
    }

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

    const setDisabled = (act: string, disabled: boolean) => {
      const btn = this.root?.querySelector(`[data-act="${act}"]`) as HTMLButtonElement | null;
      if (btn) btn.disabled = disabled;
    };
    const hasBuffer = !!this.transport.getBuffer() && !this.recording;
    const hasSel = !!normalizeEditRange(state.selection, state.lengthSamples);
    const busy = this.editBusy || this.isLoading || this.recording;
    setDisabled("cut", busy || !hasBuffer || !hasSel);
    setDisabled("copy", busy || !hasBuffer || !hasSel);
    setDisabled("paste", busy || !hasBuffer || !this.clipboard);
    setDisabled("delete-sel", busy || !hasBuffer || !hasSel);
    setDisabled("undo", busy || !this.editHistory.canUndo);
    setDisabled("redo", busy || !this.editHistory.canRedo);
    setDisabled("export-sel", busy || !hasBuffer || !hasSel);
    setDisabled("export-all", busy || !hasBuffer);
    setDisabled("play", this.recording);
    setDisabled("stop", this.recording);
    setDisabled("back", this.recording);
    setDisabled("fwd", this.recording);
    setDisabled("spec", this.recording);
    setDisabled("rec-start", this.recording || this.editBusy || this.isLoading);
    setDisabled("rec-stop", !this.recording);
    setDisabled("rec-dur", this.recording);

    const recStart = this.root?.querySelector('[data-act="rec-start"]') as HTMLButtonElement | null;
    if (recStart) recStart.textContent = this.recording ? "录音中…" : "录音";

    const waveBtn = this.root?.querySelector('[data-act="wave"]');
    const specBtn = this.root?.querySelector('[data-act="spec"]');
    waveBtn?.classList.toggle("active", state.viewMode === "waveform");
    specBtn?.classList.toggle("active", state.viewMode === "spectrogram");

    const syncCheck = (
      act: string,
      on: boolean,
    ) => {
      const el = this.root?.querySelector(`[data-act="${act}"]`) as HTMLInputElement | null;
      if (el && el.checked !== on) el.checked = on;
    };
    syncCheck("mute", state.muted);
    syncCheck("follow", state.followPlayhead);
    syncCheck("snap", state.snapToZeroCrossing);
    syncCheck("selonly", state.playSelectionOnly);
    syncCheck("loop", state.loopSelection);
    syncCheck("gainlink", state.waveformGainLinked);

    const rateSel = this.root?.querySelector('[data-act="rate"]') as HTMLSelectElement | null;
    if (rateSel) {
      const rateStr = String(state.playbackRate);
      if ([...rateSel.options].some((o) => o.value === rateStr) && rateSel.value !== rateStr) {
        rateSel.value = rateStr;
      }
    }

    const minDb = this.root?.querySelector('[data-act="mindb"]') as HTMLInputElement | null;
    const maxDb = this.root?.querySelector('[data-act="maxdb"]') as HTMLInputElement | null;
    if (minDb && minDb.value !== String(state.spectrogramMinDb)) {
      minDb.value = String(state.spectrogramMinDb);
    }
    if (maxDb && maxDb.value !== String(state.spectrogramMaxDb)) {
      maxDb.value = String(state.spectrogramMaxDb);
    }

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
      const hide = state.viewMode === "spectrogram" || this.recording;
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
      if (this.recording) {
        this.render();
      } else if (this.needRender) {
        if (
          this.spectrogramViewportOnly &&
          this.store.getSnapshot().viewMode === "spectrogram" &&
          this.spectrogramBitmaps.ready
        ) {
          this.renderSpectrogramViewportFast();
        } else {
          this.render();
        }
        this.needRender = false;
        this.spectrogramViewportOnly = false;
      } else if (this.store.getSnapshot().transport === "playing") {
        if (this.store.getSnapshot().viewMode === "spectrogram") {
          this.renderOverlaysOnly();
        } else {
          // 波形播放：同 canvas 全量重绘游标
          this.render();
        }
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
    const livePeaks = this.recording ? this.recorder.getPeaks() : null;
    const liveBuffer = this.recording ? this.recorder.getBuffer() : null;
    const peaksSource: PeaksQueryable | null = livePeaks ?? this.peaks;

    if ((!peaksSource && !this.recording) || state.channelCount === 0) {
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
    const mainW = Math.max(1, Math.floor(width * dpr));
    const mainH = Math.max(1, Math.floor(height * dpr));
    if (this.mainCanvas.width !== mainW) this.mainCanvas.width = mainW;
    if (this.mainCanvas.height !== mainH) this.mainCanvas.height = mainH;
    const ctx = this.mainCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // 录音：强制整段计划时长一屏显示（忽略用户缩放）
    const viewStart = this.recording ? 0 : state.viewport.startSample;
    const viewEnd = this.recording
      ? Math.max(1, liveBuffer?.length ?? state.lengthSamples)
      : state.viewport.endSample;
    const playheadSample = this.recording
      ? this.recorder.getWriteHead()
      : state.playheadSample;

    const axisW = !this.recording && state.viewMode === "spectrogram" ? 36 : 0;
    this.mapper = new ViewportMapper({
      sampleRate: state.sampleRate || this.audioContext.sampleRate,
      startSample: viewStart,
      endSample: viewEnd,
      width: Math.max(1, width - axisW),
      offsetX: axisW,
    });

    this.lanes = this.laneLayout.compute(
      state.laneHeights.length ? state.laneHeights : [1],
      height,
    );
    this.timeRuler?.render(this.mapper, dpr);

    let dimChannels: Set<number> | null = null;
    if (state.playChannelMode.kind === "solo") {
      dimChannels = new Set<number>();
      for (let i = 0; i < state.channelCount; i++) {
        if (i !== state.playChannelMode.channel) dimChannels.add(i);
      }
    }

    if (this.recording || state.viewMode === "waveform") {
      if (this.spectrogramCanvas) this.spectrogramCanvas.style.visibility = "hidden";
      if (this.axisCanvas) this.axisCanvas.style.visibility = "hidden";
      if (peaksSource) {
        this.waveformRenderer.render(ctx, peaksSource, this.mapper, this.lanes, {
          gains: state.waveformGain.length ? state.waveformGain : [1],
          dimChannels,
          channelCount: Math.max(1, state.channelCount),
        });
      }
    } else if (this.spectrograms) {
      // === 语谱：底层 canvas 只做整图裁剪 blit；缩放不再重算颜色 ===
      if (!this.spectrogramCanvas || !this.axisCanvas) return;
      this.spectrogramCanvas.style.visibility = "visible";
      this.axisCanvas.style.visibility = "visible";

      const specW = Math.max(1, Math.floor(width * dpr));
      const specH = Math.max(1, Math.floor(height * dpr));
      if (this.spectrogramCanvas.width !== specW) this.spectrogramCanvas.width = specW;
      if (this.spectrogramCanvas.height !== specH) this.spectrogramCanvas.height = specH;

      const specCtx = this.spectrogramCanvas.getContext("2d");
      if (!specCtx) return;
      specCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      specCtx.fillStyle = "#0c0e12";
      specCtx.fillRect(0, 0, width, height);

      if (
        this.spectrogramBitmaps.needsBake(
          state.spectrogramMinDb,
          state.spectrogramMaxDb,
          this.spectrograms.channelCount,
        )
      ) {
        void this.rebakeSpectrogramBitmaps();
      }

      if (this.spectrogramBitmaps.ready) {
        specCtx.imageSmoothingEnabled = true;
        specCtx.imageSmoothingQuality = "high";
        for (const lane of this.lanes) {
          const dim = dimChannels?.has(lane.channel) ?? false;
          this.spectrogramBitmaps.drawLane(
            specCtx,
            lane.channel,
            lane,
            axisW,
            Math.max(1, width - axisW),
            state.viewport.startSample,
            state.viewport.endSample,
            dim,
          );
        }
      } else {
        // 烘焙完成前回退到 CPU 视口渲染，保证可见
        this.spectrogramRenderer.render(ctx, this.spectrograms, this.mapper, this.lanes, {
          minDb: state.spectrogramMinDb,
          maxDb: state.spectrogramMaxDb,
          dimChannels,
          channelCount: state.channelCount,
        });
      }

      // 频率轴只占左侧 gutter；布局未变时跳过重绘（缩放时不重画）
      const layoutKey = `${state.sampleRate}:${state.channelCount}:${height}:${axisW}:${
        state.playChannelMode.kind === "solo" ? state.playChannelMode.channel : "all"
      }:${state.laneHeights.join(",")}`;
      if (layoutKey !== this.axisLayoutKey) {
        this.axisLayoutKey = layoutKey;
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
      playheadSample,
      this.recording ? null : state.selection,
      height,
    );

    const octx = this.overviewCanvas.getContext("2d");
    if (octx) {
      // 语谱图模式不渲染 minimap；录音中也不画（整段一屏即可）
      if (state.viewMode === "waveform" && !this.recording && this.peaks) {
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

  /** 缩放/平移/跟随专用：只裁剪 blit 整图 + 时间尺 + 游标，不重画频率轴、不重算颜色。 */
  private renderSpectrogramViewportFast(): void {
    if (!this.mainCanvas || !this.spectrogramCanvas || !this.spectrogramBitmaps.ready) {
      this.render();
      return;
    }
    const state = this.store.getSnapshot();
    const dpr = window.devicePixelRatio || 1;
    const width = this.mainCanvas.clientWidth;
    const height = this.mainCanvas.clientHeight;
    const axisW = 36;

    const mainW = Math.max(1, Math.floor(width * dpr));
    const mainH = Math.max(1, Math.floor(height * dpr));
    if (this.mainCanvas.width !== mainW) this.mainCanvas.width = mainW;
    if (this.mainCanvas.height !== mainH) this.mainCanvas.height = mainH;

    const ctx = this.mainCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    this.mapper = new ViewportMapper({
      sampleRate: state.sampleRate,
      startSample: state.viewport.startSample,
      endSample: state.viewport.endSample,
      width: Math.max(1, width - axisW),
      offsetX: axisW,
    });
    if (this.lanes.length === 0) {
      this.lanes = this.laneLayout.compute(state.laneHeights, height);
    }
    this.timeRuler?.render(this.mapper, dpr);

    const specW = Math.max(1, Math.floor(width * dpr));
    const specH = Math.max(1, Math.floor(height * dpr));
    if (this.spectrogramCanvas.width !== specW) this.spectrogramCanvas.width = specW;
    if (this.spectrogramCanvas.height !== specH) this.spectrogramCanvas.height = specH;

    let dimChannels: Set<number> | null = null;
    if (state.playChannelMode.kind === "solo") {
      dimChannels = new Set<number>();
      for (let i = 0; i < state.channelCount; i++) {
        if (i !== state.playChannelMode.channel) dimChannels.add(i);
      }
    }

    const specCtx = this.spectrogramCanvas.getContext("2d");
    if (!specCtx) return;
    specCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    specCtx.fillStyle = "#0c0e12";
    specCtx.fillRect(0, 0, width, height);
    specCtx.imageSmoothingEnabled = true;
    specCtx.imageSmoothingQuality = "high";
    for (const lane of this.lanes) {
      const dim = dimChannels?.has(lane.channel) ?? false;
      this.spectrogramBitmaps.drawLane(
        specCtx,
        lane.channel,
        lane,
        axisW,
        Math.max(1, width - axisW),
        state.viewport.startSample,
        state.viewport.endSample,
        dim,
      );
    }

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
  }

  private renderOverlaysOnly(): void {
    if (!this.mainCanvas || !this.peaks || this.store.getSnapshot().channelCount === 0) {
      return;
    }

    const state = this.store.getSnapshot();
    // 波形与游标共用同一 canvas，只能全量重绘。
    if (state.viewMode !== "spectrogram" || !this.mapper || this.lanes.length === 0) {
      this.render();
      return;
    }

    // 语谱：bitmap/轴层保持不动，只重画透明 overlay 上的游标/选区/分割线。
    const dpr = window.devicePixelRatio || 1;
    const width = this.mainCanvas.clientWidth;
    const height = this.mainCanvas.clientHeight;
    const ctx = this.mainCanvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

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
  }
}
