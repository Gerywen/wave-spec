import type { SelectionRange } from "../types.js";

export type EditRange = { lo: number; hi: number };

export type AudioClipboard = {
  sampleRate: number;
  channels: Float32Array[];
};

/** Normalize selection to integer half-open [lo, hi) clamped to buffer length. */
export function normalizeEditRange(
  sel: SelectionRange | null | undefined,
  length: number,
): EditRange | null {
  if (!sel || !(length > 0)) return null;
  const a = Math.min(sel.startSample, sel.endSample);
  const b = Math.max(sel.startSample, sel.endSample);
  const lo = Math.max(0, Math.min(length, Math.floor(a)));
  const hi = Math.max(0, Math.min(length, Math.ceil(b)));
  if (hi <= lo) return null;
  return { lo, hi };
}

export function copyRange(buffer: AudioBuffer, lo: number, hi: number): Float32Array[] {
  const n = Math.max(0, hi - lo);
  const out: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const slice = new Float32Array(n);
    slice.set(src.subarray(lo, lo + n));
    out.push(slice);
  }
  return out;
}

function createBuffer(
  ctx: BaseAudioContext,
  channelCount: number,
  length: number,
  sampleRate: number,
): AudioBuffer {
  return ctx.createBuffer(channelCount, Math.max(1, length), sampleRate);
}

function copyChannelSegment(
  dest: Float32Array,
  destOffset: number,
  src: Float32Array,
  srcStart: number,
  srcEnd: number,
): void {
  const n = srcEnd - srcStart;
  if (n <= 0) return;
  dest.set(src.subarray(srcStart, srcEnd), destOffset);
}

/** Align clipboard channels to target channel count (pad zeros / drop extras). */
export function alignChannels(
  channels: Float32Array[],
  targetChannelCount: number,
  frameCount: number,
): Float32Array[] {
  const out: Float32Array[] = [];
  for (let ch = 0; ch < targetChannelCount; ch++) {
    const src = channels[ch];
    const dest = new Float32Array(frameCount);
    if (src) {
      dest.set(src.subarray(0, Math.min(src.length, frameCount)));
    }
    out.push(dest);
  }
  return out;
}

export function deleteRange(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  lo: number,
  hi: number,
): AudioBuffer {
  const length = buffer.length;
  const loC = Math.max(0, Math.min(length, Math.floor(lo)));
  const hiC = Math.max(loC, Math.min(length, Math.ceil(hi)));
  const nextLen = length - (hiC - loC);
  const next = createBuffer(ctx, buffer.numberOfChannels, nextLen, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dest = next.getChannelData(ch);
    if (nextLen <= 0) {
      dest[0] = 0;
      continue;
    }
    copyChannelSegment(dest, 0, src, 0, loC);
    copyChannelSegment(dest, loC, src, hiC, length);
  }
  return next;
}

export function insertAt(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  at: number,
  channels: Float32Array[],
): AudioBuffer {
  const insertLen = channels[0]?.length ?? 0;
  const atClamped = Math.max(0, Math.min(buffer.length, Math.floor(at)));
  const aligned = alignChannels(channels, buffer.numberOfChannels, insertLen);
  const nextLen = Math.max(1, buffer.length + insertLen);
  const next = createBuffer(ctx, buffer.numberOfChannels, nextLen, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dest = next.getChannelData(ch);
    const paste = aligned[ch]!;
    copyChannelSegment(dest, 0, src, 0, atClamped);
    if (insertLen > 0) dest.set(paste, atClamped);
    copyChannelSegment(dest, atClamped + insertLen, src, atClamped, buffer.length);
  }
  return next;
}

/** Replace [lo, hi) with clipboard channels in a single pass. */
export function replaceRange(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  lo: number,
  hi: number,
  channels: Float32Array[],
): AudioBuffer {
  const length = buffer.length;
  const loC = Math.max(0, Math.min(length, Math.floor(lo)));
  const hiC = Math.max(loC, Math.min(length, Math.ceil(hi)));
  const insertLen = channels[0]?.length ?? 0;
  const aligned = alignChannels(channels, buffer.numberOfChannels, insertLen);
  const nextLen = Math.max(1, length - (hiC - loC) + insertLen);
  const next = createBuffer(ctx, buffer.numberOfChannels, nextLen, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dest = next.getChannelData(ch);
    const paste = aligned[ch]!;
    let o = 0;
    copyChannelSegment(dest, o, src, 0, loC);
    o += loC;
    if (insertLen > 0) {
      dest.set(paste, o);
      o += insertLen;
    }
    copyChannelSegment(dest, o, src, hiC, length);
  }
  return next;
}

export function cloneAudioBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const next = createBuffer(ctx, buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    next.copyToChannel(buffer.getChannelData(ch), ch);
  }
  return next;
}
