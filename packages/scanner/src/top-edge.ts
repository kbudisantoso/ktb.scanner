import type { Point, Quad, Size } from './types.ts';
import { area, quadDrift, validQuad } from './geometry.ts';

type Line = { a: number; b: number; c: number };
type Evidence = { score: number; hits: number; quarters: number[] };

/** Recover one clipped light top border. Other edges are never searched or moved. */
export function recoverTopPaperEdge(image: Size & { data: Uint8ClampedArray }, input: Quad) {
  const unchanged = { corners: input, applied: false };
  const { width, height, data } = image;
  const maximum = Math.max(width, height),
    radius = Math.max(5, Math.round(maximum * 0.06));
  const band = Math.max(3, maximum * 0.0025),
    count = 64;
  const points = input.map((p) => ({ x: p.x * (width - 1), y: p.y * (height - 1) }));
  const [start, end] = points,
    length = Math.hypot(end.x - start.x, end.y - start.y);
  const tx = (end.x - start.x) / length,
    ty = (end.y - start.y) / length,
    nx = -ty,
    ny = tx;
  const gray = (x: number, y: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= width || y < 0 || y >= height) return NaN;
    const i = (y * width + x) * 4;
    return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  };
  const stride = radius * 2 + 1,
    gradient = new Float32Array(count * stride);
  for (let j = 0; j < count; j++) {
    const t = length * (0.06 + (0.88 * j) / (count - 1));
    for (let d = -radius; d <= radius; d++) {
      let value = 0;
      for (const along of [-3, 0, 3])
        for (const offset of [3, 6])
          value +=
            (gray(
              start.x + tx * (t + along) + nx * (d + offset),
              start.y + ty * (t + along) + ny * (d + offset),
            ) -
              gray(
                start.x + tx * (t + along) + nx * (d - offset),
                start.y + ty * (t + along) + ny * (d - offset),
              )) /
            6;
      gradient[j * stride + d + radius] = Number.isFinite(value) ? value : 0;
    }
  }
  const measure = (b: number, m: number, sign = 1): Evidence => {
    let sum = 0,
      hits = 0;
    const quarters = [0, 0, 0, 0];
    for (let j = 0; j < count; j++) {
      const t = length * (0.06 + (0.88 * j) / (count - 1)) - length / 2;
      const at = Math.round(b + m * t) + radius;
      if (at < 1 || at >= stride - 1) continue;
      let value = 0;
      for (let k = -1; k <= 1; k++) value = Math.max(value, sign * gradient[j * stride + at + k]);
      if (value >= 6) {
        hits++;
        quarters[Math.floor(j / 16)]++;
        sum += Math.min(value, 30);
      }
    }
    return { score: sum / count / 30, hits, quarters };
  };
  const baseline = Math.max(measure(0, 0).score, measure(0, 0, -1).score);
  if (baseline >= 0.4) return { ...unchanged, baseline };
  let best: (Evidence & { b: number; m: number; whiteFraction: number }) | undefined;
  for (let m = -0.12; m <= 0.12001; m += 0.01)
    for (let b = -radius; b <= -Math.max(4, maximum * 0.002); b += 2) {
      // Seek missing paper outside the proposal, never shrink the existing top crop.
      if (Math.max(b - (m * length) / 2, b + (m * length) / 2) > band) continue;
      const evidence = measure(b, m);
      if (
        evidence.hits < 47 ||
        Math.min(...evidence.quarters) < 9 ||
        evidence.score < 0.6 ||
        evidence.score <= baseline + 0.15
      )
        continue;
      let whites = 0;
      for (let j = 0; j < count; j++) {
        const t = length * (0.06 + (0.88 * j) / (count - 1)),
          d = b + m * (t - length / 2) + band;
        const x = Math.round(start.x + tx * t + nx * d),
          y = Math.round(start.y + ty * t + ny * d);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const i = (y * width + x) * 4,
          low = Math.min(data[i], data[i + 1], data[i + 2]);
        if (low >= 100 && Math.max(data[i], data[i + 1], data[i + 2]) - low <= 32) whites++;
      }
      const whiteFraction = whites / count;
      if (whiteFraction >= 0.85 && (!best || evidence.score > best.score))
        best = { ...evidence, b, m, whiteFraction };
    }
  if (!best) return { ...unchanged, baseline };
  const lineThrough = (a: Point, b: Point): Line => {
    const x = -(b.y - a.y),
      y = b.x - a.x;
    return { a: x, b: y, c: x * a.x + y * a.y };
  };
  const a = nx - best.m * tx,
    b = ny - best.m * ty;
  const top: Line = { a, b, c: a * start.x + b * start.y + best.b - (best.m * length) / 2 };
  const intersection = (other: Line): Point => {
    const det = other.a * top.b - top.a * other.b;
    return {
      x: (other.c * top.b - top.c * other.b) / det / (width - 1),
      y: (other.a * top.c - top.a * other.c) / det / (height - 1),
    };
  };
  const corners: Quad = [
    intersection(lineThrough(points[3], points[0])),
    intersection(lineThrough(points[1], points[2])),
    input[2],
    input[3],
  ];
  const ratio = area(corners) / area(input);
  if (!validQuad(corners) || quadDrift(corners, input) > 0.065 || ratio < 1.0025 || ratio > 1.2)
    return { ...unchanged, baseline, best };
  // Newly exposed side segments must also be supported, preventing a jump to a neighboring sheet.
  for (const index of [0, 1]) {
    const old = points[index],
      next = { x: corners[index].x * (width - 1), y: corners[index].y * (height - 1) };
    if (Math.hypot(next.x - old.x, next.y - old.y) < band * 2) continue;
    const side = index === 0 ? lineThrough(points[3], old) : lineThrough(old, points[2]);
    const norm = Math.hypot(side.a, side.b),
      sx = side.a / norm,
      sy = side.b / norm;
    let hits = 0;
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const x = old.x + (next.x - old.x) * t,
        y = old.y + (next.y - old.y) * t;
      let strongest = 0;
      for (let d = -band; d <= band; d += 2)
        strongest = Math.max(
          strongest,
          gray(x + sx * (d + 4), y + sy * (d + 4)) - gray(x + sx * (d - 4), y + sy * (d - 4)),
        );
      if (strongest >= 6) hits++;
    }
    if (hits < 3) return { ...unchanged, baseline, best, sideUnsupported: index };
  }
  return { corners, applied: true, baseline, best };
}
