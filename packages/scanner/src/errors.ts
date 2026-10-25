import { ENGLISH_TEXTS } from './locales/en.ts';

export class ScannerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(ENGLISH_TEXTS[message] ?? message);
    this.name = 'ScannerError';
    this.code = code;
  }
}
export function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}
export function errorMessage(error: unknown): string {
  return error instanceof ScannerError ? error.message : 'Processing failed. Try again.';
}
