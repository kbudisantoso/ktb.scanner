import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CaptureRearm,
  sampleFingerprintFromPixels,
} from '../../packages/scanner/src/capture-rearm.ts';
import { AutoCapture } from '../../packages/scanner/src/capture.ts';
import type { Quad } from '../../packages/scanner/src/types.ts';

const quad: Quad = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.1 },
  { x: 0.8, y: 0.9 },
  { x: 0.2, y: 0.9 },
];
const shifted = quad.map((point) => ({ ...point, x: point.x + 0.14 })) as Quad;
function pattern(seed = 0, brightness = 0, gain = 1, size = 32) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const value =
        50 +
        ((Math.floor((x * 8) / size) * 19 + Math.floor((y * 8) / size) * 37 + seed * 47) % 140);
      const index = (y * size + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = value * gain + brightness;
      data[index + 3] = 255;
    }
  return { width: size, height: size, data };
}
const original = sampleFingerprintFromPixels(pattern())!;
const other = sampleFingerprintFromPixels(pattern(1))!;
const third = sampleFingerprintFromPixels(pattern(2))!;

test('compact descriptors normalize global illumination and retain no source-pixel reference', () => {
  const image = pattern();
  const fingerprint = sampleFingerprintFromPixels(image)!;
  assert.equal(fingerprint.length, 64);
  assert.deepEqual(sampleFingerprintFromPixels(pattern(0, 0, 1, 64)), fingerprint);
  for (const changed of [pattern(0, 30), pattern(0, 10, 1.1)]) {
    const light = sampleFingerprintFromPixels(changed)!;
    assert(light.every((value, i) => Math.abs(value - fingerprint[i]) < 0.025));
  }
  image.data.fill(0);
  assert.deepEqual(fingerprint, original);
});

test('an unchanged sheet stays locked through lighting changes and detector-only jumps or losses', () => {
  const rearm = new CaptureRearm();
  rearm.lock(original, quad);
  const light = sampleFingerprintFromPixels(pattern(0, 25))!;
  for (let time = 0; time <= 3000; time += 100)
    assert.equal(
      rearm.observe(time % 200 ? original : light, time % 300 ? shifted : null, time, time),
      false,
    );
  assert.equal(rearm.blocked, true);
});

test('only a persistent consistent content change releases once and starts a fresh full capture window', () => {
  const rearm = new CaptureRearm();
  const capture = new AutoCapture('auto', 1000);
  assert.equal(capture.claimManual(), true);
  rearm.lock(original, quad);
  for (let time = 0; time < 600; time += 100)
    assert.equal(rearm.observe(other, quad, time, time), false);
  assert.equal(rearm.observe(other, quad, 600, 600), true);
  assert.equal(rearm.blocked, false);
  capture.rearm();
  for (let time = 600; time < 1600; time += 100) {
    assert.equal(rearm.observe(other, quad, time, time), false);
    assert.equal(
      capture.update({ timestamp: time, corners: quad, sharpness: 'sharp' }, time).capture,
      false,
    );
  }
  assert.equal(
    capture.update({ timestamp: 1600, corners: quad, sharpness: 'sharp' }, 1600).capture,
    true,
  );
});

test('changing noise, transient content and observation gaps cannot accumulate a release', () => {
  const rearm = new CaptureRearm();
  rearm.lock(original, quad);
  for (let time = 0; time <= 2000; time += 100)
    assert.equal(rearm.observe(time % 200 ? other : third, quad, time, time), false);
  assert.equal(rearm.observe(original, quad, 2100, 2100), false);
  assert.equal(rearm.observe(other, quad, 2200, 2200), false);
  assert.equal(rearm.observe(original, quad, 2500, 2500), false);
  rearm.lock(original, quad);
  for (const timestamp of [0, 500, 600, 700, 800, 900, 1000])
    assert.equal(rearm.observe(other, quad, timestamp, timestamp), false);
  for (const timestamp of [1000, 800, NaN, Infinity, -1])
    assert.equal(rearm.observe(other, quad, timestamp, 1000), false);
  for (let timestamp = 1100; timestamp < 1700; timestamp += 100)
    assert.equal(rearm.observe(other, quad, timestamp, timestamp), false);
  assert.equal(rearm.observe(other, quad, 1700, 1700), true);
});

test('a delayed final frame cannot release a locked scene and valid evidence still accepts the freshness boundary', () => {
  const rearm = new CaptureRearm();
  for (const receivedNow of [1100, 599, NaN]) {
    rearm.lock(original, quad);
    for (let timestamp = 0; timestamp <= 500; timestamp += 100)
      assert.equal(rearm.observe(other, quad, timestamp, timestamp), false);
    assert.equal(rearm.observe(other, quad, 600, receivedNow), false);
    assert.equal(rearm.blocked, true);
    for (let timestamp = 1200; timestamp <= 2400; timestamp += 100)
      assert.equal(rearm.observe(original, quad, timestamp, timestamp), false);
    assert.equal(rearm.blocked, true);
  }
  rearm.lock(original, quad);
  for (let timestamp = 0; timestamp < 600; timestamp += 100)
    assert.equal(rearm.observe(other, quad, timestamp, timestamp + 400), false);
  assert.equal(rearm.observe(other, quad, 600, 1000), true);
});

test('unstructured or noisy blank scenes provide no content evidence while persistent raw geometry may rearm', () => {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 170 + ((x + y) % 2 ? 5 : -5);
      data[i + 3] = 255;
    }
  assert.equal(sampleFingerprintFromPixels({ width: 32, height: 32, data }), null);
  const rearm = new CaptureRearm();
  rearm.lock(null, quad);
  for (let time = 0; time <= 2000; time += 100)
    assert.equal(rearm.observe(null, time % 200 ? quad : null, time, time), false);
  for (let time = 2100; time < 2700; time += 100)
    assert.equal(rearm.observe(null, shifted, time, time), false);
  assert.equal(rearm.observe(null, shifted, 2700, 2700), true);
  const capture = new AutoCapture('auto', 100);
  for (let time = 2700; time <= 3200; time += 100)
    assert.equal(
      capture.update({ timestamp: time, corners: shifted, sharpness: 'unknown' }, time).capture,
      false,
    );
});

test('a genuinely lost scene needs persistent changed visual evidence rather than a brief detector dropout', () => {
  const rearm = new CaptureRearm();
  rearm.lock(original, quad);
  for (let time = 0; time <= 500; time += 100)
    assert.equal(rearm.observe(null, null, time, time), false);
  assert.equal(rearm.observe(original, quad, 600, 600), false);
  for (let time = 700; time < 1700; time += 100)
    assert.equal(rearm.observe(null, null, time, time), false);
  assert.equal(rearm.observe(null, null, 1700, 1700), true);
});

test('locking snapshots inputs and clears older pending changes; reset forgets a completed scene', () => {
  const rearm = new CaptureRearm();
  const mutable = original.slice();
  const mutableQuad = structuredClone(quad);
  rearm.lock(mutable, mutableQuad);
  mutable.fill(99);
  mutableQuad[0].x = 0;
  for (let time = 0; time <= 1000; time += 100)
    assert.equal(rearm.observe(original, quad, time, time), false);
  for (let time = 1100; time <= 1600; time += 100)
    assert.equal(rearm.observe(other, quad, time, time), false);
  rearm.lock(other, quad);
  for (let time = 1700; time <= 3000; time += 100)
    assert.equal(rearm.observe(other, quad, time, time), false);
  rearm.reset();
  assert.equal(rearm.blocked, false);
  assert.equal(rearm.observe(third, shifted, 3100, 3100), false);
});

test('known lighting interruptions keep the capture locked and a first contour is not an absent baseline', () => {
  const rearm = new CaptureRearm();
  rearm.lock(original, quad);
  for (let timestamp = 0; timestamp <= 500; timestamp += 100)
    assert.equal(rearm.observe(other, quad, timestamp, timestamp), false);
  rearm.interrupt();
  assert.equal(rearm.blocked, true);
  assert.equal(rearm.observe(other, quad, 600, 600), false);
  // The caller replaces the baseline with the first fresh frame after its known torch change.
  rearm.lock(other, quad);
  for (let timestamp = 700; timestamp <= 2300; timestamp += 100)
    assert.equal(rearm.observe(other, quad, timestamp, timestamp), false);

  rearm.lock(null, null);
  for (let timestamp = 0; timestamp <= 1500; timestamp += 100)
    assert.equal(rearm.observe(null, quad, timestamp, timestamp), false);
  for (let timestamp = 1600; timestamp <= 3000; timestamp += 100)
    assert.equal(rearm.observe(original, quad, timestamp, timestamp), false);
  assert.equal(rearm.blocked, true);
});
