import { ScannerError } from './errors.ts';
import type { Size } from './types.ts';

export interface PaddlePdfLine {
  readonly text: string;
  /** TL/TR/BR/BL in unpadded final-image pixels; edge coordinates may equal width/height. */
  readonly poly: readonly (readonly [number, number])[];
}
export interface PaddlePdfLayer {
  readonly lines: readonly PaddlePdfLine[];
  readonly imageSize: Size;
}
export interface PdfImagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const invalid = () => new ScannerError('EXPORT_FAILED', 'Invalid Paddle text layer.');
const maximumCid = 65535;

function characters(text: string): Iterable<string> {
  // A lone surrogate is not a Unicode scalar. Never silently replace recognized text.
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) throw invalid();
  }
  return text;
}

export function validatePaddlePdfLayer(layer: PaddlePdfLayer, expected: Size): void {
  if (
    !layer ||
    !Array.isArray(layer.lines) ||
    !layer.imageSize ||
    ![expected.width, expected.height].every((v) => Number.isSafeInteger(v) && v >= 2) ||
    layer.imageSize.width !== expected.width ||
    layer.imageSize.height !== expected.height
  )
    throw invalid();
  for (const line of layer.lines) {
    if (
      !line ||
      typeof line.text !== 'string' ||
      !Array.isArray(line.poly) ||
      line.poly.length !== 4 ||
      line.poly.some(
        (point: readonly [number, number]) =>
          !Array.isArray(point) ||
          point.length !== 2 ||
          !point.every(Number.isFinite) ||
          point[0] < 0 ||
          point[1] < 0 ||
          point[0] > expected.width ||
          point[1] > expected.height,
      )
    )
      throw invalid();
    for (let i = 0; i < 4; i++) {
      const a = line.poly[i],
        b = line.poly[(i + 1) % 4],
        c = line.poly[(i + 2) % 4];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0) throw invalid();
    }
    characters(line.text);
  }
}

export function paddleUnicodeMap(layers: readonly PaddlePdfLayer[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const layer of layers)
    for (const line of layer.lines)
      for (const char of characters(line.text)) {
        if (map.has(char)) continue;
        if (map.size === maximumCid)
          throw new ScannerError('LIMIT_EXCEEDED', 'Too many distinct OCR characters for one PDF.');
        map.set(char, map.size + 1);
      }
  return map;
}

/** Additional line/font/content buffers, not browser RSS or a memory reservation. No browser imports. */
export function estimatePaddlePdfMemory(
  layers: readonly PaddlePdfLayer[],
  fontBytes: number,
): number {
  if (!Number.isSafeInteger(fontBytes) || fontBytes < 0) throw invalid();
  let textBytes = 0,
    lineCount = 0;
  for (const layer of layers) {
    validatePaddlePdfLayer(layer, layer.imageSize);
    lineCount += layer.lines.length;
    for (const line of layer.lines) textBytes += line.text.length * 2;
  }
  const result =
    textBytes * 8 + lineCount * 1024 + paddleUnicodeMap(layers).size * 256 + fontBytes * 4;
  if (!Number.isSafeInteger(result)) throw invalid();
  return result;
}

/** Every scalar gets one CID, including supplementary characters; no WinAnsi or text repair. */
export function paddleTextHex(text: string, map: ReadonlyMap<string, number>): string {
  let count = 0;
  for (const _ of characters(text)) count++;
  const bytes = new Uint8Array(count * 4);
  const digits = '0123456789abcdef';
  let offset = 0;
  for (const char of characters(text)) {
    const cid = map.get(char);
    if (cid === undefined) throw invalid();
    bytes[offset++] = digits.charCodeAt((cid >> 12) & 15);
    bytes[offset++] = digits.charCodeAt((cid >> 8) & 15);
    bytes[offset++] = digits.charCodeAt((cid >> 4) & 15);
    bytes[offset++] = digits.charCodeAt(cid & 15);
  }
  return new TextDecoder().decode(bytes);
}

export function paddleToUnicodeCmap(map: ReadonlyMap<string, number>): string {
  const entries = [...map];
  const lines = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /ScannerPaddleUnicode def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
  ];
  for (let start = 0; start < entries.length; start += 100) {
    const part = entries.slice(start, start + 100);
    lines.push(`${part.length} beginbfchar`);
    for (const [char, cid] of part) {
      let unicode = '';
      for (let i = 0; i < char.length; i++)
        unicode += char.charCodeAt(i).toString(16).padStart(4, '0');
      lines.push(`<${cid.toString(16).padStart(4, '0')}> <${unicode}>`);
    }
    lines.push('endbfchar');
  }
  lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
  return lines.join('\n');
}

/** Affine fit of a line polygon. Within-line glyph positions are approximate without word boxes. */
export function paddleLineMatrix(
  line: PaddlePdfLine,
  imageSize: Size,
  placement: PdfImagePlacement,
): readonly [number, number, number, number, number, number] | null {
  let count = 0;
  for (const _ of characters(line.text)) count++;
  if (!count) return null;
  const points = line.poly.map(([x, y]) => ({
    x: placement.x + (x / imageSize.width) * placement.width,
    y: placement.y + (1 - y / imageSize.height) * placement.height,
  }));
  const [tl, tr, br, bl] = points;
  const ux = (tr.x - tl.x + br.x - bl.x) / 2,
    uy = (tr.y - tl.y + br.y - bl.y) / 2,
    vx = (tl.x - bl.x + tr.x - br.x) / 2,
    vy = (tl.y - bl.y + tr.y - br.y) / 2;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / 4,
    cy = points.reduce((sum, p) => sum + p.y, 0) / 4;
  // GlyphLessFont has default advance500 and height1000 in PDF font units; Tf is1.
  const matrix = [
    ux / (count * 0.5),
    uy / (count * 0.5),
    vx,
    vy,
    cx - ux / 2 - vx / 2,
    cy - uy / 2 - vy / 2,
  ] as const;
  if (
    !matrix.every(Number.isFinite) ||
    Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 1e-20
  )
    throw invalid();
  return matrix;
}
