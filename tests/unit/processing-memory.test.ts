import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractionSize,
  fitSourceMemory,
  fitProcessingMemory,
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

test('source fitting keeps affordable pixels and bounds large decodes before allocation', () => {
  const budget = 384 * 1024 ** 2 - 64 * 1024 ** 2 - 1024 ** 2;
  const affordable = { width: 4096, height: 3072 };
  assert.deepEqual(fitSourceMemory(affordable, budget), affordable);
  for (const source of [
    { width: 8000, height: 6000 },
    { width: 20000, height: 10000 },
  ]) {
    for (const options of [{}, { engineBuffers: true, trace: true }]) {
      const fitted = fitSourceMemory(source, budget, options);
      assert(fitted.width < source.width && fitted.height < source.height);
      assert(fitted.width >= 2 && fitted.height >= 2);
      assert(sourceMemoryPeak(fitted, options) <= budget);
      assert(Math.abs(fitted.width / fitted.height - source.width / source.height) < 0.001);
      const nextScale = Math.max(
        (fitted.width + 1) / source.width,
        (fitted.height + 1) / source.height,
      );
      assert(
        sourceMemoryPeak(
          {
            width: Math.floor(source.width * nextScale),
            height: Math.floor(source.height * nextScale),
          },
          options,
        ) > budget,
        'a larger proportional raster must not fit',
      );
    }
  }
  assert.throws(
    () =>
      fitSourceMemory({ width: 8000, height: 6000 }, sourceMemoryPeak({ width: 2, height: 2 }) - 1),
    { code: 'LIMIT_EXCEEDED' },
  );
});

test('working fitting preserves a fitting plan and adapts a real middle-crop filter peak', () => {
  const options = {
    source: { width: 6000, height: 4000 },
    corners: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ] as Quad,
    format: { kind: 'original-ratio', origin: 'user' } as const,
    recipe: { version: 1, enhancement: 'bw', dewarp: 'off' } as const,
    limits: DEFAULT_LIMITS,
    lensCorrection: { status: 'off', strength: 0, supportedEdges: 0 } as const,
  };
  const normal = planProcessingMemory(options);
  assert.deepEqual(fitProcessingMemory(options, normal.peakBytes), normal);
  const budget = 384 * 1024 ** 2 - 16 * 1024 ** 2;
  assert(normal.peakBytes > budget);
  const fitted = fitProcessingMemory(options, budget);
  assert(fitted.peakBytes <= budget);
  assert(fitted.workingSize.width < normal.workingSize.width);
  assert(fitted.workingSize.height < normal.workingSize.height);
  assert(fitted.renderSize.width * fitted.renderSize.height > 5_000_000);
  assert(fitted.comparisonBytes > 4 * fitted.renderSize.width * fitted.renderSize.height);
  assert(fitted.processingBytes + fitted.comparisonBytes <= budget);
  assert(fitted.renderSize.width * fitted.renderSize.height <= options.limits.outputPixels);
  assert(
    Math.max(fitted.renderSize.width, fitted.renderSize.height) <= options.limits.outputDimension,
  );
  const nextScale = Math.max(
    (fitted.workingSize.width + 1) / options.source.width,
    (fitted.workingSize.height + 1) / options.source.height,
  );
  assert(planProcessingMemory({ ...options, workingScale: nextScale }).peakBytes > budget);
  assert.throws(() => fitProcessingMemory(options, 1), { code: 'LIMIT_EXCEEDED' });
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
  const fitted = fitProcessingMemory(request, budget);
  assert(fitted.peakBytes <= budget);
  assert(fitted.workingSize.width < preview.workingSize.width);
  assert(fitted.baselineRenderSize.width > fitted.renderSize.width);
  assert(
    fitted.comparisonBytes > 4 * fitted.baselineRenderSize.width * fitted.baselineRenderSize.height,
    'Before reserves its actual larger baseline geometry',
  );
  assert(fitted.processingBytes + fitted.comparisonBytes <= budget);
  assert.deepEqual(fitProcessingMemory({ ...request, previewComparison: false }, budget), exported);
});
