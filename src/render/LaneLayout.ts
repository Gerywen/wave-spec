export type LaneRect = {
  channel: number;
  y: number;
  height: number;
};

export type SplitterHit = {
  index: number; // splitter between lane index and index+1
  y: number;
};

/**
 * Computes vertical lane layout from relative heights.
 */
export class LaneLayout {
  compute(heights: number[], totalHeight: number, gap = 1): LaneRect[] {
    const n = heights.length;
    if (n === 0 || totalHeight <= 0) return [];
    const sum = heights.reduce((a, b) => a + b, 0) || 1;
    const gaps = Math.max(0, n - 1) * gap;
    const usable = Math.max(0, totalHeight - gaps);
    const lanes: LaneRect[] = [];
    let y = 0;
    for (let i = 0; i < n; i++) {
      const h =
        i === n - 1
          ? Math.max(1, totalHeight - y)
          : Math.max(1, Math.round(usable * (heights[i]! / sum)));
      lanes.push({ channel: i, y, height: h });
      y += h + (i < n - 1 ? gap : 0);
    }
    return lanes;
  }

  hitSplitters(lanes: LaneRect[], gap = 1): SplitterHit[] {
    const hits: SplitterHit[] = [];
    for (let i = 0; i < lanes.length - 1; i++) {
      const lane = lanes[i]!;
      hits.push({ index: i, y: lane.y + lane.height + gap / 2 });
    }
    return hits;
  }

  /**
   * Drag splitter `index` by deltaY pixels; returns new relative heights.
   */
  resize(
    heights: number[],
    index: number,
    deltaY: number,
    totalHeight: number,
    gap = 1,
  ): number[] {
    const n = heights.length;
    if (index < 0 || index >= n - 1 || totalHeight <= 0) return [...heights];
    const lanes = this.compute(heights, totalHeight, gap);
    const next = lanes.map((l) => l.height);
    const a = next[index]!;
    const b = next[index + 1]!;
    const minH = 24;
    let na = a + deltaY;
    let nb = b - deltaY;
    if (na < minH) {
      nb -= minH - na;
      na = minH;
    }
    if (nb < minH) {
      na -= minH - nb;
      nb = minH;
    }
    next[index] = na;
    next[index + 1] = nb;
    const sum = next.reduce((x, y) => x + y, 0) || 1;
    return next.map((h) => h / sum);
  }
}
