import { PDFDocument, PDFString } from 'pdf-lib';
import type { ScanPage } from './types.ts';
import { fitImage } from './geometry.ts';
import { ScannerError } from './errors.ts';
import { imageHeader } from './image-header.ts';
import { validateMetadata } from './validation.ts';
import { OCR_BORDER_PX, ocrImageSize } from './ocr-image.ts';
import {
  estimatePaddlePdfMemory,
  paddleLineMatrix,
  paddleTextHex,
  paddleToUnicodeCmap,
  paddleUnicodeMap,
  validatePaddlePdfLayer,
} from './paddle-pdf-geometry.ts';
import type { PaddlePdfLayer } from './paddle-pdf-geometry.ts';

type AssemblyPage = Pick<ScanPage, 'id' | 'revision' | 'image' | 'metadata'> &
  ({ textPdf: Uint8Array } | { paddleText: PaddlePdfLayer });
const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
const pt = 72 / 25.4;
const paddleFontSha256 = 'c7845420925a23d88ed830a63957b8af85a66a8daf8d9fc90e843673b2ef1a59';

function embedPaddleFont(pdf: PDFDocument, font: Uint8Array, map: ReadonlyMap<string, number>) {
  const context = pdf.context;
  const file = context.register(context.flateStream(font, { Length1: font.byteLength }));
  const descriptor = context.register(
    context.obj({
      Type: 'FontDescriptor',
      FontName: 'GlyphLessFont',
      Flags: 5,
      FontBBox: [0, 0, 500, 1000],
      ItalicAngle: 0,
      Ascent: 1000,
      Descent: -1,
      CapHeight: 1000,
      StemV: 80,
      FontFile2: file,
    }),
  );
  // The official tiny GlyphLessFont contains glyph1. Every used CID maps to it;
  // /ToUnicode carries the real character, including UTF-16 surrogate pairs.
  const cidToGid = new Uint8Array((map.size + 1) * 2);
  for (let cid = 1; cid <= map.size; cid++) cidToGid[cid * 2 + 1] = 1;
  const descendant = context.register(
    context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'GlyphLessFont',
      CIDSystemInfo: {
        Registry: PDFString.of('Adobe'),
        Ordering: PDFString.of('Identity'),
        Supplement: 0,
      },
      FontDescriptor: descriptor,
      DW: 500,
      CIDToGIDMap: context.register(context.flateStream(cidToGid)),
    }),
  );
  return context.register(
    context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: 'GlyphLessFont',
      Encoding: 'Identity-H',
      DescendantFonts: [descendant],
      ToUnicode: context.register(context.flateStream(paddleToUnicodeCmap(map))),
    }),
  );
}

// PDF numbers cannot use JavaScript's exponential notation.
const pdfNumber = (value: number) => value.toFixed(10).replace(/\.?0+$/, '') || '0';

worker.onmessage = async ({ data }) => {
  try {
    const pages = data.pages as AssemblyPage[];
    if (
      !Array.isArray(pages) ||
      !pages.length ||
      ![data.maxBytes, data.workingBytes].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      ![data.textBytes, data.externalBytes].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    )
      throw new ScannerError('EXPORT_FAILED', 'Invalid searchable PDF request.');
    const paddleLayers: PaddlePdfLayer[] = [];
    for (const page of pages) {
      if (
        !page ||
        !(page.image instanceof Blob) ||
        'textPdf' in page === 'paddleText' in page ||
        ('textPdf' in page && !(page.textPdf instanceof Uint8Array))
      )
        throw new ScannerError('EXPORT_FAILED', 'Invalid OCR layer.');
      validateMetadata(page.metadata, page.revision);
      if ('paddleText' in page) {
        validatePaddlePdfLayer(page.paddleText, page.metadata.outputSizePx);
        paddleLayers.push(page.paddleText);
      }
    }
    const paddleFont = data.paddleFont as Uint8Array | undefined;
    if (
      paddleLayers.length &&
      (!(paddleFont instanceof Uint8Array) ||
        paddleFont.byteLength !== 572 ||
        paddleFont[0] !== 0 ||
        paddleFont[1] !== 1 ||
        paddleFont[2] !== 0 ||
        paddleFont[3] !== 0)
    )
      throw new ScannerError('EXPORT_FAILED', 'Invalid Paddle PDF font.');
    const paddleMemory = paddleLayers.length
      ? estimatePaddlePdfMemory(paddleLayers, paddleFont!.byteLength)
      : 0;
    const encodedBytes = pages.reduce(
      (sum, page) => sum + page.image.size + ('textPdf' in page ? page.textPdf.byteLength : 0),
      0,
    );
    const largestRaster = Math.max(
      ...pages.map((page) => page.metadata.outputSizePx.width * page.metadata.outputSizePx.height),
    );
    // Retained inputs, PDF parsing/serialization and the largest raster decode share this estimate.
    if (
      data.externalBytes +
        encodedBytes * 4 +
        data.textBytes * 2 +
        paddleMemory +
        largestRaster * 16 +
        64 * 1024 ** 2 >
      data.workingBytes
    )
      throw new ScannerError('LIMIT_EXCEEDED', 'Searchable PDF assembly exceeds the memory limit.');
    const fontBytes = paddleLayers.length ? new Uint8Array(paddleFont!) : undefined;
    if (fontBytes) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', fontBytes));
      if (
        Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('') !==
        paddleFontSha256
      )
        throw new ScannerError('EXPORT_FAILED', 'Invalid Paddle PDF font.');
    }
    const pdf = await PDFDocument.create();
    const unicodeMap = paddleUnicodeMap(paddleLayers);
    const fontRef = unicodeMap.size ? embedPaddleFont(pdf, fontBytes!, unicodeMap) : undefined;
    for (const page of pages) {
      validateMetadata(page.metadata, page.revision);
      const size = page.metadata.outputLayoutMm;
      if (
        ![size.width, size.height].every(
          (value) => Number.isFinite(value) && value >= 10 && value <= 5000,
        )
      )
        throw new ScannerError('LAYOUT_INVALID', 'Invalid PDF dimensions.');
      const bytes = new Uint8Array(await page.image.arrayBuffer());
      const header = imageHeader(bytes);
      if (
        header.mime !== page.metadata.outputMimeType ||
        header.width !== page.metadata.outputSizePx.width ||
        header.height !== page.metadata.outputSizePx.height
      )
        throw new ScannerError('METADATA_INVALID', 'Inconsistent PDF image metadata.');
      const image =
        header.mime === 'image/jpeg'
          ? await pdf.embedJpg(bytes)
          : header.mime === 'image/png'
            ? await pdf.embedPng(bytes)
            : null;
      if (!image) throw new ScannerError('FILE_UNSUPPORTED', 'Unsupported PDF image.');
      const target = pdf.addPage([size.width * pt, size.height * pt]);
      const box =
        page.metadata.format.kind === 'standard'
          ? { x: 0, y: 0, ...size }
          : fitImage(page.metadata.outputSizePx, size);
      const placement = {
        x: box.x * pt,
        y: (size.height - box.y - box.height) * pt,
        width: box.width * pt,
        height: box.height * pt,
      };
      target.drawImage(image, placement);
      // Embed now: pdf-lib releases each PNG decoder instead of retaining all page rasters.
      await image.embed();
      if ('paddleText' in page) {
        if (fontRef) {
          const name = target.node.newFontDictionary('ScannerPaddle', fontRef);
          const content = ['q', 'BT', `${name.toString()} 1 Tf`, '3 Tr'];
          for (const line of page.paddleText.lines) {
            const matrix = paddleLineMatrix(line, page.paddleText.imageSize, placement);
            if (!matrix) continue;
            content.push(
              `${matrix.map(pdfNumber).join(' ')} Tm`,
              `<${paddleTextHex(line.text, unicodeMap)}> Tj`,
            );
          }
          content.push('ET', 'Q');
          target.node.addContentStream(
            pdf.context.register(pdf.context.flateStream(content.join('\n'))),
          );
        }
        continue;
      }
      const textSource = await PDFDocument.load(page.textPdf, { updateMetadata: false });
      if (textSource.getPageCount() !== 1)
        throw new ScannerError('EXPORT_FAILED', 'Each OCR layer must contain exactly one page.');
      const sourcePage = textSource.getPage(0);
      const media = sourcePage.getMediaBox();
      if (
        !Object.values(media).every(Number.isFinite) ||
        media.width <= 0 ||
        media.height <= 0 ||
        sourcePage.getRotation().angle % 360 !== 0
      )
        throw new ScannerError('EXPORT_FAILED', 'Invalid OCR page dimensions or rotation.');
      const padded = ocrImageSize(page.metadata.outputSizePx);
      const crop = {
        left: media.x + (media.width * OCR_BORDER_PX) / padded.width,
        bottom: media.y + (media.height * OCR_BORDER_PX) / padded.height,
        right: media.x + (media.width * (padded.width - OCR_BORDER_PX)) / padded.width,
        top: media.y + (media.height * (padded.height - OCR_BORDER_PX)) / padded.height,
      };
      if (
        !Object.values(crop).every(Number.isFinite) ||
        crop.right <= crop.left ||
        crop.top <= crop.bottom
      )
        throw new ScannerError('EXPORT_FAILED', 'Invalid OCR page crop.');
      const text = await pdf.embedPage(sourcePage, crop);
      if (![text.width, text.height].every((value) => Number.isFinite(value) && value > 0))
        throw new ScannerError('EXPORT_FAILED', 'Invalid OCR page dimensions.');
      target.drawPage(text, placement);
    }
    const bytes = await pdf.save();
    if (bytes.byteLength > data.maxBytes)
      throw new ScannerError('LIMIT_EXCEEDED', 'The searchable PDF exceeds the result limit.');
    if (
      data.externalBytes +
        encodedBytes * 2 +
        bytes.byteLength * 3 +
        data.textBytes * 2 +
        paddleMemory +
        64 * 1024 ** 2 >
      data.workingBytes
    )
      throw new ScannerError(
        'LIMIT_EXCEEDED',
        'Searchable PDF serialization exceeds the memory limit.',
      );
    const result = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    worker.postMessage({ id: data.id, result });
  } catch (error) {
    worker.postMessage({
      id: data.id,
      error: {
        code: error instanceof ScannerError ? error.code : 'EXPORT_FAILED',
        message:
          error instanceof ScannerError
            ? error.message
            : 'The complete searchable PDF could not be created.',
      },
    });
  }
};
