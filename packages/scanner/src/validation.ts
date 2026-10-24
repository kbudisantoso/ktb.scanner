import type { PageMetadata } from './types.ts';
import { validQuad } from './geometry.ts';
import { ScannerError } from './errors.ts';
import { validRecipe } from './adjustments.ts';
/** Runtime guard at the host handoff. Blobs remain separate from JSON metadata. */
export function validateMetadata(value: PageMetadata, revision: number): void {
  const positive = (n: number) => Number.isFinite(n) && n > 0;
  const size = (s: { width: number; height: number }) =>
    !!s && positive(s.width) && positive(s.height);
  const format = value.format;
  const validFormat =
    format &&
    ['default', 'heuristic', 'user'].includes(format.origin) &&
    (format.kind === 'standard'
      ? ['A3', 'A4', 'A5', 'A6', 'letter', 'postcard-100x150'].includes(format.preset) &&
        (format.orientation === undefined || ['portrait', 'landscape'].includes(format.orientation))
      : format.kind === 'receipt'
        ? positive(format.widthMm)
        : format.kind === 'original-ratio');
  const quality = value.quality;
  const auto = value.autoOptimization;
  const validAuto =
    value.recipe?.enhancement === 'auto'
      ? !!auto &&
        ((auto.profile === 'color' && auto.reason === 'paper-background') ||
          (auto.profile === 'photo' && auto.reason === 'preserve-photo')) &&
        [auto.neutralFraction, auto.flatFraction].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 1,
        ) &&
        auto.flatFraction <= auto.neutralFraction &&
        Number.isFinite(auto.contrastGain) &&
        auto.contrastGain >= 1 &&
        auto.contrastGain <= 1.15 &&
        !!auto.adjustments &&
        validRecipe({
          version: 1,
          enhancement: 'auto',
          dewarp: 'off',
          adjustments: auto.adjustments,
        })
      : auto === undefined;
  if (
    value.schemaVersion !== 1 ||
    !['camera', 'file'].includes(value.source) ||
    !validQuad(value.corners) ||
    !size(value.normalizedSourceSizePx) ||
    !size(value.outputSizePx) ||
    !size(value.outputLayoutMm) ||
    ![0, 90, 180, 270].includes(value.rotationDegrees) ||
    !['image/jpeg', 'image/png'].includes(value.outputMimeType) ||
    value.physicalSizeMm !== null ||
    !validFormat ||
    !validRecipe(value.recipe) ||
    !validAuto ||
    (value.lensCorrection !== undefined &&
      (!['off', 'applied', 'already-straight', 'insufficient-evidence'].includes(
        value.lensCorrection.status,
      ) ||
        !Number.isFinite(value.lensCorrection.strength) ||
        Math.abs(value.lensCorrection.strength) > 0.18 ||
        !Number.isInteger(value.lensCorrection.supportedEdges) ||
        value.lensCorrection.supportedEdges < 0 ||
        value.lensCorrection.supportedEdges > 4 ||
        [value.lensCorrection.beforePx, value.lensCorrection.afterPx].some(
          (n) => n !== undefined && (!Number.isFinite(n) || n < 0),
        ))) ||
    !positive(value.geometry.shortToLongRatio) ||
    value.geometry.shortToLongRatio > 1 ||
    quality.state !== 'completed' ||
    quality.method !== 'image-metrics' ||
    quality.revision !== revision ||
    !['no-warning', 'review-advised', 'unknown'].includes(quality.assessment) ||
    !['sharp', 'blur', 'unknown'].includes(quality.sharpness) ||
    quality.reasons.some(
      (reason) => !['blur', 'exposure', 'edges', 'insufficient-structure'].includes(reason),
    ) ||
    quality.regions.some(
      (region) =>
        ![
          region.variance,
          region.contrast,
          region.mean,
          ...[region.edgeRatio, region.edgeRatioX, region.edgeRatioY, region.edgeSamples].filter(
            (n) => n !== undefined,
          ),
        ].every((n) => Number.isFinite(n) && n! >= 0),
    )
  ) {
    throw new ScannerError(
      'METADATA_INVALID',
      'Die Bildmetadaten sind unvollständig oder inkonsistent. Bitte Seite erneut prüfen.',
    );
  }
}
