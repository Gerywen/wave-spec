use std::f32::consts::PI;

/// WSOLA-like time stretching (pitch preserved style).
///
/// This is a port of your current TypeScript `TimeStretchEngine.stretch()`:
/// - frameSize ~ 30ms
/// - overlap = frameSize * 0.5
/// - stepIn depends on `rate`
/// - overlap-add with Hann window
/// - correlation uses a small search (min(overlap, 64)) on the overlap region
pub fn stretch_wsola(samples: &[f32], sample_rate: f32, rate: f32) -> Vec<f32> {
    assert!(rate.is_finite() && rate > 0.0);
    if (rate - 1.0).abs() < 1e-3 {
        return samples.to_vec();
    }

    let input_length = samples.len();
    let output_length = std::cmp::max(1, ((input_length as f32) / rate).floor() as usize);

    let frame_size = std::cmp::max(64, (sample_rate * 0.03).floor() as usize);
    let overlap = (frame_size as f32 * 0.5).floor() as usize;

    let step_in = std::cmp::max(1, (((frame_size - overlap) as f32) * rate).floor() as usize);
    let step_out = frame_size - overlap;

    let window = hann(frame_size);

    let mut out = vec![0.0f32; output_length];
    let mut norm = vec![0.0f32; output_length];

    let mut in_pos: usize = 0;
    let mut out_pos: usize = 0;

    while out_pos + frame_size < output_length && in_pos + frame_size < input_length {
        let mut best_offset: usize = 0;
        if out_pos > 0 {
            best_offset = find_best_offset(samples, &out, in_pos, out_pos, overlap, frame_size);
        }

        for i in 0..frame_size {
            let src_idx = in_pos + best_offset + i;
            if src_idx >= input_length || out_pos + i >= output_length {
                break;
            }
            let w = window[i];
            out[out_pos + i] += samples[src_idx] * w;
            norm[out_pos + i] += w;
        }

        in_pos += step_in;
        out_pos += step_out;
    }

    for i in 0..output_length {
        if norm[i] > 1e-6 {
            out[i] /= norm[i];
        }
    }

    out
}

fn hann(n: usize) -> Vec<f32> {
    let denom = (n.saturating_sub(1)) as f32;
    let denom = if denom == 0.0 { 1.0 } else { denom };
    let mut w = vec![0.0f32; n];
    for i in 0..n {
        w[i] = 0.5 * (1.0 - (2.0 * PI * i as f32 / denom).cos());
    }
    w
}

fn find_best_offset(
    input: &[f32],
    output: &[f32],
    in_pos: usize,
    out_pos: usize,
    overlap: usize,
    frame_size: usize,
) -> usize {
    let search = std::cmp::min(overlap, 64);
    let mut best: usize = 0;
    let mut best_corr: f32 = f32::NEG_INFINITY;

    let n = std::cmp::min(overlap, frame_size);

    for offset in 0..=search {
        let mut corr: f32 = 0.0;
        for i in 0..n {
            let a = input.get(in_pos + offset + i).copied().unwrap_or(0.0);
            let b = output.get(out_pos + i).copied().unwrap_or(0.0);
            corr += a * b;
        }
        if corr > best_corr {
            best_corr = corr;
            best = offset;
        }
    }

    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stretch_length() {
        let sr = 44100.0;
        let samples: Vec<f32> = (0..sr as usize).map(|i| (i as f32 * 0.001).sin()).collect();
        let out = stretch_wsola(&samples, sr, 2.0);
        // output_length ~= floor(input_length / rate)
        assert!(out.len() > 0);
    }
}

