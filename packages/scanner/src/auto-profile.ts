import type { AutoOptimization, Size } from './types.ts';

/** Conservative pixel heuristic, not semantic document recognition. Never removes color. */
export function chooseAutoProfile(
  image: Size & { data: Uint8ClampedArray },
): Pick<AutoOptimization, 'profile' | 'reason' | 'neutralFraction' | 'flatFraction'> {
  const { width, height, data } = image,
    step = Math.max(1, Math.ceil(Math.max(width, height) / 256));
  const hist = new Uint32Array(256);
  let samples = 0,
    neutral = 0,
    flat = 0;
  const luminance = (i: number) => data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 250) continue;
      samples++;
      const low = Math.min(data[i], data[i + 1], data[i + 2]),
        high = Math.max(data[i], data[i + 1], data[i + 2]);
      if (high - low > 24 || low < 90) continue;
      neutral++;
      const value = luminance(i);
      hist[Math.round(value)]++;
      const right = (y * width + Math.min(width - 1, x + 1)) * 4,
        down = (Math.min(height - 1, y + 1) * width + x) * 4;
      if (Math.abs(value - luminance(right)) + Math.abs(value - luminance(down)) <= 18) flat++;
    }
  let sum = 0,
    reference = 0;
  for (let value = 0; value < 256; value++) {
    sum += hist[value];
    if (neutral && sum >= neutral * 0.85) {
      reference = value;
      break;
    }
  }
  const neutralFraction = neutral / Math.max(1, samples),
    flatFraction = flat / Math.max(1, samples);
  const paper = neutralFraction >= 0.55 && flatFraction >= 0.45 && reference >= 140;
  return {
    profile: paper ? 'color' : 'photo',
    reason: paper ? 'paper-background' : 'preserve-photo',
    neutralFraction,
    flatFraction,
  };
}
