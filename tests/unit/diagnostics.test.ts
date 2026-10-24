import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { diagnose } from '../../packages/scanner/src/diagnostics.ts';
import { DiagnosticRecording } from '../../apps/demo-next/app/diagnostics/recorder.ts';
import { diagnosticZip } from '../../apps/demo-next/app/diagnostics/zip.ts';

test('diagnostics are inert when disabled and callback errors cannot break scans', () => {
  diagnose(undefined, 'test');
  let calls = 0;
  diagnose({ isActive: () => false, onEvent: () => calls++ }, 'test');
  diagnose(
    {
      isActive: () => {
        throw new Error('host');
      },
      onEvent: () => calls++,
    },
    'test',
  );
  diagnose(
    {
      onEvent: () => {
        throw new Error('host');
      },
    },
    'test',
  );
  assert.equal(calls, 0);
});
test('recording freezes metadata, deduplicates blobs and survives a cancelled scan', () => {
  const recorder = new DiagnosticRecording(false);
  const data = { corners: [{ x: 0.1, y: 0.2 }] };
  const blob = new Blob(['original']);
  for (let i = 0; i < 2; i++)
    recorder.record({
      type: 'process',
      atMs: performance.now(),
      data,
      artifacts: [{ stage: 'original', blob }],
    });
  data.corners[0].x = 0.9;
  recorder.record({
    type: 'session-close',
    atMs: performance.now(),
    data: { status: 'cancelled' },
  });
  recorder.close();
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.files.length, 1);
  assert.equal((snapshot.manifest.events[0].data as typeof data).corners[0].x, 0.1);
  assert.equal(recorder.options.isActive?.(), false);
  assert.equal(snapshot.manifest.events.at(-1)?.type, 'session-close');
  snapshot.manifest.events.length = 0;
  assert.equal(recorder.snapshot().manifest.events.length, 3);
});
test('recording limits reject whole events and preserve earlier evidence', () => {
  const recorder = new DiagnosticRecording(false, {}, 500);
  recorder.record({ type: 'first', atMs: 0, data: {} });
  recorder.record({
    type: 'oversize',
    atMs: 1,
    data: {},
    artifacts: [{ stage: 'too-big', blob: new Blob(['x'.repeat(1000)]) }],
  });
  assert.equal(recorder.summary.stopped, 'byte-limit');
  assert.equal(recorder.summary.events, 1);
  assert.equal(recorder.summary.files, 0);
  assert.equal(recorder.snapshot().manifest.truncated, true);
  assert.equal(recorder.options.isActive?.(), false);
  const eventLimit = new DiagnosticRecording(false, {}, 10000, 1);
  eventLimit.record({ type: 'first', atMs: 0, data: {} });
  eventLimit.record({ type: 'second', atMs: 1, data: {} });
  assert.equal(eventLimit.summary.stopped, 'event-limit');
});
test('successive sessions retain all evidence with unique paths and reject late old callbacks', () => {
  const recorder = new DiagnosticRecording(false, {}, 10000, 100, 1);
  const first = recorder.options;
  first.onEvent({
    type: 'image-stage',
    atMs: 0,
    data: { kind: 'detect', stage: 'live-input' },
    artifacts: [{ stage: 'original', blob: new Blob(['first']) }],
  });
  assert.equal(first.isActive?.('detect'), false);
  recorder.close();
  const second = recorder.beginSession(true, { viewport: 'changed' });
  assert.equal(second.engineBuffers, true);
  assert.equal(second.isActive?.('detect'), true);
  first.onEvent({ type: 'late-old-job', atMs: 1, data: {} });
  assert.equal(first.isActive?.(), false);
  second.onEvent({
    type: 'image-stage',
    atMs: 2,
    data: {},
    artifacts: [{ stage: 'original', blob: new Blob(['second']) }],
  });
  recorder.close();
  const { manifest, files } = recorder.snapshot();
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.mode, 'mixed');
  assert.equal(manifest.sessions.length, 2);
  assert.deepEqual(
    manifest.events.map((event) => event.sessionId),
    [1, 2],
  );
  assert.equal(new Set(files.map((file) => file.path)).size, 2);
  assert.equal(recorder.summary.sessions, 2);
});
test('sessions share one budget and clearing releases data and disables retained callbacks', () => {
  const recorder = new DiagnosticRecording(false, {}, 1500);
  recorder.record({
    type: 'photo',
    atMs: 0,
    data: {},
    artifacts: [{ stage: 'original', blob: new Blob(['x'.repeat(700)]) }],
  });
  recorder.close();
  const second = recorder.beginSession(false);
  second.onEvent({
    type: 'photo',
    atMs: 1,
    data: {},
    artifacts: [{ stage: 'original', blob: new Blob(['x'.repeat(700)]) }],
  });
  assert.equal(recorder.summary.stopped, 'byte-limit');
  assert.equal(recorder.summary.files, 1);
  recorder.clear();
  second.onEvent({ type: 'late-after-clear', atMs: 2, data: {} });
  assert.equal(second.isActive?.(), false);
  assert.equal(recorder.summary.bytes, 0);
  assert.equal(recorder.summary.files, 0);
  assert.equal(recorder.snapshot().manifest.events.length, 0);
});
test('retention expires after one hour or ten minutes after download, and new sessions reset it', () => {
  const recorder = new DiagnosticRecording(false);
  // Active scans are never expired halfway through a capture.
  assert.equal(recorder.expired(recorder.expiresAt + 1), false);
  recorder.close();
  const deadline = recorder.expiresAt;
  assert.equal(recorder.expired(deadline - 1), false);
  assert.equal(recorder.expired(deadline), true);
  recorder.markDownloaded(deadline - 30 * 60_000);
  assert.equal(recorder.expiresAt, deadline - 20 * 60_000);
  assert.equal(recorder.expired(recorder.expiresAt), true);
  recorder.beginSession(false);
  assert.ok(recorder.expiresAt >= Date.now() + 59 * 60_000);
  assert.equal(recorder.expired(deadline + 10000), false);
  recorder.close();
  assert.equal(recorder.expired(recorder.expiresAt), true);
});
test('live-frame cap stops diagnostic frame work but retains still-image and decision events', () => {
  const recorder = new DiagnosticRecording(false, {}, 10000, 100, 1);
  recorder.record({ type: 'image-stage', atMs: 0, data: { kind: 'detect', stage: 'live-input' } });
  assert.equal(recorder.options.isActive?.('detect'), false);
  assert.equal(recorder.options.isActive?.('process'), true);
  recorder.record({ type: 'live-decision', atMs: 1, data: { reason: 'sharpness-unknown' } });
  recorder.record({ type: 'processed', atMs: 2, data: { kind: 'process' } });
  assert.equal(recorder.summary.events, 3);
});
test('heavy live buffers cannot consume the photo and export budget', () => {
  const recorder = new DiagnosticRecording(true, {}, 16000);
  recorder.record({
    type: 'engine-buffers',
    atMs: 0,
    data: { kind: 'detect' },
    artifacts: [{ stage: 'scanic.raw', blob: new Blob(['x'.repeat(2000)]) }],
  });
  recorder.record({
    type: 'engine-buffers',
    atMs: 1,
    data: { kind: 'detect' },
    artifacts: [{ stage: 'scanic.more', blob: new Blob(['x'.repeat(3000)]) }],
  });
  assert.equal(recorder.options.isActive?.('detect'), false);
  assert.equal(recorder.options.isActive?.('buffers'), false);
  assert.equal(recorder.options.isActive?.('process'), true);
  for (const type of ['process-input', 'export-complete'])
    recorder.record({
      type,
      atMs: 2,
      data: { kind: 'process' },
      artifacts: [{ stage: type, blob: new Blob(['x'.repeat(3000)]) }],
    });
  recorder.record({ type: 'live-decision', atMs: 3, data: {} });
  assert.equal(recorder.summary.stopped, '');
  assert.equal(recorder.summary.detailStopped, 'detail-limit');
  assert.equal(recorder.summary.events, 4);
  assert.equal(recorder.snapshot().manifest.truncated, true);
});
test('ZIP passes an independent reader and preserves binary bytes and CRCs', async () => {
  const source = new Uint8Array([0, 255, 17, 128, 200]);
  const blob = await diagnosticZip([
    { path: 'manifest.json', blob: new Blob(['{"schemaVersion":1}']) },
    { path: 'files/raw.bin', blob: new Blob([source]) },
  ]);
  const result = execFileSync(
    'python3',
    [
      '-c',
      'import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; assert z.read("files/raw.bin")==bytes([0,255,17,128,200]); assert json.loads(z.read("manifest.json"))["schemaVersion"]==1; print(len(z.namelist()))',
    ],
    { input: Buffer.from(await blob.arrayBuffer()) },
  )
    .toString()
    .trim();
  assert.equal(result, '2');
  await assert.rejects(diagnosticZip([{ path: '../escape', blob: new Blob() }]), /Diagnosepfad/);
  await assert.rejects(
    diagnosticZip([
      { path: 'same', blob: new Blob() },
      { path: 'same', blob: new Blob() },
    ]),
    /Diagnosepfad/,
  );
});
