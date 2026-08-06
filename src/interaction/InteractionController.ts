import type { PlayerStateStore } from "../core/PlayerStateStore.js";
import type { TimelineController } from "../timeline/TimelineController.js";
import type { ViewportMapper } from "../timeline/ViewportMapper.js";
import type { WaveformPeaks } from "../analysis/WaveformPeaks.js";
import type { LaneLayout, LaneRect } from "../render/LaneLayout.js";
import { findZeroCrossing } from "./ZeroCrossingSnap.js";

type DragMode = "none" | "playhead" | "pan" | "select" | "splitter" | "overview";

export type InteractionHooks = {
  getMapper: () => ViewportMapper | null;
  getPeaks: () => WaveformPeaks | null;
  getLanes: () => LaneRect[];
  seek: (sample: number) => void;
  onOverviewDrag?: (startRatio: number, endRatio: number) => void;
};

export class InteractionController {
  private mode: DragMode = "none";
  private pointerId: number | null = null;
  private lastX = 0;
  private dragStartSample = 0;
  private splitterIndex = -1;
  private splitterStartY = 0;
  private heightsAtStart: number[] = [];
  private spaceDown = false;
  private unbound: Array<() => void> = [];
  private pendingZoom: { anchor: number; factor: number } | null = null;
  private zoomRaf = 0;

  constructor(
    private readonly mainEl: HTMLElement,
    private readonly overviewEl: HTMLElement | null,
    private readonly store: PlayerStateStore,
    private readonly timeline: TimelineController,
    private readonly laneLayout: LaneLayout,
    private readonly hooks: InteractionHooks,
  ) {
    this.bind();
  }

  destroy(): void {
    if (this.zoomRaf) cancelAnimationFrame(this.zoomRaf);
    this.zoomRaf = 0;
    for (const u of this.unbound) u();
    this.unbound = [];
  }

  private bind(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") this.spaceDown = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") this.spaceDown = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.unbound.push(() => window.removeEventListener("keydown", onKeyDown));
    this.unbound.push(() => window.removeEventListener("keyup", onKeyUp));

    const onWheel = (e: WheelEvent) => {
      if (!this.hooks.getMapper()) return;
      e.preventDefault();
      const mapper = this.hooks.getMapper()!;
      const rect = this.mainEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const anchor = mapper.xToSample(x);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      // 合并同一帧内多次滚轮，避免连续 patch 造成卡顿
      if (this.pendingZoom) {
        this.pendingZoom.factor *= factor;
        this.pendingZoom.anchor = anchor;
      } else {
        this.pendingZoom = { anchor, factor };
      }
      if (!this.zoomRaf) {
        this.zoomRaf = requestAnimationFrame(() => {
          this.zoomRaf = 0;
          const z = this.pendingZoom;
          this.pendingZoom = null;
          if (z) this.timeline.zoomAt(z.anchor, z.factor);
        });
      }
    };
    this.mainEl.addEventListener("wheel", onWheel, { passive: false });
    this.unbound.push(() => this.mainEl.removeEventListener("wheel", onWheel));

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const mapper = this.hooks.getMapper();
      if (!mapper) return;
      this.mainEl.setPointerCapture(e.pointerId);
      this.pointerId = e.pointerId;
      this.lastX = e.clientX;
      const rect = this.mainEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const sample = this.maybeSnap(mapper.xToSample(x));

      // splitter hit
      const lanes = this.hooks.getLanes();
      const splitters = this.laneLayout.hitSplitters(lanes);
      const hit = splitters.find((s) => Math.abs(s.y - y) <= 4);
      if (hit && this.store.getSnapshot().channelCount > 1) {
        this.mode = "splitter";
        this.splitterIndex = hit.index;
        this.splitterStartY = e.clientY;
        this.heightsAtStart = [...this.store.getSnapshot().laneHeights];
        return;
      }

      if (this.spaceDown || e.altKey) {
        this.mode = "pan";
        return;
      }

      if (e.shiftKey) {
        this.mode = "select";
        this.dragStartSample = sample;
        this.store.patch({
          selection: { startSample: sample, endSample: sample },
        });
        return;
      }

      this.mode = "playhead";
      this.hooks.seek(sample);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.pointerId !== e.pointerId) return;
      const mapper = this.hooks.getMapper();
      if (!mapper) return;
      const rect = this.mainEl.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (this.mode === "pan") {
        const dx = e.clientX - this.lastX;
        this.lastX = e.clientX;
        this.timeline.panBySamples(-dx * mapper.samplesPerPixel);
        return;
      }

      if (this.mode === "playhead") {
        this.hooks.seek(this.maybeSnap(mapper.xToSample(x)));
        return;
      }

      if (this.mode === "select") {
        const sample = this.maybeSnap(mapper.xToSample(x));
        this.store.patch({
          selection: {
            startSample: this.dragStartSample,
            endSample: sample,
          },
        });
        return;
      }

      if (this.mode === "splitter") {
        const dy = e.clientY - this.splitterStartY;
        const height = rect.height;
        const next = this.laneLayout.resize(
          this.heightsAtStart,
          this.splitterIndex,
          dy,
          height,
        );
        this.store.patch({ laneHeights: next });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.pointerId !== e.pointerId) return;
      this.mode = "none";
      this.pointerId = null;
      try {
        this.mainEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onDblClick = () => this.timeline.fitAll();

    this.mainEl.addEventListener("pointerdown", onPointerDown);
    this.mainEl.addEventListener("pointermove", onPointerMove);
    this.mainEl.addEventListener("pointerup", onPointerUp);
    this.mainEl.addEventListener("pointercancel", onPointerUp);
    this.mainEl.addEventListener("dblclick", onDblClick);
    this.unbound.push(() => this.mainEl.removeEventListener("pointerdown", onPointerDown));
    this.unbound.push(() => this.mainEl.removeEventListener("pointermove", onPointerMove));
    this.unbound.push(() => this.mainEl.removeEventListener("pointerup", onPointerUp));
    this.unbound.push(() => this.mainEl.removeEventListener("pointercancel", onPointerUp));
    this.unbound.push(() => this.mainEl.removeEventListener("dblclick", onDblClick));

    if (this.overviewEl) {
      this.bindOverview(this.overviewEl);
    }
  }

  private bindOverview(el: HTMLElement): void {
    let dragging = false;
    let pointerId: number | null = null;

    const ratioAt = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    };

    const apply = (r: number) => {
      const state = this.store.getSnapshot();
      const duration = state.viewport.endSample - state.viewport.startSample;
      const center = r * state.lengthSamples;
      let start = center - duration / 2;
      let end = start + duration;
      if (start < 0) {
        start = 0;
        end = duration;
      }
      if (end > state.lengthSamples) {
        end = state.lengthSamples;
        start = Math.max(0, end - duration);
      }
      this.timeline.setViewport({ startSample: start, endSample: end });
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      pointerId = e.pointerId;
      dragging = true;
      apply(ratioAt(e.clientX));
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || pointerId !== e.pointerId) return;
      apply(ratioAt(e.clientX));
    };
    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      dragging = false;
      pointerId = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = this.store.getSnapshot();
      const r = ratioAt(e.clientX);
      const anchor = r * state.lengthSamples;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.timeline.zoomAt(anchor, factor);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    this.unbound.push(() => el.removeEventListener("pointerdown", onDown));
    this.unbound.push(() => el.removeEventListener("pointermove", onMove));
    this.unbound.push(() => el.removeEventListener("pointerup", onUp));
    this.unbound.push(() => el.removeEventListener("wheel", onWheel));
  }

  private maybeSnap(sample: number): number {
    const state = this.store.getSnapshot();
    if (!state.snapToZeroCrossing) return sample;
    const peaks = this.hooks.getPeaks();
    if (!peaks || peaks.channelCount === 0) return sample;
    return findZeroCrossing(peaks.getChannelData(0), sample, Math.floor(state.sampleRate * 0.005));
  }
}
