/** Seeded grain, a shallow fold, isolated gray specks, faint strokes and true punctuation. */
export function noisyDocument() {
  const width = 480,
    height = 640,
    data = new Uint8ClampedArray(width * height * 4);
  let seed = 7319;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const bg = 160 + (75 * x) / (width - 1),
        noise = (seed % 23) - 11;
      let value = bg + noise;
      if (y >= 190 && y < 194) value = bg - 8;
      if (y >= 240 && y < 244) value = 20;
      if (x >= 250 && x < 252 && y >= 300 && y < 440) value = bg - 8;
      if (y >= 480 && y < 520) value -= 10 * Math.sin(((y - 480) / 40) * Math.PI);
      if (x % 53 === 0 && y % 47 === 0) value = bg - 35;
      if (x >= 80 && x < 82 && y >= 360 && y < 362) value = 30;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}
