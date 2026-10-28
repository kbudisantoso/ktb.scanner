import test from 'node:test';
import assert from 'node:assert/strict';
import { retainedCaptureLimits } from '../../packages/scanner/src/react/capture-queue.ts';
import type { CaptureCandidate } from '../../packages/scanner/src/react/capture-queue.ts';
import { resolveLimits } from '../../packages/scanner/src/session.ts';

const blob = (n: number) => new Blob(['x'.repeat(n)]);
const limits = resolveLimits({
  pages: 3,
  fileBytes: 100,
  originalBytes: 100,
  resultBytes: 200,
  workingBytes: 1000,
});

test('pending sources, rollback images and edited previews retain their own budget roles', () => {
  const source = blob(10),
    incoming = blob(12),
    file = blob(10);
  const page = {
    original: source,
    preview: blob(40),
    thumbnail: blob(5),
    unoptimizedPreview: blob(20),
  } as CaptureCandidate;
  const editedPreview = blob(30);
  const remaining = retainedCaptureLimits(limits, [page], [file], incoming, 3, [editedPreview], 4);
  assert.equal(remaining.resultBytes, 105);
  assert.equal(remaining.workingBytes, 869);
  assert.equal(remaining.originalBytes, 100);
  assert.equal(remaining.pages, 3);
  assert.throws(
    () =>
      retainedCaptureLimits({ ...limits, resultBytes: 95 }, [page], [], incoming, 2, [
        editedPreview,
      ]),
    { code: 'LIMIT_EXCEEDED' },
  );
});

test('one owned source is counted once; a replacement retains the preceding original until acceptance', () => {
  const source = blob(60);
  const candidate = { original: source } as CaptureCandidate;
  assert.doesNotThrow(() =>
    retainedCaptureLimits(limits, [candidate, candidate], [source], source, 1),
  );
  assert.throws(() => retainedCaptureLimits(limits, [candidate], [], blob(50), 1), {
    code: 'LIMIT_EXCEEDED',
  });
  assert.doesNotThrow(() => retainedCaptureLimits(limits, [candidate], [], blob(40), 1));
});

test('whole queued batches, page slots and peak reservations reject before retaining or copying more pixels', () => {
  const incoming = blob(10),
    files = [blob(40), blob(60)];
  assert.throws(() => retainedCaptureLimits(limits, [], files, incoming, 3), {
    code: 'LIMIT_EXCEEDED',
  });
  assert.throws(() => retainedCaptureLimits(limits, [], [], incoming, 4), {
    code: 'LIMIT_EXCEEDED',
  });
  assert.throws(() => retainedCaptureLimits(limits, [], [], blob(101), 1), {
    code: 'LIMIT_EXCEEDED',
  });
  assert.throws(() => retainedCaptureLimits(limits, [], [], incoming, 1, [], 991), {
    code: 'LIMIT_EXCEEDED',
  });
  assert.equal(files.length, 2);
  assert.equal(files[0].size, 40);
});
