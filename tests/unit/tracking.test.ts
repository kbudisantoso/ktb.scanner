import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AutoCapture,
  AUTO_CAPTURE_STABILITY_PRESETS_MS,
  resolveAutoCaptureStabilityMs,
} from '../../packages/scanner/src/capture.ts';
import { LiveTracker } from '../../packages/scanner/src/tracking.ts';
import type { Quad, LiveDetection } from '../../packages/scanner/src/types.ts';

const quad: Quad = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.1 },
  { x: 0.8, y: 0.9 },
  { x: 0.2, y: 0.9 },
];
const shifted = (dx: number) => quad.map((p) => ({ ...p, x: p.x + dx })) as Quad;
const frame = (
  timestamp: number,
  corners: Quad | null = quad,
  sharpness: LiveDetection['sharpness'] = 'sharp',
): LiveDetection => ({ timestamp, corners, sharpness });

for (const duration of [...AUTO_CAPTURE_STABILITY_PRESETS_MS, 875]) {
  test(`${duration} ms stability uses measured time, never triggers early and claims once`, () => {
    const gate = new AutoCapture('auto', duration);
    assert.equal(gate.update(frame(0), 0).capture, false);
    for (let time = 100; time < duration - 1; time += 100)
      assert.equal(gate.update(frame(time), time).capture, false);
    const before = gate.update(frame(duration - 1), duration - 1);
    assert.equal(before.capture, false);
    assert.equal(before.progress, (duration - 1) / duration);
    assert.equal(gate.poll(duration + 50).capture, false);
    assert.equal(gate.poll(duration + 50).progress, before.progress);
    assert.deepEqual(gate.update(frame(duration), duration + 60), {
      progress: 1,
      capture: true,
    });
    assert.equal(gate.update(frame(duration + 100), duration + 100).capture, false);
    gate.rearm();
    assert.equal(gate.update(frame(duration + 200), duration + 200).progress, 0);
  });
}

test('stability defaults, per-open precedence and invalid values are explicit', () => {
  assert.equal(new AutoCapture().stabilityMs, 1000);
  assert.equal(resolveAutoCaptureStabilityMs(), 1000);
  assert.equal(resolveAutoCaptureStabilityMs(2000), 2000);
  assert.equal(resolveAutoCaptureStabilityMs(2000, 300), 300);
  assert.equal(resolveAutoCaptureStabilityMs(undefined, 875), 875);
  for (const invalid of [
    0,
    -100,
    99,
    100.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    null,
    '100',
  ]) {
    assert.throws(() => new AutoCapture('auto', invalid as number), { code: 'CONFIG_INVALID' });
    assert.throws(() => resolveAutoCaptureStabilityMs(1000, invalid as number), {
      code: 'CONFIG_INVALID',
    });
    assert.throws(() => resolveAutoCaptureStabilityMs(invalid as number, 1000), {
      code: 'CONFIG_INVALID',
    });
  }
});

test('short windows still reject unknown, stale and duplicate evidence and honor Manual', () => {
  const gate = new AutoCapture('auto', 100);
  gate.update(frame(0), 0);
  assert.equal(gate.update(frame(100, quad, 'unknown'), 100).capture, false);
  assert.equal(gate.update(frame(200), 700).capture, false);
  assert.equal(gate.update(frame(800), 800).progress, 0);
  assert.equal(gate.update(frame(800), 900).capture, false);
  assert.equal(gate.update(frame(1000), 1000).progress, 0);
  const generation = gate.generation;
  gate.setMode('manual');
  assert.equal(gate.update(frame(1100), 1100, generation).capture, false);
  assert.equal(gate.update(frame(1200), 1200).capture, false);
  assert.equal(gate.claimManual(), true);
  assert.equal(gate.claimManual(), false);
});

test('a single jumping contour is not displayed or passed off as fresh evidence', () => {
  const tracker = new LiveTracker();
  tracker.update(frame(0), 0);
  const before = tracker.view(0).corners;
  assert.equal(tracker.update(frame(125, shifted(0.12)), 125).corners, null);
  assert.deepEqual(tracker.view(125).corners, before);
  assert.equal(tracker.reason, 'unconfirmed-jump');
  assert.deepEqual(tracker.update(frame(250), 250).corners, quad);
});
test('a consistent new position is adopted after two observations', () => {
  const tracker = new LiveTracker();
  tracker.update(frame(0), 0);
  assert.equal(tracker.update(frame(125, shifted(0.1)), 125).corners, null);
  assert.deepEqual(tracker.update(frame(250, shifted(0.102)), 250).corners, shifted(0.102));
  assert.equal(tracker.reason, 'confirmed-change');
});
test('loss holds briefly, fades and expires; held geometry is never capture evidence', () => {
  const tracker = new LiveTracker();
  tracker.update(frame(0), 0);
  assert.equal(tracker.update(frame(125, null), 125).corners, null);
  assert.equal(tracker.view(300).opacity, 1);
  assert.equal(tracker.view(500).opacity, 0.5);
  assert.equal(tracker.view(600).corners, null);
  assert.deepEqual(tracker.update(frame(900, shifted(0.1)), 900).corners, shifted(0.1));
});
test('jitter is smoothed for display but raw corners remain available for stability checks', () => {
  const tracker = new LiveTracker();
  tracker.update(frame(0), 0);
  const raw = shifted(0.01);
  assert.equal(tracker.update(frame(125, raw), 125).corners, raw);
  const shown = tracker.view(125).corners!;
  assert(shown[0].x > quad[0].x && shown[0].x < raw[0].x);
  assert.equal(tracker.update(frame(125, shifted(0.1)), 130).corners, null);
  assert.equal(tracker.update(frame(200), 650).corners, null);
});
test('short recurrent dropouts and shape outliers pause rather than erase stable evidence', () => {
  const tracker = new LiveTracker(),
    gate = new AutoCapture();
  let captures = 0,
    lastProgress = 0;
  for (let time = 0; time <= 5000; time += 125) {
    const bad = time % 1000 === 500;
    const detection = tracker.update(
      frame(time, bad ? shifted(0.1) : shifted(time % 250 ? 0.002 : 0)),
      time,
    );
    const status = gate.update(detection, time);
    if (bad && !captures) assert.equal(status.progress, lastProgress);
    if (status.capture) {
      captures++;
      assert(time >= 1250);
    }
    if (!captures) lastProgress = status.progress;
  }
  assert.equal(captures, 1);
});
test('small alternating edge jitter can complete capture without masking cumulative drift', () => {
  const tracker = new LiveTracker(),
    gate = new AutoCapture();
  for (let time = 0; time <= 1000; time += 125) {
    const raw = shifted(time % 250 ? 0.01 : -0.01);
    const status = gate.update(tracker.update(frame(time, raw), time), time);
    assert.equal(status.capture, time === 1000);
  }
  gate.rearm();
  for (let time = 0; time <= 3500; time += 100)
    assert.equal(gate.update(frame(time, shifted(time / 16000)), time).capture, false);
});
test('long losses reset without changing mode generation; stale/unknown data cannot trigger', () => {
  const gate = new AutoCapture();
  for (let time = 0; time <= 900; time += 100) gate.update(frame(time), time);
  const generation = gate.generation;
  assert.equal(gate.poll(1350).progress, 0.9);
  assert.equal(gate.generation, generation);
  assert.equal(gate.update(frame(1000), 1550, generation).capture, false);
  assert.equal(gate.update(frame(1300, quad, 'unknown'), 1600).capture, false);
  assert.equal(gate.poll(2201).progress, 0);
  assert.equal(gate.update(frame(2300), 2300).progress, 0);
});
test('normal hand sway and a short uncertainty pause do not restart the stable window', () => {
  const tracker = new LiveTracker(),
    gate = new AutoCapture();
  for (let time = 0; time <= 1000; time += 125) {
    const q = shifted(0.02 * Math.cos((2 * Math.PI * time) / 1000));
    assert.equal(gate.update(tracker.update(frame(time, q), time), time).capture, time === 1000);
  }
  gate.rearm();
  for (let time = 0; time <= 500; time += 100) gate.update(frame(time), time);
  assert.equal(gate.update(frame(600, null), 600).progress, 0.5);
  assert.equal(gate.poll(1500).progress, 0.5);
  assert.equal(gate.update(frame(1600), 1600).progress, 0.5);
  assert.equal(gate.update(frame(1700), 1700).progress, 0.6);
});
test('movement resets after a confirmed jump and cannot hide behind a held display', () => {
  const tracker = new LiveTracker(),
    gate = new AutoCapture();
  for (let time = 0; time <= 900; time += 100) gate.update(tracker.update(frame(time), time), time);
  assert.equal(gate.update(tracker.update(frame(1000, shifted(0.1)), 1000), 1000).capture, false);
  assert.equal(gate.update(tracker.update(frame(1100, shifted(0.1)), 1100), 1100).progress, 0);
  assert.equal(gate.decisionReason, 'anchor-drift');
});
test('ongoing uncertainty never advances auto capture, even with frequent polling', () => {
  const gate = new AutoCapture();
  for (let time = 0; time <= 900; time += 100) gate.update(frame(time), time);
  for (let time = 1000; time <= 10000; time += 100) {
    assert.equal(gate.update(frame(time, quad, 'blur'), time).capture, false);
    assert.equal(gate.poll(time + 50).capture, false);
  }
  assert.equal(gate.update(frame(10100), 10100).progress, 0);
});
test('watchdog polling cannot erase fresh evidence from a slower in-flight job', () => {
  const gate = new AutoCapture();
  let captured = false;
  for (let time = 0; time <= 1000; time += 250) {
    const generation = gate.generation;
    gate.poll(time + 200);
    assert.equal(gate.generation, generation);
    const status = gate.update(frame(time), time + 300, generation);
    assert.equal(status.capture, time === 1000);
    captured ||= status.capture;
  }
  assert(captured);
});
