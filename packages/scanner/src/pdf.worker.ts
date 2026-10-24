import { jsPDF } from 'jspdf';
import type { ScanPage } from './types.ts';
import { fitImage } from './geometry.ts';
const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
worker.onmessage = async ({ data }) => {
  try {
    const pages = data.pages as Pick<ScanPage, 'image' | 'metadata'>[];
    if (!pages.length) throw new Error('empty');
    let pdf: jsPDF | undefined;
    for (const page of pages) {
      const size = page.metadata.outputLayoutMm;
      if (![size.width, size.height].every((n) => Number.isFinite(n) && n >= 10 && n <= 5000))
        throw new Error('dimensions');
      const orientation = size.width > size.height ? 'landscape' : 'portrait';
      if (!pdf)
        pdf = new jsPDF({
          unit: 'mm',
          format: [size.width, size.height],
          orientation,
          compress: true,
        });
      else pdf.addPage([size.width, size.height], orientation);
      // Standard images are already rectified to the paper ratio. Fill the page
      // exactly to absorb the sub-pixel rounding of the raster dimensions.
      const box =
        page.metadata.format.kind === 'standard'
          ? { x: 0, y: 0, width: size.width, height: size.height }
          : fitImage(page.metadata.outputSizePx, size);
      // The exact exported PNG/JPEG bytes are embedded; no intermediate JPEG conversion.
      pdf.addImage(
        new Uint8Array(await page.image.arrayBuffer()),
        page.metadata.outputMimeType === 'image/png' ? 'PNG' : 'JPEG',
        box.x,
        box.y,
        box.width,
        box.height,
        undefined,
        'FAST',
      );
    }
    const result = pdf!.output('blob');
    if (result.size > data.maxBytes) throw new Error('limit');
    worker.postMessage({ id: data.id, result });
  } catch {
    worker.postMessage({
      id: data.id,
      error: {
        code: 'EXPORT_FAILED',
        message:
          'Das vollständige PDF konnte nicht innerhalb der Größenlimits erstellt werden. Bitte Format oder Seitenzahl prüfen.',
      },
    });
  }
};
