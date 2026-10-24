import type { Quad, Quality } from './types.ts';
function inside(x: number, y: number, q: Quad): boolean {
  return q.every((a, i) => {
    const b = q[(i + 1) % 4];
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
  });
}
/** Evaluate an unenhanced, max-1000px image; ignore paper boundaries and background. */
export function assessQuality(
  image: { data: Uint8ClampedArray; width: number; height: number },
  quad: Quad,
  revision: number,
): Quality {
  const { data, width, height } = image;
  const luma = new Float32Array(width * height),
    smooth = new Float32Array(width * height);
  for (let p = 0; p < luma.length; p++) {
    const i = p * 4;
    luma[p] = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  }
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      smooth[p] =
        (luma[p] * 4 +
          (luma[p - 1] + luma[p + 1] + luma[p - width] + luma[p + width]) * 2 +
          luma[p - width - 1] +
          luma[p - width + 1] +
          luma[p + width - 1] +
          luma[p + width + 1]) /
        16;
    }
  const luminance = (x: number, y: number) => luma[y * width + x];
  const regions: Quality['regions'] = [];
  for (let row = 0; row < 3; row++) {
    let n = 0,
      sum = 0,
      square = 0,
      lap = 0,
      lapSquare = 0;
    const edgeRatios: number[] = [];
    const edgeX: number[] = [],
      edgeY: number[] = [];
    for (
      let y = Math.max(7, Math.floor((row * height) / 3));
      y < Math.min(height - 7, ((row + 1) * height) / 3);
      y += 2
    ) {
      for (let x = 7; x < width - 7; x += 2) {
        // Stay inside the document, including clearance for the smoothed edge profile.
        if (
          ![
            [x - 7, y - 7],
            [x + 7, y - 7],
            [x + 7, y + 7],
            [x - 7, y + 7],
          ].every(([a, b]) => inside(a / width, b / height, quad))
        )
          continue;
        const c = luminance(x, y),
          l =
            luminance(x - 1, y) +
            luminance(x + 1, y) +
            luminance(x, y - 1) +
            luminance(x, y + 1) -
            4 * c;
        n++;
        sum += c;
        square += c * c;
        lap += l;
        lapSquare += l * l;
        if ((x - 7) % 4 !== 0 || (y - Math.max(7, Math.floor((row * height) / 3))) % 4 !== 0)
          continue;
        const p = y * width + x;
        const gx = smooth[p + 4] - smooth[p - 4],
          gy = smooth[p + 4 * width] - smooth[p - 4 * width];
        for (const [coarse, other, step, values] of [
          [gx, gy, 1, edgeX],
          [gy, gx, width, edgeY],
        ] as const) {
          if (Math.abs(coarse) < 40 || Math.abs(coarse) < Math.abs(other) * 1.5) continue;
          let peak = 0;
          for (let offset = -3; offset <= 3; offset++)
            peak = Math.max(
              peak,
              Math.abs(smooth[p + (offset + 1) * step] - smooth[p + (offset - 1) * step]),
            );
          const ratio = Math.min(1, peak / Math.abs(coarse));
          values.push(ratio);
          edgeRatios.push(ratio);
        }
      }
    }
    if (n > 80)
      regions.push({
        mean: sum / n,
        contrast: Math.sqrt(Math.max(0, square / n - (sum / n) ** 2)),
        variance: Math.max(0, lapSquare / n - (lap / n) ** 2),
        edgeSamples: edgeRatios.length,
        ...(edgeX.length >= 60
          ? { edgeRatioX: edgeX.sort((a, b) => a - b)[Math.floor(edgeX.length * 0.65)] }
          : {}),
        ...(edgeY.length >= 60
          ? { edgeRatioY: edgeY.sort((a, b) => a - b)[Math.floor(edgeY.length * 0.65)] }
          : {}),
        ...(edgeRatios.length >= 30
          ? { edgeRatio: edgeRatios.sort((a, b) => a - b)[Math.floor(edgeRatios.length * 0.65)] }
          : {}),
      });
  }
  const structured = regions.filter((r) => r.contrast >= 12);
  const broadTransitions =
    (['edgeRatioX', 'edgeRatioY'] as const).some(
      (axis) =>
        structured.filter((region) => region[axis] !== undefined && region[axis]! < 0.68).length >=
        2,
    ) ||
    structured.some(
      (region) =>
        region.variance < 800 &&
        (region.edgeSamples ?? 0) >= 40 &&
        region.edgeRatio !== undefined &&
        region.edgeRatio < 0.68,
    );
  const sharpness = !structured.length
    ? 'unknown'
    : broadTransitions || structured.some((r) => r.variance < 45)
      ? 'blur'
      : 'sharp';
  const reasons: Quality['reasons'] = [];
  if (sharpness === 'unknown') reasons.push('insufficient-structure');
  if (sharpness === 'blur') reasons.push('blur');
  // White paper alone is not evidence of overexposure. Report only measurable low-light loss.
  if (regions.some((r) => r.mean < 42 && r.contrast < 25)) reasons.push('exposure');
  return {
    state: 'completed',
    method: 'image-metrics',
    revision,
    assessment: !structured.length ? 'unknown' : reasons.length ? 'review-advised' : 'no-warning',
    sharpness,
    reasons,
    regions,
  };
}
export function enhanceDocument(image: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): void {
  const { data, width, height } = image;
  const original = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = original[i + channel];
        let sum = value * 4,
          weight = 4;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
          const other = original[((y + dy) * width + x + dx) * 4 + channel];
          if (Math.abs(other - value) <= 6) {
            sum += other;
            weight++;
          }
        }
        // Preserve pale strokes and chroma; only a small gamma lift, no clipping threshold.
        data[i + channel] = Math.round(255 * (sum / weight / 255) ** 0.97);
      }
    }
  sharpenDocument(image);
}

/** Small luminance-only detail boost, bounded to avoid ringing and color fringes. */
export function sharpenDocument(
  image: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  },
  strength = 0.4,
): void {
  const { data, width, height } = image;
  const luma = new Float32Array(width * height);
  for (let p = 0; p < luma.length; p++) {
    const i = p * 4;
    luma[p] = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  }
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const center = luma[p];
      const neighbors = [luma[p - 1], luma[p + 1], luma[p - width], luma[p + width]];
      const detail = center - neighbors.reduce((sum, value) => sum + value, 0) / 4;
      if (Math.abs(detail) <= 2) continue;
      const low = Math.min(center, ...neighbors),
        high = Math.max(center, ...neighbors);
      const boosted = Math.max(
        low,
        Math.min(high, center + Math.max(-8, Math.min(8, detail * strength))),
      );
      // Equal RGB offsets preserve chroma. Keep all channels away from new clipping.
      const i = p * 4;
      const delta = Math.max(
        -Math.min(data[i], data[i + 1], data[i + 2]),
        Math.min(255 - Math.max(data[i], data[i + 1], data[i + 2]), boosted - center),
      );
      for (let channel = 0; channel < 3; channel++) data[i + channel] += delta;
    }
}
