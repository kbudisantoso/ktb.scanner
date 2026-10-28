import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  containsObservedTarget,
  createDetectionJob,
  hasBoundaryContrast,
} from '../../packages/scanner/src/detection.ts';
import { selectDocumentCandidate } from '../../packages/scanner/src/candidates.ts';
import type { DocumentCandidate } from '../../packages/scanner/src/candidates.ts';
import type { Quad, Size } from '../../packages/scanner/src/types.ts';

type Pixels = Size & { data: Uint8ClampedArray };
type Engine = NonNullable<Parameters<typeof createDetectionJob>[0]>;
type EngineOptions = Parameters<Engine>[1];
type EngineResult = Awaited<ReturnType<Engine>>;
const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

function gray(width: number, height: number, value: (x: number, y: number) => number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value(x, y);
      data[i + 3] = 255;
    }
  return { width, height, data };
}
function rectangle(size: Size, left: number, top: number, right: number, bottom: number): Quad {
  return [
    { x: left / (size.width - 1), y: top / (size.height - 1) },
    { x: right / (size.width - 1), y: top / (size.height - 1) },
    { x: right / (size.width - 1), y: bottom / (size.height - 1) },
    { x: left / (size.width - 1), y: bottom / (size.height - 1) },
  ];
}
function candidate(corners: Quad, size: Size): DocumentCandidate {
  return {
    corners: Object.fromEntries(
      keys.map((key, i) => [
        key,
        { x: corners[i].x * (size.width - 1), y: corners[i].y * (size.height - 1) },
      ]),
    ) as NonNullable<DocumentCandidate['corners']>,
    confidence: 0.8,
    isValid: true,
    edgeSupport: 0.9,
    contourFitRatio: 1,
  };
}
function result(selected: DocumentCandidate | null): EngineResult {
  return {
    success: !!selected,
    corners: selected?.corners ?? null,
    confidence: selected?.confidence ?? null,
  } as EngineResult;
}

test('boundary admission accepts either material polarity but rejects thin frames and internal folds', () => {
  const size = { width: 400, height: 600 };
  const paper = rectangle(size, 60, 60, 340, 540);
  for (const [inside, outside] of [
    [220, 80],
    [80, 220],
  ]) {
    const image = gray(size.width, size.height, (x, y) =>
      x >= 60 && x <= 340 && y >= 60 && y <= 540 ? inside : outside,
    );
    assert.equal(hasBoundaryContrast(image, paper), true);
  }
  const frame = gray(size.width, size.height, (x, y) =>
    ((Math.abs(x - 60) <= 1 || Math.abs(x - 340) <= 1) && y >= 60 && y <= 540) ||
    ((Math.abs(y - 60) <= 1 || Math.abs(y - 540) <= 1) && x >= 60 && x <= 340)
      ? 50
      : 180,
  );
  assert.equal(hasBoundaryContrast(frame, paper), false);
  const folded = gray(size.width, size.height, (x, y) => {
    if (x < 60 || x > 340 || y < 60 || y > 540) return 80;
    return Math.abs(y - 220) <= 2 || Math.abs(y - 380) <= 2 ? 60 : 220;
  });
  assert.equal(hasBoundaryContrast(folded, rectangle(size, 60, 220, 340, 540)), false);
});

test('near-frame samples cannot be duplicated by clamping; smaller sheets and narrow receipts retain evidence', () => {
  const near = gray(400, 600, (x, y) => (x >= 4 && x <= 340 && y >= 60 && y <= 540 ? 220 : 80));
  assert.equal(hasBoundaryContrast(near, rectangle(near, 4, 60, 340, 540)), false);
  for (const [width, height, left, top, right, bottom] of [
    [240, 300, 20, 20, 220, 280],
    [80, 800, 12, 20, 67, 780],
    [64, 96, 14, 14, 50, 82],
  ]) {
    const image = gray(width, height, (x, y) =>
      x >= left && x <= right && y >= top && y <= bottom ? 220 : 80,
    );
    assert.equal(
      hasBoundaryContrast(image, rectangle(image, left, top, right, bottom)),
      true,
      `${width} x ${height} paper with visible outside margins`,
    );
  }
});

test('one contrast polarity must support every edge quarter instead of mixing positive and negative counts', () => {
  const size = { width: 500, height: 640 };
  const edges = [
    { x: 70, y: 70, dx: 360, dy: 0 },
    { x: 430, y: 70, dx: 0, dy: 500 },
    { x: 430, y: 570, dx: -360, dy: 0 },
    { x: 70, y: 570, dx: 0, dy: -500 },
  ];
  const image = (positive: (sample: number) => boolean) =>
    gray(size.width, size.height, (x, y) => {
      for (const edge of edges) {
        const length = Math.hypot(edge.dx, edge.dy);
        const u = ((x - edge.x) * edge.dx + (y - edge.y) * edge.dy) / length ** 2;
        const inward = (-(x - edge.x) * edge.dy + (y - edge.y) * edge.dx) / length;
        if (u < 0 || u > 1 || Math.abs(inward) > 21) continue;
        const sample = Math.max(0, Math.min(31, Math.round(((u - 0.06) / 0.88) * 31)));
        return inward >= 0 === positive(sample) ? 220 : 80;
      }
      return 150;
    });
  const paper = rectangle(size, 70, 70, 430, 570);
  assert.equal(
    hasBoundaryContrast(
      image((sample) => sample % 8 < 6),
      paper,
    ),
    true,
  );
  // Every edge has 20 positive / 12 negative positions, but its final quarter is all negative.
  assert.equal(
    hasBoundaryContrast(
      image((sample) => sample < 20),
      paper,
    ),
    false,
  );
});

test('target containment uses source-pixel halfplanes rather than bounding boxes or relative receipt tolerance', () => {
  for (const size of [
    { width: 400, height: 600 },
    { width: 80, height: 800 },
  ]) {
    const outer = rectangle(size, 20, 30, size.width - 20, size.height - 30);
    assert.equal(
      containsObservedTarget(outer, rectangle(size, 20, 200, size.width - 20, 350), size),
      true,
    );
    assert.equal(
      containsObservedTarget(outer, rectangle(size, 18.6, 200, size.width - 20, 350), size),
      true,
    );
    assert.equal(
      containsObservedTarget(outer, rectangle(size, 18.4, 200, size.width - 20, 350), size),
      false,
    );
  }
  const diamond: Quad = [
    { x: 0.5, y: 0.1 },
    { x: 0.9, y: 0.5 },
    { x: 0.5, y: 0.9 },
    { x: 0.1, y: 0.5 },
  ];
  assert.equal(
    containsObservedTarget(diamond, rectangle({ width: 401, height: 401 }, 60, 60, 100, 100), {
      width: 401,
      height: 401,
    }),
    false,
  );
});

test('one extra classical pass is shared by the whole job and observers receive only final selections', async () => {
  const image = gray(400, 600, (x, y) => (x >= 60 && x <= 340 && y >= 60 && y <= 540 ? 220 : 80));
  const outer = candidate(rectangle(image, 60, 60, 340, 540), image);
  const calls: EngineOptions[] = [];
  const engine: Engine = async (_image, options) => {
    calls.push(options);
    return result(options.selectCandidate(options.lowThreshold === 20 ? [outer] : [], image));
  };
  const job = createDetectionJob(engine);
  const observed: (DocumentCandidate | null)[] = [];
  const options = {
    mode: 'detect' as const,
    detector: 'classical' as const,
    maxProcessingDimension: 800,
  };
  const first = await job.scan(
    image as ImageData,
    options,
    selectDocumentCandidate,
    (_pool, _size, selected) => observed.push(selected.candidate),
  );
  assert.equal(first.success, true);
  assert.deepEqual(calls[1], {
    ...options,
    lowThreshold: 20,
    highThreshold: 60,
    applyDilation: true,
    dilationKernelSize: 3,
    enableDetectionCascade: false,
    selectCandidate: calls[1].selectCandidate,
  });
  assert.deepEqual([...observed], [outer]);
  const second = await job.scan(
    image as ImageData,
    options,
    selectDocumentCandidate,
    (_pool, _size, selected) => observed.push(selected.candidate),
  );
  assert.equal(second.success, false);
  assert.equal(calls.length, 3);
  assert.deepEqual(observed, [outer, null]);
});

test('an unsupported normal selection survives a rescue that finds only another non-enclosing sheet', async () => {
  const image = gray(600, 600, (x, y) => (x >= 350 && x <= 550 && y >= 60 && y <= 540 ? 220 : 80));
  const normal = candidate(rectangle(image, 50, 60, 250, 540), image);
  const other = candidate(rectangle(image, 350, 60, 550, 540), image);
  let calls = 0;
  let original: EngineResult | undefined;
  const job = createDetectionJob(async (_image, options) => {
    calls++;
    const output = result(
      options.selectCandidate(options.lowThreshold === 20 ? [other] : [normal], image),
    );
    if (options.lowThreshold !== 20) original = output;
    return output;
  });
  const observed: DocumentCandidate[] = [];
  const processed = await job.scan(
    image as ImageData,
    { mode: 'detect', detector: 'classical' },
    selectDocumentCandidate,
    (_pool, _size, selected) => {
      if (selected.candidate) observed.push(selected.candidate);
    },
  );
  assert.equal(calls, 2);
  assert.equal(processed.success, true);
  assert.equal(processed, original);
  assert.deepEqual(processed.corners, normal.corners);
  assert.deepEqual(observed, [normal]);
});

test('optional rescue failures preserve normal geometry and consume the extra-pass budget', async () => {
  const image = gray(400, 600, (x, y) => (x >= 60 && x <= 340 && y >= 60 && y <= 540 ? 220 : 80));
  const normal = candidate(rectangle(image, 60, 220, 340, 540), image);
  const outer = candidate(rectangle(image, 60, 60, 340, 540), image);
  for (const failure of ['throws', 'unsuccessful']) {
    let calls = 0;
    const originals: EngineResult[] = [];
    const job = createDetectionJob(async (_image, options) => {
      calls++;
      if (options.lowThreshold === 20) {
        options.selectCandidate([outer], image);
        if (failure === 'throws') throw new Error('Optional detection failed');
        return { ...result(outer), success: false };
      }
      const output = result(options.selectCandidate([normal], image));
      originals.push(output);
      return output;
    });
    const observed: (DocumentCandidate | null)[] = [];
    const options = { mode: 'detect' as const, detector: 'classical' as const };
    const first = await job.scan(
      image as ImageData,
      options,
      selectDocumentCandidate,
      (_pool, _size, selected) => observed.push(selected.candidate),
    );
    assert.equal(first.success, true);
    assert.equal(first, originals[0]);
    assert.deepEqual(first.corners, normal.corners);
    assert.deepEqual(observed, [normal]);
    const second = await job.scan(image as ImageData, options);
    assert.equal(second.success, true);
    assert.equal(second, originals[1]);
    assert.equal(calls, 3);
  }
});

test('normal scan errors and explicit rescue cancellation propagate instead of becoming successful crops', async () => {
  const image = gray(400, 600, () => 180);
  const normal = candidate(rectangle(image, 60, 60, 340, 540), image);
  const failure = new Error('Normal detection failed');
  let calls = 0;
  const failed = createDetectionJob(async () => {
    calls++;
    throw failure;
  });
  await assert.rejects(failed.scan(image as ImageData, {}), (error) => error === failure);
  assert.equal(calls, 1);

  const abort = new DOMException('Detection cancelled', 'AbortError');
  const cancelled = createDetectionJob(async (_image, options) => {
    if (options.lowThreshold === 20) throw abort;
    return result(options.selectCandidate([normal], image));
  });
  await assert.rejects(cancelled.scan(image as ImageData, {}), (error) => error === abort);
});

test('caller selection context is honored without producing intermediate observations', async () => {
  const image = gray(680, 600, (x, y) =>
    ((x >= 60 && x <= 280) || (x >= 400 && x <= 620)) && y >= 60 && y <= 540 ? 220 : 80,
  );
  const left = candidate(rectangle(image, 60, 60, 280, 540), image);
  const right = candidate(rectangle(image, 400, 60, 620, 540), image);
  const pick = (pool: readonly DocumentCandidate[], size: Size) => ({
    ...selectDocumentCandidate(pool, size),
    candidate: pool.includes(right) ? right : null,
  });
  let calls = 0;
  let original: EngineResult | undefined;
  const job = createDetectionJob(async (_image, options) => {
    calls++;
    original = result(options.selectCandidate([left, right], image));
    return original;
  });
  const observations: (DocumentCandidate | null)[] = [];
  const selected = await job.scan(image as ImageData, {}, pick, (_pool, _size, choice) =>
    observations.push(choice.candidate),
  );
  assert.equal(calls, 1);
  assert.equal(selected, original);
  assert.deepEqual(selected.corners, right.corners);
  assert.deepEqual(observations, [right]);
});

test('a mixed rescue pool cannot lose the normal target through ambiguity or another sheet', async () => {
  const outcomes = [];
  for (const [top, bottom, scenario] of [
    [200, 800, 'ambiguous'],
    [250, 750, 'another-sheet'],
  ] as const) {
    const image = gray(1000, 1000, (x, y) =>
      (x >= 160 && x <= 970 && y >= top && y <= bottom) ||
      (x >= 480 && x <= 620 && y >= 100 && y <= 900)
        ? 235
        : 205,
    );
    const normal = candidate(rectangle(image, 200, 280, 400, 720), image);
    const other = candidate(rectangle(image, 480, 100, 620, 900), image);
    const rescue = candidate(rectangle(image, 160, top, 970, bottom), image);
    const normalPool = [normal, other];
    assert.equal(selectDocumentCandidate(normalPool, image).candidate, normal);
    assert.equal(hasBoundaryContrast(image, rectangle(image, 160, top, 970, bottom)), true);
    assert.equal(
      containsObservedTarget(
        rectangle(image, 160, top, 970, bottom),
        rectangle(image, 200, 280, 400, 720),
        image,
      ),
      true,
    );
    let original: EngineResult | undefined;
    const job = createDetectionJob(async (_image, options) => {
      const selected = options.selectCandidate(
        options.lowThreshold === 20 ? [rescue] : normalPool,
        image,
      );
      const output = result(selected);
      if (options.lowThreshold !== 20) original = output;
      return output;
    });
    const observations: {
      pool: readonly DocumentCandidate[];
      selected: DocumentCandidate | null;
    }[] = [];
    const selected = await job.scan(
      image as ImageData,
      {},
      selectDocumentCandidate,
      (pool, _size, choice) => observations.push({ pool, selected: choice.candidate }),
    );
    outcomes.push({
      scenario,
      returnedNormal: selected === original,
      originalPoolObservedOnce: observations.length === 1 && observations[0].pool === normalPool,
      originalSelectionObserved: observations[0]?.selected === normal,
    });
  }
  assert.deepEqual(outcomes, [
    {
      scenario: 'ambiguous',
      returnedNormal: true,
      originalPoolObservedOnce: true,
      originalSelectionObserved: true,
    },
    {
      scenario: 'another-sheet',
      returnedNormal: true,
      originalPoolObservedOnce: true,
      originalSelectionObserved: true,
    },
  ]);
});
