/**
 * Compute multi-resolution peak pyramid for one channel.
 * Input: flat f32 samples.
 * Output: flat f32 containing all levels concatenated, with a header:
 *   [num_levels, level0_len, level1_len, ..., levelN_len, ...data...]
 * @param {Float32Array} samples
 * @param {number} max_levels
 * @returns {Float32Array}
 */
export function analyze_peaks(samples, max_levels) {
    const ptr0 = passArrayF32ToWasm0(samples, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_peaks(ptr0, len0, max_levels);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Compute STFT magnitudes for one channel.
 * Output: flat f32 with header [bins, frames, fft_size, hop, sample_rate, ...magnitudes...]
 * @param {Float32Array} samples
 * @param {number} sample_rate
 * @param {number} fft_size
 * @param {number} hop
 * @param {number} max_frames
 * @returns {Float32Array}
 */
export function analyze_spectrogram(samples, sample_rate, fft_size, hop, max_frames) {
    const ptr0 = passArrayF32ToWasm0(samples, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_spectrogram(ptr0, len0, sample_rate, fft_size, hop, max_frames);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}
export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
}
function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let WASM_VECTOR_LEN = 0;


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
