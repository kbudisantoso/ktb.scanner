import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractionSize,
  planProcessingMemory,
  sourceMemoryPeak,
} from '../../packages/scanner/src/processing-memory.ts';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session.ts';
import type { Quad } from '../../packages/scanner/src/types.ts';

test('processing geometry preserves existing scaling and Scanic pixel-center rounding', () => {
  const source = { width: 1001, height: 2001 };
  const corners: Quad = [
    { x: 0.1, y: 0.05 },
    { x: 0.9, y: 0.05 },
    { x: 0.85, y: 0.9 },
    { x: 0.15, y: 0.9 },
  ];
  // Pixel corners are (100,100), (900,100), (850,1800), (150,1800).
  // The longest vertical edge is sqrt(50² + 1700²), rounded by Scanic.
  const expected = { width: 800, height: 1701 };
  assert.deepEqual(extractionSize(corners, source), expected);
  const plan = planProcessingMemory({
    source,
    corners,
    format: { kind: 'original-ratio', origin: 'user' },
    recipe: { version: 1, enhancement: 'bw', dewarp: 'off' },
    limits: DEFAULT_LIMITS,
    lensCorrection: { status: 'off', strength: 0, supportedEdges: 0 },
  });
  // Existing crop limiting floors 800.8 to 800 before scaling the complete source.
  assert.deepEqual(plan.workingSize, { width: 1000, height: 1999 });
  // In that working frame the longest edges are 799.2 and sqrt(49.95² + 1698.3²).
  const workingExtraction = { width: 799, height: 1699 };
  assert.deepEqual(plan.normalExtractionSize, workingExtraction);
  assert.deepEqual(plan.correctedExtractionSize, workingExtraction);
  assert.deepEqual(plan.renderSize, workingExtraction);
  assert.deepEqual(plan.mappedCorners, corners);
});

test('applied lens geometry reserves the larger original crop needed by Before', () => {
  const source = { width: 4096, height: 3072 };
  const corners: Quad = [
    { x: 0.01, y: 0.01 },
    { x: 0.99, y: 0.01 },
    { x: 0.99, y: 0.99 },
    { x: 0.01, y: 0.99 },
  ];
  const request = {
    source,
    corners,
    format: { kind: 'original-ratio', origin: 'user' } as const,
    recipe: { version: 1, enhancement: 'none', dewarp: 'auto' } as const,
    limits: DEFAULT_LIMITS,
    lensCorrection: { status: 'applied', strength: 0.16, supportedEdges: 4 } as const,
  };
  const preview = planProcessingMemory(request);
  const exported = planProcessingMemory({ ...request, previewComparison: false });
  assert.notDeepEqual(preview.mappedCorners, corners);
  assert(preview.correctedExtractionSize.width < preview.normalExtractionSize.width);
  assert(preview.correctedExtractionSize.height < preview.normalExtractionSize.height);
  assert.deepEqual(exported.workingSize, preview.workingSize);
  assert.deepEqual(exported.correctedExtractionSize, preview.correctedExtractionSize);
  assert.deepEqual(exported.renderSize, preview.renderSize);
  const budget = 300 * 1024 ** 2;
  assert(sourceMemoryPeak(source) < budget);
  assert(exported.peakBytes < budget, 'the corrected output alone fits this budget');
  assert(preview.peakBytes > budget, 'Before must retain the larger uncorrected extraction');
});
