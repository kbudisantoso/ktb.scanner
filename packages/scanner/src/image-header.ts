import { ScannerError } from './errors.ts';
import type { Size } from './types.ts';
export interface ImageHeader extends Size {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}
export function imageHeader(bytes: Uint8Array): ImageHeader {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    ascii(1, 7) === 'PNG\r\n\x1a\n' &&
    ascii(12, 4) === 'IHDR'
  )
    return { mime: 'image/png', width: v.getUint32(16), height: v.getUint32(20) };
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = v.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) &&
        length >= 8
      )
        return {
          mime: 'image/jpeg',
          height: v.getUint16(offset + 3),
          width: v.getUint16(offset + 5),
        };
      offset += length;
    }
  }
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const tag = ascii(12, 4),
      u24 = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
    if (tag === 'VP8X') return { mime: 'image/webp', width: u24(24) + 1, height: u24(27) + 1 };
    if (tag === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42)
      return {
        mime: 'image/webp',
        width: v.getUint16(26, true) & 16383,
        height: v.getUint16(28, true) & 16383,
      };
    if (tag === 'VP8L' && bytes[20] === 47) {
      const n = v.getUint32(21, true);
      return { mime: 'image/webp', width: (n & 16383) + 1, height: ((n >>> 14) & 16383) + 1 };
    }
  }
  throw new ScannerError(
    'FILE_UNSUPPORTED',
    'Nur gültige JPEG-, PNG- und WebP-Bilder werden unterstützt.',
  );
}
