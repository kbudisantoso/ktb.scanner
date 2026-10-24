import { diagnose } from './diagnostics.ts';
import type { DiagnosticOptions } from './diagnostics.ts';
import { fitImage } from './geometry.ts';
import type { EngineAdapter, ImageMime, Limits, PageDraft, ScanResult } from './types.ts';
import { aborted, ScannerError } from './errors.ts';
import { metadataFor } from './session.ts';
import { validateMetadata } from './validation.ts';
import { WorkerClient, assetUrl } from './worker-client.ts';
export { layoutMm, fitImage } from './geometry.ts';
export async function exportDocument(options: {
  pages: readonly PageDraft[];
  sessionId: string;
  engine: EngineAdapter;
  limits: Limits;
  mime: ImageMime;
  pdf: boolean;
  originals: boolean;
  assetBaseUrl: string;
  signal?: AbortSignal;
  diagnostics?: DiagnosticOptions;
}): Promise<Extract<ScanResult, { status: 'confirmed' }>> {
  const { pages, engine, signal, limits } = options;
  aborted(signal);
  if (!pages.length)
    throw new ScannerError('EMPTY_SESSION', 'Bitte mindestens eine Seite hinzufügen.');
  let bytes = 0;
  const result: Extract<ScanResult, { status: 'confirmed' }> = {
    status: 'confirmed',
    schemaVersion: 1,
    sessionId: options.sessionId,
    pages: [],
  };
  for (const page of pages) {
    aborted(signal);
    const processed = await engine.process(
      {
        original: page.original,
        previewComparison: false,
        diagnosticContext: { pageId: page.id, source: page.source, operation: 'export' },
        limits,
        corners: page.corners,
        format: page.format,
        rotation: page.rotation,
        recipe: page.recipe,
        revision: page.revision,
        mime: options.mime,
      },
      signal,
    );
    aborted(signal);
    if ('status' in processed)
      throw new ScannerError('CROP_REQUIRED', 'Bitte zuerst die Dokumentecken bestätigen.');
    bytes += processed.preview.size + (options.originals ? page.original.size : 0);
    if (bytes > limits.resultBytes)
      throw new ScannerError(
        'LIMIT_EXCEEDED',
        'Die Ergebnisdateien sind zu groß. Bitte JPEG wählen oder Seiten reduzieren.',
      );
    const quality = { ...processed.quality };
    if (page.edgesUncertain && !quality.reasons.includes('edges')) {
      quality.reasons = [...quality.reasons, 'edges'];
      quality.assessment = 'review-advised';
    }
    const metadata = metadataFor(
      {
        ...page,
        quality,
        lensCorrection: processed.lensCorrection,
        autoOptimization: processed.autoOptimization,
      },
      options.mime,
      processed.outputSize,
    );
    validateMetadata(metadata, page.revision);
    diagnose(
      options.diagnostics,
      'export-page',
      {
        id: page.id,
        revision: page.revision,
        metadata,
        boxMm:
          metadata.format.kind === 'standard'
            ? { x: 0, y: 0, ...metadata.outputLayoutMm }
            : fitImage(processed.outputSize, metadata.outputLayoutMm),
      },
      [
        {
          stage: 'export-image',
          blob: processed.preview,
          ...processed.outputSize,
          coordinateSpace: 'output-image',
        },
      ],
    );
    result.pages.push({
      id: page.id,
      revision: page.revision,
      image: processed.preview,
      ...(options.originals ? { original: page.original } : {}),
      metadata,
    });
  }
  if (options.pdf) {
    // PDF assembly and compression stay off the UI thread and can be terminated on abort.
    const worker = new WorkerClient(assetUrl(options.assetBaseUrl, 'pdf.worker.js'));
    try {
      result.pdf = await worker.run<Blob>(
        {
          pages: result.pages.map((p) => ({ image: p.image, metadata: p.metadata })),
          maxBytes: limits.resultBytes - bytes,
        },
        [],
        signal,
      );
    } finally {
      worker.destroy();
    }
  }
  aborted(signal);
  if (result.pages.length !== pages.length)
    throw new ScannerError('EXPORT_FAILED', 'Der Export ist unvollständig.');
  diagnose(
    options.diagnostics,
    'export-complete',
    {
      sessionId: result.sessionId,
      pages: result.pages.map(({ image, original, ...page }) => page),
    },
    result.pdf ? [{ stage: 'export-pdf', blob: result.pdf }] : undefined,
  );
  return result;
}
