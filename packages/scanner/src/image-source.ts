import { aborted, ScannerError } from './errors.ts';
import { imageHeader, type ImageHeader } from './image-header.ts';
import type { Size } from './types.ts';

export interface ImageSourceInfo {
  mime: ImageHeader['mime'];
  encodedSize: Size;
  /** Original dimensions after applying EXIF orientation. */
  size: Size;
  orientation: number;
}

const HEADER_READ_BUDGET = 1024 * 1024;
const MAX_HEADERS = 4096;
const JPEG_SOF = new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

function unsupported(): ScannerError {
  return new ScannerError(
    'FILE_UNSUPPORTED',
    'Nur gültige JPEG-, PNG- und WebP-Bilder werden unterstützt.',
  );
}

function validSize(size: Size): boolean {
  return (
    Number.isSafeInteger(size.width) &&
    Number.isSafeInteger(size.height) &&
    size.width > 0 &&
    size.height > 0 &&
    Number.isSafeInteger(size.width * size.height)
  );
}

/** Abort waiting immediately; a decoder resolving after cancellation still owns its bitmap. */
function cancellable<T>(
  pending: Promise<T>,
  signal?: AbortSignal,
  discard?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    pending.then(
      (value) => {
        if (settled) {
          discard?.(value);
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

/** TIFF IFD0 only: thumbnail orientation and malformed tags must not affect the source. */
async function exifOrientation(
  offset: number,
  length: number,
  read: (offset: number, length: number) => Promise<Uint8Array>,
): Promise<number | undefined> {
  const probe = await read(offset, Math.min(length, 8));
  const start = ascii(probe, 0, 6) === 'Exif\0\0' ? 6 : 0;
  if (!start && !['II', 'MM'].includes(ascii(probe, 0, 2))) return;
  if (length - start < 8) throw unsupported();
  const bytes = start ? await read(offset + start, 8) : probe;
  const order = ascii(bytes, 0, 2);
  if (order !== 'II' && order !== 'MM') throw unsupported();
  const little = order === 'II';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, little) !== 42) throw unsupported();
  const relativeIfd = view.getUint32(4, little);
  const tiffLength = length - start;
  if (relativeIfd < 8 || relativeIfd > tiffLength - 2) throw unsupported();
  const ifd = offset + start + relativeIfd;
  const countBytes = await read(ifd, 2);
  const count = new DataView(countBytes.buffer).getUint16(0, little);
  const tableLength = count * 12;
  if (relativeIfd + 2 + tableLength + 4 > tiffLength) throw unsupported();
  const table = await read(ifd + 2, tableLength);
  const entries = new DataView(table.buffer, table.byteOffset, table.byteLength);
  for (let i = 0; i < count; i++) {
    const entry = i * 12;
    if (
      entries.getUint16(entry, little) === 274 &&
      entries.getUint16(entry + 2, little) === 3 &&
      entries.getUint32(entry + 4, little) === 1
    ) {
      const orientation = entries.getUint16(entry + 8, little);
      if (orientation >= 1 && orientation <= 8) return orientation;
    }
  }
}

/** Read only bounded header/EXIF slices, skipping large compressed image payloads. */
export async function readImageSource(blob: Blob, signal?: AbortSignal): Promise<ImageSourceInfo> {
  aborted(signal);
  if (!Number.isSafeInteger(blob.size) || blob.size < 12) throw unsupported();
  let remainingHeaderBytes = HEADER_READ_BUDGET;
  const read = async (offset: number, length: number): Promise<Uint8Array> => {
    aborted(signal);
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset > blob.size - length ||
      length > remainingHeaderBytes
    )
      throw unsupported();
    remainingHeaderBytes -= length;
    const buffer = await cancellable(blob.slice(offset, offset + length).arrayBuffer(), signal);
    aborted(signal);
    if (buffer.byteLength !== length) throw unsupported();
    return new Uint8Array(buffer);
  };
  let orientation: number | undefined;
  const exif = async (offset: number, length: number) => {
    if (orientation === undefined) orientation = await exifOrientation(offset, length, read);
  };
  const prefix = await read(0, Math.min(blob.size, 32));
  let header: ImageHeader | undefined;
  if (prefix[0] === 255 && prefix[1] === 216) {
    let offset = 2;
    let completed = false;
    for (let count = 0; offset < blob.size && count < MAX_HEADERS; count++) {
      const markerBytes = await read(offset, 2);
      if (markerBytes[0] !== 255) throw unsupported();
      const marker = markerBytes[1];
      if (marker === 255) {
        offset++;
        continue;
      }
      if (marker === 217 || marker === 218) {
        completed = true;
        break;
      }
      if (marker === 1 || (marker >= 208 && marker <= 215)) {
        offset += 2;
        continue;
      }
      const lengthBytes = await read(offset + 2, 2);
      const length = new DataView(lengthBytes.buffer).getUint16(0);
      if (length < 2 || offset > blob.size - length - 2) throw unsupported();
      if (marker === 225) await exif(offset + 4, length - 2);
      if (!header && JPEG_SOF.has(marker)) {
        if (length < 8) throw unsupported();
        // The existing parser needs only these fields, not component tables or payload.
        const fields = await read(offset + 4, 6);
        const bytes = new Uint8Array(12);
        bytes.set([255, 216, 255, marker, 0, 8]);
        bytes.set(fields, 6);
        header = imageHeader(bytes);
      }
      offset += length + 2;
      if (count === MAX_HEADERS - 1) throw unsupported();
    }
    if (!completed) throw unsupported();
  } else if (ascii(prefix, 0, 8) === '\x89PNG\r\n\x1a\n') {
    header = imageHeader(prefix);
    let offset = 8;
    for (let count = 0; offset < blob.size && count < MAX_HEADERS; count++) {
      const chunk = await read(offset, 8);
      const length = new DataView(chunk.buffer).getUint32(0);
      const tag = ascii(chunk, 4, 4);
      if (offset > blob.size - length - 12) throw unsupported();
      if (offset === 8 && (tag !== 'IHDR' || length !== 13)) throw unsupported();
      if (tag === 'eXIf') await exif(offset + 8, length);
      offset += length + 12;
      if (tag === 'IEND') break;
      if (count === MAX_HEADERS - 1) throw unsupported();
    }
  } else if (ascii(prefix, 0, 4) === 'RIFF' && ascii(prefix, 8, 4) === 'WEBP') {
    const end = new DataView(prefix.buffer).getUint32(4, true) + 8;
    if (end < 12 || end > blob.size) throw unsupported();
    let offset = 12;
    for (let count = 0; offset < end && count < MAX_HEADERS; count++) {
      if (offset > end - 8) throw unsupported();
      const chunk = await read(offset, 8);
      const length = new DataView(chunk.buffer).getUint32(4, true);
      const tag = ascii(chunk, 0, 4);
      const next = offset + 8 + length + (length % 2);
      if (next > end) throw unsupported();
      if (tag === 'EXIF') await exif(offset + 8, length);
      if (!header && ['VP8X', 'VP8 ', 'VP8L'].includes(tag)) {
        const needed = tag === 'VP8L' ? 5 : 10;
        if (length < needed) throw unsupported();
        // Reuse the format parser with this image chunk, even after metadata chunks.
        const bytes = new Uint8Array(32);
        bytes.set(prefix.subarray(0, 12));
        bytes.set(chunk, 12);
        bytes.set(await read(offset + 8, needed), 20);
        header = imageHeader(bytes);
      }
      offset = next;
      if (count === MAX_HEADERS - 1) throw unsupported();
    }
  }
  aborted(signal);
  if (!header || !validSize(header)) throw unsupported();
  const encodedSize = { width: header.width, height: header.height };
  const effectiveOrientation = orientation ?? 1;
  const size =
    effectiveOrientation >= 5 ? { width: header.height, height: header.width } : { ...encodedSize };
  return { mime: header.mime, encodedSize, size, orientation: effectiveOrientation };
}

/** Decode directly to the chosen oriented working raster, without an intermediate full bitmap. */
export async function decodeImageSource(
  blob: Blob,
  info: ImageSourceInfo,
  size: Size,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  aborted(signal);
  if (
    !validSize(info.size) ||
    !validSize(size) ||
    size.width > info.size.width ||
    size.height > info.size.height
  )
    throw new ScannerError(
      'LIMIT_EXCEEDED',
      'Das Bild überschreitet das Pixel- oder Arbeitsspeicherlimit.',
    );
  const close = (bitmap: ImageBitmap) => bitmap.close();
  const options: ImageBitmapOptions = { imageOrientation: 'from-image' };
  if (size.width !== info.size.width || size.height !== info.size.height) {
    options.resizeWidth = size.width;
    options.resizeHeight = size.height;
    options.resizeQuality = 'high';
  }
  const bitmap = await cancellable(
    createImageBitmap(new Blob([blob], { type: info.mime }), options),
    signal,
    close,
  );
  try {
    aborted(signal);
    if (bitmap.width !== size.width || bitmap.height !== size.height)
      throw new ScannerError(
        'PROCESSING_FAILED',
        'Verarbeitung fehlgeschlagen. Bitte erneut versuchen.',
      );
    return bitmap;
  } catch (error) {
    close(bitmap);
    throw error;
  }
}
