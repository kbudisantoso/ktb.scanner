import type { Limits, ScanPage } from './types.ts';
import { aborted, ScannerError } from './errors.ts';
import { resolveLimits } from './session.ts';
import { imageHeader } from './image-header.ts';
import { validateMetadata } from './validation.ts';
import { WorkerClient, assetUrl } from './worker-client.ts';
import { ocrImageSize, prepareOcrImage } from './ocr-image.ts';
import { paddleWorkingBytes } from './paddle-memory.ts';
import { estimatePaddlePdfMemory, validatePaddlePdfLayer } from './paddle-pdf-geometry.ts';
import type { PaddlePdfLayer } from './paddle-pdf-geometry.ts';

export type OcrLanguage = 'deu' | 'eng';
export type OcrEngine = 'tesseract' | 'paddle';
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
  /** Defaults to Tesseract; Paddle uses its pinned multilingual Latin model. */
  engine?: OcrEngine;
  /** Tesseract model selection; valid DE/EN values do not change Paddle's Latin model. */
  languages?: readonly OcrLanguage[];
  /** Opt into RAM reuse of original SDK page-result objects; not a persistent cache. */
  previousPages?: readonly OcrPageResult[];
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
  limits?: Partial<Limits>;
}
type SnapshotPage = Pick<ScanPage, 'id' | 'revision' | 'image' | 'metadata'>;
type TextLayer = { textPdf: Uint8Array } | { paddleText: PaddlePdfLayer };
type AssemblyPage = SnapshotPage & TextLayer;
type Recognition = { text: string; confidence: number; layer: TextLayer };
type CachedRecognition = Recognition & {
  id: string;
  revision: number;
  image: Blob;
  configuration: string;
  bytes: number;
};
const reusablePages = new WeakMap<OcrPageResult, CachedRecognition>();
const ENGINE_RESERVE = 64 * 1024 ** 2;
const ASSEMBLY_TIMEOUT = 300_000;
const PADDLE_FONT_BYTES = 572;
const TESSERACT_PIPELINE_ID = 'tesseract.js/core7.0.0/tessdata_fast4.1.0/psm3/border10';
const limitError = () =>
  new ScannerError('LIMIT_EXCEEDED', 'OCR exceeds the configured memory or result limit.');
const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const textLayerBytes = (layer: TextLayer) =>
  'textPdf' in layer ? layer.textPdf.byteLength : utf8Bytes(JSON.stringify(layer.paddleText));
const cacheBytes = (recognition: Recognition) =>
  512 +
  recognition.text.length * 2 +
  ('textPdf' in recognition.layer
    ? recognition.layer.textPdf.byteLength
    : estimatePaddlePdfMemory([recognition.layer.paddleText], 0));

async function paddleFont(url: URL, signal?: AbortSignal): Promise<Uint8Array> {
  aborted(signal);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ASSEMBLY_TIMEOUT);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    aborted(signal);
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error('Missing Paddle PDF font.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    aborted(signal);
    if (bytes.byteLength !== PADDLE_FONT_BYTES) throw new Error('Unexpected Paddle PDF font.');
    return bytes;
  } catch {
    aborted(signal);
    if (timedOut) throw new ScannerError('PROCESSING_TIMEOUT', 'PDF font loading timed out.');
    throw new ScannerError('ENGINE_LOAD_FAILED', 'The local Paddle PDF font could not be loaded.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

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
  const engine = options.engine === undefined ? 'tesseract' : options.engine;
  if (engine !== 'tesseract' && engine !== 'paddle')
    throw new ScannerError('CONFIG_INVALID', 'OCR engine must be tesseract or paddle.');
  const reuse = options.previousPages !== undefined;
  if (reuse && !Array.isArray(options.previousPages))
    throw new ScannerError('CONFIG_INVALID', 'Previous OCR pages must be an array.');
  const previous = new Set<CachedRecognition>();
  if (reuse)
    for (const candidate of options.previousPages!) {
      if (!candidate || typeof candidate !== 'object') continue;
      const cached = reusablePages.get(candidate);
      if (cached) previous.add(cached);
    }
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
  for (const cached of previous) retained.add(cached.image);
  const previousBytes = [...previous].reduce((sum, cached) => sum + cached.bytes, 0);
  const retainedBytes = [...retained].reduce((sum, blob) => sum + blob.size, 0);
  const externalBytes = [...retained]
    .filter((blob) => !images.has(blob))
    .reduce((sum, blob) => sum + blob.size, 0);
  const imageBytes = snapshot.reduce((sum, page) => sum + page.image.size, 0);
  const largestFile = Math.max(...snapshot.map((page) => page.image.size));
  if (
    imageBytes > limits.resultBytes ||
    retainedBytes + previousBytes + largestFile + ENGINE_RESERVE > limits.workingBytes
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
  }
  if (typeof Worker === 'undefined' || typeof document === 'undefined')
    throw new ScannerError('CONFIG_INVALID', 'OCR requires a browser with worker support.');
  const assets = assetUrl(assetBaseUrl, './');
  const ocrAssets = new URL('ocr/', assets);
  const pdfAssets = new URL('ocr-pdf.worker.js', assets);
  const paddle = engine === 'paddle' ? await import('./paddle-client.ts') : undefined;
  aborted(signal);
  const configuration = JSON.stringify([
    engine,
    assets.href,
    paddle?.PADDLE_PIPELINE_ID ?? TESSERACT_PIPELINE_ID,
    engine === 'tesseract' ? languages : [],
  ]);
  const hits = new Map<SnapshotPage, CachedRecognition>();
  for (const page of snapshot) {
    const cached = [...previous].find(
      (candidate) =>
        candidate.id === page.id &&
        candidate.revision === page.revision &&
        candidate.image === page.image &&
        candidate.configuration === configuration,
    );
    if (cached) hits.set(page, cached);
    else {
      const size = page.metadata.outputSizePx;
      const padded = ocrImageSize(size);
      const bytes =
        engine === 'paddle'
          ? paddleWorkingBytes(size, page.image.size)
          : padded.width * padded.height * 32 + ENGINE_RESERVE;
      if (retainedBytes + previousBytes + bytes > limits.workingBytes) throw limitError();
    }
  }
  const layers: AssemblyPage[] = [];
  const resultPages: OcrPageResult[] = [];
  const pendingCache: [OcrPageResult, CachedRecognition][] = [];
  let textBytes = 0;
  let layerBytes = 0;
  let freshCacheBytes = 0;
  let recognitionPeak = 0;
  let activePage = 0;
  let recognizing = false;
  let destroy: (() => void) | undefined;
  let recognize: ((page: SnapshotPage, available: number) => Promise<Recognition>) | undefined;
  const retainedWorkingBytes = () =>
    retainedBytes + previousBytes + freshCacheBytes + textBytes + layerBytes;
  const checkRecognition = (required: number, available: number) => {
    recognitionPeak = Math.max(recognitionPeak, required);
    if (recognitionPeak > available) throw limitError();
  };
  try {
    try {
      if (hits.size !== snapshot.length) {
        notify('loading', 0, 0);
        aborted(signal);
        if (engine === 'tesseract') {
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
          destroy = () => client.destroy();
          await client.initialize(signal);
          recognize = async (page, available) => {
            const size = page.metadata.outputSizePx;
            const padded = ocrImageSize(size);
            const pixels = padded.width * padded.height;
            checkRecognition(
              Math.max(4 * (size.width * size.height + pixels), 16 * pixels) + ENGINE_RESERVE,
              available,
            );
            let prepared: Blob | undefined = await prepareOcrImage(page.image, size, signal);
            try {
              aborted(signal);
              checkRecognition(pixels * 32 + 2 * prepared.size + ENGINE_RESERVE, available);
              const result = await client.recognize(prepared, signal);
              return {
                text: result.text,
                confidence: result.confidence,
                layer: { textPdf: result.pdf },
              };
            } finally {
              prepared = undefined;
            }
          };
        } else {
          const client = new paddle!.PaddleClient({
            assetBaseUrl: assets,
            onProgress: ({ status, progress }) => {
              if (recognizing && status === 'recognizing')
                notify('recognizing', activePage, progress);
            },
          });
          destroy = () => client.destroy();
          await client.initialize(signal);
          recognize = async (page, available) => {
            checkRecognition(
              paddleWorkingBytes(page.metadata.outputSizePx, page.image.size),
              available,
            );
            const result = await client.recognize(
              { id: page.id, revision: page.revision, image: page.image, workingBytes: available },
              signal,
            );
            const paddleText: PaddlePdfLayer = {
              imageSize: { width: result.width, height: result.height },
              lines: result.lines.map((line) => ({
                text: line.text,
                poly: line.poly.map(([x, y]) => [x, y] as const),
              })),
            };
            validatePaddlePdfLayer(paddleText, page.metadata.outputSizePx);
            return { text: result.text, confidence: result.confidence, layer: { paddleText } };
          };
        }
        aborted(signal);
        notify('loading', 0, 1);
        aborted(signal);
      }
      for (const [index, page] of snapshot.entries()) {
        activePage = index + 1;
        const cached = hits.get(page);
        let recognized: Recognition;
        if (cached) recognized = cached;
        else {
          recognizing = true;
          notify('recognizing', activePage, 0);
          aborted(signal);
          recognized = await recognize!(page, limits.workingBytes - retainedWorkingBytes());
          recognizing = false;
          aborted(signal);
        }
        const nextTextBytes = textBytes + utf8Bytes(recognized.text);
        if (imageBytes + nextTextBytes > limits.resultBytes) throw limitError();
        const nextLayerBytes = layerBytes + textLayerBytes(recognized.layer);
        const entry: CachedRecognition | undefined = reuse
          ? (cached ?? {
              ...recognized,
              id: page.id,
              revision: page.revision,
              image: page.image,
              configuration,
              bytes: cacheBytes(recognized),
            })
          : undefined;
        const nextCacheBytes = freshCacheBytes + (entry && !cached ? entry.bytes : 0);
        if (
          imageBytes + nextLayerBytes + nextTextBytes > limits.resultBytes ||
          retainedBytes +
            previousBytes +
            nextCacheBytes +
            nextLayerBytes +
            nextTextBytes +
            recognitionPeak >
            limits.workingBytes
        )
          throw limitError();
        textBytes = nextTextBytes;
        layerBytes = nextLayerBytes;
        freshCacheBytes = nextCacheBytes;
        // Transfer only an owned copy when the protected original remains reusable in RAM.
        const layer =
          reuse && 'textPdf' in recognized.layer
            ? { textPdf: recognized.layer.textPdf.slice() }
            : recognized.layer;
        layers.push({ ...page, ...layer });
        const publicPage = {
          id: page.id,
          revision: page.revision,
          text: recognized.text,
          confidence: recognized.confidence,
        };
        resultPages.push(publicPage);
        if (entry) pendingCache.push([publicPage, entry]);
        notify('recognizing', activePage, 1);
        aborted(signal);
      }
    } finally {
      recognizing = false;
      destroy?.();
    }
    aborted(signal);
    const paddleLayers = layers.flatMap((page) => ('paddleText' in page ? [page.paddleText] : []));
    const paddleMemory = estimatePaddlePdfMemory(
      paddleLayers,
      paddleLayers.length ? PADDLE_FONT_BYTES : 0,
    );
    const cachedBytes = previousBytes + freshCacheBytes;
    const largestRaster = Math.max(
      ...snapshot.map((page) => {
        const size = page.metadata.outputSizePx;
        return size.width * size.height;
      }),
    );
    if (
      externalBytes +
        cachedBytes +
        (imageBytes + layerBytes) * 4 +
        textBytes * 2 +
        largestRaster * 16 +
        ENGINE_RESERVE +
        paddleMemory >
      limits.workingBytes
    )
      throw limitError();
    notify('assembling', 0, 0);
    aborted(signal);
    const font = paddleLayers.length
      ? await paddleFont(new URL('ocr/paddle/pdf.ttf', assets), signal)
      : undefined;
    aborted(signal);
    const worker = new WorkerClient(pdfAssets);
    let pdf: Blob;
    try {
      const transfers = [
        ...new Set([
          ...layers.flatMap((page) => ('textPdf' in page ? [page.textPdf.buffer] : [])),
          ...(font ? [font.buffer] : []),
        ]),
      ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
      pdf = await worker.run<Blob>(
        {
          pages: layers,
          ...(font ? { paddleFont: font } : {}),
          maxBytes: limits.resultBytes - textBytes - layerBytes,
          workingBytes: limits.workingBytes,
          textBytes,
          externalBytes: externalBytes + cachedBytes,
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
    for (const [page, entry] of pendingCache) reusablePages.set(page, entry);
    return { pdf, pages: resultPages };
  } finally {
    layers.length = 0;
    pendingCache.length = 0;
  }
}
