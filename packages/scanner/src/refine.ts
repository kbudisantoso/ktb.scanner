import type { Point, Quad, Size } from './types.ts';
import { validQuad, quadDrift } from './geometry.ts';
type Line = { a: number; b: number; c: number };
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
/** Narrow-strip gradients followed by robust residual trimming and a line fit. */
export function refineEdges(
  image: { data: Uint8ClampedArray } & Size,
  input: Quad,
): { corners: Quad; supported: boolean } {
  const { width, height, data } = image;
  const gray = (x: number, y: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= width || y < 0 || y >= height) return NaN;
    const i = (y * width + x) * 4;
    return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  };
  const points = input.map((p) => ({ x: p.x * (width - 1), y: p.y * (height - 1) }));
  const radius = Math.min(24, Math.max(3, Math.round(Math.max(width, height) * 0.006)));
  const lines: Line[] = [];
  for (let edge = 0; edge < 4; edge++) {
    const start = points[edge],
      end = points[(edge + 1) % 4],
      length = Math.hypot(end.x - start.x, end.y - start.y);
    const tx = (end.x - start.x) / length,
      ty = (end.y - start.y) / length,
      nx = -ty,
      ny = tx;
    const samples: { t: number; d: number }[] = [];
    for (let sample = 0; sample < 64; sample++) {
      const t = length * (0.06 + (0.88 * sample) / 63),
        x = start.x + tx * t,
        y = start.y + ty * t;
      let best = 14,
        chosen: number | undefined;
      for (let offset = -radius; offset <= radius; offset++) {
        let gradient = 0;
        for (let tangent = -1; tangent <= 1; tangent++)
          gradient +=
            Math.abs(
              gray(x + nx * (offset + 2) + tx * tangent, y + ny * (offset + 2) + ty * tangent) -
                gray(x + nx * (offset - 2) + tx * tangent, y + ny * (offset - 2) + ty * tangent),
            ) / 3;
        if (gradient > best) {
          best = gradient;
          chosen = offset;
        }
      }
      if (chosen !== undefined) samples.push({ t, d: chosen });
    }
    if (samples.length < 42) return { corners: input, supported: false };
    // Theil-Sen slope estimate resists text/stamp transitions along a paper edge.
    const slopes: number[] = [];
    for (let i = 0; i < samples.length; i += 3)
      for (let j = i + 6; j < samples.length; j += 3)
        slopes.push((samples[j].d - samples[i].d) / (samples[j].t - samples[i].t));
    const slope = median(slopes),
      intercept = median(samples.map((p) => p.d - slope * p.t));
    const inliers = samples.filter((p) => Math.abs(p.d - slope * p.t - intercept) <= 2);
    if (inliers.length < 38) return { corners: input, supported: false };
    const n = inliers.length,
      st = inliers.reduce((s, p) => s + p.t, 0),
      sd = inliers.reduce((s, p) => s + p.d, 0);
    const stt = inliers.reduce((s, p) => s + p.t * p.t, 0),
      std = inliers.reduce((s, p) => s + p.t * p.d, 0);
    const m = (n * std - st * sd) / Math.max(1e-6, n * stt - st * st),
      b = (sd - m * st) / n;
    const a = nx - m * tx,
      c = ny - m * ty;
    lines.push({ a, b: c, c: a * start.x + c * start.y + b });
  }
  const refined = lines.map((line, i): Point => {
    const previous = lines[(i + 3) % 4],
      determinant = previous.a * line.b - line.a * previous.b;
    return {
      x: (previous.c * line.b - line.c * previous.b) / determinant / (width - 1),
      y: (previous.a * line.c - line.a * previous.c) / determinant / (height - 1),
    };
  }) as Quad;
  if (!validQuad(refined) || quadDrift(input, refined) > 0.04)
    return { corners: input, supported: false };
  return { corners: refined, supported: true };
}
