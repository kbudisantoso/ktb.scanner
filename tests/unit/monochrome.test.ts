import test from 'node:test';
import assert from 'node:assert/strict';
import { blackAndWhite } from '../../packages/scanner/src/color-profiles.ts';
import { noisyDocument } from '../fixtures/noisy-document.ts';
test('monochrome suppresses grain and gray impulses without turning folds into black lines', () => {
  const image = noisyDocument();
  blackAndWhite(image);
  let dark = 0,
    n = 0,
    foldDark = 0;
  for (let y = 20; y < 170; y++)
    for (let x = 20; x < 460; x++) {
      n++;
      if (image.data[(y * image.width + x) * 4] < 100) dark++;
    }
  for (let y = 485; y < 515; y++)
    for (let x = 20; x < 460; x++) if (image.data[(y * image.width + x) * 4] < 100) foldDark++;
  assert(dark / n < 0.001, `grain ${dark}/${n}`);
  assert(foldDark < 5, `fold ${foldDark}`);
  assert(image.data[(94 * image.width + 106) * 4] > 245);
});
test('monochrome keeps weak thin strokes, black text, punctuation and antialiased gray edges', () => {
  const image = noisyDocument();
  blackAndWhite(image);
  let weak = 0,
    vertical = 0;
  for (let x = 20; x < 460; x++)
    if (
      image.data[(191 * image.width + x) * 4] < 252 &&
      image.data[(191 * image.width + x) * 4] > 60
    )
      weak++;
  for (let y = 310; y < 430; y++) if (image.data[(y * image.width + 250) * 4] < 252) vertical++;
  assert(weak > 400, `weak ${weak}`);
  assert(vertical > 110, `vertical ${vertical}`);
  assert(image.data[(241 * image.width + 200) * 4] < 30);
  assert(image.data[(360 * image.width + 80) * 4] < 30);
  assert(new Set(image.data).size > 16);
  for (let p = 0; p < image.data.length; p += 4) {
    assert.equal(image.data[p], image.data[p + 1]);
    assert.equal(image.data[p], image.data[p + 2]);
    assert.equal(image.data[p + 3], 255);
  }
});
test('monochrome preserves alpha and handles flat, single-row and single-column images', () => {
  for (const [width, height] of [
    [1, 1],
    [1, 80],
    [80, 1],
    [90, 130],
  ]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([190, 190, 190, i % 8 ? 128 : 255], i);
    const before = data.slice();
    blackAndWhite({ width, height, data });
    for (let i = 0; i < data.length; i += 4) {
      assert.equal(data[i], 255);
      assert.equal(data[i + 3], before[i + 3]);
    }
  }
});

test('monochrome does not add gray halos to flat paper beside printed paragraphs', () => {
  const width = 300,
    height = 300,
    data = new Uint8ClampedArray(width * height * 4),
    ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const printed = x >= 60 && x < 240 && y >= 80 && y < 160 && y % 16 < 5;
      ink[y * width + x] = Number(printed);
      const v = printed ? 40 : 230;
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  blackAndWhite({ width, height, data });
  for (let p = 0; p < ink.length; p++)
    if (!ink[p]) assert(data[p * 4] >= 250, `paper at ${p}: ${data[p * 4]}`);
});

test('monochrome preserves a coherent faint one-pixel stroke without blackening it', () => {
  const width = 64,
    height = 64,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = x === 32 && y >= 8 && y < 56 ? 212 : 220;
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  blackAndWhite({ width, height, data });
  for (let y = 12; y < 52; y++) {
    assert(data[(y * width + 32) * 4] < 252 && data[(y * width + 32) * 4] > 150);
    assert(data[(y * width + 30) * 4] >= 250);
  }
});
