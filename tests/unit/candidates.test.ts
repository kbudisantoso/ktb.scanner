import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectDocumentCandidate,
  compareCaptureHint,
  paperShape,
  candidateQuad,
} from '../../packages/scanner/src/candidates.ts';
import type { DocumentCandidate } from '../../packages/scanner/src/candidates.ts';
import type { CaptureHint, Quad } from '../../packages/scanner/src/types.ts';
const size = { width: 1001, height: 1001 };
function sheet(left: number, right: number, top = 0.1, bottom = 0.9, confidence = 0.8) {
  return {
    corners: {
      topLeft: { x: left * 1000, y: top * 1000 },
      topRight: { x: right * 1000, y: top * 1000 },
      bottomRight: { x: right * 1000, y: bottom * 1000 },
      bottomLeft: { x: left * 1000, y: bottom * 1000 },
    },
    confidence,
    isValid: true,
    edgeSupport: 0.9,
    contourFitRatio: 1,
  };
}
test('the source frame is not a document candidate, including rotated padding edges', () => {
  for (const inset of [0, 0.002, 0.01]) {
    const frame = sheet(inset, 1 - inset, inset, 1 - inset, 0.99);
    assert.equal(candidateQuad(frame, size), null);
    assert.equal(selectDocumentCandidate([frame], size).candidate, null);
  }
  assert.ok(candidateQuad(sheet(0.05, 0.95, 0.05, 0.95), size));
});
test('three distinct full sheets choose the middle despite a better side score', () => {
  const left = sheet(0.02, 0.27, 0.1, 0.9, 0.99),
    middle = sheet(0.37, 0.62, 0.1, 0.9, 0.6),
    right = sheet(0.72, 0.97);
  assert.equal(selectDocumentCandidate([right, left, middle], size).candidate, middle);
});
test('two full sheets prefer the left, even when the right is closer to frame center', () => {
  const left = sheet(0.01, 0.25),
    right = sheet(0.37, 0.65);
  assert.equal(selectDocumentCandidate([right, left], size).candidate, left);
});
test('a full side sheet wins over a clipped central sheet', () => {
  const left = sheet(0.03, 0.27),
    middle = sheet(0.38, 0.63, 0, 0.9);
  assert.equal(selectDocumentCandidate([middle, left], size).candidate, left);
});
test('full sheets outrank clipped sheets before the left preference', () => {
  const left = sheet(0, 0.3),
    right = sheet(0.6, 0.9);
  assert.equal(selectDocumentCandidate([left, right], size).candidate, right);
});
test('a clipped alternative cannot suppress a full contour of the same sheet', () => {
  const full = sheet(0.22, 0.78, 0.04, 0.9, 0.75),
    clipped = sheet(0.22, 0.78, 0, 0.9, 0.99);
  assert.equal(selectDocumentCandidate([clipped, full], size).candidate, full);
});
test('duplicate cascade contours do not count as separate documents', () => {
  const left = sheet(0.03, 0.27),
    right = sheet(0.7, 0.95);
  const duplicate = sheet(0.701, 0.951, 0.101, 0.901, 0.79);
  const result = selectDocumentCandidate([left, right, duplicate], size);
  assert.equal(result.candidate, left);
  assert.equal(result.candidates.filter((c) => c.excluded === 'duplicate').length, 1);
});
test('interior rectangular content cannot displace its enclosing paper', () => {
  const paper = sheet(0.1, 0.9, 0.05, 0.95, 0.8),
    text = sheet(0.3, 0.7, 0.25, 0.75, 0.9),
    other = sheet(0.01, 0.08);
  const result = selectDocumentCandidate([text, paper, other], size);
  assert.equal(result.candidate, paper);
  assert.equal(result.candidates[0].excluded, 'inside-another-sheet');
});
test('invalid, tiny or unsubstantiated contours produce no automatic crop', () => {
  const tiny = sheet(0.1, 0.11),
    low = { ...sheet(0.1, 0.9), isValid: false, confidence: 0.1 };
  const invalid = { ...sheet(0.1, 0.9), corners: null };
  assert.equal(selectDocumentCandidate([tiny, low, invalid], size).candidate, null);
  const crossing = sheet(0.1, 0.9);
  crossing.corners.bottomLeft = { x: 900, y: 100 };
  assert.equal(selectDocumentCandidate([crossing], size).candidate, null);
});
test('perspective quads remain eligible without forcing an A-format aspect ratio', () => {
  const tilted: DocumentCandidate = sheet(0.1, 0.9);
  tilted.corners!.topRight = { x: 800, y: 250 };
  assert.equal(selectDocumentCandidate([tilted], size).candidate, tilted);
});
test('a rectangular paper contour beats a higher-confidence trapezoid of the same sheet', () => {
  const paper = sheet(0.22, 0.78, 0.1, 0.9, 0.8);
  const trapezoid = {
    ...sheet(0.22, 0.78, 0.1, 0.9, 0.94),
    corners: {
      topLeft: { x: 160, y: 160 },
      topRight: { x: 840, y: 160 },
      bottomRight: { x: 780, y: 900 },
      bottomLeft: { x: 220, y: 900 },
    },
  };
  const result = selectDocumentCandidate([trapezoid, paper], size);
  assert.equal(result.candidate, paper);
  assert.equal(result.candidates[0].excluded, 'duplicate');
  assert(result.candidates[1].shape!.rectangularity > result.candidates[0].shape!.rectangularity);
  assert.deepEqual(result.workingSize, size);
  assert.equal(result.candidates[1].edgeSupport, paper.edgeSupport);
  assert.equal(result.candidates[1].contourFitRatio, paper.contourFitRatio);
});
test('overlapping false trapezoids are alternate hypotheses, not additional middle sheets', () => {
  const paper = sheet(0.3, 0.7, 0.2, 0.8, 0.5);
  const lower = {
    ...sheet(0.2, 0.7, 0.45, 0.8, 0.65),
    corners: {
      topLeft: { x: 180, y: 450 },
      topRight: { x: 680, y: 580 },
      bottomRight: { x: 730, y: 760 },
      bottomLeft: { x: 220, y: 850 },
    },
  };
  const diagonal = {
    ...sheet(0.2, 0.7, 0.2, 0.8, 0.6),
    corners: {
      topLeft: { x: 350, y: 150 },
      topRight: { x: 670, y: 220 },
      bottomRight: { x: 700, y: 800 },
      bottomLeft: { x: 130, y: 720 },
    },
  };
  const result = selectDocumentCandidate([lower, diagonal, paper], size);
  assert.equal(result.candidate, paper);
  assert.equal(result.reason, 'single-sheet');
  assert.equal(result.candidates.filter((c) => c.excluded === 'duplicate').length, 2);
});
test('limited overlap and inner boxes do not merge separate papers', () => {
  const left = sheet(0.05, 0.55),
    right = sheet(0.45, 0.95);
  const result = selectDocumentCandidate([right, left], size);
  assert.equal(result.candidate, left);
  assert.equal(result.reason, 'left-sheet');
});
test('almost-contained smaller contours cannot become a second left sheet', () => {
  const paper = sheet(0.3, 0.8, 0.15, 0.85, 0.8);
  const bottomBox = sheet(0.29, 0.79, 0.61, 0.86, 0.72);
  const result = selectDocumentCandidate([bottomBox, paper], size);
  assert.equal(result.candidate, paper);
  assert.equal(result.reason, 'single-sheet');
  assert.equal(result.candidates[0].excluded, 'inside-another-sheet');
});
test('a weak crossing partial contour cannot trigger left-sheet preference', () => {
  const paper = {
    ...sheet(0.3, 0.8, 0.3, 0.8, 0.75),
    corners: {
      topLeft: { x: 400, y: 300 },
      topRight: { x: 810, y: 350 },
      bottomRight: { x: 690, y: 820 },
      bottomLeft: { x: 270, y: 740 },
    },
  };
  const partial = {
    ...sheet(0.05, 0.8, 0.55, 0.9, 0.45),
    corners: {
      topLeft: { x: 300, y: 540 },
      topRight: { x: 750, y: 600 },
      bottomRight: { x: 690, y: 830 },
      bottomLeft: { x: 20, y: 890 },
    },
  };
  const result = selectDocumentCandidate([partial, paper], size);
  assert.equal(result.candidate, paper);
  assert.equal(result.reason, 'single-sheet');
  assert.equal(result.candidates[0].excluded, 'overlapping-weaker-hypothesis');
});
test('substantially overlapping real sheets with comparable evidence remain separate', () => {
  const left = sheet(0.08, 0.62, 0.12, 0.88, 0.75);
  const right = sheet(0.33, 0.87, 0.12, 0.88, 0.8);
  const result = selectDocumentCandidate([right, left], size);
  assert.equal(result.candidate, left);
  assert.equal(result.reason, 'left-sheet');
});
test('a crossing edge wedge cannot become the left sheet at similar detector confidence', () => {
  const paper = sheet(0.25, 0.8, 0.12, 0.86, 0.55);
  const wedge = {
    ...sheet(0.1, 0.5, 0.12, 0.8, 0.56),
    corners: {
      topLeft: { x: 250, y: 120 },
      topRight: { x: 500, y: 120 },
      bottomRight: { x: 300, y: 700 },
      bottomLeft: { x: 50, y: 800 },
    },
  };
  const result = selectDocumentCandidate([wedge, paper], size);
  assert.equal(result.candidate, paper);
  assert.equal(result.reason, 'single-sheet');
  assert.equal(result.candidates[0].excluded, 'overlapping-weaker-hypothesis');
});
test('a separate narrow receipt remains eligible beside a better scoring paper', () => {
  const paper = sheet(0.3, 0.9, 0.1, 0.9, 0.8);
  const receipt = sheet(0.02, 0.2, 0.1, 0.9, 0.6);
  const result = selectDocumentCandidate([paper, receipt], size);
  assert.equal(result.candidate, receipt);
  assert.equal(result.reason, 'left-sheet');
});
test('an unresolved overlapping inner fragment requests uncropped review instead of left-sheet selection', () => {
  const outer = sheet(0.3, 0.8, 0.1, 0.9, 0.75);
  const fragment = sheet(0.25, 0.55, 0.05, 0.4, 0.75);
  const result = selectDocumentCandidate([outer, fragment], size);
  assert.equal(result.candidate, null);
  assert.equal(result.reason, 'ambiguous-overlapping-contours');
  assert.equal(
    result.candidates.some((item) => item.selected),
    false,
  );
});
test('paper ratio evidence uses source pixels and is invariant to in-plane rotation', () => {
  const portrait: Quad = [
    { x: 0.3, y: 0.1 },
    { x: 0.7, y: 0.1 },
    { x: 0.7, y: 0.9 },
    { x: 0.3, y: 0.9 },
  ];
  const dimensions = { width: 1415, height: 1001 };
  const evidence = paperShape(portrait, dimensions);
  assert.equal(evidence.family, 'A/B');
  assert(Math.abs(evidence.ratio - 0.707) < 0.001);
  assert.equal(evidence.rectangularity, 1);
  const angle = 0.2,
    cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const rotated = portrait.map((p) => {
    const x = (p.x - 0.5) * 1414,
      y = (p.y - 0.5) * 1000;
    return { x: 0.5 + (x * cosine - y * sine) / 1414, y: 0.5 + (x * sine + y * cosine) / 1000 };
  }) as Quad;
  const turned = paperShape(rotated, dimensions);
  assert(Math.abs(turned.ratio - evidence.ratio) < 1e-12);
  assert(Math.abs(turned.rectangularity - 1) < 1e-12);
});
test('Letter and A/B are soft priors; a long receipt is still eligible', () => {
  const letter = sheet(0.2, 0.2 + (0.8 * 215.9) / 279.4);
  assert.equal(paperShape(candidateQuad(letter, size)!, size).family, 'Letter');
  const receipt = sheet(0.4, 0.6, 0.03, 0.97);
  assert.equal(selectDocumentCandidate([receipt], size).candidate, receipt);
  assert(paperShape(candidateQuad(receipt, size)!, size).formatFit < 0.01);
});
test('live continuity resists small confidence reversals within the same sheet', () => {
  const a = sheet(0.22, 0.78, 0.1, 0.9, 0.8),
    b = sheet(0.225, 0.785, 0.105, 0.905, 0.82);
  const previous = candidateQuad(a, size)!;
  assert.equal(selectDocumentCandidate([a, b], size).candidate, b);
  assert.equal(selectDocumentCandidate([a, b], size, previous).candidate, a);
  const farBetter = { ...b, confidence: 1 };
  assert.equal(selectDocumentCandidate([a, farBetter], size, previous).candidate, farBetter);
});
const quad: Quad = [
  { x: 0.1, y: 0.1 },
  { x: 0.4, y: 0.1 },
  { x: 0.4, y: 0.9 },
  { x: 0.1, y: 0.9 },
];
const hint: CaptureHint = {
  stable: true,
  corners: quad,
  frameSize: size,
  ageMs: 100,
  mapping: 'same-frame-area',
};
test('live comparison rejects stale, unknown photo FOV and mismatched aspect hints', () => {
  assert.equal(compareCaptureHint({ ...hint, ageMs: 401 }, size, quad).state, 'stale');
  assert.equal(
    compareCaptureHint({ ...hint, mapping: 'unverified-photo-area' }, size, quad).state,
    'different-photo-field-of-view',
  );
  assert.equal(
    compareCaptureHint(hint, { width: 1600, height: 900 }, quad).state,
    'different-aspect-ratio',
  );
});
test('fresh live comparison records disagreement but retains still-image authority', () => {
  const still = quad.map((p) => ({ ...p, x: p.x + 0.3 })) as Quad;
  const result = compareCaptureHint(hint, size, still);
  assert.equal(result.state, 'disagrees');
  assert.equal(result.authority, 'still-image');
  assert.equal(result.stillCorners, still);
  assert.equal(compareCaptureHint(hint, size, quad).state, 'agrees');
  assert.equal(compareCaptureHint(hint, size, null).state, 'still-not-detected');
});
