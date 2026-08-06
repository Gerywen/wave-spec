/// <reference lib="webworker" />

import init, { analyze_peaks, analyze_spectrogram } from "../wasm/wasm_analyzer.js";

type AnalysisRequest = {
  kind: "analyze";
  channelData: Float32Array[];
  sampleRate: number;
  fftSize: number;
  hop: number;
  maxFrames: number;
};

type SpectrogramDataPayload = {
  bins: number;
  frames: number;
  magnitudes: Float32Array;
  fftSize: number;
  hop: number;
  sampleRate: number;
};

type AnalysisResponse = {
  peaks: { peaksLevels: Float32Array[][] };
  spectrogram: { channelCount: number; data: SpectrogramDataPayload[] };
};

let wasmReady: Promise<unknown> | null = null;

function ensureInit(): Promise<unknown> {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

function decodePeaks(flat: Float32Array): Float32Array[] {
  const numLevels = flat[0]!;
  const levels: Float32Array[] = [];
  let offset = 1 + numLevels;
  for (let i = 0; i < numLevels; i++) {
    const len = flat[1 + i]!;
    levels.push(flat.slice(offset, offset + len));
    offset += len;
  }
  return levels;
}

function decodeSpectrogram(flat: Float32Array): SpectrogramDataPayload {
  const bins = flat[0]!;
  const frames = flat[1]!;
  const fftSize = flat[2]!;
  const hop = flat[3]!;
  const sampleRate = flat[4]!;
  const magnitudes = flat.slice(5);
  return { bins, frames, magnitudes, fftSize, hop, sampleRate };
}

self.onmessage = async (e: MessageEvent<AnalysisRequest>) => {
  const msg = e.data;
  if (msg.kind !== "analyze") return;

  await ensureInit();

  const channelCount = msg.channelData.length;

  // 1) Peaks pyramid (via WASM)
  const peaksLevels: Float32Array[][] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const flat = analyze_peaks(msg.channelData[ch]!, 25);
    peaksLevels.push(decodePeaks(flat));
  }

  // 2) Spectrogram (via WASM)
  const data: SpectrogramDataPayload[] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const flat = analyze_spectrogram(
      msg.channelData[ch]!,
      msg.sampleRate,
      msg.fftSize,
      msg.hop,
      msg.maxFrames,
    );
    data.push(decodeSpectrogram(flat));
  }

  const transferables: Transferable[] = [];
  for (const chLevels of peaksLevels) {
    for (const level of chLevels) {
      transferables.push(level.buffer);
    }
  }
  for (const chData of data) {
    transferables.push(chData.magnitudes.buffer);
  }

  const response: AnalysisResponse = {
    peaks: { peaksLevels },
    spectrogram: { channelCount, data },
  };

  (self as DedicatedWorkerGlobalScope).postMessage(response, transferables);
};
