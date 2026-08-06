import type { LoadProgress } from "../types.js";

export type AudioLoaderCallbacks = {
  onProgress?: (p: LoadProgress) => void;
};

export class AudioLoader {
  constructor(private readonly audioContext: AudioContext) {}

  async load(
    source: File | Blob | string | ArrayBuffer | AudioBuffer,
    callbacks: AudioLoaderCallbacks = {},
  ): Promise<AudioBuffer> {
    if (source instanceof AudioBuffer) {
      callbacks.onProgress?.({ stage: "done", progress: 1 });
      return source;
    }

    let arrayBuffer: ArrayBuffer;
    if (typeof source === "string") {
      callbacks.onProgress?.({ stage: "fetch", progress: 0.1, message: "Fetching…" });
      const res = await fetch(source);
      if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
      callbacks.onProgress?.({ stage: "fetch", progress: 0.4 });
    } else if (source instanceof ArrayBuffer) {
      arrayBuffer = source;
    } else {
      callbacks.onProgress?.({ stage: "fetch", progress: 0.2, message: "Reading file…" });
      arrayBuffer = await source.arrayBuffer();
      callbacks.onProgress?.({ stage: "fetch", progress: 0.4 });
    }

    callbacks.onProgress?.({ stage: "decode", progress: 0.5, message: "Decoding…" });
    const buffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
    callbacks.onProgress?.({ stage: "decode", progress: 0.8 });
    return buffer;
  }
}
