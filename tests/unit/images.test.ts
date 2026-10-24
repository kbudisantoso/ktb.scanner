import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageHeader } from '../../packages/scanner/src/image-header.ts';
import {
  assessQuality,
  enhanceDocument,
  sharpenDocument,
} from '../../packages/scanner/src/quality.ts';
import { refineEdges } from '../../packages/scanner/src/refine.ts';
import { FULL_QUAD } from '../../packages/scanner/src/geometry.ts';
import { normalizePaperLighting } from '../../packages/scanner/src/paper-cleanup.ts';
import { recoverTopPaperEdge } from '../../packages/scanner/src/top-edge.ts';
import type { Quad } from '../../packages/scanner/src/types.ts';
function image(width = 240, height = 320) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return { data, width, height };
}
test('blank white paper has unknown sharpness and no false overexposure claim', () => {
  const result = assessQuality(image(), FULL_QUAD, 2);
  assert.equal(result.sharpness, 'unknown');
  assert(!result.reasons.includes('exposure'));
  assert.equal(result.revision, 2);
});
test('paper cleanup reduces a smooth shadow while retaining pale strokes and colored marks', () => {
  const im = image(640, 480);
  for (let y = 0; y < im.height; y++)
    for (let x = 0; x < im.width; x++) {
      const bg = 140 + (95 * x) / (im.width - 1);
      const i = (y * im.width + x) * 4;
      const value = y >= 220 && y < 224 ? bg - 8 : y >= 260 && y < 265 ? 15 : bg;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = value;
    }
  const colored = (160 * im.width + 320) * 4;
  im.data.set([180, 40, 80, 255], colored);
  const before = im.data.slice();
  const result = normalizePaperLighting(im);
  assert(result.applied);
  const pixel = (data: Uint8ClampedArray, x: number, y: number) => data[(y * im.width + x) * 4];
  const oldSpread = pixel(before, 620, 100) - pixel(before, 20, 100);
  const newSpread = pixel(im.data, 620, 100) - pixel(im.data, 20, 100);
  assert(newSpread < oldSpread * 0.7, `${oldSpread} -> ${newSpread}`);
  for (const x of [40, 320, 600]) {
    assert(pixel(im.data, x, 100) > pixel(before, x, 100));
    assert(pixel(im.data, x, 219) - pixel(im.data, x, 221) >= 7);
    assert(pixel(im.data, x, 262) < 30);
  }
  assert.deepEqual(im.data.slice(colored, colored + 4), before.slice(colored, colored + 4));
  for (let i = 3; i < im.data.length; i += 4) assert.equal(im.data[i], before[i]);
});
test('paper cleanup leaves colored paper and unjudgeably dark images unchanged', () => {
  for (const rgb of [
    [70, 70, 70],
    [60, 130, 200],
  ]) {
    const im = image(120, 160);
    for (let i = 0; i < im.data.length; i += 4) im.data.set([...rgb, 255], i);
    const before = im.data.slice();
    assert.equal(normalizePaperLighting(im).applied, false);
    assert.deepEqual(im.data, before);
  }
});
test('paper cleanup does not turn small neutral color variations into brightness patches', () => {
  const im = image(160, 160);
  for (let y = 0; y < im.height; y++)
    for (let x = 0; x < im.width; x++) {
      const cast = Math.floor(x / 4) % 2 ? 20 : 28;
      const red = Math.round(150 - cast * 0.0722);
      im.data.set([red, red, red + cast, 255], (y * im.width + x) * 4);
    }
  assert(normalizePaperLighting(im).applied);
  const luminance = (i: number) =>
    im.data[i] * 0.2126 + im.data[i + 1] * 0.7152 + im.data[i + 2] * 0.0722;
  assert(Math.abs(luminance(0) - luminance(16)) <= 2);
});

test('coherent light outer border recovers a clipped top corner without shifting other edges', () => {
  const im = image(400, 600);
  const truth = [
    { x: 60, y: 72 },
    { x: 340, y: 96 },
    { x: 328, y: 540 },
    { x: 48, y: 552 },
  ];
  for (let y = 0; y < im.height; y++)
    for (let x = 0; x < im.width; x++) {
      const inside = truth.every((a, i) => {
        const b = truth[(i + 1) % 4];
        return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
      });
      let value = inside ? 245 : 185 + ((x * 7 + y * 11) % 17);
      if (inside && x >= 85 && x <= 315 && y >= 115 && y < 180) value = 70;
      const i = (y * im.width + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = value;
    }
  const input = [
    { x: 59.3 / 399, y: 100 / 599 },
    ...truth.slice(1).map((p) => ({ x: p.x / 399, y: p.y / 599 })),
  ] as Quad;
  const result = recoverTopPaperEdge(im, input);
  assert(result.applied, JSON.stringify(result));
  assert(Math.abs(result.corners[0].y * 599 - truth[0].y) < 6);
  assert(Math.abs(result.corners[1].y * 599 - truth[1].y) < 6);
  assert.deepEqual(result.corners.slice(2), input.slice(2));
  const confirmed = truth.map((p) => ({ x: p.x / 399, y: p.y / 599 })) as Quad;
  assert.equal(recoverTopPaperEdge(im, confirmed).applied, false);
});
test('unstructured images cannot acquire an invented top edge', () => {
  const input: Quad = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];
  const result = recoverTopPaperEdge(image(), input);
  assert.equal(result.applied, false);
  assert.deepEqual(result.corners, input);
});
test('sharp distributed content provides positive evidence', () => {
  const im = image();
  for (let y = 10; y < im.height - 10; y++)
    for (let x = 10; x < im.width - 10; x++)
      if (y % 16 < 3 && x % 9 < 6) {
        const i = (y * im.width + x) * 4;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = 30;
      }
  assert.equal(assessQuality(im, FULL_QUAD, 1).sharpness, 'sharp');
});
test('smooth high-contrast waves do not count as sharp', () => {
  const im = image();
  for (let y = 0; y < im.height; y++)
    for (let x = 0; x < im.width; x++) {
      const value = 140 + 80 * Math.sin(x / 12);
      const i = (y * im.width + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = value;
    }
  assert.equal(assessQuality(im, FULL_QUAD, 1).sharpness, 'blur');
});
test('busy background does not make blank document sharp', () => {
  const im = image();
  const quad: Quad = [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.75, y: 0.75 },
    { x: 0.25, y: 0.75 },
  ];
  for (let y = 0; y < im.height; y++)
    for (let x = 0; x < im.width; x++)
      if (x < 50 || x > 190 || y < 60 || y > 260) {
        const i = (y * im.width + x) * 4;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = (x + y) % 2 ? 0 : 255;
      }
  assert.equal(assessQuality(im, quad, 1).sharpness, 'unknown');
});
test('enhancement preserves pale digits and colored pixels', () => {
  const im = image(8, 8);
  im.data[0] = im.data[1] = im.data[2] = 220;
  im.data[4] = 180;
  im.data[5] = 40;
  im.data[6] = 80;
  enhanceDocument(im);
  assert(im.data[0] < 230);
  assert(im.data[4] > im.data[5] + 100);
  assert.equal(im.data[3], 255);
});
test('detail boost increases soft stroke contrast without halos or color fringes', () => {
  const im = image(9, 7);
  const ramp = [210, 210, 190, 130, 100, 130, 190, 210, 210];
  for (let y = 0; y < im.height; y++)
    for (let x = 0; x < im.width; x++) {
      const i = (y * im.width + x) * 4;
      im.data[i] = ramp[x];
      im.data[i + 1] = ramp[x] - 20;
      im.data[i + 2] = ramp[x] - 30;
    }
  const before = im.data.slice();
  sharpenDocument(im);
  const stroke = (3 * im.width + 3) * 4;
  assert(im.data[stroke] < before[stroke]);
  for (let i = 0; i < im.data.length; i += 4) {
    assert(Math.abs(im.data[i] - before[i]) <= 8);
    assert.equal(im.data[i] - im.data[i + 1], 20);
    assert.equal(im.data[i] - im.data[i + 2], 30);
    assert.equal(im.data[i + 3], before[i + 3]);
    assert(im.data[i] >= 100 && im.data[i] <= 210);
  }
});
test('flat paper and low-amplitude texture do not acquire artificial detail', () => {
  const im = image(10, 10);
  for (let i = 0; i < im.data.length; i += 4)
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 220 + (i % 3);
  const before = im.data.slice();
  sharpenDocument(im);
  assert.deepEqual(im.data, before);
});
test('refinement recovers supported paper edges without a fixed inset', () => {
  const im = image(400, 500);
  for (let y = 0; y < 500; y++)
    for (let x = 0; x < 400; x++) {
      const value = x >= 60 && x < 340 && y >= 60 && y < 440 ? 245 : 50;
      const i = (y * 400 + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = value;
    }
  const initial: Quad = [
    { x: 61 / 399, y: 61 / 499 },
    { x: 338 / 399, y: 61 / 499 },
    { x: 338 / 399, y: 438 / 499 },
    { x: 61 / 399, y: 438 / 499 },
  ];
  const result = refineEdges(im, initial);
  assert(result.supported);
  assert(Math.abs(result.corners[0].x * 399 - 60) <= 2);
  assert(Math.abs(result.corners[2].x * 399 - 339) <= 2);
});
test('unsupported boundaries keep original suggestion and require review', () => {
  const q: Quad = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];
  const result = refineEdges(image(), q);
  assert.equal(result.supported, false);
  assert.deepEqual(result.corners, q);
});
test('PNG dimensions come from signature, not declared MIME', () => {
  const data = new Uint8Array(24);
  data.set([137, 80, 78, 71, 13, 10, 26, 10]);
  data.set([73, 72, 68, 82], 12);
  const v = new DataView(data.buffer);
  v.setUint32(16, 800);
  v.setUint32(20, 1200);
  assert.deepEqual(imageHeader(data), { mime: 'image/png', width: 800, height: 1200 });
});
test('JPEG markers skip metadata and inspect frame dimensions', () => {
  const data = new Uint8Array([
    255, 216, 255, 225, 0, 4, 0, 0, 255, 192, 0, 8, 8, 4, 176, 3, 32, 3, 255, 217,
  ]);
  assert.deepEqual(imageHeader(data), { mime: 'image/jpeg', width: 800, height: 1200 });
});
test('WebP VP8X dimensions are parsed before decoding', () => {
  const data = new Uint8Array(30);
  data.set(new TextEncoder().encode('RIFF'), 0);
  data.set(new TextEncoder().encode('WEBPVP8X'), 8);
  data[24] = 99;
  data[27] = 199;
  assert.deepEqual(imageHeader(data), { mime: 'image/webp', width: 100, height: 200 });
});
test('SVG, HTML, corrupt markers and truncated bytes are rejected', () => {
  for (const bytes of [
    new TextEncoder().encode('<svg/>'),
    new Uint8Array([255, 216, 255, 225, 0, 0]),
    new Uint8Array(),
  ])
    assert.throws(() => imageHeader(bytes));
});
