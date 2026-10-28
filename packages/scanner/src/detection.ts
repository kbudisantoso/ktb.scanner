import { scanDocument } from 'scanic';
import type { DetectionOptions, ScannerResult } from 'scanic';
import { candidateQuad, selectDocumentCandidate } from './candidates.ts';
import type { DocumentCandidate } from './candidates.ts';
import type { Point, Quad, Size } from './types.ts';

type Pixels = Size & { data: Uint8ClampedArray };
type WorkingImage = ImageData | OffscreenCanvas;
type Selection = ReturnType<typeof selectDocumentCandidate>;
type Picker = (candidates: readonly DocumentCandidate[], size: Size) => Selection;
type Observer = (
  candidates: readonly DocumentCandidate[],
  size: Size,
  selection: Selection,
) => void;
type InstrumentedOptions = DetectionOptions & {
  selectCandidate: (candidates: DocumentCandidate[], size: Size) => DocumentCandidate | null;
};
type ScanEngine = (image: WorkingImage, options: InstrumentedOptions) => Promise<ScannerResult>;

function bands(reach: number, band: number) {
  const cap = Math.min(4 * band, reach - 1),
    gap = 1.5;
  if (cap < 10.5) return null;
  let start = Math.max(3, 0.75 * band),
    step = Math.max(gap, 0.25 * band);
  if (cap < start + 2 * step + 3 * gap) {
    start = 3;
    step = gap;
  }
  const farStep = cap >= 4 * band ? Math.max(gap, 0.5 * band) : gap;
  const near = [start, start + step, start + 2 * step];
  const far = [cap - 2 * farStep, cap - farStep, cap];
  return far[0] - near[2] >= gap ? { near, far } : null;
}

/** Admission evidence for additional contours; failure never invalidates a normal result. */
export function hasBoundaryContrast(image: Pixels, corners: Quad): boolean {
  const { width, height, data } = image;
  const points = corners.map((point) => ({ x: point.x * (width - 1), y: point.y * (height - 1) }));
  const band = Math.max(4, Math.min(width, height) * 0.01);
  const gray = (point: Point) => {
    const x = Math.round(point.x),
      y = Math.round(point.y);
    if (x < 0 || y < 0 || x >= width || y >= height) return NaN;
    const index = (y * width + x) * 4;
    return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
  };
  for (let edge = 0; edge < 4; edge++) {
    const start = points[edge],
      end = points[(edge + 1) % 4];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const tx = (end.x - start.x) / length,
      ty = (end.y - start.y) / length;
    const nx = -ty,
      ny = tx;
    const positive = [0, 0, 0, 0],
      negative = [0, 0, 0, 0];
    for (let sample = 0; sample < 32; sample++) {
      const t = length * (0.06 + (0.88 * sample) / 31);
      const x = start.x + tx * t,
        y = start.y + ty * t;
      const reach = (dx: number, dy: number) =>
        Math.min(
          dx > 0 ? (width - 1 - x) / dx : dx < 0 ? -x / dx : Infinity,
          dy > 0 ? (height - 1 - y) / dy : dy < 0 ? -y / dy : Infinity,
        );
      const inside = bands(reach(nx, ny), band),
        outside = bands(reach(-nx, -ny), band);
      if (!inside || !outside) continue;
      const median = (distances: number[], direction: number) => {
        const values = distances.map((distance) =>
          gray({ x: x + nx * distance * direction, y: y + ny * distance * direction }),
        );
        return values.every(Number.isFinite) ? values.sort((a, b) => a - b)[1] : NaN;
      };
      // Samples in each band and the gap between bands are >=1.5 px apart.
      // This exceeds a pixel cell's diagonal; rounded samples cannot collapse.
      const near = median(inside.near, 1) - median(outside.near, -1);
      const far = median(inside.far, 1) - median(outside.far, -1);
      if (near >= 8 && far >= 8) positive[Math.floor(sample / 8)]++;
      if (near <= -8 && far <= -8) negative[Math.floor(sample / 8)]++;
    }
    if (
      ![positive, negative].some(
        (quarters) =>
          quarters.reduce((sum, count) => sum + count, 0) >= 20 && Math.min(...quarters) >= 4,
      )
    )
      return false;
  }
  return true;
}

/** Compare observed contours using a fixed working-image pixel tolerance, including narrow receipts. */
export function containsObservedTarget(outer: Quad, inner: Quad, size: Size): boolean {
  const pixels = (point: Point) => ({
    x: point.x * (size.width - 1),
    y: point.y * (size.height - 1),
  });
  return inner.every((value) =>
    outer.every((first, index) => {
      const point = pixels(value),
        a = pixels(first),
        b = pixels(outer[(index + 1) % 4]);
      return (
        ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) /
          Math.hypot(b.x - a.x, b.y - a.y) >=
        -1.5
      );
    }),
  );
}

/** One additional classical pass per complete live/still job, with no source modifications. */
export function createDetectionJob(engine: ScanEngine = scanDocument) {
  let rescueAvailable = true;
  return {
    async scan(
      image: WorkingImage,
      options: DetectionOptions,
      pick: Picker = selectDocumentCandidate,
      observe?: Observer,
    ): Promise<ScannerResult> {
      const capture: { candidates: DocumentCandidate[]; size?: Size } = { candidates: [] };
      const normalOptions: InstrumentedOptions = {
        ...options,
        selectCandidate(candidates, size) {
          capture.candidates = candidates;
          capture.size = size;
          return pick(candidates, size).candidate;
        },
      };
      const normal = await engine(image, normalOptions);
      if (!capture.size) return normal;
      const size = capture.size;
      const normalSelection = pick(capture.candidates, size);
      const normalQuad = normalSelection.candidate
        ? candidateQuad(normalSelection.candidate, size)
        : null;
      let pixels: Pixels | undefined;
      const getPixels = () =>
        (pixels ??=
          'data' in image
            ? image
            : image.getContext('2d')!.getImageData(0, 0, image.width, image.height));
      const supported = (quad: Quad | null) => !!quad && hasBoundaryContrast(getPixels(), quad);
      let candidates = capture.candidates,
        result = normal;
      let acceptedRescue: DocumentCandidate[] | undefined;
      if (rescueAvailable && !supported(normalQuad)) {
        rescueAvailable = false;
        const admitted: DocumentCandidate[] = [];
        const rescueOptions: InstrumentedOptions = {
          ...options,
          lowThreshold: 20,
          highThreshold: 60,
          applyDilation: true,
          dilationKernelSize: 3,
          enableDetectionCascade: false,
          selectCandidate(proposals, workingSize) {
            for (const proposal of proposals) {
              const quad = candidateQuad(proposal, workingSize);
              if (
                supported(quad) &&
                (!normalQuad || containsObservedTarget(quad!, normalQuad, workingSize))
              )
                admitted.push(proposal);
            }
            return pick(admitted, workingSize).candidate;
          },
        };
        let rescue: ScannerResult | undefined;
        try {
          rescue = await engine(image, rescueOptions);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error;
          // An optional recognition attempt cannot destroy an existing normal result.
        }
        const replacement = rescue?.success ? pick(admitted, size).candidate : null;
        if (replacement) {
          const outer = candidateQuad(replacement, size)!;
          candidates = [
            ...capture.candidates.filter((candidate) => {
              const quad = candidateQuad(candidate, size);
              return !quad || !containsObservedTarget(outer, quad, size);
            }),
            ...admitted,
          ];
          result = rescue!;
          acceptedRescue = admitted;
        }
      }
      let selected = pick(candidates, size);
      if (
        acceptedRescue &&
        (!selected.candidate || (normalQuad && !acceptedRescue.includes(selected.candidate)))
      ) {
        // Merging hypotheses must not lose or switch an already selected document.
        candidates = capture.candidates;
        result = normal;
        selected = normalSelection;
      }
      observe?.(candidates, size, selected);
      const final = selected.candidate;
      if (result === normal && final === normalSelection.candidate) return normal;
      if (!final?.corners) return { ...result, success: false, corners: null, confidence: null };
      const scale = Math.max(image.width, image.height) / Math.max(size.width, size.height);
      const scaled = (key: keyof NonNullable<ScannerResult['corners']>) => ({
        x: final.corners![key].x * scale,
        y: final.corners![key].y * scale,
      });
      const corners = {
        topLeft: scaled('topLeft'),
        topRight: scaled('topRight'),
        bottomRight: scaled('bottomRight'),
        bottomLeft: scaled('bottomLeft'),
      };
      return { ...result, success: true, corners, confidence: final.confidence };
    },
  };
}
