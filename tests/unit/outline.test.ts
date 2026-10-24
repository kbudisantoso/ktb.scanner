import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressOutline } from '../../packages/scanner/src/outline.ts';
import type { Quad } from '../../packages/scanner/src/types.ts';

const corners: Quad = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.1 },
  { x: 0.8, y: 0.9 },
  { x: 0.2, y: 0.9 },
];
test('progress follows true perimeter in portrait and landscape, with no early closed outline', () => {
  for (const size of [
    { width: 300, height: 400 },
    { width: 600, height: 200 },
  ]) {
    const perimeter = 2 * (0.6 * size.width + 0.8 * size.height);
    for (const progress of [0.1, 0.25, 0.5, 0.9, 0.985, 1]) {
      const points = progressOutline(corners, size, progress);
      const length = points
        .slice(1)
        .reduce(
          (sum, point, index) =>
            sum +
            Math.hypot(
              (point.x - points[index].x) * size.width,
              (point.y - points[index].y) * size.height,
            ),
          0,
        );
      assert.ok(Math.abs(length / perimeter - progress) < 1e-10);
      if (progress < 1) assert.notDeepEqual(points.at(-1), corners[0]);
    }
    const almost = progressOutline(corners, size, 0.999999);
    assert.notDeepEqual(almost.at(-1), corners[0]);
  }
  assert.deepEqual(progressOutline(corners, { width: 300, height: 400 }, 0), []);
});
