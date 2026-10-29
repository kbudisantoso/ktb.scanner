import type { FormatSelection, LensCorrection, Limits, Quad, Recipe, Size } from './types.ts';
import { cropSize, limitedSize, rectifiedSize } from './geometry.ts';
import { lensMapping } from './lens.ts';

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
}: {
  source: Size;
  corners: Quad;
  format: FormatSelection;
  recipe: Recipe;
  limits: Pick<Limits, 'outputPixels' | 'outputDimension'>;
  lensCorrection: LensCorrection;
  previewComparison?: boolean;
}) {
  const crop = cropSize(corners, source);
  const desired = limitedSize(crop, limits.outputPixels, limits.outputDimension);
  const scale = Math.min(1, desired.width / crop.width, desired.height / crop.height);
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
  return {
    workingSize,
    mappedCorners,
    normalExtractionSize,
    correctedExtractionSize,
    renderSize,
    baselineRenderSize,
    processingBytes: Math.max(processingBytes, phaseBytes),
    copyBytes,
    peakBytes: Math.max(copyBytes, processingBytes, phaseBytes),
  };
}
