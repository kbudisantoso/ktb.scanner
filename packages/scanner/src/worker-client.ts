import { aborted, ScannerError } from './errors.ts';
/** One worker and at most one in-flight job. Cancellation terminates computation. */
export class WorkerClient {
  private worker: Worker | null = null;
  private pending: { reject: (reason: unknown) => void; cleanup: () => void } | null = null;
  private disposed = false;
  private sequence = 0;
  private url: URL;
  constructor(url: URL) {
    this.url = url;
  }
  run<T>(
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
    signal?: AbortSignal,
    timeoutMs = 60_000,
    onDiagnostic?: (event: {
      type: string;
      data: Record<string, unknown>;
      artifacts?: import('./diagnostics.ts').DiagnosticArtifact[];
    }) => void,
  ): Promise<T> {
    aborted(signal);
    if (this.disposed)
      return Promise.reject(new ScannerError('SCANNER_DISPOSED', 'Scanner geschlossen.'));
    if (this.pending)
      return Promise.reject(new ScannerError('SCANNER_BUSY', 'Verarbeitung läuft bereits.'));
    const worker = (this.worker ??= new Worker(this.url, { type: 'module' }));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const cancel = () => this.stop(new DOMException('Abgebrochen', 'AbortError'));
      const timer = setTimeout(
        () =>
          this.stop(
            new ScannerError(
              'PROCESSING_TIMEOUT',
              'Die Verarbeitung dauerte zu lange. Bitte erneut versuchen.',
            ),
          ),
        timeoutMs,
      );
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        worker.onmessage = worker.onerror = null;
        this.pending = null;
      };
      this.pending = { reject, cleanup };
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return;
        if (data.diagnostic) {
          try {
            onDiagnostic?.(data.diagnostic);
          } catch {
            /* Do not affect the worker job. */
          }
          return;
        }
        cleanup();
        if (data.error) reject(new ScannerError(data.error.code, data.error.message));
        else resolve(data.result as T);
      };
      worker.onerror = () =>
        this.stop(
          new ScannerError(
            'ENGINE_LOAD_FAILED',
            'Scanner-Assets konnten nicht geladen werden. Bitte Assetpfad prüfen und erneut versuchen.',
          ),
        );
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        worker.postMessage({ ...message, id }, transfer);
      } catch (error) {
        this.stop(error);
      }
    });
  }
  private stop(reason: unknown): void {
    const current = this.pending;
    current?.cleanup();
    this.worker?.terminate();
    this.worker = null;
    current?.reject(reason);
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop(new DOMException('Abgebrochen', 'AbortError'));
  }
}
export function assetUrl(base: string, file: string): URL {
  const url = new URL(base.endsWith('/') ? base : `${base}/`, document.baseURI);
  if (url.origin !== location.origin)
    throw new ScannerError(
      'CONFIG_INVALID',
      'Scanner-Assets müssen vom selben Ursprung ausgeliefert werden.',
    );
  return new URL(file, url);
}
