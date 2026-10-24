import type { Size } from './types.ts';

/** Optional white-paper assumption. Smooth illumination only; no binarization or resampling. */
export function normalizePaperLighting(
  image: Size & { data: Uint8ClampedArray },
  options: { whiten?: boolean } = {},
): {
  applied: boolean;
  neutralFraction: number;
} {
  const { width, height, data } = image;
  const whitePaper = options.whiten === true;
  const cellSize = whitePaper ? 64 : 96;
  const channels = whitePaper ? 3 : 1;
  const cols = Math.max(1, Math.min(32, Math.ceil(width / cellSize)));
  const rows = Math.max(1, Math.min(32, Math.ceil(height / cellSize)));
  const histograms = new Uint32Array(cols * rows * channels * 256);
  const counts = new Uint32Array(cols * rows);
  const global = new Uint32Array(256);
  let samples = 0,
    neutral = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 250) continue;
      samples++;
      const low = Math.min(data[i], data[i + 1], data[i + 2]);
      const high = Math.max(data[i], data[i + 1], data[i + 2]);
      if (high - low > (whitePaper ? 40 : 24) || low < 65) continue;
      const value = Math.round(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
      const cell = Math.floor((y * rows) / height) * cols + Math.floor((x * cols) / width);
      for (let c = 0; c < channels; c++)
        histograms[(cell * channels + c) * 256 + (whitePaper ? data[i + c] : value)]++;
      counts[cell]++;
      global[value]++;
      neutral++;
    }
  }
  const neutralFraction = neutral / Math.max(1, samples);
  const quantile = (hist: Uint32Array, offset: number, count: number, fraction = 0.85) => {
    let sum = 0;
    for (let value = 0; value < 256; value++) {
      sum += hist[offset + value];
      if (sum >= count * fraction) return value;
    }
    return 255;
  };
  const reference = quantile(global, 0, neutral);
  if (neutralFraction < 0.35 || reference < 110) return { applied: false, neutralFraction };
  let field = new Float32Array(cols * rows * channels);
  for (let p = 0; p < counts.length; p++)
    for (let c = 0; c < channels; c++)
      field[p * channels + c] =
        counts[p] >= 8
          ? Math.max(
              reference * (whitePaper ? 0.35 : 0.55),
              quantile(histograms, (p * channels + c) * 256, counts[p], whitePaper ? 0.5 : 0.85),
            )
          : reference;
  // Fill small dark text/photo cells from nearby background, then remove grid seams.
  const filled = new Float32Array(field.length);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      for (let c = 0; c < channels; c++) {
        let value = field[(y * cols + x) * channels + c];
        for (let dy = -1; counts[y * cols + x] < 8 && dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (x + dx >= 0 && x + dx < cols && y + dy >= 0 && y + dy < rows)
              value = Math.max(value, field[((y + dy) * cols + x + dx) * channels + c]);
          }
        filled[(y * cols + x) * channels + c] = value;
      }
    }
  field = filled;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(field.length);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        for (let c = 0; c < channels; c++) {
          let sum = 0,
            weights = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
              const px = Math.max(0, Math.min(cols - 1, x + dx));
              const py = Math.max(0, Math.min(rows - 1, y + dy));
              // Linear extension preserves illumination slopes at image boundaries.
              let value = field[(py * cols + px) * channels + c];
              if (whitePaper && cols > 1 && x + dx !== px)
                value +=
                  (x + dx - px) *
                  (field[(py * cols + Math.min(cols - 1, px + 1)) * channels + c] -
                    field[(py * cols + Math.max(0, px - 1)) * channels + c]);
              if (whitePaper && rows > 1 && y + dy !== py)
                value +=
                  (y + dy - py) *
                  (field[(Math.min(rows - 1, py + 1) * cols + px) * channels + c] -
                    field[(Math.max(0, py - 1) * cols + px) * channels + c]);
              sum += value * weight;
              weights += weight;
            }
          next[(y * cols + x) * channels + c] = sum / weights;
        }
      }
    field = next;
  }
  let applied = false;
  for (let y = 0; y < height; y++) {
    const gy = whitePaper
      ? ((y + 0.5) * rows) / height - 0.5
      : Math.max(0, Math.min(rows - 1, ((y + 0.5) * rows) / height - 0.5));
    const y0 = Math.max(0, Math.min(rows - (whitePaper && rows > 1 ? 2 : 1), Math.floor(gy))),
      y1 = Math.min(rows - 1, y0 + 1),
      fy = gy - y0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 250) continue;
      const high = Math.max(data[i], data[i + 1], data[i + 2]);
      const low = Math.min(data[i], data[i + 1], data[i + 2]);
      // A neutral band includes modest camera color casts. Fading within that band
      // would amplify small chroma/JPEG variations into visible brightness patches.
      const chromaFade = Math.max(0, Math.min(1, (64 - (high - low)) / 24));
      const chromaWeight = chromaFade * chromaFade * (3 - 2 * chromaFade);
      if (chromaWeight === 0) continue;
      const gx = whitePaper
        ? ((x + 0.5) * cols) / width - 0.5
        : Math.max(0, Math.min(cols - 1, ((x + 0.5) * cols) / width - 0.5));
      const x0 = Math.max(0, Math.min(cols - (whitePaper && cols > 1 ? 2 : 1), Math.floor(gx))),
        x1 = Math.min(cols - 1, x0 + 1),
        fx = gx - x0;
      const luminance = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      for (let c = 0; c < channels; c++) {
        const background =
          (field[(y0 * cols + x0) * channels + c] * (1 - fx) +
            field[(y0 * cols + x1) * channels + c] * fx) *
            (1 - fy) +
          (field[(y1 * cols + x0) * channels + c] * (1 - fx) +
            field[(y1 * cols + x1) * channels + c] * fx) *
            fy;
        const gain = Math.max(
          1,
          Math.min(whitePaper ? 3 : 2.2, (whitePaper ? 255 : 250) / Math.max(1, background)),
        );
        const delta = (gain - 1) * (whitePaper ? data[i + c] : luminance) * chromaWeight;
        if (delta >= 0.5) applied = true;
        if (whitePaper) data[i + c] += delta;
        else for (let channel = 0; channel < 3; channel++) data[i + channel] += delta;
      }
    }
  }
  return { applied, neutralFraction };
}
