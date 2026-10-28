import { chooseAutoProfile } from './auto-profile.ts';
import { extractDocument } from 'scanic';
import type { CornerPoints } from 'scanic';
import type {
  AutoOptimization,
  ProcessRequest,
  Quad,
  ProcessingResult,
  CropRequired,
  LiveDetection,
} from './types.ts';
import { selectDocumentCandidate, compareCaptureHint, candidateQuad } from './candidates.ts';
import type { DocumentCandidate } from './candidates.ts';
import { imageHeader } from './image-header.ts';
import {
  validQuad,
  limitedSize,
  cropSize,
  area,
  rectifiedSize,
  suggestFormat,
  estimatePaperRatio,
} from './geometry.ts';
import { assessQuality, enhanceDocument } from './quality.ts';
import { normalizePaperLighting } from './paper-cleanup.ts';
import { applyAdjustments, autoPaperContrast, validRecipe } from './adjustments.ts';
import { refineEdges } from './refine.ts';
import { recoverTopPaperEdge } from './top-edge.ts';
import { createDetectionJob } from './detection.ts';
import { correctLens, estimateLens } from './lens.ts';
import { grayscale, blackAndWhite } from './color-profiles.ts';
import { WorkerTrace } from './diagnostics.worker.ts';
import { ScannerError } from './errors.ts';
const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
// Only live candidate ranking uses continuity. Still-image recognition is independent.
let liveTarget: { corners: Quad; timestamp: number; aspect: number } | undefined;
function normalized(corners: CornerPoints | null, width: number, height: number): Quad | null {
  if (!corners) return null;
  const q = keys.map((key) => ({
    x: corners[key].x / (width - 1),
    y: corners[key].y / (height - 1),
  })) as Quad;
  // Tiny text blocks can look like document contours. Keep them editable as a full image instead.
  return validQuad(q) && area(q) >= 0.08 ? q : null;
}
function pixels(quad: Quad, width: number, height: number): CornerPoints {
  return Object.fromEntries(
    keys.map((key, i) => [key, { x: quad[i].x * (width - 1), y: quad[i].y * (height - 1) }]),
  ) as unknown as CornerPoints;
}
function canvasFor(image: ImageBitmap | OffscreenCanvas, maxDimension = Infinity): OffscreenCanvas {
  const size = limitedSize(image, Infinity, maxDimension),
    canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function detect(
  bitmap: ImageBitmap,
  timestamp: number,
  trace?: WorkerTrace,
  engineBuffers = false,
  includeEngineBuffers = engineBuffers,
): Promise<LiveDetection> {
  try {
    const small = canvasFor(bitmap, 800),
      ctx = small.getContext('2d')!,
      data = ctx.getImageData(0, 0, small.width, small.height);
    await trace?.image('live-input', small, 'normalized-video-frame');
    const aspect = small.width / small.height;
    const previous =
      liveTarget &&
      timestamp > liveTarget.timestamp &&
      timestamp - liveTarget.timestamp <= 800 &&
      Math.abs(Math.log(aspect / liveTarget.aspect)) < 0.01
        ? liveTarget.corners
        : null;
    const result = await createDetectionJob().scan(
      data,
      {
        mode: 'detect',
        detector: 'classical',
        maxProcessingDimension: 800,
        debug: engineBuffers,
        output: 'imagedata',
      },
      (candidates, size) => selectDocumentCandidate(candidates, size, previous),
      (_candidates, _size, selected) => {
        trace?.event('candidate-selection', { phase: 'live', ...selected, candidate: undefined });
      },
    );
    const corners = normalized(result.corners, small.width, small.height);
    if (corners) liveTarget = { corners, timestamp, aspect };
    const sharpness = corners ? assessQuality(data, corners, 0).sharpness : 'unknown';
    trace?.event('live-detection', {
      timestamp,
      corners,
      sharpness,
      confidence: result.confidence,
      timings: result.timings,
      success: result.success,
      message: result.message,
    });
    if (includeEngineBuffers) await trace?.buffers(result.debug, small.width, small.height);
    return { corners, sharpness, timestamp };
  } finally {
    bitmap.close();
  }
}
async function process(
  request: ProcessRequest,
  trace?: WorkerTrace,
  engineBuffers = false,
  includeEngineBuffers = engineBuffers,
): Promise<ProcessingResult> {
  const { original, limits } = request;
  const render = (image: ImageData, format: NonNullable<ProcessRequest['format']>) => {
    const input = new OffscreenCanvas(image.width, image.height);
    input.getContext('2d')!.putImageData(image, 0, 0);
    const bounded = limitedSize(
      rectifiedSize(input, format),
      limits.outputPixels,
      limits.outputDimension,
    );
    const quarter = request.rotation === 90 || request.rotation === 270;
    const result = new OffscreenCanvas(
      quarter ? bounded.height : bounded.width,
      quarter ? bounded.width : bounded.height,
    );
    const ctx = result.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, result.width, result.height);
    ctx.translate(result.width / 2, result.height / 2);
    ctx.rotate((request.rotation * Math.PI) / 180);
    ctx.drawImage(input, -bounded.width / 2, -bounded.height / 2, bounded.width, bounded.height);
    input.width = input.height = 1;
    return result;
  };
  if (!validRecipe(request.recipe))
    throw new ScannerError('CONFIG_INVALID', 'Ungültige Bildkorrektur.');
  trace?.event(
    'process-input',
    { ...request, original: undefined, coordinateSpace: 'orientation-normalized-original' },
    [{ stage: 'original', blob: original, coordinateSpace: 'original-file-with-metadata' }],
  );
  if (original.size > limits.fileBytes)
    throw new ScannerError('LIMIT_EXCEEDED', 'Die Bilddatei ist zu groß.');
  const header = imageHeader(new Uint8Array(await original.arrayBuffer()));
  const paperFieldBytes = ['auto', 'paper', 'grayscale'].includes(request.recipe.enhancement)
    ? 4 * 1024 * 1024
    : 0;
  if (
    header.width < 2 ||
    header.height < 2 ||
    header.width * header.height > limits.inputPixels ||
    header.width * header.height * (request.recipe.dewarp === 'off' ? 8 : 12) +
      limits.outputPixels *
        (request.recipe.enhancement === 'bw' ? 32 : request.recipe.dewarp === 'off' ? 24 : 28) +
      paperFieldBytes >
      limits.workingBytes
  )
    throw new ScannerError(
      'LIMIT_EXCEEDED',
      'Das Bild überschreitet das Pixel- oder Arbeitsspeicherlimit.',
    );
  const bitmap = await createImageBitmap(new Blob([original], { type: header.mime }), {
    imageOrientation: 'from-image',
  });
  let source: OffscreenCanvas | undefined;
  let output: OffscreenCanvas | undefined;
  let thumbnailCanvas: OffscreenCanvas | undefined;
  try {
    if (bitmap.width * bitmap.height > limits.inputPixels)
      throw new ScannerError('LIMIT_EXCEEDED', 'Zu viele dekodierte Bildpunkte.');
    const size = { width: bitmap.width, height: bitmap.height };
    // A comparable live hint may seed manual correction, never automatic still geometry.
    const editorHint =
      request.captureHint?.stable === true &&
      compareCaptureHint(request.captureHint, size, null).state === 'still-not-detected'
        ? request.captureHint
        : undefined;
    const requireCrop = (reason: CropRequired['reason'], proposed?: Quad): CropRequired => {
      const corners: Quad =
        proposed ??
        (editorHint
          ? structuredClone(editorHint.corners)
          : [
              { x: 0.1, y: 0.1 },
              { x: 0.9, y: 0.1 },
              { x: 0.9, y: 0.9 },
              { x: 0.1, y: 0.9 },
            ]);
      trace?.event('crop-required', { reason, size, corners });
      return { status: 'crop-required', reason, size, corners };
    };
    source = canvasFor(bitmap);
    bitmap.close();
    await trace?.image('normalized-original', source, 'orientation-normalized-original');
    const small = canvasFor(source, 1000),
      data = small.getContext('2d')!.getImageData(0, 0, small.width, small.height);
    await trace?.image('detection-input', small, 'orientation-normalized-original');
    let stillDetected = !!request.corners;
    let corners = request.corners,
      edgesUncertain = false;
    if (!corners) {
      const detection = createDetectionJob();
      const pool: DocumentCandidate[] = [];
      let sourcePixels: ImageData | undefined;
      const getPixels = () =>
        (sourcePixels ??= source!
          .getContext('2d')!
          .getImageData(0, 0, source!.width, source!.height));
      for (const bound of [1000, 800]) {
        if (bound === 800 && Math.max(small.width, small.height) <= 800) continue;
        const pass = bound === 1000 ? small : canvasFor(source, bound);
        try {
          const passData =
            bound === 1000
              ? data
              : pass.getContext('2d')!.getImageData(0, 0, pass.width, pass.height);
          const detected = await detection.scan(
            passData,
            {
              mode: 'detect',
              detector: 'classical',
              maxProcessingDimension: bound,
              debug: engineBuffers,
              output: 'imagedata',
            },
            selectDocumentCandidate,
            (candidates, size, selected) => {
              for (const candidate of candidates) {
                const q = candidateQuad(candidate, size);
                if (q) pool.push({ ...candidate, corners: pixels(q, small.width, small.height) });
              }
              trace?.event('candidate-selection', {
                phase: 'still',
                passMaxDimension: bound,
                ...selected,
                candidate: undefined,
              });
            },
          );
          trace?.event('still-detection', {
            corners: detected.corners,
            confidence: detected.confidence,
            timings: detected.timings,
            success: detected.success,
            message: detected.message,
            workingSize: { width: pass.width, height: pass.height },
            passMaxDimension: bound,
          });
          if (includeEngineBuffers) await trace?.buffers(detected.debug, pass.width, pass.height);
        } finally {
          if (pass !== small) pass.width = pass.height = 1;
        }
      }
      const provisional = selectDocumentCandidate(pool, small);
      const provisionalCorners = provisional.candidate
        ? candidateQuad(provisional.candidate, small)
        : null;
      if (!provisionalCorners) {
        // Near-diagonal paper edges can break the classical contour approximation.
        // Retry missing still hypotheses without treating live geometry as crop evidence.
        for (const degrees of [-30, 30]) {
          const theta = (degrees * Math.PI) / 180,
            c = Math.cos(theta),
            s = Math.sin(theta);
          const rotated = new OffscreenCanvas(
            Math.ceil(Math.abs(small.width * c) + Math.abs(small.height * s)),
            Math.ceil(Math.abs(small.width * s) + Math.abs(small.height * c)),
          );
          const context = rotated.getContext('2d')!;
          context.fillStyle = '#777';
          context.fillRect(0, 0, rotated.width, rotated.height);
          context.translate(rotated.width / 2, rotated.height / 2);
          context.rotate(theta);
          context.drawImage(small, -small.width / 2, -small.height / 2);
          try {
            await detection.scan(
              rotated,
              {
                mode: 'detect',
                detector: 'classical',
                maxProcessingDimension: 1000,
                debug: engineBuffers,
                output: 'imagedata',
              },
              selectDocumentCandidate,
              (candidates, size) => {
                for (const candidate of candidates) {
                  const q = candidateQuad(candidate, size);
                  if (!q) continue;
                  const mapped = q.map((p) => {
                    const x = p.x * (rotated.width - 1) - rotated.width / 2;
                    const y = p.y * (rotated.height - 1) - rotated.height / 2;
                    return {
                      x: (c * x + s * y + small.width / 2) / (small.width - 1),
                      y: (-s * x + c * y + small.height / 2) / (small.height - 1),
                    };
                  });
                  const start = mapped.reduce(
                    (best, p, i) =>
                      p.x * small.width + p.y * small.height <
                      mapped[best].x * small.width + mapped[best].y * small.height
                        ? i
                        : best,
                    0,
                  );
                  const ordered = mapped.map((_, i) => mapped[(i + start) % 4]) as Quad;
                  if (validQuad(ordered))
                    pool.push({
                      ...candidate,
                      corners: pixels(ordered, small.width, small.height),
                    });
                }
              },
            );
            trace?.event('still-orientation-retry', { degrees, hypotheses: pool.length });
          } finally {
            rotated.width = rotated.height = 1;
          }
        }
      }
      const selected = selectDocumentCandidate(pool, small);
      trace?.event('candidate-selection', {
        phase: 'still-combined',
        ...selected,
        candidate: undefined,
      });
      const initial = selected.candidate ? candidateQuad(selected.candidate, small) : null;
      stillDetected = !!initial;
      if (initial) {
        const refined = refineEdges(getPixels(), initial);
        trace?.event('edge-refinement', { initial, ...refined });
        corners = refined.corners;
        edgesUncertain = !refined.supported;
        if (!refined.supported) {
          const recovered = recoverTopPaperEdge(getPixels(), corners);
          trace?.event('top-edge-recovery', { initial: corners, ...recovered });
          if (recovered.applied) corners = recovered.corners;
        }
      } else {
        return requireCrop('not-detected');
      }
    }
    if (!validQuad(corners))
      throw new ScannerError('CORNERS_INVALID', 'Bitte vier gültige Dokumentecken setzen.');
    if (
      !request.corners &&
      edgesUncertain &&
      corners.some((p) => Math.min(p.x, p.y, 1 - p.x, 1 - p.y) < 0.004)
    ) {
      trace?.event('unsupported-frame-border', { corners });
      return requireCrop('not-detected', corners);
    }
    trace?.event('live-still-comparison', {
      ...compareCaptureHint(request.captureHint, size, stillDetected ? corners : null),
    });
    const ratioEvidence = estimatePaperRatio(size, corners);
    // Confirming a crop does not calibrate the camera or prove the physical paper format.
    const formatGeometryUncertain =
      edgesUncertain ||
      (!!request.corners &&
        request.format?.origin !== 'user' &&
        !refineEdges(data, corners).supported);
    const format =
      request.format ??
      suggestFormat(size, {
        corners,
        preferredPaper: request.preferredPaper,
        geometryUncertain: formatGeometryUncertain,
      });
    trace?.event('format-suggestion', {
      ...ratioEvidence,
      preferredPaper: request.preferredPaper ?? 'A4',
      format,
      explicitFormat: request.format !== undefined,
      formatGeometryUncertain,
    });
    trace?.event('geometry', {
      corners,
      size,
      edgesUncertain,
      format,
    });
    const quality = assessQuality(data, corners, request.revision);
    if (edgesUncertain) {
      quality.reasons.push('edges');
      if (quality.assessment !== 'unknown') quality.assessment = 'review-advised';
    }
    const desired = limitedSize(
      cropSize(corners, size),
      limits.outputPixels,
      limits.outputDimension,
    );
    const crop = cropSize(corners, size),
      scale = Math.min(1, desired.width / crop.width, desired.height / crop.height);
    const working = new OffscreenCanvas(
      Math.max(2, Math.floor(size.width * scale)),
      Math.max(2, Math.floor(size.height * scale)),
    );
    working.getContext('2d')!.drawImage(source, 0, 0, working.width, working.height);
    source.width = source.height = 1;
    let sourceData = working.getContext('2d')!.getImageData(0, 0, working.width, working.height);
    const lensCorrection =
      request.recipe.dewarp === 'auto'
        ? estimateLens(data, corners)
        : {
            status:
              request.recipe.dewarp === 'manual' && request.recipe.lensStrength
                ? ('applied' as const)
                : ('off' as const),
            strength: request.recipe.dewarp === 'manual' ? request.recipe.lensStrength! : 0,
            supportedEdges: 0,
          };
    let extractionCorners = corners;
    let unoptimizedPreview: Blob | undefined;
    if (lensCorrection.status === 'applied') {
      if (request.previewComparison !== false) {
        const base = await extractDocument(
          sourceData,
          pixels(corners, working.width, working.height),
          { output: 'imagedata' },
        );
        if (!base.success || !(base.output instanceof ImageData))
          throw new ScannerError(
            'PROCESSING_FAILED',
            'Der Vergleichszuschnitt konnte nicht erstellt werden.',
          );
        const baseline = render(base.output, format);
        unoptimizedPreview = await baseline.convertToBlob({ type: request.mime, quality: 0.92 });
        baseline.width = baseline.height = 1;
      }
      const corrected = correctLens(sourceData, corners, lensCorrection.strength);
      sourceData = new ImageData(
        corrected.data as Uint8ClampedArray<ArrayBuffer>,
        working.width,
        working.height,
      );
      extractionCorners = corrected.corners;
      if (!validQuad(extractionCorners))
        throw new ScannerError(
          'CORNERS_INVALID',
          'Die Linsenentzerrung ergibt keinen gültigen Zuschnitt. Bitte Stärke reduzieren.',
        );
      working.getContext('2d')!.putImageData(sourceData, 0, 0);
      await trace?.image('lens-corrected', working, 'lens-corrected-source');
    }
    trace?.event('lens-correction', { ...lensCorrection });
    const extracted = await extractDocument(
      sourceData,
      pixels(extractionCorners, working.width, working.height),
      { output: 'imagedata' },
    );
    if (!extracted.success || !(extracted.output instanceof ImageData))
      throw new ScannerError(
        'PROCESSING_FAILED',
        'Die Perspektivkorrektur ist fehlgeschlagen. Bitte Ecken prüfen.',
      );
    trace?.event('quality', { ...quality });
    const corrected = new OffscreenCanvas(extracted.output.width, extracted.output.height);
    corrected.getContext('2d')!.putImageData(extracted.output, 0, 0);
    await trace?.image('perspective-corrected', corrected, 'unconstrained-rectified-document');
    corrected.width = corrected.height = 1;
    output = render(extracted.output, format);
    const ctx = output.getContext('2d')!;
    await trace?.image('format-and-rotation', output, 'output-image');
    if (
      !unoptimizedPreview &&
      request.previewComparison !== false &&
      (request.recipe.enhancement !== 'none' ||
        Object.values(request.recipe.adjustments ?? {}).some(Boolean))
    ) {
      unoptimizedPreview = await output.convertToBlob({ type: request.mime, quality: 0.92 });
    }
    let autoOptimization: AutoOptimization | undefined;
    if (request.recipe.enhancement === 'auto') {
      const image = ctx.getImageData(0, 0, output.width, output.height);
      autoOptimization = {
        ...chooseAutoProfile(image),
        contrastGain: 1,
        adjustments: { brightness: 0, contrast: 0, sharpness: 0 },
      };
      if (autoOptimization.profile === 'color') autoOptimization.adjustments.sharpness = 20;
    }
    const enhancement = autoOptimization
      ? autoOptimization.profile === 'color'
        ? 'paper'
        : 'none'
      : request.recipe.enhancement;
    let paperCleanup: ReturnType<typeof normalizePaperLighting> | undefined;
    if (request.recipe.enhancement === 'document') {
      const enhanced = ctx.getImageData(0, 0, output.width, output.height);
      enhanceDocument(enhanced);
      ctx.putImageData(enhanced, 0, 0);
    }
    if (['paper', 'grayscale', 'bw'].includes(enhancement)) {
      const enhanced = ctx.getImageData(0, 0, output.width, output.height);
      paperCleanup = normalizePaperLighting(enhanced, { whiten: enhancement !== 'bw' });
      const contrastGain = paperCleanup.applied ? autoPaperContrast(enhanced) : 1;
      if (autoOptimization) autoOptimization.contrastGain = contrastGain;
      ctx.putImageData(enhanced, 0, 0);
      trace?.event('paper-cleanup', {
        ...paperCleanup,
        contrastGain,
        whitePaper: enhancement !== 'bw',
      });
    }
    const adjustments = request.recipe.adjustments ?? autoOptimization?.adjustments;
    if (adjustments) {
      const adjusted = ctx.getImageData(0, 0, output.width, output.height);
      applyAdjustments(adjusted, adjustments);
      ctx.putImageData(adjusted, 0, 0);
      if (request.recipe.adjustments)
        trace?.event('manual-adjustments', request.recipe.adjustments);
    }
    if (request.recipe.enhancement === 'grayscale' || request.recipe.enhancement === 'bw') {
      const filtered = ctx.getImageData(0, 0, output.width, output.height);
      if (request.recipe.enhancement === 'grayscale') grayscale(filtered);
      else
        blackAndWhite(
          filtered,
          -(request.recipe.adjustments?.brightness ?? 0) * 0.12 +
            (request.recipe.adjustments?.contrast ?? 0) * 0.08,
        );
      ctx.putImageData(filtered, 0, 0);
      trace?.event('color-profile', { profile: request.recipe.enhancement });
    }
    if (autoOptimization) trace?.event('auto-optimization', { ...autoOptimization });
    await trace?.image('enhanced', output, 'output-image');
    const preview = await output.convertToBlob({ type: request.mime, quality: 0.92 });
    thumbnailCanvas = canvasFor(output, 256);
    const thumbnail = await thumbnailCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    if (
      preview.type !== request.mime ||
      preview.size + thumbnail.size + (unoptimizedPreview?.size ?? 0) > limits.resultBytes
    )
      throw new ScannerError(
        'EXPORT_FAILED',
        'Das gewünschte Bildformat konnte nicht erzeugt werden.',
      );
    trace?.event('processed', { outputSize: { width: output.width, height: output.height } }, [
      {
        stage: 'processed-image',
        blob: preview,
        width: output.width,
        height: output.height,
        coordinateSpace: 'output-image',
      },
      {
        stage: 'thumbnail',
        blob: thumbnail,
        width: thumbnailCanvas.width,
        height: thumbnailCanvas.height,
        coordinateSpace: 'output-image',
      },
    ]);
    return {
      format,
      size,
      corners,
      preview,
      unoptimizedPreview,
      paperCleanup,
      autoOptimization,
      lensCorrection,
      thumbnail,
      outputSize: { width: output.width, height: output.height },
      quality,
      edgesUncertain,
    };
  } finally {
    bitmap.close();
    if (source) source.width = source.height = 1;
    if (output) output.width = output.height = 1;
    if (thumbnailCanvas) thumbnailCanvas.width = thumbnailCanvas.height = 1;
  }
}
worker.onmessage = async ({ data }) => {
  try {
    const trace = data.trace
      ? new WorkerTrace((diagnostic) => worker.postMessage({ id: data.id, diagnostic }))
      : undefined;
    const result =
      data.kind === 'detect'
        ? await detect(
            data.image,
            data.timestamp,
            trace,
            data.engineBuffers,
            data.includeEngineBuffers,
          )
        : await process(data.request, trace, data.engineBuffers, data.includeEngineBuffers);
    worker.postMessage({ id: data.id, result });
  } catch (error) {
    worker.postMessage({
      id: data.id,
      error: {
        code: error instanceof ScannerError ? error.code : 'PROCESSING_FAILED',
        message:
          error instanceof ScannerError
            ? error.message
            : 'Bildverarbeitung fehlgeschlagen. Bitte anderes Bild verwenden oder erneut versuchen.',
      },
    });
  }
};
