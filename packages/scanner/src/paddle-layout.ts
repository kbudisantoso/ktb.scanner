export interface PaddleLayoutItem {
  readonly text: string;
  readonly score: number;
  readonly poly: readonly (readonly [number, number])[];
}

export interface PaddleLayoutResult<T extends PaddleLayoutItem> {
  text: string;
  items: T[];
  uncertain: boolean;
  reasons: string[];
}

// Dimensionless private geometry parameters, not a semantic layout model.
export const PADDLE_LAYOUT_PARAMETERS = Object.freeze({
  maxDeskewRadians: Math.PI / 12,
  rowAnchorHeight: 0.55,
  endpointClusterHeight: 0.35,
  overhangHeight: 0.65,
  overhangWidth: 0.025,
  interiorCrossingFraction: 0.12,
  fragmentWidthHeight: 2.5,
  fragmentGapHeight: 1.5,
  minColumnRows: 3,
  minCommonHeight: 2,
  minVerticalOverlap: 0.4,
  minColumnWidthFraction: 0.22,
  minColumnFill: 0.45,
  allowedGutterOverlapHeight: 0.5,
  overlappingLineFraction: 0.25,
  maxDepth: 8,
});

type Box<T> = {
  item: T;
  index: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  x: number;
  y: number;
  height: number;
};
type Row<T> = { anchor: number; height: number; boxes: Box<T>[] };
type Cut<T> = { left: Box<T>[]; right: Box<T>[]; spanners: Box<T>[]; score: number };
const p = PADDLE_LAYOUT_PARAMETERS;

function quantile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

function scale<T>(boxes: readonly Box<T>[]): number {
  return quantile(
    boxes.map((b) => b.height),
    0.5,
  );
}

function xOrder<T>(a: Box<T>, b: Box<T>): number {
  return a.left - b.left || a.y - b.y || a.index - b.index;
}

// Membership is measured against the first row anchor, never a transitive y comparator.
function rows<T>(boxes: readonly Box<T>[]): Row<T>[] {
  const result: Row<T>[] = [];
  const sorted = [...boxes].sort((a, b) => a.y - b.y || xOrder(a, b));
  for (const box of sorted) {
    let best: Row<T> | undefined;
    let distance = Infinity;
    for (let i = result.length - 1; i >= 0; i--) {
      const row = result[i];
      const delta = Math.abs(box.y - row.anchor);
      if (delta <= p.rowAnchorHeight * Math.min(box.height, row.height) && delta < distance) {
        best = row;
        distance = delta;
      }
    }
    if (best) best.boxes.push(box);
    else result.push({ anchor: box.y, height: box.height, boxes: [box] });
  }
  for (const row of result) row.boxes.sort(xOrder);
  return result.sort((a, b) => a.anchor - b.anchor || xOrder(a.boxes[0], b.boxes[0]));
}

function rowBounds<T>(row: Row<T>) {
  const left = Math.min(...row.boxes.map((b) => b.left));
  const right = Math.max(...row.boxes.map((b) => b.right));
  return { left, right, width: right - left };
}

function contiguousRowWidth<T>(row: Row<T>, unit: number): number {
  let left = row.boxes[0].left;
  let right = row.boxes[0].right;
  let widest = right - left;
  for (const box of row.boxes.slice(1)) {
    if (box.left - right <= unit * p.fragmentGapHeight) right = Math.max(right, box.right);
    else {
      left = box.left;
      right = box.right;
    }
    widest = Math.max(widest, right - left);
  }
  return widest;
}

function candidateCuts<T>(boxes: readonly Box<T>[], unit: number): number[] {
  const endpoints = boxes.flatMap((b) => [b.left, b.right]).sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of endpoints) {
    const last = clusters.at(-1);
    if (last && x - last[0] <= unit * p.endpointClusterHeight) last.push(x);
    else clusters.push([x]);
  }
  const centers = clusters.map((c) => quantile(c, 0.5));
  return centers.slice(1).map((x, i) => (centers[i] + x) / 2);
}

function columnCut<T>(boxes: readonly Box<T>[]): { cut?: Cut<T>; ambiguous: boolean } {
  if (boxes.length < 2 * p.minColumnRows) return { ambiguous: false };
  const unit = scale(boxes);
  const allLeft = Math.min(...boxes.map((b) => b.left));
  const allRight = Math.max(...boxes.map((b) => b.right));
  const width = allRight - allLeft;
  let best: Cut<T> | undefined;
  let ambiguous = false;
  for (const x of candidateCuts(boxes, unit)) {
    const left: Box<T>[] = [],
      right: Box<T>[] = [],
      spanners: Box<T>[] = [];
    for (const b of boxes) {
      const smallPart = Math.min(x - b.left, b.right - x);
      const overhang = Math.max(unit * p.overhangHeight, (b.right - b.left) * p.overhangWidth);
      if (
        b.right - b.left > unit * p.fragmentWidthHeight &&
        smallPart > overhang &&
        smallPart / (b.right - b.left) > p.interiorCrossingFraction
      )
        spanners.push(b);
      else (b.x < x ? left : right).push(b);
    }
    if (!left.length || !right.length) continue;
    const l = rows(left),
      r = rows(right);
    if (Math.min(l.length, r.length) < p.minColumnRows) continue;
    const commonTop = Math.max(l[0].anchor, r[0].anchor);
    const commonBottom = Math.min(l.at(-1)!.anchor, r.at(-1)!.anchor);
    const commonHeight = commonBottom - commonTop;
    const shorterHeight = Math.min(l.at(-1)!.anchor - l[0].anchor, r.at(-1)!.anchor - r[0].anchor);
    if (
      commonHeight < unit * p.minCommonHeight ||
      commonHeight < shorterHeight * p.minVerticalOverlap
    )
      continue;
    const lb = l.map(rowBounds),
      rb = r.map(rowBounds);
    const leftEnd = quantile(
      lb.map((b) => b.right),
      0.75,
    );
    const rightStart = quantile(
      rb.map((b) => b.left),
      0.25,
    );
    const gap = rightStart - leftEnd;
    if (
      gap < -unit * p.allowedGutterOverlapHeight ||
      x < leftEnd - unit * p.overhangHeight ||
      x > rightStart + unit * p.overhangHeight
    )
      continue;
    const leftWidth = quantile(
      l.map((row) => contiguousRowWidth(row, unit)),
      0.65,
    );
    const rightWidth = quantile(
      r.map((row) => contiguousRowWidth(row, unit)),
      0.65,
    );
    const leftExtent = Math.max(...lb.map((b) => b.right)) - Math.min(...lb.map((b) => b.left));
    const rightExtent = Math.max(...rb.map((b) => b.right)) - Math.min(...rb.map((b) => b.left));
    // Compact aligned fields/prices have no evidence for paragraph-column flow.
    if (
      Math.min(leftWidth, rightWidth) < width * p.minColumnWidthFraction ||
      leftWidth < leftExtent * p.minColumnFill ||
      rightWidth < rightExtent * p.minColumnFill
    ) {
      if (gap > unit) ambiguous = true;
      continue;
    }
    // A true full-width separator can divide vertical bands. Conflicting same-y text cannot.
    const conflict = spanners.some((s) =>
      [...left, ...right].some((b) => Math.abs(s.y - b.y) < unit * p.rowAnchorHeight),
    );
    if (conflict) {
      ambiguous = true;
      continue;
    }
    const score =
      Math.min(l.length, r.length) * 3 +
      Math.min(gap / unit, 5) +
      commonHeight / Math.max(unit, shorterHeight) -
      spanners.length * 0.1;
    if (!best || score > best.score) best = { left, right, spanners, score };
  }
  return { cut: best, ambiguous };
}

function partition<T>(boxes: readonly Box<T>[], reasons: Set<string>, depth = 0): Box<T>[][] {
  if (!boxes.length) return [];
  if (depth >= p.maxDepth) {
    reasons.add('layout-depth-limit');
    return rows(boxes).map((r) => r.boxes);
  }
  const { cut, ambiguous } = columnCut(boxes);
  if (!cut) {
    if (ambiguous) reasons.add('tabular-or-ambiguous-columns');
    return rows(boxes).map((r) => r.boxes);
  }
  // Line polygons alone cannot prove whether dense aligned cells are prose or a table.
  reasons.add('column-flow-inferred');
  if (!cut.spanners.length)
    return [
      ...partition(cut.left, reasons, depth + 1),
      ...partition(cut.right, reasons, depth + 1),
    ];
  const result: Box<T>[][] = [];
  let remaining = [...cut.left, ...cut.right];
  for (const spanningRow of rows(cut.spanners)) {
    const before = remaining.filter((b) => b.y < spanningRow.anchor);
    remaining = remaining.filter((b) => b.y >= spanningRow.anchor);
    result.push(...partition(before, reasons, depth + 1), spanningRow.boxes);
  }
  return [...result, ...partition(remaining, reasons, depth + 1)];
}

/** Geometry-only reading-order hypothesis. Text and item identities are never edited or dropped. */
export function orderPaddleLayout<T extends PaddleLayoutItem>(
  items: readonly T[],
): PaddleLayoutResult<T> {
  if (!items.length) return { text: '', items: [], uncertain: false, reasons: [] };
  const reasons = new Set<string>();
  const valid = items.every(
    (item) =>
      item.poly.length >= 3 &&
      item.poly.every((xy) => xy.length === 2 && xy.every(Number.isFinite)),
  );
  const fallback = (reason: string): PaddleLayoutResult<T> => ({
    text: items.map((i) => i.text).join('\n'),
    items: [...items],
    uncertain: true,
    reasons: [reason],
  });
  if (!valid) return fallback('invalid-geometry');
  const angles = items.flatMap((item) => {
    const [a, b] = item.poly;
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const side = Math.hypot(item.poly.at(-1)![0] - a[0], item.poly.at(-1)![1] - a[1]);
    if (Math.hypot(dx, dy) < 2 * side) return [];
    let angle = Math.atan2(dy, dx);
    while (angle > Math.PI / 2) angle -= Math.PI;
    while (angle < -Math.PI / 2) angle += Math.PI;
    return [angle];
  });
  let angle = angles.length ? quantile(angles, 0.5) : 0;
  if (Math.abs(angle) > p.maxDeskewRadians) {
    reasons.add('unsupported-orientation');
    angle = 0;
  }
  if (angles.length > 2 && quantile(angles, 0.75) - quantile(angles, 0.25) > p.maxDeskewRadians)
    reasons.add('mixed-orientation');
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const boxes: Box<T>[] = items.map((item, index) => {
    const points = item.poly.map(([x, y]) => [x * c + y * s, y * c - x * s]);
    const left = Math.min(...points.map(([x]) => x)),
      right = Math.max(...points.map(([x]) => x));
    const top = Math.min(...points.map(([, y]) => y)),
      bottom = Math.max(...points.map(([, y]) => y));
    return {
      item,
      index,
      left,
      right,
      top,
      bottom,
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      height: bottom - top,
    };
  });
  if (
    boxes.some(
      (b) =>
        ![b.left, b.right, b.top, b.bottom, b.x, b.y, b.height].every(Number.isFinite) ||
        b.height <= 0 ||
        b.right <= b.left,
    )
  )
    return fallback('invalid-geometry');
  for (const row of rows(boxes)) {
    for (let i = 1; i < row.boxes.length; i++) {
      const a = row.boxes[i - 1],
        b = row.boxes[i];
      const significantOverlap = Math.min(
        Math.min(a.right - a.left, b.right - b.left) * p.overlappingLineFraction,
        Math.min(a.height, b.height) * p.overhangHeight,
      );
      if (a.right - b.left > significantOverlap) reasons.add('overlapping-lines');
    }
  }
  const orientationUnknown =
    reasons.has('unsupported-orientation') || reasons.has('mixed-orientation');
  const lines = orientationUnknown ? rows(boxes).map((r) => r.boxes) : partition(boxes, reasons);
  const ordered = lines.flatMap((line) => line.map((b) => b.item));
  return {
    text: lines.map((line) => line.map((b) => b.item.text).join(' ')).join('\n'),
    items: ordered,
    uncertain: reasons.size > 0,
    reasons: [...reasons].sort(),
  };
}
