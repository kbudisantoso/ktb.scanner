/** Known paper, weak ink, strong ink and chromatic markers under a sloping warm shadow. */
export function whitePaperFixture() {
  const width = 640,
    height = 480,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const background = 110 + (115 * x) / (width - 1) + (12 * y) / (height - 1);
      const value = y >= 220 && y < 224 ? background - 8 : y >= 260 && y < 265 ? 15 : background;
      data.set([value, value - 5, value - 12, 255], (y * width + x) * 4);
      if (x >= 300 && x < 340 && y >= 140 && y < 180)
        data.set([180, 40, 80, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}
