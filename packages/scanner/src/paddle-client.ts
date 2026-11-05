import { aborted, ScannerError } from './errors.ts';
import { PADDLE_MAX_DIMENSION, PADDLE_MAX_PIXELS } from './paddle-memory.ts';

export const PADDLE_PIPELINE_ID =
  'paddle0.4.2/ort1.31.1-wasm1/opencv4.10.0-release.1/' +
  'det4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae/' +
  'recb20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a/' +
  'dict3c0a8a79b612653c25f765271714f71281e4e955962c153e272b7b8c1d2b13ff/' +
  'det960max/rec-batch1/layout-v2';

export interface PaddleLine {
  text: string;
  /** Four TL/TR/BR/BL points in the unpadded final image, including its boundary. */
  poly: readonly (readonly [number, number])[];
}

export interface PaddleResult {
  text: string;
  /** Arithmetic mean of recognized line scores, scaled to 0..100; empty pages have0. */
  confidence: number;
  lines: PaddleLine[];
  width: number;
  height: number;
}

export interface PaddlePageInput {
  id: string;
  revision: number;
  image: Blob;
  workingBytes: number;
}

export interface PaddleClientOptions {
  /** Same-origin scanner asset ROOT, including its trailing slash. */
  assetBaseUrl: URL;
  onProgress?: (progress: { status: 'loading' | 'recognizing'; progress: number }) => void;
}

export type PaddleRequest =
  | { requestId: number; action: 'initialize'; assets: string }
  | {
      requestId: number;
      action: 'recognize';
      pageId: string;
      revision: number;
      image: Blob;
      workingBytes: number;
    };

type Action = PaddleRequest['action'];
type Pending = {
  request: PaddleRequest;
  resolve: (data: unknown) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};

const INITIALIZE_TIMEOUT_MS = 180_000;
const RECOGNIZE_TIMEOUT_MS = 300_000;

function failure(action: Action): ScannerError {
  return action === 'initialize'
    ? new ScannerError(
        'ENGINE_LOAD_FAILED',
        'Scanner-Assets konnten nicht geladen werden. Bitte Assetpfad prüfen und erneut versuchen.',
      )
    : new ScannerError('PROCESSING_FAILED', 'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function result(value: unknown): value is PaddleResult {
  if (
    !record(value) ||
    typeof value.text !== 'string' ||
    typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 100 ||
    typeof value.width !== 'number' ||
    typeof value.height !== 'number' ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    value.width < 1 ||
    value.height < 1 ||
    value.width > PADDLE_MAX_DIMENSION ||
    value.height > PADDLE_MAX_DIMENSION ||
    value.width * value.height > PADDLE_MAX_PIXELS ||
    !Array.isArray(value.lines) ||
    value.lines.length > 1000
  )
    return false;
  const { width, height } = value;
  return value.lines.every(
    (line: unknown) =>
      record(line) &&
      typeof line.text === 'string' &&
      Array.isArray(line.poly) &&
      line.poly.length === 4 &&
      line.poly.every(
        (point: unknown) =>
          Array.isArray(point) &&
          point.length === 2 &&
          typeof point[0] === 'number' &&
          typeof point[1] === 'number' &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]) &&
          point[0] >= 0 &&
          point[0] <= width &&
          point[1] >= 0 &&
          point[1] <= height,
      ),
  );
}

/** Private sequential-batch adapter. No worker or other browser resource is created on import. */
export class PaddleClient {
  private readonly options: PaddleClientOptions;
  private worker: Worker | null = null;
  private pending: Pending | null = null;
  private initialized = false;
  private disposed = false;
  private busy = false;
  private sequence = 0;

  constructor(options: PaddleClientOptions) {
    this.options = { ...options, assetBaseUrl: new URL(options.assetBaseUrl.href) };
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    this.available(signal);
    if (this.initialized) return;
    this.busy = true;
    try {
      if (
        !this.options.assetBaseUrl.pathname.endsWith('/') ||
        this.options.assetBaseUrl.origin !== location.origin
      )
        throw new ScannerError(
          'CONFIG_INVALID',
          'Scanner-Assets müssen vom selben Ursprung ausgeliefert werden.',
        );
      try {
        const worker = new Worker(new URL('paddle.worker.js', this.options.assetBaseUrl), {
          type: 'module',
        });
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<unknown>) => this.receive(worker, event.data);
        worker.onerror = worker.onmessageerror = () => {
          if (this.worker === worker)
            this.stop(failure(this.pending?.request.action ?? 'initialize'));
        };
      } catch {
        throw failure('initialize');
      }
      const initialized = await this.job(
        {
          requestId: ++this.sequence,
          action: 'initialize',
          assets: new URL('ocr/paddle/', this.options.assetBaseUrl).href,
        },
        signal,
      );
      this.active(signal);
      if (!record(initialized) || initialized.ready !== true) throw failure('initialize');
      this.initialized = true;
    } catch (error) {
      this.stop(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async recognize(page: PaddlePageInput, signal?: AbortSignal): Promise<PaddleResult> {
    this.available(signal);
    if (!this.initialized) throw failure('initialize');
    if (
      typeof page.id !== 'string' ||
      !page.id ||
      !Number.isSafeInteger(page.revision) ||
      page.revision < 1 ||
      !(page.image instanceof Blob) ||
      !page.image.size ||
      !Number.isSafeInteger(page.workingBytes) ||
      page.workingBytes < 1
    ) {
      const error = new ScannerError(
        'CONFIG_INVALID',
        'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.',
      );
      this.stop(error);
      throw error;
    }
    this.busy = true;
    try {
      const data = await this.job(
        {
          requestId: ++this.sequence,
          action: 'recognize',
          pageId: page.id,
          revision: page.revision,
          image: page.image,
          workingBytes: page.workingBytes,
        },
        signal,
      );
      this.active(signal);
      if (!result(data)) throw failure('recognize');
      return data;
    } catch (error) {
      this.stop(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private active(signal?: AbortSignal): void {
    try {
      aborted(signal);
      if (this.disposed) throw new ScannerError('SCANNER_DISPOSED', 'Scanner wurde geschlossen.');
      if (
        signal !== undefined &&
        (typeof signal.addEventListener !== 'function' ||
          typeof signal.removeEventListener !== 'function')
      )
        throw new ScannerError(
          'CONFIG_INVALID',
          'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.',
        );
    } catch (error) {
      this.stop(error);
      throw error;
    }
  }

  private available(signal?: AbortSignal): void {
    if (this.busy) throw new ScannerError('SCANNER_BUSY', 'Verarbeitung läuft bereits.');
    this.active(signal);
  }

  private job(request: PaddleRequest, signal?: AbortSignal): Promise<unknown> {
    this.active(signal);
    const worker = this.worker;
    if (!worker) return Promise.reject(failure(request.action));
    return new Promise((resolve, reject) => {
      const cancel = () => this.stop(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(
        () =>
          this.stop(
            new ScannerError(
              'PROCESSING_TIMEOUT',
              'Die Verarbeitung dauerte zu lange. Bitte erneut versuchen.',
            ),
          ),
        request.action === 'initialize' ? INITIALIZE_TIMEOUT_MS : RECOGNIZE_TIMEOUT_MS,
      );
      const current: Pending = {
        request,
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          if (this.pending === current) this.pending = null;
          try {
            signal?.removeEventListener('abort', cancel);
          } catch {
            /* Cleanup still owns the worker. */
          }
        },
      };
      this.pending = current;
      try {
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) {
          cancel();
          return;
        }
        if (this.pending !== current || this.worker !== worker || this.disposed) return;
        worker.postMessage(request);
      } catch {
        this.stop(failure(request.action));
      }
    });
  }

  private receive(worker: Worker, message: unknown): void {
    const current = this.pending;
    if (
      this.worker !== worker ||
      !current ||
      !record(message) ||
      message.requestId !== current.request.requestId
    )
      return;
    if (
      message.action !== current.request.action ||
      (current.request.action === 'recognize' &&
        (message.pageId !== current.request.pageId ||
          message.revision !== current.request.revision))
    ) {
      this.stop(failure(current.request.action));
      return;
    }
    if (message.type === 'progress') {
      const expected = current.request.action === 'initialize' ? 'loading' : 'recognizing';
      if (message.status !== expected || (message.progress !== 0 && message.progress !== 1)) {
        this.stop(failure(current.request.action));
        return;
      }
      try {
        this.options.onProgress?.({ status: expected, progress: message.progress });
      } catch {
        /* Host observers do not affect processing. */
      }
      return;
    }
    if (message.type === 'error') {
      const code = ['LIMIT_EXCEEDED', 'FILE_UNSUPPORTED'].includes(String(message.code))
        ? String(message.code)
        : current.request.action === 'initialize'
          ? 'ENGINE_LOAD_FAILED'
          : 'PROCESSING_FAILED';
      this.stop(
        new ScannerError(
          code,
          code === 'LIMIT_EXCEEDED'
            ? 'Das Bild überschreitet das Pixel- oder Arbeitsspeicherlimit.'
            : 'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.',
        ),
      );
      return;
    }
    if (message.type !== 'result') {
      this.stop(failure(current.request.action));
      return;
    }
    current.cleanup();
    current.resolve(message.result);
  }

  private stop(error: unknown): void {
    const pending = this.pending;
    const worker = this.worker;
    this.worker = null;
    this.initialized = false;
    pending?.cleanup();
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      try {
        worker.terminate();
      } catch {
        /* Always settle the pending operation. */
      }
    }
    pending?.reject(error);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop(new DOMException('Aborted', 'AbortError'));
  }
}
