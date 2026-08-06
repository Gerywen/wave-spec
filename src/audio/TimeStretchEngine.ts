/**
 * Lightweight WSOLA-style time stretch (tempo change, pitch preserved).
 * Used offline to produce a rate-adjusted AudioBuffer for playback.
 */
export class TimeStretchEngine {
  /**
   * @param rate playback tempo (>0). 1 = original, 2 = twice as fast (shorter).
   */
  stretch(buffer: AudioBuffer, rate: number, ctx: BaseAudioContext): AudioBuffer {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("rate must be positive");
    }
    if (Math.abs(rate - 1) < 1e-3) {
      return cloneBuffer(buffer, ctx);
    }

    const channels = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const inputLength = buffer.length;
    const outputLength = Math.max(1, Math.floor(inputLength / rate));

    const frameSize = Math.max(64, Math.floor(sr * 0.03)); // ~30ms
    const overlap = Math.floor(frameSize * 0.5);
    const stepIn = Math.max(1, Math.floor((frameSize - overlap) * rate));
    const stepOut = frameSize - overlap;

    const out = ctx.createBuffer(channels, outputLength, sr);
    const window = hann(frameSize);

    for (let ch = 0; ch < channels; ch++) {
      const input = buffer.getChannelData(ch);
      const output = out.getChannelData(ch);
      const norm = new Float32Array(outputLength);

      let inPos = 0;
      let outPos = 0;

      while (outPos + frameSize < outputLength && inPos + frameSize < inputLength) {
        let bestOffset = 0;
        if (outPos > 0) {
          bestOffset = findBestOffset(input, inPos, output, outPos, overlap, frameSize);
        }

        for (let i = 0; i < frameSize; i++) {
          const srcIndex = inPos + bestOffset + i;
          if (srcIndex >= inputLength || outPos + i >= outputLength) break;
          const w = window[i]!;
          output[outPos + i]! += input[srcIndex]! * w;
          norm[outPos + i]! += w;
        }

        inPos += stepIn;
        outPos += stepOut;
      }

      for (let i = 0; i < outputLength; i++) {
        if (norm[i]! > 1e-6) output[i]! /= norm[i]!;
      }
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

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
  }
  return w;
}

function findBestOffset(
  input: Float32Array,
  inPos: number,
  output: Float32Array,
  outPos: number,
  overlap: number,
  frameSize: number,
): number {
  const search = Math.min(overlap, 64);
  let best = 0;
  let bestCorr = -Infinity;
  for (let offset = 0; offset <= search; offset++) {
    let corr = 0;
    const n = Math.min(overlap, frameSize);
    for (let i = 0; i < n; i++) {
      const a = input[inPos + offset + i] ?? 0;
      const b = output[outPos + i] ?? 0;
      corr += a * b;
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      best = offset;
    }
  }
  return best;
}
