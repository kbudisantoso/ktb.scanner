import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePaperLighting } from '../../packages/scanner/src/paper-cleanup.ts';
import { autoPaperContrast } from '../../packages/scanner/src/adjustments.ts';
import { grayscale } from '../../packages/scanner/src/color-profiles.ts';
import { whitePaperFixture } from '../fixtures/white-paper.ts';

test('color and gray whiten a cast shadow to near-white while retaining weak ink and colored marks', () => {
  for (const gray of [false, true]) {
    const im = whitePaperFixture(),
      before = im.data.slice();
    assert.equal(normalizePaperLighting(im, { whiten: true }).applied, true);
    autoPaperContrast(im);
    if (gray) grayscale(im);
    const pixel = (x: number, y: number) =>
      Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 3));
    for (const x of [0, 20, 40, 320, 600, 639]) {
      const paper = pixel(x, 219),
        weak = pixel(x, 221),
        dark = pixel(x, 262);
      assert(Math.min(...paper) >= 250, `${gray}: ${x}: ${paper}`);
      assert(
        paper.every((v, c) => v - weak[c] >= 7),
        `${paper} vs ${weak}`,
      );
      assert(Math.max(...dark) < 40);
    }
    const marker = (160 * im.width + 320) * 4;
    if (!gray)
      assert.deepEqual(im.data.slice(marker, marker + 4), before.slice(marker, marker + 4));
    else assert.equal(pixel(320, 160)[0], pixel(320, 160)[2]);
    for (let i = 3; i < im.data.length; i += 4) assert.equal(im.data[i], before[i]);
  }
});
test('strong whitening keeps pale colored ink distinguishable from neutralized paper', () => {
  const width = 128,
    height = 128,
    data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([180, 175, 165, 255], i);
  for (let x = 10; x < 118; x++)
    for (let y = 60; y < 64; y++) data.set([170, 165, 165, 255], (y * width + x) * 4);
  normalizePaperLighting({ width, height, data }, { whiten: true });
  const paper = data.slice((50 * width + 60) * 4, (50 * width + 60) * 4 + 3),
    ink = data.slice((61 * width + 60) * 4, (61 * width + 60) * 4 + 3);
  assert(Math.min(...paper) >= 250);
  assert(paper[0] - ink[0] >= 10);
  assert(ink[2] - ink[0] >= 10);
});
test('white-paper mode preserves exclusions, transparency and white input, including narrow images', () => {
  for (const rgb of [
    [70, 70, 70],
    [60, 130, 200],
    [255, 255, 255],
  ]) {
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
    const before = data.slice();
    assert.equal(
      normalizePaperLighting({ width: 128, height: 128, data }, { whiten: true }).applied,
      false,
    );
    assert.deepEqual(data, before);
  }
  for (const [width, height] of [
    [1, 80],
    [80, 1],
    [1, 1],
  ]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([160, 160, 160, 255], i);
    if (width * height > 1) data.set([100, 90, 80, 128], 4);
    normalizePaperLighting({ width, height, data }, { whiten: true });
    assert(data[0] >= 250);
    if (width * height > 1) assert.deepEqual(Array.from(data.slice(4, 8)), [100, 90, 80, 128]);
  }
});
