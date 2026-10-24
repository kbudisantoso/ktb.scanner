export class ScannerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScannerError';
    this.code = code;
  }
}
export function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
}
export function errorMessage(error: unknown): string {
  return error instanceof ScannerError
    ? error.message
    : 'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.';
}
