import assert from 'node:assert/strict';
import test from 'node:test';
import { orderPaddleLayout } from '../../packages/scanner/src/paddle-layout.ts';
import type { PaddleLayoutItem } from '../../packages/scanner/src/paddle-layout.ts';

function box(text: string, x: number, y: number, width: number, height = 10): PaddleLayoutItem {
  return {
    text,
    score: 0.9,
    poly: [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
  };
}
function keepAll(input: readonly PaddleLayoutItem[], expected: readonly PaddleLayoutItem[]) {
  const snapshot = structuredClone(input);
  const result = orderPaddleLayout(input);
  assert.deepEqual(result.items, expected);
  assert.deepEqual(input, snapshot);
  assert.equal(result.items.length, input.length);
  for (const item of input)
    assert.equal(
      result.items.filter((v) => v === item).length,
      input.filter((v) => v === item).length,
    );
  return result;
}

test('one column preserves exact Unicode text, blank items and repeated identities', () => {
  const a = box('ÄÖü  12\nunchanged', 10, 10, 160),
    b = box('', 10, 30, 100),
    c = box('third', 10, 50, 130);
  const result = keepAll([c, a, b], [a, b, c]);
  assert.equal(result.text, `${a.text}\n\n${c.text}`);
  assert.equal(result.uncertain, false);
  keepAll([a, a], [a, a]);
});

test('two paragraph columns follow a full-width header and retain small edge crossings', () => {
  const title = box('header', 10, 0, 430, 16);
  const left = Array.from({ length: 5 }, (_, i) =>
    box(`L${i}`, 10, 40 + i * 16, i === 2 ? 205 : 200),
  );
  const right = Array.from({ length: 5 }, (_, i) => box(`R${i}`, 214, 40 + i * 16, 220));
  const input = [right[4], title, ...left.flatMap((v, i) => [right[i], v]).slice(0, -2), left[4]];
  const result = keepAll(input, [title, ...left, ...right]);
  assert.equal(result.uncertain, true);
  assert(result.reasons.includes('column-flow-inferred'));
});

test('list markers and wrapped fragments stay in their own column and are retained', () => {
  const left = Array.from({ length: 4 }, (_, i) => box(`left ${i}`, 20, 30 + i * 20, 170));
  const marker = box('1.', 5, 30, 8),
    fragment = box('tail', 150, 50, 40);
  const right = Array.from({ length: 4 }, (_, i) => box(`right ${i}`, 220, 30 + i * 20, 190));
  left[1] = box('wrap', 20, 50, 110);
  const result = keepAll(
    [right[2], fragment, ...left, marker, right[0], right[1], right[3]],
    [marker, left[0], left[1], fragment, ...left.slice(2), ...right],
  );
  assert.equal(result.text.split('\n')[0], '1. left 0');
});

test('common modest skew and scale do not change the inferred column order', () => {
  const items = [
    ...Array.from({ length: 4 }, (_, i) => box(`L${i}`, 0, 20 * i, 180)),
    ...Array.from({ length: 4 }, (_, i) => box(`R${i}`, 220, 20 * i, 180)),
  ];
  for (const factor of [0.05, 1, 20]) {
    const angle = (8 * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const transformed = items.map((i) => ({
      ...i,
      poly: i.poly.map(
        ([x, y]) => [(x * c - y * s) * factor, (x * s + y * c) * factor] as [number, number],
      ),
    }));
    const result = orderPaddleLayout([...transformed].reverse());
    assert.deepEqual(
      result.items.map((i) => i.text),
      items.map((i) => i.text),
    );
    assert.equal(result.uncertain, true);
  }
});

test('a separator creates vertical bands instead of entering the preceding column body', () => {
  const left = Array.from({ length: 4 }, (_, i) => box(`L${i}`, 0, 20 * i, 190));
  const right = Array.from({ length: 4 }, (_, i) => box(`R${i}`, 220, 20 * i, 190));
  const footer = box('full width footer', 0, 100, 410);
  keepAll([right[0], footer, ...left, ...right.slice(1)], [...left, ...right, footer]);
});

test('recursive columns and full-width internal sections use their local text scale', () => {
  const columns = [0, 220, 440].map((x, c) =>
    Array.from({ length: 4 }, (_, r) => box(`${c}/${r}`, x, 20 * r, 180)),
  );
  keepAll(columns.flat().reverse(), columns.flat());
  const title = box('section', 0, 100, 420, 18);
  const lowerLeft = Array.from({ length: 4 }, (_, i) =>
    box(`small L${i}`, 0, 140 + 10 * i, 190, 5),
  );
  const lowerRight = Array.from({ length: 4 }, (_, i) =>
    box(`small R${i}`, 230, 140 + 10 * i, 190, 5),
  );
  const input = [...columns[0], ...columns[1], title, ...lowerLeft, ...lowerRight];
  keepAll(input.reverse(), [...columns[0], ...columns[1], title, ...lowerLeft, ...lowerRight]);
});

test('compact tables and horizontal receipts keep row order and expose ambiguity', () => {
  for (const widths of [
    [70, 40],
    [180, 35],
  ]) {
    const lines = Array.from({ length: 5 }, (_, i) => [
      box(`item${i}`, 0, 20 * i, widths[0]),
      box(`value${i}`, 260, 20 * i, widths[1]),
    ]);
    const expected = lines.flat();
    const result = keepAll([...expected].reverse(), expected);
    assert.equal(result.uncertain, true);
    assert(result.reasons.includes('tabular-or-ambiguous-columns'));
  }
});

test('anchor rows prevent a chain of small y offsets from collapsing separate rows', () => {
  const a = box('A', 0, 0, 20),
    b = box('B', 30, 5, 20),
    c = box('C', 0, 10, 20),
    d = box('D', 30, 15, 20);
  const result = keepAll([d, c, b, a], [a, b, c, d]);
  assert.equal(result.text, 'A B\nC D');
});

test('ambiguous overlaps use deterministic conservative row order without dropping text', () => {
  const a = box('left', 0, 0, 100),
    b = box('overlap', 50, 0, 100),
    c = box('below', 0, 30, 100);
  const result = keepAll([c, b, a], [a, b, c]);
  assert.equal(result.uncertain, true);
  assert(result.reasons.includes('overlapping-lines'));
  assert.deepEqual(orderPaddleLayout([c, b, a]), result);
});

test('invalid geometry retains original order and data rather than inventing positions', () => {
  const a = box('valid', 0, 0, 100),
    bad = { ...box('retained', 0, 20, 100), poly: [[NaN, 1]] as [number, number][] };
  const result = keepAll([bad, a], [bad, a]);
  assert.equal(result.uncertain, true);
  assert.deepEqual(result.reasons, ['invalid-geometry']);
  assert.deepEqual(orderPaddleLayout([]), { text: '', items: [], uncertain: false, reasons: [] });
});

test('overlapping fragments within one column warn locally without vetoing a separate gutter', () => {
  const left = Array.from({ length: 5 }, (_, i) => box(`left ${i}`, 0, i * 20, 190));
  const first = box('fragment A', 0, 20, 120);
  const second = box('fragment B', 80, 20, 110);
  left.splice(1, 1, first, second);
  const right = Array.from({ length: 5 }, (_, i) => box(`right ${i}`, 230, i * 20, 190));
  const result = keepAll([...right, ...left].reverse(), [...left, ...right]);
  assert(result.reasons.includes('overlapping-lines'));
  assert(result.reasons.includes('column-flow-inferred'));
  assert.equal(result.uncertain, true);
});

test('separated compact table cells cannot masquerade as one wide paragraph column', () => {
  const title = box('invoice heading', 0, 0, 600, 16);
  const table = Array.from({ length: 5 }, (_, i) => [
    box(`position ${i}`, 0, 60 + i * 20, 15),
    box(`description ${i}`, 30, 60 + i * 20, 190),
    box(`quantity ${i}`, 300, 60 + i * 20, 15),
    box(`unit ${i}`, 410, 60 + i * 20, 40),
    box(`total ${i}`, 550, 60 + i * 20, 40),
  ]).flat();
  const result = keepAll([...table, title].reverse(), [title, ...table]);
  assert(result.reasons.includes('tabular-or-ambiguous-columns'));
  assert(!result.reasons.includes('column-flow-inferred'));
});

test('substantially conflicting candidate columns remain conservative rows', () => {
  const rowPairs = Array.from({ length: 5 }, (_, i) => [
    box(`left ${i}`, 0, i * 20, 180),
    box(`right ${i}`, 150, i * 20, 180),
  ]);
  const result = keepAll(rowPairs.flat().reverse(), rowPairs.flat());
  assert.equal(result.uncertain, true);
  assert(!result.reasons.includes('column-flow-inferred'));
});
