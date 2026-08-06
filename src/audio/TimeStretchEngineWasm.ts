import init, { stretch_wsola } from "../wasm/wasm_analyzer.js";

/**
 * WSOLA-like time stretching backed by Rust/WASM.
 *
 * Strategy B: compute on cache miss (i.e. first time a given rate is requested),
 * then cache the resulting AudioBuffer in `TransportController`.
 */
export class TimeStretchEngineWasm {
  private static wasmReady: Promise<unknown> | null = null;

  /** Call once (ideally during `AudioPlayerControl.load()`) so subsequent `stretch()` stays sync. */
  static ensureWasm(): Promise<unknown> {
    if (!this.wasmReady) this.wasmReady = init();
    return this.wasmReady;
  }

  stretch(buffer: AudioBuffer, rate: number, ctx: BaseAudioContext): AudioBuffer {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("rate must be positive");
    }

    if (Math.abs(rate - 1) < 1e-3) {
      return cloneBuffer(buffer, ctx);
    }

    const channels = buffer.numberOfChannels;
    const sr = buffer.sampleRate;

    // Compute channel 0 first to know exact outputLength.
    const ch0 = stretch_wsola(buffer.getChannelData(0), sr, rate);
    const out = ctx.createBuffer(channels, ch0.length, sr);
    out.copyToChannel(ch0, 0);

    for (let ch = 1; ch < channels; ch++) {
      const outCh = stretch_wsola(buffer.getChannelData(ch), sr, rate);
      out.copyToChannel(outCh, ch);
    }

    return out;
  }
}

function cloneBuffer(buffer: AudioBuffer, ctx: BaseAudioContext): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch), ch);
  }
  return out;
}

