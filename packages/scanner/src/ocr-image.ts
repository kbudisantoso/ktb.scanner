import type { Size } from './types.ts';
import { aborted, ScannerError } from './errors.ts';
import { imageHeader } from './image-header.ts';

export const OCR_BORDER_PX = 10;
const PREPARATION_TIMEOUT = 300_000;

export function ocrImageSize(size: Size): Size {
  return { width: size.width + 2 * OCR_BORDER_PX, height: size.height + 2 * OCR_BORDER_PX };
}

/** Recognition-only padding. The confirmed image and output geometry remain untouched. */
export async function prepareOcrImage(
  image: Blob,
  size: Size,
  signal?: AbortSignal,
): Promise<Blob> {
  aborted(signal);
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined')
    return Promise.reject(
      new ScannerError('PROCESSING_FAILED', 'OCR image preparation is unavailable.'),
    );
  const padded = ocrImageSize(size);
  return new Promise((resolve, reject) => {
    let settled = false;
    let bitmap: ImageBitmap | undefined;
    let canvas: OffscreenCanvas | undefined;
    const release = () => {
      bitmap?.close();
      bitmap = undefined;
      if (canvas) canvas.width = canvas.height = 1;
      canvas = undefined;
    };
    const finish = (error?: unknown, result?: Blob) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      release();
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () => finish(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(
      () => finish(new ScannerError('PROCESSING_TIMEOUT', 'OCR image preparation timed out.')),
      PREPARATION_TIMEOUT,
    );
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    const prepare = async () => {
      const decoded = await createImageBitmap(image);
      if (settled || signal?.aborted) {
        decoded.close();
        return;
      }
      bitmap = decoded;
      if (bitmap.width !== size.width || bitmap.height !== size.height)
        throw new ScannerError('PROCESSING_FAILED', 'Unexpected OCR image dimensions.');
      canvas = new OffscreenCanvas(padded.width, padded.height);
      if (settled || signal?.aborted) {
        release();
        cancel();
        return;
      }
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      if (settled || signal?.aborted) {
        release();
        cancel();
        return;
      }
      context.fillStyle = '#fff';
      context.fillRect(0, 0, padded.width, padded.height);
      if (settled || signal?.aborted) {
        release();
        cancel();
        return;
      }
      context.drawImage(bitmap, OCR_BORDER_PX, OCR_BORDER_PX);
      if (settled || signal?.aborted) {
        release();
        cancel();
        return;
      }
      bitmap.close();
      bitmap = undefined;
      if (settled || signal?.aborted) {
        release();
        cancel();
        return;
      }
      const encoded = await canvas.convertToBlob({ type: 'image/png' });
      if (settled || signal?.aborted) return;
      const header = imageHeader(new Uint8Array(await encoded.slice(0, 32).arrayBuffer()));
      if (settled || signal?.aborted) return;
      if (
        encoded.type !== 'image/png' ||
        header.mime !== 'image/png' ||
        header.width !== padded.width ||
        header.height !== padded.height
      )
        throw new Error('encoding');
      finish(undefined, encoded);
    };
    void prepare().catch((error: unknown) =>
      finish(
        error instanceof ScannerError && error.code === 'PROCESSING_FAILED'
          ? error
          : new ScannerError('PROCESSING_FAILED', 'OCR image preparation failed.'),
      ),
    );
  });
}
