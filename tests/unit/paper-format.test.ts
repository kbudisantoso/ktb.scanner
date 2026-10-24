import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatePaperRatio,
  suggestFormat,
  FULL_QUAD,
} from '../../packages/scanner/src/geometry.ts';
import { resolvePaperPreference } from '../../packages/scanner/src/paper-region.ts';
import type { Quad } from '../../packages/scanner/src/types.ts';
import { size, photograph } from '../fixtures/paper-projection.ts';

test('projective ratio recovers independent paper proportions across tilt and in-plane rotation', () => {
  for (const [w, h] of [
    [210, 297],
    [215.9, 279.4],
  ]) {
    for (const angles of [
      [25, 20, 0],
      [35, 25, 20],
      [-25, 20, -15],
      [30, -20, 90],
    ]) {
      const corners = photograph(w, h, ...(angles as [number, number, number]));
      const evidence = estimatePaperRatio(size, corners);
      assert.equal(evidence.method, 'projective', JSON.stringify({ w, h, angles, evidence }));
      assert.ok(Math.abs(evidence.ratio - w / h) < 1e-8);
      for (const preferredPaper of ['A4', 'letter'] as const) {
        const format = suggestFormat(size, { corners, preferredPaper });
        assert.equal(format.kind, 'standard');
        assert.equal(format.kind === 'standard' && format.preset, w === 210 ? 'A4' : 'letter');
      }
    }
  }
});
test('affine and unstable views fall back without claiming metric reconstruction', () => {
  assert.equal(estimatePaperRatio(size, FULL_QUAD).method, 'edge-lengths');
  const nearAffine: Quad = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2001 },
    { x: 0.8001, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];
  assert.equal(estimatePaperRatio(size, nearAffine).method, 'edge-lengths');
  const strongSkew: Quad = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.3 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.9 },
  ];
  assert.equal(estimatePaperRatio(size, strongSkew).method, 'edge-lengths');
  assert.equal(
    suggestFormat(size, { corners: strongSkew, preferredPaper: 'A4' }).kind,
    'original-ratio',
  );
});
test('failed focal recovery cannot promote perspective-distorted edge lengths to a clear Letter decision', () => {
  for (const roll of [-15, 0, 15, 90]) {
    const corners = photograph(210, 297, 25, 0, roll);
    const evidence = estimatePaperRatio(size, corners);
    assert.equal(evidence.method, 'edge-lengths');
    assert.equal(evidence.uncertainPerspective, true);
    assert.ok(
      evidence.ratioRange &&
        evidence.ratioRange.min < 210 / 297 &&
        evidence.ratioRange.max > 210 / 297,
    );
    assert.deepEqual(suggestFormat(size, { corners, preferredPaper: 'A4' }), {
      kind: 'standard',
      preset: 'A4',
      origin: 'default',
    });
    const noisy = corners.map((p, i) => ({ x: p.x + (i === 0 ? 0.0004 : 0), y: p.y })) as Quad;
    const format = suggestFormat(size, { corners: noisy, preferredPaper: 'A4' });
    assert.equal(format.kind === 'standard' && format.preset, 'A4');
  }
});
test('uncertain perspective retains a plausible regional Letter default; front-facing Letter stays clear', () => {
  const corners = photograph(215.9, 279.4, 25, 0, 10);
  const format = suggestFormat(size, { corners, preferredPaper: 'letter' });
  assert.equal(format.kind === 'standard' && format.preset, 'letter');
  const front = photograph(215.9, 279.4, 0, 0);
  assert.notEqual(estimatePaperRatio(size, front).uncertainPerspective, true);
  const clear = suggestFormat(size, { corners: front, preferredPaper: 'A4' });
  assert.equal(clear.kind === 'standard' && clear.preset, 'letter');
});
test('regional preference resolves close ratios but cannot override clear geometry', () => {
  for (const preferredPaper of ['A4', 'letter'] as const) {
    const ambiguous = suggestFormat({ width: 740, height: 1000 }, { preferredPaper });
    assert.equal(ambiguous.kind === 'standard' && ambiguous.preset, preferredPaper);
    const a4 = suggestFormat({ width: 210, height: 297 }, { preferredPaper });
    const letter = suggestFormat({ width: 215.9, height: 279.4 }, { preferredPaper });
    assert.equal(a4.kind === 'standard' && a4.preset, 'A4');
    assert.equal(letter.kind === 'standard' && letter.preset, 'letter');
    assert.equal(suggestFormat({ width: 200, height: 1200 }, { preferredPaper }).kind, 'receipt');
    assert.equal(
      suggestFormat({ width: 1000, height: 1000 }, { preferredPaper }).kind,
      'original-ratio',
    );
  }
});
test('paper regions follow explicit primary locale regions rather than inferred language geography', () => {
  assert.deepEqual(resolvePaperPreference('DE', ['en-US']), {
    preferredPaper: 'A4',
    source: 'host-region',
  });
  assert.deepEqual(resolvePaperPreference('ca', ['de-DE']), {
    preferredPaper: 'letter',
    source: 'host-region',
  });
  for (const locale of ['de-DE', 'de-CH', 'en-GB', 'en-AU'])
    assert.deepEqual(resolvePaperPreference(undefined, [locale]), {
      preferredPaper: 'A4',
      source: 'browser-region',
    });
  for (const locale of ['en-US', 'fr-CA', 'es-MX', 'fil-PH'])
    assert.deepEqual(resolvePaperPreference(undefined, [locale]), {
      preferredPaper: 'letter',
      source: 'browser-region',
    });
  for (const locales of [[], ['en'], ['de', 'en-US'], ['invalid_locale', 'en-US']])
    assert.deepEqual(resolvePaperPreference(undefined, locales), {
      preferredPaper: 'A4',
      source: 'default',
    });
});

test('unsupported document edges cannot establish Letter against the regional prior', () => {
  const corners = photograph(215.9, 279.4, 35, 25, 20);
  assert.equal(estimatePaperRatio(size, corners).method, 'projective');
  for (const preferredPaper of ['A4', 'letter'] as const) {
    const uncertain = suggestFormat(size, { corners, preferredPaper, geometryUncertain: true });
    assert.equal(uncertain.kind === 'standard' && uncertain.preset, preferredPaper);
  }
  const supported = suggestFormat(size, {
    corners,
    preferredPaper: 'A4',
    geometryUncertain: false,
  });
  assert.equal(supported.kind === 'standard' && supported.preset, 'letter');
  for (const [width, height, kind] of [
    [100, 600, 'original-ratio'],
    [600, 600, 'original-ratio'],
  ] as const)
    assert.equal(suggestFormat({ width, height }, { geometryUncertain: true }).kind, kind);
  assert.equal(
    suggestFormat({ width: 100, height: 600 }, { geometryUncertain: false }).kind,
    'receipt',
  );
});
