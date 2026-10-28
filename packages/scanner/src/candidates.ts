import type { CaptureHint, Point, Quad, Size } from './types.ts';
import { area, quadDrift, validQuad, FULL_QUAD } from './geometry.ts';

const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
export interface DocumentCandidate {
  corners: Record<(typeof keys)[number], Point> | null;
  confidence: number;
  isValid: boolean;
  edgeSupport?: number;
  contourFitRatio?: number;
}
export function candidateQuad(candidate: DocumentCandidate, size: Size): Quad | null {
  if (
    !candidate.corners ||
    keys.some((key) => !candidate.corners![key]) ||
    size.width < 2 ||
    size.height < 2
  )
    return null;
  const corners = keys.map((key) => ({
    x: candidate.corners![key].x / (size.width - 1),
    y: candidate.corners![key].y / (size.height - 1),
  })) as Quad;
  // Rotation adds a synthetic background around the photo. Its boundary is
  // not a document edge, even if the detector gives it high confidence.
  return validQuad(corners) && area(corners) >= 0.08 && quadDrift(corners, FULL_QUAD) > 0.025
    ? corners
    : null;
}
function contains(outer: Quad, inner: Quad): boolean {
  return inner.every((p) =>
    outer.every((a, i) => {
      const b = outer[(i + 1) % 4];
      return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -0.002;
    }),
  );
}
function supportedContour(candidate: DocumentCandidate): boolean {
  return (
    candidate.confidence >= 0.35 &&
    (candidate.edgeSupport ?? 0) >= 0.5 &&
    (candidate.contourFitRatio ?? 0) >= 0.65 &&
    (candidate.contourFitRatio ?? Infinity) <= 1.4
  );
}
/** Compare opposite boundaries in source pixels without forcing a paper aspect ratio. */
function sharesOppositeSides(outer: Quad, inner: Quad, size: Size): boolean {
  const pixels = (quad: Quad) =>
    quad.map((point) => ({ x: point.x * (size.width - 1), y: point.y * (size.height - 1) }));
  const outside = pixels(outer),
    inside = pixels(inner),
    // Cascade contours can differ by four source pixels around the same side.
    tolerance = Math.max(4, Math.min(size.width, size.height) * 0.005);
  const onLine = (point: Point, edge: number) => {
    const a = outside[edge],
      b = outside[(edge + 1) % 4];
    return (
      Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) /
        Math.hypot(b.x - a.x, b.y - a.y) <=
      tolerance
    );
  };
  for (let first = 0; first < 2; first++)
    for (let shift = 0; shift < 4; shift++)
      if (
        [0, 2].every((opposite) => {
          const edge = (first + opposite) % 4,
            outerEdge = (edge + shift) % 4;
          return onLine(inside[edge], outerEdge) && onLine(inside[(edge + 1) % 4], outerEdge);
        })
      )
        return true;
  return false;
}
/** Fraction of the smaller contour covered by the other convex contour. */
function overlapCoverage(a: Quad, b: Quad): number {
  let polygon: Point[] = a;
  for (let i = 0; i < 4 && polygon.length; i++) {
    const p = b[i],
      n = b[(i + 1) % 4];
    const side = (q: Point) => (n.x - p.x) * (q.y - p.y) - (n.y - p.y) * (q.x - p.x);
    const clipped: Point[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const start = polygon[j],
        end = polygon[(j + 1) % polygon.length];
      const from = side(start),
        to = side(end);
      if (from >= 0 !== to >= 0) {
        const t = from / (from - to);
        clipped.push({ x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) });
      }
      if (to >= 0) clipped.push(end);
    }
    polygon = clipped;
  }
  const intersection =
    Math.abs(
      polygon.reduce((sum, p, i) => {
        const n = polygon[(i + 1) % polygon.length];
        return sum + p.x * n.y - p.y * n.x;
      }, 0),
    ) / 2;
  return Math.min(1, intersection / Math.min(area(a), area(b)));
}
/** Soft evidence in pixel space. Perspective is allowed; no corners are moved. */
export function paperShape(corners: Quad, size: Size) {
  const points = corners.map((p) => ({ x: p.x * (size.width - 1), y: p.y * (size.height - 1) }));
  const edges = points.map((p, i) => ({
    x: points[(i + 1) % 4].x - p.x,
    y: points[(i + 1) % 4].y - p.y,
  }));
  const lengths = edges.map((p) => Math.hypot(p.x, p.y));
  const cosine = (i: number, j: number) =>
    Math.abs((edges[i].x * edges[j].x + edges[i].y * edges[j].y) / (lengths[i] * lengths[j]));
  const rightAngles = Math.max(
    0,
    1 - edges.reduce((sum, _, i) => sum + cosine(i, (i + 1) % 4), 0) / 4,
  );
  const parallel = (cosine(0, 2) + cosine(1, 3)) / 2;
  const symmetry = Math.sqrt(
    (Math.min(lengths[0], lengths[2]) / Math.max(lengths[0], lengths[2])) *
      (Math.min(lengths[1], lengths[3]) / Math.max(lengths[1], lengths[3])),
  );
  const width = (lengths[0] + lengths[2]) / 2,
    height = (lengths[1] + lengths[3]) / 2,
    ratio = Math.min(width, height) / Math.max(width, height);
  // A and B series share sqrt(2); their physical sizes cannot be distinguished here.
  const priors = [
    { family: 'A/B', ratio: 1 / Math.SQRT2 },
    { family: 'Letter', ratio: 215.9 / 279.4 },
    { family: 'postcard', ratio: 2 / 3 },
  ];
  const closest = priors.sort(
    (a, b) => Math.abs(Math.log(ratio / a.ratio)) - Math.abs(Math.log(ratio / b.ratio)),
  )[0];
  const formatFit = Math.exp(-0.5 * (Math.log(ratio / closest.ratio) / 0.16) ** 2);
  const rectangularity = 0.5 * rightAngles + 0.3 * parallel + 0.2 * symmetry;
  return {
    ratio,
    family: closest.family,
    formatFit,
    rectangularity,
    rightAngles,
    parallel,
    symmetry,
  };
}
/** Rank distinct plausible sheets, not repeated cascade contours or interior text boxes. */
export function selectDocumentCandidate<T extends DocumentCandidate>(
  input: readonly T[],
  size: Size,
  previous?: Quad | null,
) {
  const assessed = input.map((candidate, index) => {
    const corners = candidateQuad(candidate, size);
    const plausible =
      !!corners &&
      Number.isFinite(candidate.confidence) &&
      (candidate.isValid || supportedContour(candidate));
    const clearance = corners
      ? Math.min(...corners.flatMap((p) => [p.x, p.y, 1 - p.x, 1 - p.y]))
      : 0;
    const shape = corners ? paperShape(corners, size) : null;
    const continuity = corners && previous ? Math.exp(-quadDrift(corners, previous) / 0.035) : 0;
    const score =
      0.35 * candidate.confidence +
      0.4 * (shape?.rectangularity ?? 0) ** 3 +
      0.15 * (shape?.formatFit ?? 0) +
      0.1 * (candidate.edgeSupport ?? 0) +
      0.12 * continuity;
    return {
      candidate,
      index,
      corners,
      plausible,
      shape,
      continuity,
      score,
      full: clearance > Math.max(0.003, 1.5 / Math.min(size.width, size.height)),
      area: corners ? area(corners) : 0,
      centerX: corners ? corners.reduce((sum, p) => sum + p.x, 0) / 4 : 0,
      excluded: plausible ? '' : 'implausible',
    };
  });
  const unique: typeof assessed = [];
  for (const item of assessed
    .filter((item) => item.plausible)
    .sort((a, b) => Number(b.full) - Number(a.full) || b.score - a.score || b.area - a.area)) {
    // Resolve observed outer/inner alternatives before greedy deduplication can
    // discard the outer sheet. Strong creases can bound high-confidence panels.
    const panel = assessed.some(
      (outer) =>
        outer !== item &&
        outer.plausible &&
        outer.full &&
        supportedContour(outer.candidate) &&
        item.area < outer.area * 0.82 &&
        contains(outer.corners!, item.corners!) &&
        sharesOppositeSides(outer.corners!, item.corners!, size),
    );
    if (panel) {
      item.excluded = 'inside-another-sheet';
      continue;
    }
    if (
      unique.some(
        (other) =>
          (item.area / other.area > 0.65 &&
            item.area / other.area < 1.54 &&
            quadDrift(item.corners!, other.corners!) < 0.12) ||
          (item.area / other.area > 0.5 &&
            item.area / other.area < 2 &&
            overlapCoverage(item.corners!, other.corners!) > 0.65),
      )
    )
      item.excluded = 'duplicate';
    else unique.push(item);
  }
  const sheets = unique.filter((item) => {
    const nested = unique.some(
      (outer) =>
        outer !== item &&
        outer.full &&
        item.area < outer.area * 0.82 &&
        outer.candidate.confidence >= item.candidate.confidence - 0.2 &&
        (contains(outer.corners!, item.corners!) ||
          overlapCoverage(outer.corners!, item.corners!) > 0.9),
    );
    if (nested) item.excluded = 'inside-another-sheet';
    // A partial contour can cross the page boundary and escape strict containment.
    // It must not become a second "left sheet" when a much stronger, more paper-like
    // hypothesis covers the same region. Similar-quality overlapping sheets remain distinct.
    const weakerOverlap =
      !nested &&
      unique.some((other) => {
        if (other === item || !other.full) return false;
        const scoreGain = other.score - item.score;
        const confidenceGain = other.candidate.confidence - item.candidate.confidence;
        const shapeGain = (other.shape?.rectangularity ?? 0) - (item.shape?.rectangularity ?? 0);
        const coverage = overlapCoverage(other.corners!, item.corners!);
        if (scoreGain > 0.15 && confidenceGain > 0.15 && shapeGain > 0.1 && coverage > 0.45)
          return true;
        // A reflection can share a real paper corner while crossing out into the
        // background. Scanic confidence alone may be almost identical for both.
        return (
          scoreGain > 0.22 &&
          confidenceGain >= -0.05 &&
          shapeGain > 0.12 &&
          item.area < other.area * 0.6 &&
          coverage > 0.18 &&
          item.corners!.some((point) =>
            other.corners!.some(
              (corner) => Math.hypot(point.x - corner.x, point.y - corner.y) < 0.025,
            ),
          )
        );
      });
    if (weakerOverlap) item.excluded = 'overlapping-weaker-hypothesis';
    return !nested && !weakerOverlap;
  });
  const full = sheets.filter((item) => item.full);
  const pool = (full.length ? full : sheets).sort(
    (a, b) => a.centerX - b.centerX || b.candidate.confidence - a.candidate.confidence,
  );
  // Odd counts: middle sheet. Even counts: left of the two middle sheets, including a pair.
  const proposed = pool[Math.floor((pool.length - 1) / 2)];
  // Remaining overlapping hypotheses are not distinct visible sheets. A small
  // interior fragment must not win by horizontal position when its outer contour
  // is too uncertain for the normal containment rule. Require a confirmed crop.
  const ambiguous =
    proposed &&
    pool.some(
      (other) =>
        other !== proposed &&
        proposed.area < other.area * 0.6 &&
        overlapCoverage(proposed.corners!, other.corners!) > 0.65,
    );
  const selected = ambiguous ? undefined : proposed;
  return {
    workingSize: { width: size.width, height: size.height },
    candidate: selected?.candidate ?? null,
    reason: ambiguous
      ? 'ambiguous-overlapping-contours'
      : !selected
        ? 'no-plausible-sheet'
        : pool.length === 1
          ? 'single-sheet'
          : pool.length === 2
            ? 'left-sheet'
            : 'middle-sheet',
    candidates: assessed.map(({ candidate, ...item }) => ({
      ...item,
      confidence: candidate.confidence,
      isValid: candidate.isValid,
      edgeSupport: candidate.edgeSupport,
      contourFitRatio: candidate.contourFitRatio,
      selected: item.index === selected?.index,
    })),
  };
}
/** Comparison is evidence only: a live contour never replaces a fresh still-image contour. */
export function compareCaptureHint(
  hint: CaptureHint | undefined,
  size: Size,
  corners: Quad | null,
) {
  if (!hint) return { state: 'unavailable' };
  if (hint.mapping !== 'same-frame-area') return { state: 'different-photo-field-of-view' };
  if (!Number.isFinite(hint.ageMs) || hint.ageMs < 0 || hint.ageMs > 400) return { state: 'stale' };
  if (
    !validQuad(hint.corners) ||
    ![hint.frameSize.width, hint.frameSize.height].every((n) => Number.isFinite(n) && n > 0)
  )
    return { state: 'invalid' };
  if (
    Math.abs(Math.log(size.width / size.height / (hint.frameSize.width / hint.frameSize.height))) >
    0.01
  )
    return { state: 'different-aspect-ratio' };
  if (!corners) return { state: 'still-not-detected' };
  const drift = quadDrift(hint.corners, corners);
  return {
    state: drift <= 0.06 ? 'agrees' : 'disagrees',
    drift,
    liveCorners: hint.corners,
    stillCorners: corners,
    authority: 'still-image',
  };
}

/** A fresh comparable live/photo conflict must not silently cut away document content. */
export function guardCaptureCrop(hint: CaptureHint | undefined, size: Size, corners: Quad) {
  const comparison = compareCaptureHint(hint, size, corners);
  const rejected =
    hint?.stable === true && comparison.state === 'disagrees' && comparison.drift! > 0.08;
  return { comparison, rejected, corners: rejected ? null : corners };
}
