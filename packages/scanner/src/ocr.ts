import type { Limits, ScanPage } from './types.ts';
import { aborted, ScannerError } from './errors.ts';
import { resolveLimits } from './session.ts';
import { imageHeader } from './image-header.ts';
import { validateMetadata } from './validation.ts';
import { WorkerClient, assetUrl } from './worker-client.ts';

export type OcrLanguage = 'deu' | 'eng';
export interface OcrProgress {
  stage: 'loading' | 'recognizing' | 'assembling';
  /** One-based during recognition; zero for loading and assembly. */
  page: number;
  pages: number;
  /** Engine recognition progress, or concrete phase start/end, from zero to one. */
  progress: number;
}
export interface OcrPageResult {
  id: string;
  revision: number;
  text: string;
  /** Engine confidence from zero to 100; not a readability guarantee. */
  confidence: number;
}
export interface SearchablePdfResult {
  pdf: Blob;
  pages: OcrPageResult[];
}
export interface OcrOptions {
  pages: readonly ScanPage[];
  assetBaseUrl: string;
  languages?: readonly OcrLanguage[];
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
  limits?: Partial<Limits>;
}
type SnapshotPage = Pick<ScanPage, 'id' | 'revision' | 'image' | 'metadata'>;
const ENGINE_RESERVE = 64 * 1024 ** 2;
const ASSEMBLY_TIMEOUT = 300_000;
const limitError = () =>
  new ScannerError('LIMIT_EXCEEDED', 'OCR exceeds the configured memory or result limit.');

/** Recognize confirmed final images and add an invisible text layer without changing their pixels. */
export async function createSearchablePdf(options: OcrOptions): Promise<SearchablePdfResult> {
  const signal = options?.signal;
  aborted(signal);
  if (
    !options ||
    !Array.isArray(options.pages) ||
    !options.pages.length ||
    typeof options.assetBaseUrl !== 'string' ||
    !options.assetBaseUrl.trim()
  )
    throw new ScannerError(
      'CONFIG_INVALID',
      'Provide confirmed pages and a same-origin asset URL.',
    );
  const assetBaseUrl = options.assetBaseUrl;
  const limits = resolveLimits(options.limits);
  if (options.pages.length > limits.pages) throw limitError();
  const requested = options.languages ?? ['deu', 'eng'];
  if (
    !Array.isArray(requested) ||
    !requested.length ||
    Array.from(requested).some((language) => !['deu', 'eng'].includes(language))
  )
    throw new ScannerError('CONFIG_INVALID', 'OCR languages must contain deu or eng.');
  const languages = [...new Set(requested)] as OcrLanguage[];
  const callback = options.onProgress;
  const notify = (stage: OcrProgress['stage'], page: number, progress: number) => {
    if (signal?.aborted) return;
    try {
      void Promise.resolve(callback?.({ stage, page, pages: snapshot.length, progress })).catch(
        () => {},
      );
    } catch {
      // Progress observers do not own the OCR job.
    }
  };
  const ids = new Set<string>();
  const retained = new Set<Blob>();
  const images = new Set<Blob>();
  const snapshot: SnapshotPage[] = Array.from(options.pages).map((page) => {
    if (
      !page ||
      typeof page.id !== 'string' ||
      !page.id ||
      ids.has(page.id) ||
      !Number.isSafeInteger(page.revision) ||
      page.revision < 1 ||
      !(page.image instanceof Blob)
    )
      throw new ScannerError(
        'METADATA_INVALID',
        'OCR requires uniquely identified confirmed page revisions.',
      );
    ids.add(page.id);
    let metadata: ScanPage['metadata'];
    try {
      metadata = structuredClone(page.metadata);
      validateMetadata(metadata, page.revision);
    } catch {
      throw new ScannerError(
        'METADATA_INVALID',
        'OCR requires consistent confirmed page metadata.',
      );
    }
    if (
      ![metadata.outputLayoutMm.width, metadata.outputLayoutMm.height].every(
        (value) => Number.isFinite(value) && value >= 10 && value <= 5000,
      )
    )
      throw new ScannerError(
        'LAYOUT_INVALID',
        'PDF dimensions must be between 10 and 5000 millimeters.',
      );
    retained.add(page.image);
    images.add(page.image);
    if (page.original !== undefined) {
      if (!(page.original instanceof Blob))
        throw new ScannerError('METADATA_INVALID', 'Invalid retained original.');
      retained.add(page.original);
    }
    return { id: page.id, revision: page.revision, image: page.image, metadata };
  });
  const retainedBytes = [...retained].reduce((sum, blob) => sum + blob.size, 0);
  const externalBytes = [...retained]
    .filter((blob) => !images.has(blob))
    .reduce((sum, blob) => sum + blob.size, 0);
  const imageBytes = snapshot.reduce((sum, page) => sum + page.image.size, 0);
  const largestFile = Math.max(...snapshot.map((page) => page.image.size));
  if (
    imageBytes > limits.resultBytes ||
    retainedBytes + largestFile + ENGINE_RESERVE > limits.workingBytes
  )
    throw limitError();
  for (const page of snapshot) {
    const header = imageHeader(new Uint8Array(await page.image.arrayBuffer()));
    aborted(signal);
    if (header.mime !== 'image/jpeg' && header.mime !== 'image/png')
      throw new ScannerError('FILE_UNSUPPORTED', 'OCR accepts final JPEG and PNG images only.');
    if (
      header.mime !== page.metadata.outputMimeType ||
      header.width !== page.metadata.outputSizePx.width ||
      header.height !== page.metadata.outputSizePx.height ||
      header.width < 2 ||
      header.height < 2
    )
      throw new ScannerError(
        'METADATA_INVALID',
        'OCR image dimensions and format must match the confirmed page.',
      );
    const pixels = header.width * header.height;
    if (
      pixels > limits.inputPixels ||
      pixels > limits.outputPixels ||
      Math.max(header.width, header.height) > limits.outputDimension
    )
      throw limitError();
    // A raster/engine estimate, not a native or browser RSS measurement.
    if (retainedBytes + page.image.size + pixels * 32 + ENGINE_RESERVE > limits.workingBytes)
      throw limitError();
  }
  if (typeof Worker === 'undefined' || typeof document === 'undefined')
    throw new ScannerError('CONFIG_INVALID', 'OCR requires a browser with worker support.');
  const ocrAssets = assetUrl(assetBaseUrl, 'ocr/');
  const pdfAssets = assetUrl(assetBaseUrl, 'ocr-pdf.worker.js');
  const layers: (SnapshotPage & { textPdf: Uint8Array })[] = [];
  const resultPages: OcrPageResult[] = [];
  let textBytes = 0;
  let layerBytes = 0;
  let activePage = 0;
  let recognizing = false;
  try {
    notify('loading', 0, 0);
    aborted(signal);
    const { OcrClient } = await import('./ocr-client.ts');
    aborted(signal);
    const client = new OcrClient({
      assetBaseUrl: ocrAssets,
      languages,
      onProgress: ({ status, progress }) => {
        if (recognizing && status === 'recognizing text')
          notify('recognizing', activePage, progress);
      },
    });
    try {
      await client.initialize(signal);
      aborted(signal);
      notify('loading', 0, 1);
      aborted(signal);
      for (const [index, page] of snapshot.entries()) {
        activePage = index + 1;
        const pageWorkingBytes =
          retainedBytes +
          page.image.size +
          page.metadata.outputSizePx.width * page.metadata.outputSizePx.height * 32 +
          ENGINE_RESERVE;
        if (pageWorkingBytes + layerBytes + textBytes > limits.workingBytes) throw limitError();
        recognizing = true;
        notify('recognizing', activePage, 0);
        aborted(signal);
        const result = await client.recognize(page.image, signal);
        recognizing = false;
        aborted(signal);
        textBytes += new TextEncoder().encode(result.text).byteLength;
        layerBytes += result.pdf.byteLength;
        if (
          imageBytes + layerBytes + textBytes > limits.resultBytes ||
          pageWorkingBytes + layerBytes + textBytes > limits.workingBytes
        )
          throw limitError();
        layers.push({ ...page, textPdf: result.pdf });
        resultPages.push({
          id: page.id,
          revision: page.revision,
          text: result.text,
          confidence: result.confidence,
        });
        notify('recognizing', activePage, 1);
        aborted(signal);
      }
    } finally {
      recognizing = false;
      client.destroy();
    }
    aborted(signal);
    notify('assembling', 0, 0);
    aborted(signal);
    const worker = new WorkerClient(pdfAssets);
    let pdf: Blob;
    try {
      const transfers = [...new Set(layers.map((page) => page.textPdf.buffer))].filter(
        (buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer,
      );
      pdf = await worker.run<Blob>(
        {
          pages: layers,
          maxBytes: limits.resultBytes - textBytes - layerBytes,
          workingBytes: limits.workingBytes,
          textBytes,
          externalBytes,
        },
        transfers,
        signal,
        ASSEMBLY_TIMEOUT,
      );
    } finally {
      worker.destroy();
    }
    aborted(signal);
    if (
      !(pdf instanceof Blob) ||
      pdf.type !== 'application/pdf' ||
      !pdf.size ||
      pdf.size + textBytes + layerBytes > limits.resultBytes
    )
      throw new ScannerError(
        'EXPORT_FAILED',
        'The complete searchable PDF could not be created within the limits.',
      );
    notify('assembling', 0, 1);
    aborted(signal);
    return { pdf, pages: resultPages };
  } finally {
    layers.length = 0;
  }
}
