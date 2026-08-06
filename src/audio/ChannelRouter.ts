import type { PlayChannelMode } from "../types.js";

/**
 * Routes multi-channel buffer playback through gain matrix:
 * Original / Mono mixdown / Solo one channel.
 */
export class ChannelRouter {
  readonly input: GainNode;
  readonly output: GainNode;
  private splitter: ChannelSplitterNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private channelGains: GainNode[] = [];
  private mode: PlayChannelMode = { kind: "original" };
  private channelCount = 0;

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  configure(channelCount: number, mode: PlayChannelMode): void {
    this.teardownGraph();
    this.channelCount = channelCount;
    this.mode = mode;

    if (channelCount <= 0) {
      this.input.connect(this.output);
      return;
    }

    const outChannels = Math.min(2, Math.max(2, this.ctx.destination.maxChannelCount || 2));
    this.splitter = this.ctx.createChannelSplitter(channelCount);
    this.merger = this.ctx.createChannelMerger(outChannels);
    this.channelGains = [];

    this.input.disconnect();
    this.input.connect(this.splitter);

    for (let ch = 0; ch < channelCount; ch++) {
      const g = this.ctx.createGain();
      this.channelGains.push(g);
      this.splitter.connect(g, ch);
    }

    this.applyModeGains(outChannels);
    this.merger.connect(this.output);
  }

  setMode(mode: PlayChannelMode): void {
    this.mode = mode;
    if (!this.merger || this.channelGains.length === 0) {
      this.configure(this.channelCount, mode);
      return;
    }
    const outChannels = this.merger.numberOfInputs;
    for (const g of this.channelGains) {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.applyModeGains(outChannels);
  }

  private applyModeGains(outChannels: number): void {
    if (!this.merger) return;
    const n = this.channelGains.length;
    const mode = this.mode;

    for (let ch = 0; ch < n; ch++) {
      const g = this.channelGains[ch]!;
      g.gain.value = 1;

      if (mode.kind === "original") {
        if (n === 1) {
          g.connect(this.merger, 0, 0);
          if (outChannels > 1) g.connect(this.merger, 0, 1);
        } else if (n === 2) {
          g.connect(this.merger, 0, Math.min(ch, outChannels - 1));
        } else {
          // Multi-channel: fold into stereo L/R alternating, or mono-sum to both
          const dest = ch % outChannels;
          g.gain.value = 1;
          g.connect(this.merger, 0, dest);
        }
      } else if (mode.kind === "mono") {
        g.gain.value = 1 / n;
        g.connect(this.merger, 0, 0);
        if (outChannels > 1) g.connect(this.merger, 0, 1);
      } else {
        // solo
        if (ch === mode.channel) {
          g.gain.value = 1;
          g.connect(this.merger, 0, 0);
          if (outChannels > 1) g.connect(this.merger, 0, 1);
        } else {
          g.gain.value = 0;
        }
      }
    }
  }

  private teardownGraph(): void {
    try {
      this.input.disconnect();
    } catch {
      /* ignore */
    }
    for (const g of this.channelGains) {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      this.splitter?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.merger?.disconnect();
    } catch {
      /* ignore */
    }
    this.splitter = null;
    this.merger = null;
    this.channelGains = [];
  }

  dispose(): void {
    this.teardownGraph();
    try {
      this.output.disconnect();
    } catch {
      /* ignore */
    }
  }
}
