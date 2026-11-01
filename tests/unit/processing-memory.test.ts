import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractionSize,
  planProcessingMemory,
  sourceMemoryPeak,
} from '../../packages/scanner/src/processing-memory.ts';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session.ts';
import type { Quad } from '../../packages/scanner/src/types.ts';

test('a fractional crop within output limits preserves source sampling and Scanic rounding', () => {
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
  assert.deepEqual(plan.workingSize, source);
  assert.deepEqual(plan.normalExtractionSize, expected);
  assert.deepEqual(plan.correctedExtractionSize, expected);
  assert.deepEqual(plan.renderSize, expected);
  assert.deepEqual(plan.mappedCorners, corners);
});

test('binding pixel and dimension caps still bound near-full output without a budget downscale', () => {
  const source = { width: 4096, height: 3072 };
  const corners: Quad = [
    { x: 0.01, y: 0.01 },
    { x: 0.99, y: 0.01 },
    { x: 0.99, y: 0.99 },
    { x: 0.01, y: 0.99 },
  ];
  for (const outputDimension of [DEFAULT_LIMITS.outputDimension, 1024]) {
    const limits = { ...DEFAULT_LIMITS, outputDimension };
    const plan = planProcessingMemory({
      source,
      corners,
      format: { kind: 'original-ratio', origin: 'user' },
      recipe: { version: 1, enhancement: 'none', dewarp: 'off' },
      limits,
      lensCorrection: { status: 'off', strength: 0, supportedEdges: 0 },
    });
    assert(plan.workingSize.width < source.width);
    assert(plan.workingSize.height < source.height);
    assert(plan.renderSize.width * plan.renderSize.height <= limits.outputPixels);
    assert(Math.max(plan.renderSize.width, plan.renderSize.height) <= outputDimension);
    assert(plan.peakBytes < limits.workingBytes - 16 * 1024 ** 2);
    if (outputDimension === DEFAULT_LIMITS.outputDimension)
      assert(plan.renderSize.width * plan.renderSize.height > 7_900_000);
    else assert(Math.max(plan.renderSize.width, plan.renderSize.height) >= 1022);
  }
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
