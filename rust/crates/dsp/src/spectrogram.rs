use rustfft::{FftPlanner, num_complex::Complex};
use std::f32::consts::PI;

pub struct StftResult {
    pub bins: usize,
    pub frames: usize,
    /// Flat array: frames * bins, linear magnitude values
    pub magnitudes: Vec<f32>,
    pub fft_size: usize,
    pub hop: usize,
    pub sample_rate: f32,
}

/// Compute STFT magnitudes with Hann window.
/// Returns linear magnitudes (not dB).
pub fn compute_stft(
    samples: &[f32],
    sample_rate: f32,
    fft_size: usize,
    hop: usize,
    max_frames: usize,
) -> StftResult {
    let bins = fft_size / 2 + 1;
    let window = hann(fft_size);

    let total_frames = if samples.len() >= fft_size {
        (samples.len() - fft_size) / hop + 1
    } else {
        1
    };

    let frame_step = if max_frames > 0 && total_frames > max_frames {
        (total_frames + max_frames - 1) / max_frames
    } else {
        1
    };
    let frames = (total_frames + frame_step - 1) / frame_step;

    let mut magnitudes = vec![0.0f32; frames * bins];

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);
    let mut buffer = vec![Complex::new(0.0, 0.0); fft_size];

    for f in 0..frames {
        let frame_index = f * frame_step;
        let start = frame_index * hop;

        for i in 0..fft_size {
            let s = if start + i < samples.len() {
                samples[start + i]
            } else {
                0.0
            };
            buffer[i] = Complex::new(s * window[i], 0.0);
        }

        fft.process(&mut buffer);

        let base = f * bins;
        for b in 0..bins {
            magnitudes[base + b] = buffer[b].norm();
        }
    }

    StftResult {
        bins,
        frames,
        magnitudes,
        fft_size,
        hop: hop * frame_step,
        sample_rate,
    }
}

fn hann(n: usize) -> Vec<f32> {
    let mut w = vec![0.0f32; n];
    let denom = if n > 1 { (n - 1) as f32 } else { 1.0 };
    for i in 0..n {
        w[i] = 0.5 * (1.0 - (2.0 * PI * i as f32 / denom).cos());
    }
    w
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stft_basic() {
        let samples: Vec<f32> = (0..4096).map(|i| (i as f32 * 0.1).sin()).collect();
        let result = compute_stft(&samples, 44100.0, 1024, 256, 8192);
        assert_eq!(result.bins, 513);
        assert!(result.frames > 0);
        assert_eq!(result.magnitudes.len(), result.frames * result.bins);
    }
}
