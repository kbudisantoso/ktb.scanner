import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdjustments,
  autoPaperContrast,
  validRecipe,
} from '../../packages/scanner/src/adjustments.ts';
import {
  correctLens,
  estimateLens,
  lensMapping,
  undistortPoint,
} from '../../packages/scanner/src/lens.ts';
import type { Quad } from '../../packages/scanner/src/types.ts';
import { assessQuality } from '../../packages/scanner/src/quality.ts';
import { FULL_QUAD } from '../../packages/scanner/src/geometry.ts';
import { grayscale, blackAndWhite } from '../../packages/scanner/src/color-profiles.ts';

function curvedPaper(k: number) {
  const width = 640,
    height = 800,
    data = new Uint8ClampedArray(width * height * 4);
  const left = 95,
    right = 545,
    top = 95,
    bottom = 705;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = undistortPoint({ x, y }, { width, height }, k);
      const value = p.x >= left && p.x <= right && p.y >= top && p.y <= bottom ? 240 : 45;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  const corners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ].map((p) => {
    const cx = (width - 1) / 2,
      cy = (height - 1) / 2,
      s = Math.max(cx, cy),
      r2 = ((p.x - cx) ** 2 + (p.y - cy) ** 2) / s ** 2;
    const f = 2 / (1 + Math.sqrt(1 - 4 * k * r2));
    return { x: (cx + (p.x - cx) * f) / (width - 1), y: (cy + (p.y - cy) * f) / (height - 1) };
  }) as Quad;
  return { width, height, data, corners };
}
test('radial auto estimate recovers both curvature signs using held-out edge evidence', () => {
  for (const k of [-0.09, 0.08]) {
    const im = curvedPaper(k),
      result = estimateLens(im, im.corners);
    assert.equal(result.status, 'applied', JSON.stringify(result));
    assert(Math.abs(result.strength - k) < 0.02, JSON.stringify(result));
    assert(result.afterPx! < result.beforePx! * 0.5);
  }
});
test('straight, blank and inconsistent borders cannot invent automatic lens distortion', () => {
  const straight = curvedPaper(0);
  assert.equal(estimateLens(straight, straight.corners).status, 'already-straight');
  straight.data.fill(255);
  assert.equal(estimateLens(straight, straight.corners).status, 'insufficient-evidence');
  const mixed = curvedPaper(-0.09),
    other = curvedPaper(0.09);
  for (let y = 0; y < mixed.height / 2; y++)
    mixed.data.set(
      other.data.slice(y * mixed.width * 4, (y + 1) * mixed.width * 4),
      y * mixed.width * 4,
    );
  assert.notEqual(estimateLens(mixed, mixed.corners).status, 'applied');
});
test('lens inverse mapping roundtrips and preserves selected corners inside expanded bounds', () => {
  const size = { width: 640, height: 800 };
  for (const k of [-0.18, 0, 0.18]) {
    const map = lensMapping(size, k);
    for (const p of [
      { x: 0, y: 0 },
      { x: 639, y: 799 },
      { x: 95, y: 705 },
      { x: 320, y: 400 },
    ]) {
      const q = map.forward(p),
        back = map.backward(q);
      assert(q.x >= -1e-6 && q.y >= -1e-6 && q.x <= 639.00001 && q.y <= 799.00001);
      assert(Math.hypot(p.x - back.x, p.y - back.y) < 1e-6);
    }
  }
  const im = curvedPaper(-0.09),
    before = im.data.slice(),
    out = correctLens(im, im.corners, -0.09);
  assert.deepEqual(im.data, before);
  assert.notDeepEqual(out.data, before);
  assert.strictEqual(correctLens(im, im.corners, 0).data, im.data);
});
test('manual brightness and contrast have neutral no-op, measured effects and recipe validation', () => {
  const im = { width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4) };
  for (let i = 0; i < im.data.length; i += 4)
    im.data.set([80 + (i % 80), 90 + (i % 80), 100 + (i % 80), 255], i);
  const original = im.data.slice();
  applyAdjustments(im, { brightness: 0, contrast: 0, sharpness: 0 });
  assert.deepEqual(im.data, original);
  applyAdjustments(im, { brightness: 25, contrast: 0, sharpness: 0 });
  assert.equal(im.data[0], 96);
  assert.equal(im.data[2] - im.data[0], 20);
  im.data.set(original);
  applyAdjustments(im, { brightness: 0, contrast: 50, sharpness: 0 });
  assert(im.data[0] < original[0]);
  assert.equal(im.data[3], 255);
  for (const recipe of [
    { version: 1, enhancement: 'paper', dewarp: 'manual', lensStrength: NaN },
    { version: 1, enhancement: 'none', dewarp: 'manual', lensStrength: 1 },
    {
      version: 1,
      enhancement: 'document',
      dewarp: 'off',
      adjustments: { brightness: 0, contrast: Infinity, sharpness: 0 },
    },
  ])
    assert.equal(validRecipe(recipe as never), false);
});
test('automatic paper contrast protects vivid marks and does not amplify a blank page', () => {
  const im = { width: 100, height: 100, data: new Uint8ClampedArray(40000).fill(240) };
  for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255;
  const before = im.data.slice();
  assert.equal(autoPaperContrast(im), 1);
  assert.deepEqual(im.data, before);
  for (let p = 0; p < 3000; p++) im.data.set([120, 120, 120, 255], p * 4);
  im.data.set([180, 40, 80, 255], 0);
  assert(autoPaperContrast(im) > 1);
  assert.deepEqual(im.data.slice(0, 4), new Uint8ClampedArray([180, 40, 80, 255]));
});
test('noisy horizontal, vertical and diagonal motion blur cannot pass from Laplacian noise alone', () => {
  const width = 400,
    height = 500,
    original = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 20; y < height - 20; y++)
    for (let x = 20; x < width - 20; x++)
      if ((x % 18 < 3 && y % 23 < 15) || (y % 23 < 3 && x % 18 < 12)) {
        const i = (y * width + x) * 4;
        original[i] = original[i + 1] = original[i + 2] = 30;
      }
  assert.equal(assessQuality({ data: original, width, height }, FULL_QUAD, 1).sharpness, 'sharp');
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const data = original.slice();
    for (let y = 15; y < height - 15; y++)
      for (let x = 15; x < width - 15; x++) {
        let sum = 0;
        for (let j = -7; j <= 7; j++) sum += original[((y + dy * j) * width + x + dx * j) * 4];
        const i = (y * width + x) * 4,
          value = sum / 15 + ((x * 17 + y * 31) % 7) - 3;
        data[i] = data[i + 1] = data[i + 2] = value;
      }
    const result = assessQuality({ data, width, height }, FULL_QUAD, 1);
    assert.equal(result.sharpness, 'blur', JSON.stringify({ dx, dy, result }));
  }
});
test('grayscale keeps tonal detail and alpha instead of thresholding colors', () => {
  const image = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([180, 40, 80, 255, 40, 130, 200, 128, 240, 240, 240, 255]),
  };
  grayscale(image);
  assert.deepEqual([...image.data], [73, 73, 73, 255, 116, 116, 116, 128, 240, 240, 240, 255]);
});
test('soft monochrome removes a smooth shadow and retains pale strokes as gray', () => {
  const width = 360,
    height = 500,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const background = 115 + (115 * x) / (width - 1);
      const value =
        y >= 220 && y <= 222
          ? background - 8
          : y >= 270 && y < 274
            ? 20
            : background + ((x * 11 + y * 7) % 5) - 2;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  blackAndWhite({ width, height, data });
  let black = 0,
    white = 0;
  for (let x = 20; x < width - 20; x++) {
    if (data[(221 * width + x) * 4] < 252 && data[(221 * width + x) * 4] > 60) black++;
    if (data[(150 * width + x) * 4] === 255) white++;
  }
  assert(black > 300, `pale strokes: ${black}`);
  assert(white > 310, `paper: ${white}`);
  for (let i = 0; i < data.length; i += 4) {
    assert(data[i] >= 0 && data[i] <= 255);
    assert.equal(data[i], data[i + 1]);
    assert.equal(data[i], data[i + 2]);
    assert.equal(data[i + 3], 255);
  }
});
