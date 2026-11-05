import { PaddleOCR } from '@paddleocr/paddleocr-js';
import cvModule, { type Mat } from '@techstark/opencv-js';
import { ScannerError } from './errors.ts';
import { imageHeader } from './image-header.ts';
import { orderPaddleLayout } from './paddle-layout.ts';
import {
  PADDLE_DETECTOR_SIDE,
  PADDLE_ENGINE_RESERVE_BYTES,
  PADDLE_MAX_DIMENSION,
  PADDLE_MAX_PIXELS,
  paddleWorkingBytes,
} from './paddle-memory.ts';
import type { PaddleRequest, PaddleResult } from './paddle-client.ts';

const scope = self as unknown as {
  location: { origin: string; href: string };
  fetch: typeof fetch;
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent<PaddleRequest>) => void) | null;
};
type Pipeline = Awaited<ReturnType<typeof PaddleOCR.create>>;
type OpenCv = typeof cvModule;
let pipeline: Pipeline | undefined;
let cv: OpenCv | undefined;
let busy = false;

function envelope(request: PaddleRequest) {
  return {
    requestId: request.requestId,
    action: request.action,
    ...(request.action === 'recognize'
      ? { pageId: request.pageId, revision: request.revision }
      : {}),
  };
}

function progress(request: PaddleRequest, value: 0 | 1): void {
  scope.postMessage({
    ...envelope(request),
    type: 'progress',
    status: request.action === 'initialize' ? 'loading' : 'recognizing',
    progress: value,
  });
}

function limit(): never {
  throw new ScannerError(
    'LIMIT_EXCEEDED',
    'Das Bild überschreitet das Pixel- oder Arbeitsspeicherlimit.',
  );
}

function geometry(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > PADDLE_MAX_DIMENSION ||
    height > PADDLE_MAX_DIMENSION ||
    width * height > PADDLE_MAX_PIXELS
  )
    limit();
}

async function initialize(assetsValue: string): Promise<void> {
  if (pipeline) return;
  const assets = new URL(assetsValue);
  if (assets.origin !== scope.location.origin || !assets.pathname.endsWith('/'))
    throw new ScannerError(
      'CONFIG_INVALID',
      'Scanner-Assets müssen vom selben Ursprung ausgeliefert werden.',
    );
  const paths = new Set([
    new URL('det.tar', assets).href,
    new URL('rec.tar', assets).href,
    new URL('ort-wasm-simd-threaded.mjs', assets).href,
    new URL('ort-wasm-simd-threaded.wasm', assets).href,
  ]);
  const nativeFetch = scope.fetch.bind(scope);
  scope.fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input : input.url,
      scope.location.href,
    );
    if (!paths.has(url.href)) return Promise.reject(new Error('Unexpected OCR asset.'));
    return nativeFetch(input, init);
  };
  pipeline = await PaddleOCR.create({
    worker: false,
    ortOptions: {
      backend: 'wasm',
      wasmPaths: assets.href,
      numThreads: 1,
      simd: true,
      proxy: false,
      disableWasmProxy: true,
    },
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textRecognitionModelName: 'latin_PP-OCRv5_mobile_rec',
    textDetectionModelAsset: { url: new URL('det.tar', assets).href },
    textRecognitionModelAsset: { url: new URL('rec.tar', assets).href },
    textDetectionBatchSize: 1,
    textRecognitionBatchSize: 1,
    textDetLimitSideLen: PADDLE_DETECTOR_SIDE,
    textDetLimitType: 'max',
  });
  const module = cvModule as OpenCv | Promise<OpenCv>;
  cv = module instanceof Promise ? await module : module;
}

async function recognize(
  request: Extract<PaddleRequest, { action: 'recognize' }>,
): Promise<PaddleResult> {
  if (!pipeline || !cv) throw new Error('OCR not initialized.');
  if (
    !(request.image instanceof Blob) ||
    !request.image.size ||
    !['image/jpeg', 'image/png'].includes(request.image.type) ||
    !Number.isSafeInteger(request.workingBytes) ||
    request.workingBytes < 1
  )
    throw new ScannerError(
      'FILE_UNSUPPORTED',
      'Nur gültige JPEG-, PNG- und WebP-Bilder werden unterstützt.',
    );
  // Header bytes are temporary; model/runtime residency remains across every page.
  if (PADDLE_ENGINE_RESERVE_BYTES + request.image.size > request.workingBytes) limit();
  let bytes: Uint8Array | undefined = new Uint8Array(await request.image.arrayBuffer());
  const header = imageHeader(bytes);
  bytes = undefined;
  geometry(header.width, header.height);
  if (paddleWorkingBytes(header, request.image.size) > request.workingBytes) limit();
  let bitmap: ImageBitmap | undefined;
  let canvas: OffscreenCanvas | undefined;
  let pixels: ImageData | undefined;
  let mat: Mat | undefined;
  try {
    bitmap = await createImageBitmap(request.image);
    const width = bitmap.width,
      height = bitmap.height;
    geometry(width, height);
    if (width !== header.width || height !== header.height)
      throw new Error('Unexpected final image orientation.');
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable.');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    bitmap = undefined;
    pixels = context.getImageData(0, 0, width, height);
    canvas.width = canvas.height = 1;
    canvas = undefined;
    mat = cv.matFromArray(height, width, cv.CV_8UC4, pixels.data);
    pixels = undefined;
    const output = await pipeline.predict(mat);
    if (output.length !== 1 || output[0].image.width !== width || output[0].image.height !== height)
      throw new Error('Unexpected OCR image geometry.');
    const items = output[0].items;
    if (
      items.length > 1000 ||
      !items.every(
        (item) =>
          typeof item.text === 'string' &&
          Number.isFinite(item.score) &&
          item.score >= 0 &&
          item.score <= 1 &&
          item.poly.length === 4 &&
          item.poly.every(
            (point) =>
              point.length === 2 &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1]) &&
              point[0] >= 0 &&
              point[0] <= width &&
              point[1] >= 0 &&
              point[1] <= height,
          ),
      )
    )
      throw new Error('Invalid OCR lines.');
    const ordered = orderPaddleLayout(items);
    return {
      text: ordered.text,
      confidence: items.length
        ? (items.reduce((sum, item) => sum + item.score, 0) / items.length) * 100
        : 0,
      lines: ordered.items.map((item) => ({
        text: item.text,
        poly: item.poly.map((point) => [point[0], point[1]] as const),
      })),
      width,
      height,
    };
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 1;
    pixels = undefined;
    mat?.delete();
  }
}

scope.onmessage = (event: MessageEvent<PaddleRequest>) => {
  const request = event.data;
  if (
    !request ||
    !Number.isSafeInteger(request.requestId) ||
    !['initialize', 'recognize'].includes(request.action)
  )
    return;
  if (busy) {
    scope.postMessage({ ...envelope(request), type: 'error', code: 'SCANNER_BUSY' });
    return;
  }
  busy = true;
  void (async () => {
    try {
      progress(request, 0);
      let result: unknown;
      if (request.action === 'initialize') {
        await initialize(request.assets);
        result = { ready: true };
      } else result = await recognize(request);
      progress(request, 1);
      scope.postMessage({ ...envelope(request), type: 'result', result });
    } catch (error) {
      scope.postMessage({
        ...envelope(request),
        type: 'error',
        code:
          error instanceof ScannerError
            ? error.code
            : request.action === 'initialize'
              ? 'ENGINE_LOAD_FAILED'
              : 'PROCESSING_FAILED',
      });
      // The owner hard-terminates on failure. Dispose is best effort for failed startup too.
      try {
        await pipeline?.dispose();
      } catch {
        /* Termination releases the worker realm. */
      }
      pipeline = undefined;
      cv = undefined;
      scope.close();
    } finally {
      busy = false;
    }
  })();
};
