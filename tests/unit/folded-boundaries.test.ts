import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateQuad, selectDocumentCandidate } from '../../packages/scanner/src/candidates.ts';
import type { DocumentCandidate } from '../../packages/scanner/src/candidates.ts';
import { LiveTracker } from '../../packages/scanner/src/tracking.ts';
import type { Point, Quad } from '../../packages/scanner/src/types.ts';

const size = { width: 1001, height: 1201 };
const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
const paper: Quad = [
  { x: 180, y: 140 },
  { x: 810, y: 140 },
  { x: 810, y: 1031 },
  { x: 180, y: 1031 },
];
const candidate = (corners: Quad, confidence: number): DocumentCandidate => ({
  corners: Object.fromEntries(keys.map((key, index) => [key, corners[index]])) as Record<
    (typeof keys)[number],
    Point
  >,
  confidence,
  isValid: true,
  edgeSupport: 0.9,
  contourFitRatio: 1,
});
function panel(corners: Quad, from: number, to: number): Quad {
  const between = (a: Point, b: Point, fraction: number): Point => ({
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
  });
  return [
    between(corners[0], corners[3], from),
    between(corners[1], corners[2], from),
    between(corners[1], corners[2], to),
    between(corners[0], corners[3], to),
  ];
}

test('supported complete A4 boundaries survive stronger one- and two-third fold panels', () => {
  const outer = candidate(paper, 0.55);
  for (const [from, to] of [
    [0, 2 / 3],
    [1 / 3, 1],
    [1 / 3, 2 / 3],
  ]) {
    const fragment = candidate(panel(paper, from, to), 0.99);
    for (const input of [
      [outer, fragment],
      [fragment, outer],
    ]) {
      const result = selectDocumentCandidate(input, size);
      assert.equal(result.candidate, outer);
      assert.equal(result.reason, 'single-sheet');
    }
  }
});

test('opposite shared boundaries work in perspective and after an in-plane rotation', () => {
  const perspective: Quad = [
    { x: 180, y: 140 },
    { x: 790, y: 180 },
    { x: 830, y: 1031 },
    { x: 160, y: 991 },
  ];
  const rotated = paper.map((point) => ({
    x: 500 - (point.y - 600),
    y: 600 + (point.x - 500),
  })) as Quad;
  for (const corners of [perspective, rotated]) {
    const outer = candidate(corners, 0.55);
    const fragment = candidate(panel(corners, 1 / 3, 1), 0.99);
    assert.equal(selectDocumentCandidate([fragment, outer], size).candidate, outer);
  }
});

test('real synthetic Scanic contours retain the outer boundary despite cascade side offsets', () => {
  const outer = {
    ...candidate(
      [
        { x: 269, y: 62 },
        { x: 370, y: 78 },
        { x: 561, y: 706 },
        { x: 78, y: 666 },
      ],
      0.7807291229774456,
    ),
    edgeSupport: 1,
    contourFitRatio: 0.9924724248354385,
  };
  const fragment = {
    ...candidate(
      [
        { x: 207, y: 270 },
        { x: 431, y: 290 },
        { x: 556, y: 702 },
        { x: 82, y: 662 },
      ],
      0.7558567997615295,
    ),
    edgeSupport: 1,
    contourFitRatio: 1.009857588846598,
  };
  assert.equal(
    selectDocumentCandidate([fragment, outer], { width: 640, height: 800 }).candidate,
    outer,
  );
});

test('changing fold scores cannot displace the observed outer boundary in a live sequence', () => {
  const tracker = new LiveTracker();
  let previous: Quad | null = candidateQuad(candidate(panel(paper, 1 / 3, 1), 0.99), size);
  for (const [index, confidence] of [0.55, 0.62, 0.7, 0.58, 0.65].entries()) {
    const outer = candidate(paper, confidence);
    const fragment = candidate(panel(paper, index % 2 ? 0 : 1 / 3, index % 2 ? 2 / 3 : 1), 0.99);
    const selected = selectDocumentCandidate([fragment, outer], size, previous).candidate;
    assert.equal(selected, outer);
    const corners = candidateQuad(selected!, size)!;
    previous = corners;
    tracker.update({ timestamp: index * 125, corners, sharpness: 'sharp' }, index * 125);
    assert.deepEqual(tracker.view(index * 125).corners, candidateQuad(outer, size));
  }
});

test('missing, clipped or unsubstantiated wrappers cannot supply an invented outer crop', () => {
  const fragment = candidate(panel(paper, 1 / 3, 1), 0.99);
  assert.equal(selectDocumentCandidate([fragment], size).candidate, fragment);
  const clipped = candidate([{ x: 180, y: 0 }, { x: 810, y: 0 }, paper[2], paper[3]], 0.99);
  const outer = candidate(paper, 0.55);
  for (const wrapper of [
    clipped,
    { ...outer, confidence: 0.25 },
    { ...outer, edgeSupport: 0.49 },
    { ...outer, contourFitRatio: 0.2 },
    { ...outer, edgeSupport: undefined },
  ]) {
    assert.notEqual(selectDocumentCandidate([fragment, wrapper], size).candidate, wrapper);
  }
});

test('a smaller overlapping paper with only adjacent shared sides stays independent', () => {
  const outer = candidate(paper, 0.55);
  const other = candidate(
    [{ x: 250, y: 437 }, { x: 810, y: 437 }, paper[2], { x: 250, y: 1031 }],
    0.99,
  );
  assert.equal(selectDocumentCandidate([other, outer], size).candidate, other);
});
