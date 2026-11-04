import type { FormatSelection, LensCorrection, Limits, Quad, Recipe, Size } from './types.ts';
import { cropSize, limitedSize, rectifiedSize } from './geometry.ts';
import { lensMapping } from './lens.ts';
import { ScannerError } from './errors.ts';

const pixels = (size: Size) => size.width * size.height;

/** Estimated decode/refinement envelope, not browser RSS or a native heap bound. */
export function sourceMemoryPeak(
  size: Size,
  { engineBuffers = false, trace = false }: { engineBuffers?: boolean; trace?: boolean } = {},
): number {
  // The worker can retain its previous detector heap; never shrink this model with the input.
  const detectorPixels = 1_000_000;
  const preparation = 28 * detectorPixels;
  const residentModel = 32 * detectorPixels;
  const debugPayload = engineBuffers ? 82 * detectorPixels : 0;
  const tracePayload = trace ? (engineBuffers ? 84 : 16) * detectorPixels : 0;
  return Math.max(
    pixels(size) * 12,
    pixels(size) * 8 + preparation + residentModel + debugPayload + tracePayload,
  );
}

function memoryLimit(): never {
  throw new ScannerError(
    'LIMIT_EXCEEDED',
    'Das Bild überschreitet das Pixel- oder Arbeitsspeicherlimit.',
  );
}

/** Plan owned decode buffers; browser-internal codec allocations remain outside this estimate. */
export function fitSourceMemory(
  source: Size,
  budget: number,
  options: Parameters<typeof sourceMemoryPeak>[1] = {},
): Size {
  if (!Number.isFinite(budget) || budget <= 0) memoryLimit();
  if (sourceMemoryPeak(source, options) <= budget) return { ...source };
  const at = (scale: number): Size => ({
    width: Math.max(2, Math.floor(source.width * scale)),
    height: Math.max(2, Math.floor(source.height * scale)),
  });
  // Do not squeeze a thin source or manufacture a second pixel by upscaling.
  let low = Math.max(2 / source.width, 2 / source.height),
    high = 1;
  let fitted = at(low);
  if (low > high || sourceMemoryPeak(fitted, options) > budget) memoryLimit();
  for (let i = 0; i < 52; i++) {
    const scale = (low + high) / 2,
      candidate = at(scale);
    if (sourceMemoryPeak(candidate, options) <= budget) {
      low = scale;
      fitted = candidate;
    } else high = scale;
  }
  return fitted;
}

/** Scanic 1.7.1 rounds opposite-edge lengths in pixel-center coordinates. */
export function extractionSize(corners: Quad, size: Size): Size {
  const points = corners.map((p) => ({ x: p.x * (size.width - 1), y: p.y * (size.height - 1) }));
  const edge = (a: number, b: number) =>
    Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  return {
    width: Math.max(1, Math.round(Math.max(edge(0, 1), edge(3, 2)))),
    height: Math.max(1, Math.round(Math.max(edge(0, 3), edge(1, 2)))),
  };
}

export function planProcessingMemory({
  source,
  corners,
  format,
  recipe,
  limits,
  lensCorrection,
  previewComparison = true,
  workingScale = 1,
}: {
  source: Size;
  corners: Quad;
  format: FormatSelection;
  recipe: Recipe;
  limits: Pick<Limits, 'outputPixels' | 'outputDimension'>;
  lensCorrection: LensCorrection;
  previewComparison?: boolean;
  /** Private upper bound; output caps still apply and no source axis is upscaled. */
  workingScale?: number;
}) {
  const crop = cropSize(corners, source);
  // Rounding the crop first would resample even a source that already fits the limits.
  const scale = Math.min(
    1,
    workingScale,
    Math.sqrt(limits.outputPixels / (crop.width * crop.height)),
    limits.outputDimension / Math.max(crop.width, crop.height),
  );
  const workingSize = {
    width: Math.max(2, Math.floor(source.width * scale)),
    height: Math.max(2, Math.floor(source.height * scale)),
  };
  const lensApplied = lensCorrection.status === 'applied';
  const mappedCorners = lensApplied
    ? lensMapping(workingSize, lensCorrection.strength).corners(corners)
    : corners;
  const normalExtractionSize = extractionSize(corners, workingSize);
  const correctedExtractionSize = extractionSize(mappedCorners, workingSize);
  const renderSize = limitedSize(
    rectifiedSize(correctedExtractionSize, format),
    limits.outputPixels,
    limits.outputDimension,
  );
  const baselineRenderSize = limitedSize(
    rectifiedSize(normalExtractionSize, format),
    limits.outputPixels,
    limits.outputDimension,
  );
  const targetPixels = Math.max(
    pixels(correctedExtractionSize),
    pixels(renderSize),
    lensApplied && previewComparison ? pixels(normalExtractionSize) : 0,
    lensApplied && previewComparison ? pixels(baselineRenderSize) : 0,
  );
  const paperFieldBytes = ['auto', 'paper', 'grayscale'].includes(recipe.enhancement)
    ? 4 * 1024 ** 2
    : 0;
  const processingBytes =
    pixels(workingSize) * (lensApplied ? 12 : 8) +
    targetPixels * (recipe.enhancement === 'bw' ? 32 : lensApplied ? 28 : 24) +
    paperFieldBytes;
  const residentModel = 32 * 1_000_000;
  const copyBytes = 4 * (pixels(source) + pixels(workingSize)) + residentModel;
  const phaseBytes =
    Math.max(
      pixels(workingSize) * (lensApplied ? 12 : 8),
      pixels(workingSize) * 8 + targetPixels * 8 + pixels(renderSize) * 4,
      pixels(renderSize) * (recipe.enhancement === 'bw' ? 32 : 24) + paperFieldBytes,
    ) + residentModel;
  const hasComparison =
    previewComparison &&
    (lensApplied ||
      recipe.enhancement !== 'none' ||
      Object.values(recipe.adjustments ?? {}).some(Boolean));
  const comparisonSize = lensApplied ? baselineRenderSize : renderSize;
  const comparisonRawBytes = 4 * pixels(comparisonSize) + comparisonSize.height;
  // Estimate a retained PNG-sized comparison, including rows/chunks/framing. JPEG92 normally
  // fits this envelope too; the worker still checks the actual encoded blob size afterwards.
  const comparisonBytes = hasComparison
    ? comparisonRawBytes + Math.ceil(comparisonRawBytes / 16384) * 32 + 65536
    : 0;
  return {
    workingSize,
    mappedCorners,
    normalExtractionSize,
    correctedExtractionSize,
    renderSize,
    baselineRenderSize,
    processingBytes: Math.max(processingBytes, phaseBytes),
    copyBytes,
    comparisonBytes,
    peakBytes: Math.max(copyBytes, Math.max(processingBytes, phaseBytes) + comparisonBytes),
  };
}

/** Keep a fitting plan exact; otherwise use the largest working raster that fits every phase. */
export function fitProcessingMemory(
  options: Parameters<typeof planProcessingMemory>[0],
  budget: number,
): ReturnType<typeof planProcessingMemory> {
  if (!Number.isFinite(budget) || budget <= 0) memoryLimit();
  const normal = planProcessingMemory(options);
  if (normal.peakBytes <= budget) return normal;
  let low = 0,
    high = Math.min(1, options.workingScale ?? 1);
  let fitted = planProcessingMemory({ ...options, workingScale: low });
  if (fitted.peakBytes > budget) memoryLimit();
  for (let i = 0; i < 52; i++) {
    const scale = (low + high) / 2,
      candidate = planProcessingMemory({ ...options, workingScale: scale });
    if (candidate.peakBytes <= budget) {
      low = scale;
      fitted = candidate;
    } else high = scale;
  }
  return fitted;
}
