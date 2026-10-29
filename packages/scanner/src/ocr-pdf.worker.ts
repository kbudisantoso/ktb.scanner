import { PDFDocument } from 'pdf-lib';
import type { ScanPage } from './types.ts';
import { fitImage } from './geometry.ts';
import { ScannerError } from './errors.ts';
import { imageHeader } from './image-header.ts';
import { validateMetadata } from './validation.ts';

type AssemblyPage = Pick<ScanPage, 'id' | 'revision' | 'image' | 'metadata'> & {
  textPdf: Uint8Array;
};
const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
const pt = 72 / 25.4;
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
    const encodedBytes = pages.reduce(
      (sum, page) => sum + page.image.size + page.textPdf.byteLength,
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
        largestRaster * 16 +
        64 * 1024 ** 2 >
      data.workingBytes
    )
      throw new ScannerError('LIMIT_EXCEEDED', 'Searchable PDF assembly exceeds the memory limit.');
    const pdf = await PDFDocument.create();
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
      const textSource = await PDFDocument.load(page.textPdf, { updateMetadata: false });
      if (textSource.getPageCount() !== 1)
        throw new ScannerError('EXPORT_FAILED', 'Each OCR layer must contain exactly one page.');
      const [text] = await pdf.embedPdf(textSource, [0]);
      if (!(text.width > 0 && text.height > 0))
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
