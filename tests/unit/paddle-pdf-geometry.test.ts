import assert from 'node:assert/strict';
import test from 'node:test';
import {
  estimatePaddlePdfMemory,
  paddleLineMatrix,
  paddleTextHex,
  paddleToUnicodeCmap,
  paddleUnicodeMap,
  validatePaddlePdfLayer,
} from '../../packages/scanner/src/paddle-pdf-geometry.ts';
import type { PaddlePdfLayer } from '../../packages/scanner/src/paddle-pdf-geometry.ts';

const layer = (text: string): PaddlePdfLayer => ({
  imageSize: { width: 1000, height: 500 },
  lines: [
    {
      text,
      poly: [
        [100, 100],
        [600, 100],
        [600, 200],
        [100, 200],
      ],
    },
  ],
});
const code = (value: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === value;

test('PDF CIDs preserve exact Unicode scalars and map supplementary text to UTF16', () => {
  const input = layer('Äß😀e\u0301Ä');
  const before = structuredClone(input);
  const map = paddleUnicodeMap([input]);
  assert.equal(map.size, 5);
  assert.equal(paddleTextHex(input.lines[0].text, map), '000100020003000400050001');
  const cmap = paddleToUnicodeCmap(map);
  assert(cmap.includes('<0001> <00c4>'));
  assert(cmap.includes('<0003> <d83dde00>'));
  assert(cmap.includes('<0005> <0301>'));
  assert.deepEqual(input, before);
  assert.throws(() => paddleTextHex('not mapped', map), code('EXPORT_FAILED'));
});

test('line matrices share image placement, y inversion and skew without a second rotation', () => {
  const placement = { x: 20, y: 30, width: 200, height: 100 };
  const input = layer('ABCD');
  const close = (actual: readonly number[] | null, expected: number[]) => {
    assert(actual);
    actual.forEach((value, index) => assert(Math.abs(value - expected[index]) < 1e-10));
  };
  close(paddleLineMatrix(input.lines[0], input.imageSize, placement), [50, 0, 0, 20, 40, 90]);
  const skewed = {
    text: 'ABCD',
    poly: [
      [100, 100],
      [600, 150],
      [620, 250],
      [120, 200],
    ] as const,
  };
  close(paddleLineMatrix(skewed, input.imageSize, placement), [50, -5, -4, 20, 44, 90]);
  assert.equal(paddleLineMatrix({ ...input.lines[0], text: '' }, input.imageSize, placement), null);
});

test('pixel-edge coordinates are inclusive; invalid shapes or mismatched images fail atomically', () => {
  const edge: PaddlePdfLayer = {
    imageSize: { width: 1000, height: 500 },
    lines: [
      {
        text: 'edge',
        poly: [
          [0, 0],
          [1000, 0],
          [1000, 500],
          [0, 500],
        ],
      },
    ],
  };
  validatePaddlePdfLayer(edge, edge.imageSize);
  for (const poly of [
    [
      [-1, 0],
      [1000, 0],
      [1000, 500],
      [0, 500],
    ],
    [
      [0, 0],
      [1001, 0],
      [1000, 500],
      [0, 500],
    ],
    [
      [0, 0],
      [1000, 500],
      [1000, 0],
      [0, 500],
    ],
    [
      [0, 0],
      [0, 0],
      [1000, 500],
      [0, 500],
    ],
    [
      [NaN, 0],
      [1000, 0],
      [1000, 500],
      [0, 500],
    ],
  ] as const)
    assert.throws(
      () =>
        validatePaddlePdfLayer({ ...edge, lines: [{ text: 'retained', poly }] }, edge.imageSize),
      code('EXPORT_FAILED'),
    );
  assert.throws(
    () => validatePaddlePdfLayer(edge, { width: 500, height: 1000 }),
    code('EXPORT_FAILED'),
  );
});

test('Paddle memory accounts for UTF16, repeated glyphs across pages and line/font buffers', () => {
  const first = layer('Ä😀');
  const second = layer('Äe\u0301');
  // Six UTF16 units, two lines, four distinct scalars and the pinned572-byte font.
  assert.equal(
    estimatePaddlePdfMemory([first, second], 572),
    12 * 8 + 2 * 1024 + 4 * 256 + 572 * 4,
  );
  assert.throws(() => estimatePaddlePdfMemory([layer('\ud800')], 572), code('EXPORT_FAILED'));
  assert.throws(() => estimatePaddlePdfMemory([first], NaN), code('EXPORT_FAILED'));
});

test('CID exhaustion fails instead of wrapping or dropping Unicode characters', () => {
  const text = Array.from({ length: 65536 }, (_, index) =>
    String.fromCodePoint(0x10000 + index),
  ).join('');
  assert.throws(() => paddleUnicodeMap([layer(text)]), code('LIMIT_EXCEEDED'));
});
