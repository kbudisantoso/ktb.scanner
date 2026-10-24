import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAutoProfile } from '../../packages/scanner/src/auto-profile.ts';

function image(pixel: (x: number, y: number) => number[], width = 180, height = 240) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}
test('auto recognizes shaded paper with text and colored marks without selecting a destructive filter', () => {
  const paper = image((x, y) => {
    if (x > 135 && y > 180) return [180, 30, 55, 255];
    if (y % 24 < 3 && x > 20 && x < 130) return [60, 60, 60, 255];
    const value = 135 + x / 2;
    return [value, value, value, 255];
  });
  const result = chooseAutoProfile(paper);
  assert.equal(result.profile, 'color');
  assert.equal(result.reason, 'paper-background');
  // A quarter turn must not change the selected filter.
  const rotated = image(
    (x, y) => {
      const i = ((paper.height - 1 - x) * paper.width + y) * 4;
      return Array.from(paper.data.slice(i, i + 4));
    },
    paper.height,
    paper.width,
  );
  assert.equal(chooseAutoProfile(rotated).profile, 'color');
});
test('auto preserves colorful, textured, dark and transparent images as photos', () => {
  for (const source of [
    image((x, y) => [30 + (x % 100), 100 + (y % 100), 30, 255]),
    image((x, y) => {
      const v = (x + y) % 2 ? 110 : 230;
      return [v, v, v, 255];
    }),
    image(() => [80, 80, 80, 255]),
    image(() => [255, 255, 255, 0]),
    image(() => [0, 0, 0, 0], 0, 0),
  ]) {
    assert.equal(chooseAutoProfile(source).profile, 'photo');
    assert.equal(chooseAutoProfile(source).reason, 'preserve-photo');
  }
});
