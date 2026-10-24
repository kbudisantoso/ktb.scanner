import type {
  Quad,
  Size,
  Point,
  FormatSelection,
  Rotation,
  Preset,
  PaperPreference,
} from './types.ts';
import { ScannerError } from './errors.ts';
export const FULL_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
export const PAPER: Record<Preset, Size> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
  letter: { width: 215.9, height: 279.4 },
  'postcard-100x150': { width: 100, height: 150 },
};
export function area(q: Quad): number {
  return (
    Math.abs(
      q.reduce((sum, p, i) => {
        const n = q[(i + 1) % 4];
        return sum + p.x * n.y - p.y * n.x;
      }, 0),
    ) / 2
  );
}
export function validQuad(q: Quad): boolean {
  if (
    !Array.isArray(q) ||
    q.length !== 4 ||
    q.some(
      (p) =>
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.y < 0 ||
        p.x > 1 ||
        p.y > 1,
    )
  )
    return false;
  for (let i = 0; i < 4; i++) {
    const a = q[i],
      b = q[(i + 1) % 4],
      c = q[(i + 2) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0.00001) return false;
  }
  return area(q) >= 0.005;
}
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function quadDrift(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => distance(p, b[i])));
}
export function cropSize(q: Quad, size: Size): Size {
  const p = q.map((v) => ({ x: v.x * size.width, y: v.y * size.height }));
  return {
    width: Math.max(distance(p[0], p[1]), distance(p[3], p[2])),
    height: Math.max(distance(p[0], p[3]), distance(p[1], p[2])),
  };
}
export function limitedSize(size: Size, pixels: number, dimension: number): Size {
  const scale = Math.min(
    1,
    Math.sqrt(pixels / (size.width * size.height)),
    dimension / Math.max(size.width, size.height),
  );
  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
  };
}
/** Target paper ratio within the available crop resolution; no axis is upscaled. */
export function rectifiedSize(crop: Size, format: FormatSelection): Size {
  if (format.kind !== 'standard') return { width: crop.width, height: crop.height };
  const paper = PAPER[format.preset];
  if (!paper) throw new ScannerError('CONFIG_INVALID', 'Unbekanntes Papierformat.');
  const landscape = format.orientation
    ? format.orientation === 'landscape'
    : crop.width > crop.height;
  const ratio = landscape ? paper.height / paper.width : paper.width / paper.height;
  const width = Math.min(crop.width, crop.height * ratio);
  return { width, height: width / ratio };
}
/** Independent estimate, assuming square pixels and principal point at image center. */
export function estimatePaperRatio(
  size: Size,
  corners?: Quad,
): {
  ratio: number;
  rawRatio: number;
  method: 'edge-lengths' | 'projective';
  fallbackReason?: 'focal-unresolved' | 'unstable';
  uncertainPerspective?: boolean;
  ratioRange?: { min: number; max: number };
} {
  const crop = corners ? cropSize(corners, size) : size;
  const rawRatio = Math.min(crop.width, crop.height) / Math.max(crop.width, crop.height);
  const fallback = { ratio: rawRatio, rawRatio, method: 'edge-lengths' as const };
  if (!corners || !validQuad(corners) || !(size.width > 0 && size.height > 0)) return fallback;
  const scale = Math.max(size.width, size.height);
  const points = corners.map((p) => ({
    x: ((p.x - 0.5) * size.width) / scale,
    y: ((p.y - 0.5) * size.height) / scale,
  }));
  const model = (p: Point[]) => {
    const [p0, p1, p2, p3] = p;
    const dx1 = p1.x - p2.x,
      dx2 = p3.x - p2.x,
      dx3 = p0.x - p1.x + p2.x - p3.x,
      dy1 = p1.y - p2.y,
      dy2 = p3.y - p2.y,
      dy3 = p0.y - p1.y + p2.y - p3.y;
    const determinant = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(determinant) < 1e-8) return null;
    const g = (dx3 * dy2 - dx2 * dy3) / determinant,
      h = (dx1 * dy3 - dx3 * dy1) / determinant;
    return {
      g,
      h,
      a: p1.x - p0.x + g * p1.x,
      b: p3.x - p0.x + h * p3.x,
      c: p1.y - p0.y + g * p1.y,
      d: p3.y - p0.y + h * p3.y,
    };
  };
  const solve = (p: Point[]): number | null => {
    const coefficients = model(p);
    if (!coefficients) return null;
    const { a, b, c, d, g, h } = coefficients;
    if (Math.abs(g * h) < 1e-5) return null;
    const focalSquared = -(a * b + c * d) / (g * h);
    if (!(focalSquared >= 0.35 ** 2 && focalSquared <= 2.5 ** 2)) return null;
    const ratio = Math.sqrt(
      (a * a + c * c + focalSquared * g * g) / (b * b + d * d + focalSquared * h * h),
    );
    return Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, 1 / ratio) : null;
  };
  const perturbations: Point[][] = [];
  for (let i = 0; i < 4; i++) {
    for (const axis of ['x', 'y'] as const) {
      for (const delta of [-0.002, 0.002]) {
        const perturbed = points.map((p) => ({ ...p }));
        perturbed[i][axis] += delta;
        perturbations.push(perturbed);
      }
    }
  }
  const uncertain = (fallbackReason: 'focal-unresolved' | 'unstable') => {
    const nominal = model(points);
    // Front-facing views retain the ordinary raw-ratio decision. Converging
    // edges, however, make that ratio weak evidence when calibration failed.
    if (!nominal || Math.max(Math.abs(nominal.g), Math.abs(nominal.h)) < 0.04)
      return { ...fallback, fallbackReason };
    const ratios: number[] = [];
    for (const p of [points, ...perturbations]) {
      const coefficients = model(p);
      if (!coefficients) return { ...fallback, fallbackReason, uncertainPerspective: true };
      const { a, b, c, d, g, h } = coefficients;
      const samples: number[] = [];
      for (const focal of [0.35, 0.5, 0.75, 1, 1.5, 2, 2.5]) {
        const x = a * a + c * c + focal * focal * g * g,
          y = b * b + d * d + focal * focal * h * h;
        const orthogonality = Math.abs(a * b + c * d + focal * focal * g * h) / Math.sqrt(x * y);
        if (orthogonality > 0.04) continue;
        const ratio = Math.sqrt(x / y);
        if (Number.isFinite(ratio) && ratio > 0) samples.push(Math.min(ratio, 1 / ratio));
      }
      if (samples.length < 3) return { ...fallback, fallbackReason, uncertainPerspective: true };
      ratios.push(...samples);
    }
    const min = Math.min(...ratios),
      max = Math.max(...ratios);
    if (Math.log(max / min) > 0.5)
      return { ...fallback, fallbackReason, uncertainPerspective: true };
    return { ...fallback, fallbackReason, uncertainPerspective: true, ratioRange: { min, max } };
  };
  const ratio = solve(points);
  if (ratio === null) return uncertain('focal-unresolved');
  for (const perturbed of perturbations) {
    const estimate = solve(perturbed);
    if (estimate === null || Math.abs(Math.log(estimate / ratio)) > 0.04)
      return uncertain('unstable');
  }
  return { ratio, rawRatio, method: 'projective' };
}
export function suggestFormat(
  size: Size,
  options: { corners?: Quad; preferredPaper?: PaperPreference; geometryUncertain?: boolean } = {},
): FormatSelection {
  const evidence = estimatePaperRatio(size, options.corners);
  const { ratio } = evidence;
  if (
    options.geometryUncertain &&
    !evidence.uncertainPerspective &&
    ratio >= 0.64 &&
    ratio <= 0.85
  ) {
    // Unsupported edges cannot establish a precise A4/Letter distinction even
    // when the assumed camera model yields a numerically stable point solution.
    return {
      kind: 'standard',
      preset: options.preferredPaper ?? 'A4',
      origin: options.preferredPaper === 'letter' ? 'heuristic' : 'default',
    };
  }
  if (evidence.uncertainPerspective) {
    const range = evidence.ratioRange;
    const fits = (paperRatio: number) =>
      range &&
      paperRatio >= range.min * Math.exp(-0.025) &&
      paperRatio <= range.max * Math.exp(0.025);
    const a4 = fits(210 / 297),
      letter = fits(215.9 / 279.4);
    if (a4 || letter) {
      const preset = a4 && letter ? (options.preferredPaper ?? 'A4') : a4 ? 'A4' : 'letter';
      return { kind: 'standard', preset, origin: preset === 'A4' ? 'default' : 'heuristic' };
    }
    // No sufficiently constrained model: do not claim a standard from distorted
    // projected edge lengths. Long receipts keep their existing output default.
    return ratio < 0.45 && !options.geometryUncertain
      ? { kind: 'receipt', widthMm: 80, origin: 'default' }
      : { kind: 'original-ratio', origin: 'default' };
  }
  if (ratio < 0.45)
    return options.geometryUncertain
      ? { kind: 'original-ratio', origin: 'default' }
      : { kind: 'receipt', widthMm: 80, origin: 'default' };
  const a4Distance = Math.abs(Math.log(ratio / (210 / 297))),
    letterDistance = Math.abs(Math.log(ratio / (215.9 / 279.4)));
  const a4 = a4Distance < 0.09,
    letter = letterDistance < 0.09;
  if (a4 || letter) {
    const preset =
      a4 && letter && Math.abs(a4Distance - letterDistance) <= 0.035
        ? (options.preferredPaper ?? 'A4')
        : a4 && (!letter || a4Distance < letterDistance)
          ? 'A4'
          : 'letter';
    return { kind: 'standard', preset, origin: preset === 'A4' ? 'default' : 'heuristic' };
  }
  return { kind: 'original-ratio', origin: 'default' };
}
export function layoutMm(format: FormatSelection, unrotated: Size, rotation: Rotation): Size {
  let size: Size;
  if (format.kind === 'standard') {
    const paper = PAPER[format.preset];
    if (!paper) throw new ScannerError('CONFIG_INVALID', 'Unbekanntes Papierformat.');
    const landscape = format.orientation
      ? format.orientation === 'landscape'
      : unrotated.width > unrotated.height;
    size = landscape ? { width: paper.height, height: paper.width } : { ...paper };
  } else if (format.kind === 'receipt') {
    size = { width: format.widthMm, height: (format.widthMm * unrotated.height) / unrotated.width };
  } else {
    const scale = 210 / Math.min(unrotated.width, unrotated.height);
    size = { width: unrotated.width * scale, height: unrotated.height * scale };
  }
  if (rotation === 90 || rotation === 270) size = { width: size.height, height: size.width };
  // jsPDF/PDF user space is limited to 14,400 points; stay below that boundary.
  if (![size.width, size.height].every((n) => Number.isFinite(n) && n >= 10 && n <= 5000))
    throw new ScannerError(
      'LAYOUT_INVALID',
      'PDF-Seiten müssen zwischen 10 und 5.000 mm groß sein. Bitte Format oder Bonbreite ändern.',
    );
  return size;
}
export function fitImage(
  image: Size,
  paper: Size,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(paper.width / image.width, paper.height / image.height);
  const width = image.width * scale,
    height = image.height * scale;
  return { x: (paper.width - width) / 2, y: (paper.height - height) / 2, width, height };
}
export function smoothQuad(previous: Quad | null, next: Quad | null, elapsed: number): Quad | null {
  if (!next) return null;
  if (!previous || quadDrift(previous, next) > 0.12) return structuredClone(next);
  const alpha = 1 - Math.exp(-Math.max(0, elapsed) / 180);
  return next.map((p, i) => ({
    x: previous[i].x + alpha * (p.x - previous[i].x),
    y: previous[i].y + alpha * (p.y - previous[i].y),
  })) as Quad;
}
