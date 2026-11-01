import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAnimateOutline, outlineAt } from '../../packages/scanner/src/react/outline-motion.ts';
import type { Quad } from '../../packages/scanner/src/types.ts';

test('display interpolation is bounded, reaches its accepted target and does not mutate measurements', () => {
  const before: Quad = [
    { x: 0.2, y: 0.1 },
    { x: 0.8, y: 0.1 },
    { x: 0.8, y: 0.9 },
    { x: 0.2, y: 0.9 },
  ];
  const next = before.map((point) => ({ ...point, x: point.x + 0.02 })) as Quad;
  const measurements = structuredClone({ before, next });
  assert(canAnimateOutline(before, next));
  assert.deepEqual(outlineAt(before, next, 0), before);
  assert(Math.abs(outlineAt(before, next, 60)[0].x - 0.215) < 1e-12);
  for (const elapsed of [120, 1000]) assert.deepEqual(outlineAt(before, next, elapsed), next);
  assert.deepEqual({ before, next }, measurements);
  assert.equal(
    canAnimateOutline(before, before.map((point) => ({ ...point, x: point.x + 0.1 })) as Quad),
    false,
  );
});
