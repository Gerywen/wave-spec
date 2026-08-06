use wasm_bindgen::prelude::*;

/// Compute multi-resolution peak pyramid for one channel.
/// Input: flat f32 samples.
/// Output: flat f32 containing all levels concatenated, with a header:
///   [num_levels, level0_len, level1_len, ..., levelN_len, ...data...]
#[wasm_bindgen]
pub fn analyze_peaks(samples: &[f32], max_levels: u32) -> Vec<f32> {
    let pyramid = dsp::peaks::build_pyramid(samples, max_levels as usize);

    // Header: [num_levels, len0, len1, ..., lenN]
    let num_levels = pyramid.len();
    let header_size = 1 + num_levels;
    let total_data: usize = pyramid.iter().map(|l| l.len()).sum();
    let mut out = Vec::with_capacity(header_size + total_data);

    out.push(num_levels as f32);
    for level in &pyramid {
        out.push(level.len() as f32);
    }
    for level in &pyramid {
        out.extend_from_slice(level);
    }

    out
}

/// Compute STFT magnitudes for one channel.
/// Output: flat f32 with header [bins, frames, fft_size, hop, sample_rate, ...magnitudes...]
#[wasm_bindgen]
pub fn analyze_spectrogram(
    samples: &[f32],
    sample_rate: f32,
    fft_size: u32,
    hop: u32,
    max_frames: u32,
) -> Vec<f32> {
    let result = dsp::spectrogram::compute_stft(
        samples,
        sample_rate,
        fft_size as usize,
        hop as usize,
        max_frames as usize,
    );

    let header_size = 5;
    let mut out = Vec::with_capacity(header_size + result.magnitudes.len());
    out.push(result.bins as f32);
    out.push(result.frames as f32);
    out.push(result.fft_size as f32);
    out.push(result.hop as f32);
    out.push(result.sample_rate);
    out.extend_from_slice(&result.magnitudes);

    out
}

/// WSOLA-like time stretching (pitch preserved style).
///
/// Returns stretched mono channel samples.
#[wasm_bindgen]
pub fn stretch_wsola(samples: &[f32], sample_rate: f32, rate: f32) -> Vec<f32> {
    dsp::time_stretch::stretch_wsola(samples, sample_rate, rate)
}
