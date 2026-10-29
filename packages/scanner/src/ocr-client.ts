import { aborted, ScannerError } from './errors.ts';

export interface OcrClientOptions {
  /** The resolved, same-origin OCR asset directory, including its trailing slash. */
  assetBaseUrl: URL;
  languages: readonly ('deu' | 'eng')[];
  onProgress?: (progress: { status: string; progress: number }) => void;
}

export interface OcrResult {
  text: string;
  confidence: number;
  pdf: Uint8Array;
}

type Action = 'load' | 'loadLanguage' | 'initialize' | 'setParameters' | 'recognize';
type PreparedJob = { payload: Record<string, unknown>; transfer?: Transferable[] };
type PendingJob = {
  action: Action;
  jobId: string;
  resolve: (data: unknown) => void;
  reject: (reason: unknown) => void;
  cleanup: () => void;
};

const LOAD_TIMEOUT_MS = 180_000;
const RECOGNIZE_TIMEOUT_MS = 300_000;
const WORKER_ID = 'ktb-scanner-ocr';

function failure(action: Action): ScannerError {
  return action === 'recognize'
    ? new ScannerError('PROCESSING_FAILED', 'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.')
    : new ScannerError(
        'ENGINE_LOAD_FAILED',
        'Scanner-Assets konnten nicht geladen werden. Bitte Assetpfad prüfen und erneut versuchen.',
      );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Private adapter for the pinned Tesseract.js 7 worker protocol. */
export class OcrClient {
  private readonly options: OcrClientOptions;
  private worker: Worker | null = null;
  private pending: PendingJob | null = null;
  private initialized = false;
  private disposed = false;
  private busy = false;
  private sequence = 0;

  constructor(options: OcrClientOptions) {
    this.options = {
      ...options,
      assetBaseUrl: new URL(options.assetBaseUrl.href),
      languages: [...options.languages],
    };
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    this.available(signal);
    if (this.initialized) return;
    this.busy = true;
    try {
      try {
        // A classic worker is required by the upstream importScripts-based loader.
        const worker = new Worker(new URL('worker.min.js', this.options.assetBaseUrl));
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<unknown>) => this.receive(worker, event.data);
        worker.onerror = worker.onmessageerror = () => {
          if (this.worker === worker) this.stop(failure(this.pending?.action ?? 'load'));
        };
      } catch {
        throw failure('load');
      }
      await this.job(
        'load',
        {
          payload: {
            options: {
              lstmOnly: true,
              corePath: new URL('core/', this.options.assetBaseUrl).href,
            },
          },
        },
        signal,
      );
      await this.job(
        'loadLanguage',
        {
          payload: {
            langs: this.options.languages.join('+'),
            options: {
              langPath: new URL('models/', this.options.assetBaseUrl).href,
              gzip: false,
              cacheMethod: 'none',
              lstmOnly: true,
            },
          },
        },
        signal,
      );
      await this.job(
        'initialize',
        { payload: { langs: this.options.languages.join('+'), oem: 1, config: {} } },
        signal,
      );
      await this.job(
        'setParameters',
        { payload: { params: { tessedit_pageseg_mode: '3' } } },
        signal,
      );
      this.active(signal);
      this.initialized = true;
    } catch (error) {
      this.stop(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async recognize(image: Blob, signal?: AbortSignal): Promise<OcrResult> {
    this.available(signal);
    if (!this.initialized) throw failure('load');
    this.busy = true;
    try {
      const data = await this.job(
        'recognize',
        async () => {
          const bytes = new Uint8Array(await image.arrayBuffer());
          return {
            payload: {
              image: bytes,
              options: { pdfTextOnly: true, rotateAuto: false, rotateRadians: 0 },
              output: { text: true, pdf: true },
            },
            transfer: [bytes.buffer],
          };
        },
        signal,
      );
      this.active(signal);
      if (
        !record(data) ||
        typeof data.text !== 'string' ||
        typeof data.confidence !== 'number' ||
        !Number.isFinite(data.confidence) ||
        data.confidence < 0 ||
        data.confidence > 100
      )
        throw failure('recognize');
      // Upstream declares number[] but its MEMFS read returns Uint8Array.
      let pdf: Uint8Array;
      if (data.pdf instanceof Uint8Array) pdf = data.pdf;
      else if (
        Array.isArray(data.pdf) &&
        data.pdf.every(
          (byte: unknown) => Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255,
        )
      )
        pdf = Uint8Array.from(data.pdf);
      else throw failure('recognize');
      if (
        pdf.length < 5 ||
        pdf[0] !== 37 ||
        pdf[1] !== 80 ||
        pdf[2] !== 68 ||
        pdf[3] !== 70 ||
        pdf[4] !== 45
      )
        throw failure('recognize');
      return { text: data.text, confidence: data.confidence, pdf };
    } catch (error) {
      this.stop(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private available(signal?: AbortSignal): void {
    this.active(signal);
    if (this.busy) throw new ScannerError('SCANNER_BUSY', 'Verarbeitung läuft bereits.');
  }

  private active(signal?: AbortSignal): void {
    aborted(signal);
    if (this.disposed) throw new ScannerError('SCANNER_DISPOSED', 'Scanner wurde geschlossen.');
  }

  private job(
    action: Action,
    input: PreparedJob | (() => Promise<PreparedJob>),
    signal?: AbortSignal,
  ): Promise<unknown> {
    this.active(signal);
    const worker = this.worker;
    if (!worker) return Promise.reject(failure(action));
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
        action === 'recognize' ? RECOGNIZE_TIMEOUT_MS : LOAD_TIMEOUT_MS,
      );
      const current: PendingJob = {
        action,
        jobId: `ocr-${++this.sequence}`,
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
          if (this.pending === current) this.pending = null;
        },
      };
      this.pending = current;
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      const send = ({ payload, transfer = [] }: PreparedJob) => {
        if (this.pending !== current || this.worker !== worker) return;
        try {
          worker.postMessage(
            { workerId: WORKER_ID, jobId: current.jobId, action, payload },
            transfer,
          );
        } catch {
          this.stop(failure(action));
        }
      };
      if (typeof input === 'function') {
        void input().then(send, () => {
          if (this.pending === current && this.worker === worker) this.stop(failure(action));
        });
      } else send(input);
    });
  }

  private receive(worker: Worker, message: unknown): void {
    const current = this.pending;
    if (
      this.worker !== worker ||
      !current ||
      !record(message) ||
      message.workerId !== WORKER_ID ||
      message.jobId !== current.jobId ||
      message.action !== current.action
    )
      return;
    if (message.status === 'progress') {
      const progress = message.data;
      if (
        record(progress) &&
        typeof progress.status === 'string' &&
        typeof progress.progress === 'number' &&
        Number.isFinite(progress.progress) &&
        progress.progress >= 0 &&
        progress.progress <= 1
      ) {
        try {
          this.options.onProgress?.({ status: progress.status, progress: progress.progress });
        } catch {
          /* Host callbacks must not affect OCR. */
        }
      }
      return;
    }
    if (message.status === 'reject') {
      this.stop(failure(current.action));
      return;
    }
    if (message.status !== 'resolve') return;
    current.cleanup();
    current.resolve(message.data);
  }

  private stop(reason: unknown): void {
    const pending = this.pending;
    pending?.cleanup();
    const worker = this.worker;
    this.worker = null;
    this.initialized = false;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      try {
        worker.terminate();
      } catch {
        /* Settle the job even if the worker is already unavailable. */
      }
    }
    pending?.reject(reason);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop(new DOMException('Aborted', 'AbortError'));
  }
}
