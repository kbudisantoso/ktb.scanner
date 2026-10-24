import type { Point, Quad, Size } from './types.ts';

/** Trace measured screen-space perimeter; SVG stroke scaling must not change progress. */
export function progressOutline(corners: Quad, size: Size, progress: number): Point[] {
  if (!Number.isFinite(progress) || progress <= 0) return [];
  const lengths = corners.map((point, index) => {
    const next = corners[(index + 1) % 4];
    return Math.hypot((next.x - point.x) * size.width, (next.y - point.y) * size.height);
  });
  // Keep a visible opening until capture has actually been claimed.
  let remaining =
    lengths.reduce((sum, length) => sum + length, 0) *
    (progress >= 1 ? 1 : Math.min(progress, 0.985));
  const points = [{ ...corners[0] }];
  for (let index = 0; index < 4; index++) {
    const start = corners[index],
      next = corners[(index + 1) % 4];
    const fraction = Math.min(1, remaining / lengths[index]);
    points.push({
      x: start.x + (next.x - start.x) * fraction,
      y: start.y + (next.y - start.y) * fraction,
    });
    remaining -= lengths[index];
    if (remaining <= 0) break;
  }
  return points;
}
