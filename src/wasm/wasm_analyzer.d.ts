/* tslint:disable */
/* eslint-disable */

/**
 * Compute multi-resolution peak pyramid for one channel.
 * Input: flat f32 samples.
 * Output: flat f32 containing all levels concatenated, with a header:
 *   [num_levels, level0_len, level1_len, ..., levelN_len, ...data...]
 */
export function analyze_peaks(samples: Float32Array, max_levels: number): Float32Array;

/**
 * Compute STFT magnitudes for one channel.
 * Output: flat f32 with header [bins, frames, fft_size, hop, sample_rate, ...magnitudes...]
 */
export function analyze_spectrogram(samples: Float32Array, sample_rate: number, fft_size: number, hop: number, max_frames: number): Float32Array;

/**
 * WSOLA-like time stretching (pitch preserved style).
 *
 * Returns stretched mono channel samples.
 */
export function stretch_wsola(samples: Float32Array, sample_rate: number, rate: number): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly analyze_peaks: (a: number, b: number, c: number) => [number, number];
    readonly analyze_spectrogram: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly stretch_wsola: (a: number, b: number, c: number, d: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
