import type { LensCorrection, Point, Quad, Size } from './types.ts';

type Pixels = Size & { data: Uint8ClampedArray };
/** One-parameter division model in source pixels; optical center assumed at the image center. */
export function undistortPoint(p: Point, size: Size, strength: number): Point {
  const cx = (size.width - 1) / 2,
    cy = (size.height - 1) / 2,
    scale = Math.max(cx, cy);
  const x = (p.x - cx) / scale,
    y = (p.y - cy) / scale;
  const denominator = 1 + strength * (x * x + y * y);
  return { x: cx + (p.x - cx) / denominator, y: cy + (p.y - cy) / denominator };
}

function lineError(points: Point[]): number {
  if (points.length < 8) return Infinity;
  const n = points.length,
    cx = points.reduce((v, p) => v + p.x, 0) / n,
    cy = points.reduce((v, p) => v + p.y, 0) / n;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of points) {
    const x = p.x - cx,
      y = p.y - cy;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
    nx = -Math.sin(angle),
    ny = Math.cos(angle);
  const errors = points.map((p) => ((p.x - cx) * nx + (p.y - cy) * ny) ** 2).sort((a, b) => a - b);
  const kept = errors.slice(0, Math.ceil(n * 0.9));
  return Math.sqrt(kept.reduce((a, b) => a + b, 0) / kept.length);
}

/** Estimate only from mutually consistent curved paper borders, validated at held-out positions. */
export function estimateLens(image: Pixels, quad: Quad): LensCorrection {
  const { width, height, data } = image,
    radius = Math.max(6, Math.round(Math.max(width, height) * 0.03));
  const gray = (x: number, y: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return NaN;
    const i = (y * width + x) * 4;
    return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  };
  const edges: Point[][] = [];
  for (let edge = 0; edge < 4; edge++) {
    const a = { x: quad[edge].x * (width - 1), y: quad[edge].y * (height - 1) },
      b = { x: quad[(edge + 1) % 4].x * (width - 1), y: quad[(edge + 1) % 4].y * (height - 1) };
    const length = Math.hypot(b.x - a.x, b.y - a.y),
      nx = -(b.y - a.y) / length,
      ny = (b.x - a.x) / length;
    const samples: Point[] = [],
      quarters = [0, 0, 0, 0];
    for (let j = 0; j < 48; j++) {
      const t = 0.05 + (0.9 * j) / 47,
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t;
      const score = (d: number) =>
        (gray(x + nx * (d + 2), y + ny * (d + 2)) -
          gray(x + nx * (d - 2), y + ny * (d - 2)) +
          gray(x + nx * (d + 4), y + ny * (d + 4)) -
          gray(x + nx * (d - 4), y + ny * (d - 4))) /
        2;
      let best = -Infinity,
        offset = 0;
      for (let d = -radius; d <= radius; d++) {
        const s = score(d) - Math.abs(d) * 0.25;
        if (s > best) {
          best = s;
          offset = d;
        }
      }
      if (best < 20 || Math.abs(offset) >= radius - 1) continue;
      const l = score(offset - 1),
        c = score(offset),
        r = score(offset + 1),
        den = l - 2 * c + r;
      const sub = Math.abs(den) > 0.01 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
      samples.push({ x: x + nx * (offset + sub), y: y + ny * (offset + sub) });
      quarters[Math.floor(j / 12)]++;
    }
    if (samples.length >= 36 && Math.min(...quarters) >= 7) edges.push(samples);
  }
  const none: LensCorrection = {
    status: 'insufficient-evidence',
    strength: 0,
    supportedEdges: edges.length,
  };
  if (edges.length < 3) return none;
  const error = (points: Point[], k: number) =>
    lineError(points.map((p) => undistortPoint(p, image, k)));
  const train = edges.map((e) => e.filter((_, i) => i % 2 === 0)),
    test = edges.map((e) => e.filter((_, i) => i % 2 === 1));
  const aggregate = (lines: Point[][], k: number) =>
    Math.sqrt(lines.reduce((sum, e) => sum + error(e, k) ** 2, 0) / lines.length);
  const before = aggregate(test, 0);
  if (before < 0.75)
    return { ...none, status: 'already-straight', beforePx: before, afterPx: before };
  let strength = 0,
    best = aggregate(train, 0);
  for (let step = -36; step <= 36; step++) {
    const k = step * 0.005,
      value = aggregate(train, k);
    if (value < best) {
      best = value;
      strength = k;
    }
  }
  const after = aggregate(test, strength);
  let agreeing = 0;
  for (let i = 0; i < edges.length; i++) {
    let localK = 0,
      localError = error(train[i], 0);
    for (let step = -36; step <= 36; step++) {
      const k = step * 0.005,
        value = error(train[i], k);
      if (value < localError) {
        localError = value;
        localK = k;
      }
    }
    if (Math.abs(localK - strength) <= 0.04 && error(test[i], strength) < error(test[i], 0) * 0.7)
      agreeing++;
  }
  if (
    Math.abs(strength) < 0.015 ||
    Math.abs(strength) >= 0.175 ||
    after > 1.25 ||
    after > before * 0.6 ||
    agreeing < 3
  )
    return { ...none, beforePx: before, afterPx: after };
  return {
    status: 'applied',
    strength,
    supportedEdges: edges.length,
    beforePx: before,
    afterPx: after,
  };
}

/** Expand the corrected source bounds, so correction never silently clips the selected paper. */
export function lensMapping(size: Size, strength: number) {
  const border: Point[] = [];
  for (let j = 0; j <= 32; j++) {
    const x = (j / 32) * (size.width - 1),
      y = (j / 32) * (size.height - 1);
    border.push(
      ...[
        { x, y: 0 },
        { x, y: size.height - 1 },
        { x: 0, y },
        { x: size.width - 1, y },
      ].map((p) => undistortPoint(p, size, strength)),
    );
  }
  const left = Math.min(...border.map((p) => p.x)),
    top = Math.min(...border.map((p) => p.y));
  const spanX = Math.max(...border.map((p) => p.x)) - left,
    spanY = Math.max(...border.map((p) => p.y)) - top;
  const forward = (p: Point) => {
    const u = undistortPoint(p, size, strength);
    return {
      x: ((u.x - left) / spanX) * (size.width - 1),
      y: ((u.y - top) / spanY) * (size.height - 1),
    };
  };
  const backward = (p: Point): Point => {
    const ux = left + (p.x / (size.width - 1)) * spanX,
      uy = top + (p.y / (size.height - 1)) * spanY;
    const cx = (size.width - 1) / 2,
      cy = (size.height - 1) / 2,
      s = Math.max(cx, cy),
      r = Math.hypot(ux - cx, uy - cy) / s;
    const disc = 1 - 4 * strength * r * r;
    if (disc < 0) return { x: NaN, y: NaN };
    const factor = 2 / (1 + Math.sqrt(disc));
    return { x: cx + (ux - cx) * factor, y: cy + (uy - cy) * factor };
  };
  return { forward, backward };
}

export function correctLens(
  image: Pixels,
  quad: Quad,
  strength: number,
): { data: Uint8ClampedArray; corners: Quad } {
  if (strength === 0) return { data: image.data, corners: quad };
  const { width, height, data } = image,
    map = lensMapping(image, strength),
    out = new Uint8ClampedArray(data.length).fill(255);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = map.backward({ x, y });
      if (!Number.isFinite(p.x) || p.x < 0 || p.y < 0 || p.x > width - 1 || p.y > height - 1)
        continue;
      const x0 = Math.floor(p.x),
        y0 = Math.floor(p.y),
        x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1),
        fx = p.x - x0,
        fy = p.y - y0;
      const index = (y * width + x) * 4;
      for (let c = 0; c < 4; c++)
        out[index + c] =
          (data[(y0 * width + x0) * 4 + c] * (1 - fx) + data[(y0 * width + x1) * 4 + c] * fx) *
            (1 - fy) +
          (data[(y1 * width + x0) * 4 + c] * (1 - fx) + data[(y1 * width + x1) * 4 + c] * fx) * fy;
    }
  const corners = quad.map((p) => {
    const u = map.forward({ x: p.x * (width - 1), y: p.y * (height - 1) });
    return { x: u.x / (width - 1), y: u.y / (height - 1) };
  }) as Quad;
  return { data: out, corners };
}
