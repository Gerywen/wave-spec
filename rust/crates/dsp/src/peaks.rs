/// Build a multi-resolution min/max peak pyramid.
/// Each level is interleaved [min0, max0, min1, max1, ...].
/// Level 0 has block=1, level 1 has block=2, etc.
pub fn build_pyramid(data: &[f32], max_levels: usize) -> Vec<Vec<f32>> {
    let mut levels: Vec<Vec<f32>> = Vec::new();
    let mut block: usize = 1;

    while block < data.len() && levels.len() < max_levels {
        let cols = (data.len() + block - 1) / block;
        let mut level = vec![0.0f32; cols * 2];

        if block == 1 {
            for c in 0..cols {
                let v = data[c];
                level[c * 2] = v;
                level[c * 2 + 1] = v;
            }
        } else if let Some(prev) = levels.last() {
            let prev_cols = prev.len() / 2;
            for c in 0..cols {
                let i0 = c * 2;
                let i1 = (c * 2 + 1).min(prev_cols - 1);
                let mut mn = prev[i0 * 2];
                let mut mx = prev[i0 * 2 + 1];
                for i in i0..=i1 {
                    if i < prev_cols {
                        mn = mn.min(prev[i * 2]);
                        mx = mx.max(prev[i * 2 + 1]);
                    }
                }
                level[c * 2] = mn;
                level[c * 2 + 1] = mx;
            }
        }

        levels.push(level);
        block *= 2;
    }

    levels
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pyramid_basic() {
        let data = vec![0.0, 1.0, -1.0, 0.5];
        let pyramid = build_pyramid(&data, 24);
        assert!(!pyramid.is_empty());
        // Level 0 (block=1): each sample is its own min/max
        assert_eq!(pyramid[0].len(), 8);
        assert_eq!(pyramid[0][0], 0.0); // min of sample 0
        assert_eq!(pyramid[0][1], 0.0); // max of sample 0
        assert_eq!(pyramid[0][2], 1.0);
        assert_eq!(pyramid[0][3], 1.0);
    }
}
