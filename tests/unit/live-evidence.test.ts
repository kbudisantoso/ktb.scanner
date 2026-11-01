import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoCapture } from '../../packages/scanner/src/capture.ts';
import { LiveTracker } from '../../packages/scanner/src/tracking.ts';
import type { LiveDetection, Quad } from '../../packages/scanner/src/types.ts';

const quad: Quad = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.1 },
  { x: 0.8, y: 0.9 },
  { x: 0.2, y: 0.9 },
];
const frame = (
  timestamp: number,
  sharpness: LiveDetection['sharpness'] = 'sharp',
  corners: Quad | null = quad,
): LiveDetection => ({ timestamp, sharpness, corners });

test('fresh sparse endpoints earn capped credit without the former 401ms deadzone', () => {
  for (const [period, expected] of [
    [125, 1000],
    [400, 1200],
    [401, 1203],
    [600, 1800],
    [800, 2400],
  ]) {
    const gate = new AutoCapture();
    let captureAt: number | undefined;
    for (let time = 0; time <= 5000; time += period) {
      const status = gate.update(frame(time), time + 30);
      if (status.capture) {
        captureAt = time;
        break;
      }
    }
    assert.equal(captureAt, expected, `${period}ms cadence`);
  }
  const gate = new AutoCapture();
  for (let time = 0; time <= 5000; time += 801) {
    assert.equal(gate.update(frame(time), time + 30).progress, 0);
  }
});

test('sparse intervals count at most400ms and short sparse windows need four inliers', () => {
  const gate = new AutoCapture();
  assert.equal(gate.update(frame(0), 0).progress, 0);
  assert.equal(gate.update(frame(600), 600).progress, 0.4);
  assert.equal(gate.update(frame(1200), 1200).progress, 0.8);
  assert.equal(gate.update(frame(1800), 1800).capture, true);
  assert.equal(gate.update(frame(2400), 2400).capture, false);
  const short = new AutoCapture('auto', 100);
  short.update(frame(0), 0);
  assert.equal(short.update(frame(600), 600).capture, false);
  assert(short.poll(650).progress < 1);
  assert.equal(short.update(frame(1200), 1200).capture, false);
  assert.equal(short.update(frame(1800), 1800).capture, true);
  const fast = new AutoCapture('auto', 100);
  fast.update(frame(0), 0);
  assert.equal(fast.update(frame(100), 100).capture, true);
});

test('actually stale sparse results, repeated timestamps and uncertain intervals never gain credit', () => {
  for (const kind of ['stale', 'unknown', 'blur', 'missing', 'duplicate'] as const) {
    const gate = new AutoCapture();
    for (let time = 0; time <= 6000; time += 600) {
      const detection = frame(
        kind === 'duplicate' ? 0 : time,
        kind === 'unknown' || kind === 'blur' ? kind : 'sharp',
        kind === 'missing' ? null : quad,
      );
      assert.equal(gate.update(detection, time + (kind === 'stale' ? 401 : 0)).progress, 0, kind);
    }
  }
  const gate = new AutoCapture();
  for (let time = 0; time <= 375; time += 125) gate.update(frame(time), time);
  assert.equal(gate.update(frame(500, 'unknown'), 500).progress, 0.375);
  assert.equal(gate.update(frame(625), 625).progress, 0.375);
  assert.equal(gate.update(frame(750), 750).progress, 0.5);
});

test('alternating outliers and cumulative drift cannot hide behind sparse endpoint tolerance', () => {
  for (const period of [125, 600]) {
    const tracker = new LiveTracker(),
      gate = new AutoCapture();
    for (let time = 0, index = 0; time <= 6000; time += period, index++) {
      const shifted = quad.map((point) => ({
        ...point,
        x: point.x + (index % 2 ? 0.06 : 0),
      })) as Quad;
      assert.equal(
        gate.update(tracker.update(frame(time, 'sharp', shifted), time), time).capture,
        false,
      );
    }
  }
  const gate = new AutoCapture();
  for (let time = 0; time <= 3500; time += 125) {
    const shifted = quad.map((point) => ({ ...point, x: point.x + time / 16000 })) as Quad;
    assert.equal(gate.update(frame(time, 'sharp', shifted), time).capture, false);
  }
  const generation = gate.generation;
  gate.reset();
  assert.equal(gate.update(frame(4000), 4000, generation).capture, false);
  gate.setMode('manual');
  for (let time = 4200; time <= 8000; time += 600)
    assert.equal(gate.update(frame(time), time).capture, false);
});
