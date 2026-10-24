import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoCapture } from '../../packages/scanner/src/capture.ts';
import {
  FULL_QUAD,
  validQuad,
  cropSize,
  layoutMm,
  fitImage,
  limitedSize,
  rectifiedSize,
  smoothQuad,
  suggestFormat,
} from '../../packages/scanner/src/geometry.ts';
import { ScanSession, resolveLimits, metadataFor } from '../../packages/scanner/src/session.ts';
import { exportDocument } from '../../packages/scanner/src/export.ts';
import type {
  Quad,
  PageDraft,
  EngineAdapter,
  ProcessRequest,
} from '../../packages/scanner/src/types.ts';
const quad: Quad = [
  { x: 0.15, y: 0.1 },
  { x: 0.85, y: 0.1 },
  { x: 0.85, y: 0.9 },
  { x: 0.15, y: 0.9 },
];
function detection(
  timestamp: number,
  q: Quad | null = quad,
  sharpness: 'sharp' | 'blur' | 'unknown' = 'sharp',
) {
  return { timestamp, corners: q, sharpness };
}
export function page(): PageDraft {
  return {
    id: 'draft',
    revision: 1,
    original: new Blob(['original']),
    preview: new Blob(['preview'], { type: 'image/jpeg' }),
    thumbnail: new Blob(['thumb'], { type: 'image/jpeg' }),
    source: 'file',
    size: { width: 800, height: 1200 },
    outputSize: { width: 560, height: 960 },
    corners: structuredClone(quad),
    rotation: 0,
    format: { kind: 'standard', preset: 'A4', origin: 'user' },
    recipe: { version: 1, enhancement: 'document', dewarp: 'off' },
    edgesUncertain: false,
    quality: {
      state: 'completed',
      method: 'image-metrics',
      revision: 1,
      assessment: 'unknown',
      sharpness: 'unknown',
      regions: [],
      reasons: ['insufficient-structure'],
    },
  };
}
function prime(gate: AutoCapture) {
  for (let time = 0; time <= 950; time += 50)
    assert.equal(gate.update(detection(time), time).capture, false);
}
test('export rejects a missing crop without confirming a partial document', async () => {
  const original = page();
  let calls = 0;
  const engine = {
    process: async () => {
      if (++calls === 1) return original;
      return {
        status: 'crop-required' as const,
        reason: 'not-detected' as const,
        size: original.size,
        corners: original.corners,
      };
    },
  } as unknown as EngineAdapter;
  await assert.rejects(
    exportDocument({
      pages: [original, { ...original, id: 'second' }],
      sessionId: 'session',
      engine,
      limits: resolveLimits(),
      mime: 'image/jpeg',
      pdf: true,
      originals: false,
      assetBaseUrl: '/assets',
    }),
    { code: 'CROP_REQUIRED' },
  );
  assert.equal(calls, 2);
});
test('quad rejects crossings, NaN, repeated and out-of-frame corners', () => {
  assert(validQuad(quad));
  assert(validQuad(FULL_QUAD));
  assert(!validQuad([quad[0], quad[2], quad[1], quad[3]]));
  assert(!validQuad([{ x: NaN, y: 0 }, ...quad.slice(1)] as Quad));
  assert(!validQuad([quad[0], quad[0], quad[2], quad[3]]));
  assert(!validQuad([{ x: -0.01, y: 0 }, ...quad.slice(1)] as Quad));
});
test('geometry estimates pixels before paper selection', () => {
  assert.deepEqual(cropSize(FULL_QUAD, { width: 800, height: 1200 }), { width: 800, height: 1200 });
  assert.equal(suggestFormat({ width: 210, height: 297 }).kind, 'standard');
  assert.deepEqual(suggestFormat({ width: 148, height: 210 }), {
    kind: 'standard',
    preset: 'A4',
    origin: 'default',
  });
});
test('receipt defaults and original ratio are explicit', () => {
  assert.deepEqual(suggestFormat({ width: 300, height: 1800 }), {
    kind: 'receipt',
    widthMm: 80,
    origin: 'default',
  });
  assert.deepEqual(
    layoutMm({ kind: 'original-ratio', origin: 'default' }, { width: 500, height: 500 }, 0),
    { width: 210, height: 210 },
  );
});
test('all paper presets and rotated axes are correct', () => {
  for (const [preset, width, height] of [
    ['A3', 297, 420],
    ['A4', 210, 297],
    ['A5', 148, 210],
    ['A6', 105, 148],
    ['letter', 215.9, 279.4],
    ['postcard-100x150', 100, 150],
  ] as const) {
    assert.deepEqual(
      layoutMm({ kind: 'standard', preset, origin: 'user' }, { width: 800, height: 1200 }, 90),
      { width: height, height: width },
    );
  }
});
test('receipt width stays tied to unrotated content', () => {
  assert.deepEqual(
    layoutMm({ kind: 'receipt', widthMm: 80, origin: 'user' }, { width: 800, height: 3000 }, 270),
    { width: 300, height: 80 },
  );
});
test('invalid PDF sizes fail before generator can silently clamp', () => {
  for (const widthMm of [0, -2, NaN, Infinity, 6000])
    assert.throws(() =>
      layoutMm({ kind: 'receipt', widthMm, origin: 'user' }, { width: 50, height: 100 }, 0),
    );
});
test('fit is centered, proportional and has no crop', () => {
  assert.deepEqual(fitImage({ width: 100, height: 100 }, { width: 210, height: 297 }), {
    x: 0,
    y: 43.5,
    width: 210,
    height: 210,
  });
});
test('output cap never upscales and respects long receipts', () => {
  assert.deepEqual(limitedSize({ width: 100, height: 200 }, 8e6, 4096), {
    width: 100,
    height: 200,
  });
  const result = limitedSize({ width: 1000, height: 12000 }, 8e6, 4096);
  assert.equal(result.height, 4096);
  assert(result.width * result.height <= 8e6);
});
test('overlay smoothing does not retain a lost contour', () => {
  assert.equal(smoothQuad(quad, null, 180), null);
  const next = quad.map((p) => ({ x: p.x + 0.01, y: p.y })) as Quad;
  const shown = smoothQuad(quad, next, 180)!;
  assert(shown[0].x > quad[0].x && shown[0].x < next[0].x);
});
test('capture is not early and fires exactly once', () => {
  const gate = new AutoCapture();
  prime(gate);
  assert.equal(gate.update(detection(1000), 1000).capture, true);
  assert.equal(gate.update(detection(1100), 1100).capture, false);
  gate.rearm();
  assert.equal(gate.update(detection(1200), 1200).progress, 0);
});
for (const problem of ['blur', 'unknown', 'loss', 'gap', 'stale', 'duplicate'] as const)
  test(`capture pauses without counting uncertain time for ${problem}`, () => {
    const gate = new AutoCapture();
    prime(gate);
    const value =
      problem === 'loss'
        ? detection(1000, null)
        : problem === 'blur' || problem === 'unknown'
          ? detection(1000, quad, problem)
          : detection(problem === 'gap' ? 1401 : problem === 'duplicate' ? 950 : 1000);
    const response = gate.update(value, problem === 'stale' ? 1500 : value.timestamp);
    assert.equal(response.capture, false);
    assert.equal(response.progress, 0.95);
    const next = Math.max(value.timestamp, problem === 'stale' ? 1500 : 1000) + 100;
    assert.equal(gate.update(detection(next), next).capture, problem === 'gap');
    assert.equal(gate.update(detection(next + 100), next + 100).capture, problem !== 'gap');
  });
test('slow drift is measured against start, not smoothed frames', () => {
  const gate = new AutoCapture();
  for (let time = 0; time <= 3500; time += 100) {
    const shift = time / 16000;
    const q = quad.map((p) => ({ x: p.x + shift, y: p.y })) as Quad;
    assert.equal(gate.update(detection(time, q), time).capture, false);
  }
});
test('manual switch invalidates in-flight detections and starts fresh on return', () => {
  const gate = new AutoCapture();
  prime(gate);
  const generation = gate.generation;
  gate.setMode('manual');
  assert.equal(gate.update(detection(1000), 1000, generation).capture, false);
  gate.setMode('auto');
  assert.equal(gate.update(detection(1100), 1100, generation).progress, 0);
  assert.equal(gate.update(detection(1200), 1200).progress, 0);
});
test('manual and auto triggers share a single capture claim', () => {
  const gate = new AutoCapture();
  prime(gate);
  assert.equal(gate.claimManual(), true);
  assert.equal(gate.claimManual(), false);
  assert.equal(gate.update(detection(1000), 1000).capture, false);
});
test('session returns detached snapshots and stable IDs on atomic replacement', () => {
  const session = new ScanSession();
  session.accept(page());
  const first = session.pages[0];
  first.corners[0].x = 0;
  assert.equal(session.pages[0].corners[0].x, 0.15);
  const id = first.id;
  session.accept({ ...page(), original: new Blob(['replacement']) }, id);
  assert.equal(session.pages[0].id, id);
  assert.equal(session.pages[0].revision, 2);
  assert.equal(session.pages[0].quality.revision, 2);
});
test('failed replacement preserves the old page and revision', () => {
  const session = new ScanSession(resolveLimits({ fileBytes: 10 }));
  session.accept(page());
  const before = session.pages[0];
  assert.throws(() =>
    session.accept({ ...page(), original: new Blob(['x'.repeat(11)]) }, before.id),
  );
  assert.equal(session.pages[0].revision, 1);
  assert.equal(session.pages[0].original.size, before.original.size);
});
test('page limit allows replacement but disallows extra pages', () => {
  const session = new ScanSession(resolveLimits({ pages: 1 }));
  session.accept(page());
  assert.throws(() => session.accept(page()));
  session.accept(page(), session.pages[0].id);
  assert.equal(session.pages.length, 1);
});
test('reordering and deletion operate on stable IDs', () => {
  const session = new ScanSession();
  session.accept(page());
  session.accept(page());
  const [a, b] = session.pages;
  session.move(b.id, -1);
  assert.deepEqual(
    session.pages.map((p) => p.id),
    [b.id, a.id],
  );
  session.remove(b.id);
  assert.equal(session.pages[0].id, a.id);
});
test('export freezes edits and unlocks on failure', async () => {
  const session = new ScanSession();
  session.accept(page());
  await assert.rejects(
    session.export(async () => {
      assert.throws(() => session.remove(session.pages[0].id));
      throw new Error('failure');
    }),
  );
  session.remove(session.pages[0].id);
  assert.equal(session.pages.length, 0);
  await assert.rejects(session.export(async () => 'empty'));
});
test('metadata contains only JSON data and distinguishes layout from measurement', () => {
  const metadata = metadataFor(page(), 'image/png');
  assert.deepEqual(JSON.parse(JSON.stringify(metadata)), metadata);
  assert.equal(metadata.physicalSizeMm, null);
  assert.equal(metadata.format.origin, 'user');
  assert.equal(metadata.outputMimeType, 'image/png');
});
test('invalid limits rejected', () => {
  for (const pages of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => resolveLimits({ pages }));
});
function engine(
  process: (r: ProcessRequest) => Promise<Awaited<ReturnType<EngineAdapter['process']>>>,
): EngineAdapter {
  return { process, detect: async () => detection(0), destroy() {} };
}
const exportOptions = {
  pages: [page()],
  sessionId: 'session',
  limits: resolveLimits(),
  mime: 'image/png' as const,
  pdf: false,
  originals: false,
  assetBaseUrl: '/scanner-assets/',
};
test('export is ordered and uses the final recipe and mime', async () => {
  const inputs: ProcessRequest[] = [];
  const adapter = engine(async (request) => {
    inputs.push(request);
    return { ...page(), preview: new Blob(['final'], { type: request.mime }) };
  });
  const result = await exportDocument({ ...exportOptions, engine: adapter });
  assert.equal(result.pages[0].image.type, 'image/png');
  assert.equal(inputs[0].mime, 'image/png');
  assert.deepEqual(inputs[0].format, page().format);
  assert.equal(result.pages[0].original, undefined);
  assert.equal(result.pages[0].metadata.quality.revision, result.pages[0].revision);
});
test('failed page rejects whole export without partial success', async () => {
  let count = 0;
  const adapter = engine(async () => {
    if (++count === 2) throw new Error('second page');
    return page();
  });
  await assert.rejects(
    exportDocument({ ...exportOptions, pages: [page(), page()], engine: adapter }),
    /second page/,
  );
  assert.equal(count, 2);
});
test('abort during processing cannot return a confirmed result', async () => {
  const abort = new AbortController();
  const adapter = engine(async () => {
    abort.abort();
    return page();
  });
  await assert.rejects(
    exportDocument({ ...exportOptions, signal: abort.signal, engine: adapter }),
    { name: 'AbortError' },
  );
});
test('export buffer limit fails without losing source pages', async () => {
  const adapter = engine(async () => page());
  await assert.rejects(
    exportDocument({
      ...exportOptions,
      limits: resolveLimits({ resultBytes: 1 }),
      engine: adapter,
    }),
    /groß/,
  );
});

test('handoff rejects invalid numbers, rotations and stale quality revisions', async () => {
  const { validateMetadata } = await import('../../packages/scanner/src/validation.ts');
  const valid = metadataFor(page(), 'image/jpeg');
  validateMetadata(valid, 1);
  assert.throws(() => validateMetadata({ ...valid, rotationDegrees: 45 as any }, 1));
  assert.throws(() => validateMetadata({ ...valid, outputSizePx: { width: NaN, height: 100 } }, 1));
  assert.throws(() => validateMetadata(valid, 2));
  validateMetadata(
    {
      ...valid,
      format: { kind: 'standard', preset: 'A4', origin: 'user', orientation: 'portrait' },
    },
    1,
  );
  assert.throws(() =>
    validateMetadata(
      {
        ...valid,
        format: { kind: 'standard', preset: 'A4', origin: 'user', orientation: 'square' as any },
      },
      1,
    ),
  );
});

test('replacement preflight includes both originals until the new page is accepted', () => {
  const session = new ScanSession(resolveLimits({ originalBytes: 15 }));
  session.accept(page());
  const before = session.pages[0];
  assert.throws(() => session.checkImport(new Blob(['12345678']), before.id), /Sitzungslimit/);
  assert.equal(session.pages[0].id, before.id);
  assert.equal(session.pages[0].revision, 1);
  // Editing an already retained original does not allocate a replacement original.
  session.accept(before, before.id);
  assert.equal(session.pages[0].revision, 2);
});

test('thumbnail bytes count toward retained preview limits', () => {
  const session = new ScanSession(resolveLimits({ resultBytes: 10 }));
  assert.throws(() => session.accept(page()), /Vorschaudaten/);
  assert.equal(session.pages.length, 0);
});

test('unoptimized comparison blobs count toward the session preview budget', () => {
  const session = new ScanSession(resolveLimits({ resultBytes: 20 }));
  assert.throws(
    () => session.accept({ ...page(), unoptimizedPreview: new Blob(['comparison'.repeat(3)]) }),
    /Vorschaudaten/,
  );
  assert.equal(session.pages.length, 0);
});

test('replacement preflight rejects a page that no longer exists', () => {
  const session = new ScanSession();
  assert.throws(() => session.checkImport(new Blob(['image']), 'removed-page'), /nicht mehr/);
  assert.equal(session.pages.length, 0);
});

test('paper rectification corrects both orientations without upscaling or cropping', () => {
  for (const preset of ['A3', 'A4', 'A5', 'A6', 'letter', 'postcard-100x150'] as const) {
    for (const crop of [
      { width: 800, height: 1000 },
      { width: 1000, height: 800 },
    ]) {
      const format = { kind: 'standard', preset, origin: 'user' } as const;
      const target = rectifiedSize(crop, format);
      const paper = layoutMm(format, crop, 0);
      assert(Math.abs(target.width / target.height - paper.width / paper.height) < 1e-12);
      assert(target.width <= crop.width && target.height <= crop.height + 1e-9);
    }
  }
  const crop = { width: 300, height: 1800 };
  assert.deepEqual(rectifiedSize(crop, { kind: 'receipt', widthMm: 80, origin: 'user' }), crop);
  assert.deepEqual(rectifiedSize(crop, { kind: 'original-ratio', origin: 'user' }), crop);
});

test('rectification reads canvas-style size getters rather than enumerable fields', () => {
  class CanvasSize {
    get width() {
      return 300;
    }
    get height() {
      return 1800;
    }
  }
  assert.deepEqual(
    rectifiedSize(new CanvasSize(), { kind: 'receipt', widthMm: 80, origin: 'user' }),
    { width: 300, height: 1800 },
  );
});

test('explicit paper axes override foreshortened crop geometry without rotating content', () => {
  for (const orientation of ['portrait', 'landscape'] as const) {
    for (const crop of [
      { width: 1700, height: 1550 },
      { width: 800, height: 1200 },
    ]) {
      const format = { kind: 'standard', preset: 'A4', origin: 'user', orientation } as const;
      const output = rectifiedSize(crop, format);
      const paper =
        orientation === 'portrait' ? { width: 210, height: 297 } : { width: 297, height: 210 };
      assert.deepEqual(layoutMm(format, crop, 0), paper);
      assert.deepEqual(layoutMm(format, crop, 90), { width: paper.height, height: paper.width });
      assert(Math.abs(output.width / output.height - paper.width / paper.height) < 1e-12);
      assert(output.width <= crop.width && output.height <= crop.height + 1e-9);
    }
  }
});

test('auto metadata records resolution and rejects missing, stale or malformed decisions', async () => {
  const { validateMetadata } = await import('../../packages/scanner/src/validation.ts');
  const draft = page();
  draft.recipe = { version: 1, enhancement: 'auto', dewarp: 'auto' };
  draft.autoOptimization = {
    profile: 'color',
    reason: 'paper-background',
    neutralFraction: 0.8,
    flatFraction: 0.7,
    contrastGain: 1.1,
    adjustments: { brightness: 0, contrast: 0, sharpness: 20 },
  };
  const metadata = metadataFor(draft, 'image/png');
  validateMetadata(metadata, 1);
  draft.autoOptimization.adjustments.sharpness = 50;
  assert.equal(metadata.autoOptimization!.adjustments.sharpness, 20);
  for (const autoOptimization of [
    undefined,
    null,
    { ...metadata.autoOptimization, profile: 'bw' },
    { ...metadata.autoOptimization, neutralFraction: NaN },
    { ...metadata.autoOptimization, flatFraction: 0.9 },
    { ...metadata.autoOptimization, contrastGain: 3 },
    { ...metadata.autoOptimization, adjustments: { sharpness: -1 } },
  ])
    assert.throws(() =>
      validateMetadata({ ...metadata, autoOptimization: autoOptimization as any }, 1),
    );
  assert.throws(() =>
    validateMetadata({ ...metadata, recipe: { ...metadata.recipe, enhancement: 'paper' } }, 1),
  );
});

test('export takes the fresh auto decision from processing rather than retained draft metadata', async () => {
  const draft = page();
  draft.recipe = { version: 1, enhancement: 'auto', dewarp: 'off' };
  draft.autoOptimization = {
    profile: 'photo',
    reason: 'preserve-photo',
    neutralFraction: 0.2,
    flatFraction: 0.1,
    contrastGain: 1,
    adjustments: { brightness: 0, contrast: 0, sharpness: 0 },
  };
  const fresh = {
    profile: 'color' as const,
    reason: 'paper-background' as const,
    neutralFraction: 0.9,
    flatFraction: 0.8,
    contrastGain: 1.1,
    adjustments: { brightness: 0, contrast: 0, sharpness: 20 },
  };
  const adapter = engine(async () => ({ ...draft, autoOptimization: fresh }));
  const result = await exportDocument({ ...exportOptions, pages: [draft], engine: adapter });
  assert.deepEqual(result.pages[0].metadata.autoOptimization, fresh);
  assert.equal(draft.autoOptimization.profile, 'photo');
});
