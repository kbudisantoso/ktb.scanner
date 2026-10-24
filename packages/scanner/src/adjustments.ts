import type { Recipe, Size } from './types.ts';
import { sharpenDocument } from './quality.ts';

export const NEUTRAL_ADJUSTMENTS = { brightness: 0, contrast: 0, sharpness: 0 } as const;

export function validRecipe(recipe: Recipe): boolean {
  if (
    !recipe ||
    recipe.version !== 1 ||
    !['auto', 'none', 'document', 'paper', 'grayscale', 'bw'].includes(recipe.enhancement) ||
    !['off', 'auto', 'manual'].includes(recipe.dewarp)
  )
    return false;
  if (
    recipe.lensStrength !== undefined &&
    (!Number.isFinite(recipe.lensStrength) || Math.abs(recipe.lensStrength) > 0.18)
  )
    return false;
  if (recipe.dewarp === 'manual' && recipe.lensStrength === undefined) return false;
  const a = recipe.adjustments;
  return (
    a === undefined ||
    (Number.isFinite(a.brightness) &&
      Math.abs(a.brightness) <= 100 &&
      Number.isFinite(a.contrast) &&
      Math.abs(a.contrast) <= 100 &&
      Number.isFinite(a.sharpness) &&
      a.sharpness >= 0 &&
      a.sharpness <= 100)
  );
}

/** Explicit manual tone controls. Zero is an exact no-op. Always run from original-derived pixels. */
export function applyAdjustments(
  image: Size & { data: Uint8ClampedArray },
  settings: Recipe['adjustments'],
): void {
  if (!settings) return;
  const gain = 2 ** (settings.contrast / 100),
    offset = settings.brightness * 0.64;
  if (settings.brightness || settings.contrast) {
    for (let i = 0; i < image.data.length; i += 4) {
      const y = image.data[i] * 0.2126 + image.data[i + 1] * 0.7152 + image.data[i + 2] * 0.0722;
      const delta = (y - 128) * gain + 128 + offset - y;
      for (let c = 0; c < 3; c++) image.data[i + c] += delta;
    }
  }
  if (settings.sharpness) sharpenDocument(image, settings.sharpness / 100);
}

/** Mild adaptive contrast after paper lighting; keep flat pages and vivid colors unchanged. */
export function autoPaperContrast(image: Size & { data: Uint8ClampedArray }): number {
  const hist = new Uint32Array(256);
  let n = 0;
  const d = image.data;
  for (let i = 0; i < d.length; i += 16) {
    if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40) continue;
    hist[Math.round(d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722)]++;
    n++;
  }
  const q = (fraction: number) => {
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += hist[i];
      if (sum >= n * fraction) return i;
    }
    return 255;
  };
  if (n < 100) return 1;
  const low = q(0.05),
    high = q(0.9),
    span = high - low;
  if (span < 35 || high < 150) return 1;
  const gain = Math.max(1, Math.min(1.15, 190 / span));
  for (let i = 0; i < d.length; i += 4) {
    if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40) continue;
    const y = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
    const delta = (y - high) * (gain - 1);
    for (let c = 0; c < 3; c++) d[i + c] += delta;
  }
  return gain;
}
