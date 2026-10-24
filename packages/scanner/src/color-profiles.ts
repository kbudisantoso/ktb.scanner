import type { Size } from './types.ts';
type Pixels = Size & { data: Uint8ClampedArray };
const aligned = (center: number, u: number, v: number) =>
  Math.abs(u - center) <= 3 && Math.abs(v - center) <= 3;

export function grayscale(image: Pixels): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
}

/** Monochrome document: denoise first, then map local ink contrast with soft gray edges. */
export function blackAndWhite(image: Pixels, bias = 0): void {
  const { width, height, data } = image,
    scale = Math.min(1, 1024 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)),
    h = Math.max(1, Math.round(height * scale)),
    stride = w + 1;
  const gray = new Uint8Array(width * height);
  for (let p = 0; p < gray.length; p++) {
    const i = p * 4;
    gray[p] = Math.round(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
  }
  const filtered = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x,
        center = gray[p];
      if (center < 60) {
        filtered[p] = center;
        continue;
      }
      const left = Math.max(0, x - 1),
        right = Math.min(width - 1, x + 1),
        up = Math.max(0, y - 1) * width,
        down = Math.min(height - 1, y + 1) * width;
      const a = gray[up + left],
        b = gray[up + x],
        c = gray[up + right],
        d = gray[y * width + left],
        e = gray[y * width + right],
        f = gray[down + left],
        g = gray[down + x],
        h = gray[down + right];
      const high = Math.max(a, b, c, d, e, f, g, h),
        low = Math.min(a, b, c, d, e, f, g, h);
      // Preserve coherent one-pixel strokes and decimal points; suppress isolated gray impulses.
      if (
        high >= center + 5 &&
        (aligned(center, a, h) ||
          aligned(center, b, g) ||
          aligned(center, c, f) ||
          aligned(center, d, e))
      )
        filtered[p] = center;
      else if (low > center + 12) filtered[p] = (a + b + c + d + e + f + g + h) / 8;
      else if (Math.max(high, center) - Math.min(low, center) <= 32)
        filtered[p] = (center * 2 + a + b + c + d + e + f + g + h) / 10;
      else filtered[p] = center;
    }
  const sum = new Float64Array((w + 1) * (h + 1)),
    square = new Float64Array(sum.length);
  for (let y = 0; y < h; y++) {
    let row = 0,
      rowSquare = 0;
    for (let x = 0; x < w; x++) {
      const value =
        filtered[
          Math.min(height - 1, Math.floor((y + 0.5) / scale)) * width +
            Math.min(width - 1, Math.floor((x + 0.5) / scale))
        ];
      row += value;
      rowSquare += value * value;
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + row;
      square[(y + 1) * stride + x + 1] = square[y * stride + x + 1] + rowSquare;
    }
  }
  const radius = Math.max(8, Math.round(Math.min(w, h) * 0.025));
  const thresholds = new Float32Array(w * h);
  const spans = new Uint8Array(w * h);
  for (let sy = 0; sy < h; sy++)
    for (let sx = 0; sx < w; sx++) {
      const x0 = Math.max(0, sx - radius),
        y0 = Math.max(0, sy - radius),
        x1 = Math.min(w, sx + radius + 1),
        y1 = Math.min(h, sy + radius + 1),
        n = (x1 - x0) * (y1 - y0);
      const a = y1 * stride + x1,
        b = y0 * stride + x1,
        c = y1 * stride + x0,
        d = y0 * stride + x0;
      const mean = (sum[a] - sum[b] - sum[c] + sum[d]) / n,
        deviation = Math.sqrt(
          Math.max(0, (square[a] - square[b] - square[c] + square[d]) / n - mean * mean),
        );
      const background = Math.min(255, mean + deviation * 0.4);
      thresholds[sy * w + sx] = background - Math.max(4, Math.min(12, deviation * 0.12)) + bias;
      spans[sy * w + sx] = Math.max(36, Math.min(116, deviation * 2));
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(w - 1, Math.floor(x * scale)),
        sy = Math.min(h - 1, Math.floor(y * scale));
      const p = y * width + x,
        cell = sy * w + sx,
        span = spans[cell];
      const tone = Math.max(0, Math.min(1, (filtered[p] - thresholds[cell] + span) / span));
      const value = Math.round(255 * tone * tone * (3 - 2 * tone)),
        i = p * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
}
