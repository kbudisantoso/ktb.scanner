import { quadDrift, validQuad } from '../geometry.ts';
import type { Quad } from '../types.ts';

export const OUTLINE_MOTION_MS = 120;

/** A bounded display transition, never a source of camera measurements. */
export function canAnimateOutline(from: Quad, to: Quad): boolean {
  return validQuad(from) && validQuad(to) && quadDrift(from, to) <= 0.035;
}

export function outlineAt(from: Quad, to: Quad, elapsed: number): Quad {
  const time = Math.max(0, Math.min(1, elapsed / OUTLINE_MOTION_MS));
  const fraction = time * (2 - time);
  const result = from.map((point, index) => ({
    x: point.x + (to[index].x - point.x) * fraction,
    y: point.y + (to[index].y - point.y) * fraction,
  })) as Quad;
  return validQuad(result) ? result : to;
}
