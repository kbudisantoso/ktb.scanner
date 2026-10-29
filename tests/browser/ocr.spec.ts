import { build } from 'esbuild';
import { test, expect } from './fixtures';
import type { ScanPage } from '../../packages/scanner/src/types';

let harness: string;
test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {createSearchablePdf} from './packages/scanner/dist/ocr.js';
import {metadataFor} from './packages/scanner/dist/index.js';
import {WorkerClient} from './packages/scanner/src/worker-client.ts';
import * as pdfjs from './apps/demo-next/node_modules/pdfjs-dist/build/pdf.mjs';
import {PDFDocument} from './packages/scanner/node_modules/pdf-lib/es/index.js';
import React from './apps/demo-next/node_modules/react/index.js';
import {createRoot} from './apps/demo-next/node_modules/react-dom/client.js';
import Results from './apps/demo-next/app/Results.tsx';
import {DemoLocaleProvider} from './apps/demo-next/app/i18n.tsx';
pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
window.ocrHarness={createSearchablePdf,metadataFor,WorkerClient,pdfjs,PDFDocument,
 showResults(result,locale){
  const h=window.ocrHarness;
  if(!h.root){const mount=document.createElement('main');mount.className='has-result';document.body.replaceChildren(mount);h.root=createRoot(mount);}
  h.root.render(React.createElement(DemoLocaleProvider,{initialLocale:locale},React.createElement(Results,{result,hidden:false,reset(){},scan(){},back(){}})));
 }};`,
    },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  harness = compiled.outputFiles[0].text;
});

/** Final, already reviewed images; OCR must not reprocess or rotate them again. */
async function confirmedPages(): Promise<void> {
  const h = (window as any).ocrHarness;
  const pages: ScanPage[] = [];
  for (const [index, [width, height]] of [
    [1200, 848],
    [600, 1500],
  ].entries()) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111';
    ctx.font = `${index === 0 ? 64 : 48}px Arial`;
    const lines =
      index === 0
        ? ['ERSTE SEITE', 'Grüße aus Köln', 'Straße 123', 'Betrag 12,34 Euro']
        : ['SECOND PAGE', 'Payment received', 'Receipt 56789', 'Thank you'];
    const left = index === 0 ? 80 : 40;
    const top = index === 0 ? 120 : 100;
    lines.forEach((line, row) => ctx.fillText(line, left, top + row * 100));
    ctx.fillStyle = '#b73331';
    ctx.fillRect(left, height - 100, 100, 32);
    ctx.fillStyle = '#256d93';
    ctx.fillRect(width - left - 80, height - 100, 80, 32);
    const image = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), 'image/png'),
    );
    const revision = index === 0 ? 3 : 7;
    const draft = {
      id: `final-${index + 1}`,
      revision,
      original: image,
      source: 'file',
      size: index === 0 ? { width: height, height: width } : { width, height },
      corners: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      rotation: index === 0 ? 90 : 0,
      format:
        index === 0
          ? { kind: 'standard', preset: 'A4', orientation: 'portrait', origin: 'user' }
          : { kind: 'receipt', widthMm: 80, origin: 'user' },
      recipe: { version: 1, enhancement: 'none', dewarp: 'off' },
      quality: {
        state: 'completed',
        method: 'image-metrics',
        revision,
        assessment: 'no-warning',
        sharpness: 'sharp',
        reasons: [],
        regions: [],
      },
    };
    pages.push({
      id: draft.id,
      revision,
      image,
      metadata: h.metadataFor(draft, 'image/png', { width, height }),
    });
    canvas.width = canvas.height = 1;
  }
  h.pages = pages;
}

test('local OCR preserves final DE/EN images, ordered layouts, searchable Unicode and rendered pixels @worker-only', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).ocrHarness)).toBe(true);
  expect(requests.filter((url) => url.includes('/scanner-assets/ocr/'))).toEqual([]);
  await page.evaluate(confirmedPages);
  const result = await page.evaluate(async () => {
    const h = (window as any).ocrHarness;
    const sha = async (blob: Blob) =>
      Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
      ).join(',');
    const before = await Promise.all(h.pages.map((page: ScanPage) => sha(page.image)));
    const metadata = JSON.stringify(
      h.pages.map(({ id, revision, metadata }: ScanPage) => ({ id, revision, metadata })),
    );
    const storage = async () => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      databases: (await indexedDB.databases()).map((database) => database.name).sort(),
    });
    const beforeStorage = await storage();
    const NativeWorker = window.Worker;
    const events: { type: string; url: string }[] = [];
    window.Worker = class extends NativeWorker {
      readonly recordedUrl: string;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.recordedUrl = new URL(String(url), location.href).href;
        events.push({ type: 'create', url: this.recordedUrl });
      }
      terminate() {
        events.push({ type: 'terminate', url: this.recordedUrl });
        super.terminate();
      }
    };
    try {
      const raster = new h.WorkerClient(new URL('/scanner-assets/pdf.worker.js', location.href));
      let rasterPdf: Blob;
      try {
        rasterPdf = await raster.run({ pages: h.pages, maxBytes: 16 * 1024 ** 2 });
      } finally {
        raster.destroy();
      }
      const progress: { stage: string; page: number; pages: number; progress: number }[] = [];
      const recognized = await h.createSearchablePdf({
        pages: h.pages,
        assetBaseUrl: '/scanner-assets/',
        languages: ['deu', 'eng'],
        onProgress(value: (typeof progress)[number]) {
          progress.push(value);
          throw new Error('Synthetic host progress failure');
        },
      });
      const inspect = async (blob: Blob) => {
        const loading = h.pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const documentPdf = await loading.promise;
        const pages = [];
        try {
          for (let number = 1; number <= documentPdf.numPages; number++) {
            const pdfPage = await documentPdf.getPage(number);
            const natural = pdfPage.getViewport({ scale: 1 });
            const viewport = pdfPage.getViewport({ scale: 500 / natural.width });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await pdfPage.render({ canvas, viewport }).promise;
            const text = await pdfPage.getTextContent();
            const items = text.items.filter((item: any) => typeof item.str === 'string');
            const first = items.find((item: any) => /ERSTE|SECOND/.test(item.str));
            pages.push({
              width: natural.width,
              height: natural.height,
              text: items.map((item: any) => item.str).join(' '),
              position: first
                ? {
                    x: first.transform[4] / natural.width,
                    y: 1 - first.transform[5] / natural.height,
                  }
                : null,
              pixels: canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
            });
            canvas.width = canvas.height = 1;
          }
          return pages;
        } finally {
          await loading.destroy();
        }
      };
      const plain = await inspect(rasterPdf!);
      const searchable = await inspect(recognized.pdf);
      const pdfPages = searchable.map((entry, index) => {
        const other = plain[index];
        if (entry.pixels.length !== other.pixels.length)
          throw new Error('Changed PDF page geometry');
        let difference = 0;
        let changed = 0;
        for (let pixel = 0; pixel < entry.pixels.length; pixel++) {
          const delta = Math.abs(entry.pixels[pixel] - other.pixels[pixel]);
          difference += delta;
          if (delta > 10) changed++;
        }
        return {
          width: entry.width,
          height: entry.height,
          text: entry.text,
          position: entry.position,
          meanDifference: difference / entry.pixels.length,
          changedFraction: changed / entry.pixels.length,
        };
      });
      return {
        pages: recognized.pages,
        pdfType: recognized.pdf.type,
        pdfPages,
        sameImages:
          JSON.stringify(before) ===
          JSON.stringify(await Promise.all(h.pages.map((page: ScanPage) => sha(page.image)))),
        sameMetadata:
          metadata ===
          JSON.stringify(
            h.pages.map(({ id, revision, metadata }: ScanPage) => ({ id, revision, metadata })),
          ),
        layouts: h.pages.map((page: ScanPage) => page.metadata.outputLayoutMm),
        dimensions: h.pages.map((page: ScanPage) => page.metadata.outputSizePx),
        beforeStorage,
        afterStorage: await storage(),
        progress,
        events,
      };
    } finally {
      window.Worker = NativeWorker;
    }
  });
  expect(
    result.pages.map(({ id, revision }: { id: string; revision: number }) => ({ id, revision })),
  ).toEqual([
    { id: 'final-1', revision: 3 },
    { id: 'final-2', revision: 7 },
  ]);
  expect(result.pages[0].text).toContain('Grüße');
  expect(result.pages[0].text).toContain('Köln');
  expect(result.pages[0].text).toContain('Straße');
  expect(result.pages[1].text).toContain('SECOND PAGE');
  expect(result.pdfType).toBe('application/pdf');
  expect(result.pdfPages).toHaveLength(2);
  expect(result.pdfPages[0].text).toContain('Grüße');
  expect(result.pdfPages[0].text).toContain('Straße');
  expect(result.pdfPages[0].text).not.toContain('SECOND');
  expect(result.pdfPages[1].text).toContain('SECOND');
  expect(result.pdfPages[1].text).not.toContain('ERSTE');
  for (const [index, pdf] of result.pdfPages.entries()) {
    expect(pdf.width).toBeCloseTo((result.layouts[index].width * 72) / 25.4, 2);
    expect(pdf.height).toBeCloseTo((result.layouts[index].height * 72) / 25.4, 2);
    expect(pdf.position).not.toBeNull();
    expect(Math.abs(pdf.position!.x - 1 / 15)).toBeLessThan(0.035);
    expect(Math.abs(pdf.position!.y - (index === 0 ? 120 / 848 : 100 / 1500))).toBeLessThan(0.04);
    expect(pdf.meanDifference).toBeLessThan(0.5);
    expect(pdf.changedFraction).toBeLessThan(0.01);
    expect(Number.isFinite(result.pages[index].confidence)).toBe(true);
    expect(result.pages[index].confidence).toBeGreaterThanOrEqual(0);
    expect(result.pages[index].confidence).toBeLessThanOrEqual(100);
  }
  expect(result.dimensions).toEqual([
    { width: 1200, height: 848 },
    { width: 600, height: 1500 },
  ]);
  expect(result.sameImages).toBe(true);
  expect(result.sameMetadata).toBe(true);
  expect(result.afterStorage).toEqual(result.beforeStorage);
  expect(result.progress.some((value) => value.stage === 'assembling')).toBe(true);
  for (const number of [1, 2])
    expect(
      result.progress.some(
        (value) => value.stage === 'recognizing' && value.page === number && value.pages === 2,
      ),
    ).toBe(true);
  const ocrCreated = result.events.filter(
    (event) => event.type === 'create' && event.url.endsWith('/ocr/worker.min.js'),
  );
  expect(ocrCreated).toHaveLength(1);
  const terminated = result.events.findIndex(
    (event) => event.type === 'terminate' && event.url === ocrCreated[0].url,
  );
  const assembled = result.events.findIndex(
    (event) => event.type === 'create' && event.url.endsWith('/ocr-pdf.worker.js'),
  );
  expect(terminated).toBeGreaterThan(-1);
  expect(assembled).toBeGreaterThan(terminated);
  expect(
    result.events.some(
      (event) => event.type === 'terminate' && event.url.endsWith('/ocr-pdf.worker.js'),
    ),
  ).toBe(true);
  const origin = new URL(page.url()).origin;
  expect(
    requests.filter((url) => /^https?:/.test(url)).every((url) => new URL(url).origin === origin),
  ).toBe(true);
  for (const model of ['deu', 'eng'])
    expect(requests.some((url) => url.endsWith(`/ocr/models/${model}.traineddata`))).toBe(true);
  const coreRequests = requests.filter((url) => url.includes('/scanner-assets/ocr/core/'));
  expect(coreRequests).toHaveLength(1);
  expect([
    '/scanner-assets/ocr/core/tesseract-core-lstm.wasm.js',
    '/scanner-assets/ocr/core/tesseract-core-simd-lstm.wasm.js',
    '/scanner-assets/ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  ]).toContain(new URL(coreRequests[0]).pathname);
});

test('result OCR cancels, retries and ignores stale results while preserving downloads and native text selection', async ({
  page,
}, info) => {
  const locale = info.project.name === 'mobile-webkit' ? 'de' : 'en';
  const names =
    locale === 'de'
      ? {
          start: 'Text erkennen',
          cancel: 'Texterkennung abbrechen',
          retry: 'Texterkennung erneut versuchen',
          again: 'Text erneut erkennen',
          languages: 'Texterkennungssprachen',
          pdf: 'PDF herunterladen',
          image: 'Bild herunterladen',
          text: 'Erkannter Text: Seite 1',
        }
      : {
          start: 'Recognize text',
          cancel: 'Cancel text recognition',
          retry: 'Retry text recognition',
          again: 'Recognize text again',
          languages: 'Text languages',
          pdf: 'Download PDF',
          image: 'Download image',
          text: 'Recognized text: page 1',
        };
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).ocrHarness)).toBe(true);
  await page.evaluate(confirmedPages);
  await page.evaluate(async (locale) => {
    const h = (window as any).ocrHarness;
    const raster = new h.WorkerClient(new URL('/scanner-assets/pdf.worker.js', location.href));
    let pdf: Blob;
    try {
      pdf = await raster.run({ pages: h.pages.slice(0, 1), maxBytes: 16 * 1024 ** 2 });
    } finally {
      raster.destroy();
    }
    const overlay = await h.PDFDocument.create();
    overlay.addPage([1200, 848]).drawText('Synthetic OCR layer', { opacity: 0 });
    h.textPdf = await overlay.save();
    h.behavior = 'hold';
    h.held = [];
    h.ocrWorkers = [];
    h.languages = [];
    const NativeWorker = window.Worker;
    h.NativeWorker = NativeWorker;
    window.Worker = class extends NativeWorker {
      readonly controlled: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.controlled = String(url).endsWith('/ocr/worker.min.js');
        if (this.controlled) h.ocrWorkers.push({ worker: this, terminated: false });
      }
      postMessage(message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (!this.controlled) {
          if (Array.isArray(transfer)) super.postMessage(message, transfer);
          else super.postMessage(message, transfer);
          return;
        }
        const listener = this.onmessage;
        if (h.behavior === 'hold') {
          h.held.push({ listener, worker: this, message });
          return;
        }
        if (message.action === 'loadLanguage') h.languages.push(message.payload.langs);
        queueMicrotask(() => {
          const reject = h.behavior === 'reject' && message.action === 'loadLanguage';
          listener?.call(
            this,
            new MessageEvent('message', {
              data: {
                ...message,
                status: reject ? 'reject' : 'resolve',
                data:
                  message.action === 'recognize'
                    ? {
                        text: 'Synthetic Grüße from the current page.',
                        confidence: 93,
                        pdf: h.textPdf.slice(),
                      }
                    : reject
                      ? 'Synthetic missing model'
                      : {},
              },
            }),
          );
        });
      }
      terminate() {
        const owned = h.ocrWorkers.find((entry: any) => entry.worker === this);
        if (owned) owned.terminated = true;
        super.terminate();
      }
    };
    h.result = {
      status: 'confirmed',
      schemaVersion: 1,
      sessionId: 'current',
      pages: h.pages.slice(0, 1),
      pdf: pdf!,
    };
    h.showResults(h.result, locale);
  }, locale);
  const download = page.getByRole('link', { name: names.pdf, exact: true });
  const image = page.getByRole('link', { name: names.image, exact: true });
  await expect(download).toHaveAttribute('href', /^blob:/);
  const originalPdf = await download.getAttribute('href');
  const originalImage = await image.getAttribute('href');
  await expect(page.getByRole('combobox', { name: names.languages })).toHaveValue('deu+eng');
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).ocrHarness.ocrWorkers.length)).toBe(0);
  const pdfTab = page.getByRole('button', { name: 'PDF', exact: true });
  const previewCanvas = page.locator('.pdf-result canvas');
  await pdfTab.click();
  await expect(previewCanvas).toBeVisible();
  expect(
    await previewCanvas.evaluate(
      (canvas: HTMLCanvasElement) => canvas.width > 1 && canvas.height > 1,
    ),
  ).toBe(true);

  await page.getByRole('button', { name: names.start, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).ocrHarness.held.length)).toBe(1);
  await expect(pdfTab).toBeDisabled();
  await expect(previewCanvas).toHaveCount(0);
  await page.getByRole('button', { name: names.cancel, exact: true }).click();
  const retry = page.getByRole('button', { name: names.retry, exact: true });
  await expect(retry).toBeFocused();
  await expect(pdfTab).toBeEnabled();
  await expect(pdfTab).toHaveAttribute('aria-pressed', 'true');
  await expect(previewCanvas).toBeVisible();
  await expect(download).toHaveAttribute('href', originalPdf!);
  await expect(image).toHaveAttribute('href', originalImage!);
  expect(await page.evaluate(() => (window as any).ocrHarness.ocrWorkers[0].terminated)).toBe(true);

  await page.evaluate(() => {
    const h = (window as any).ocrHarness;
    for (const late of h.held)
      late.listener?.call(
        late.worker,
        new MessageEvent('message', { data: { ...late.message, status: 'resolve', data: {} } }),
      );
    h.behavior = 'reject';
  });
  await page.getByRole('combobox', { name: names.languages }).selectOption('eng');
  await retry.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(download).toHaveAttribute('href', originalPdf!);
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    (window as any).ocrHarness.behavior = 'success';
  });
  await page.getByRole('button', { name: names.retry, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeEnabled();
  await expect(download).not.toHaveAttribute('href', originalPdf!);
  const recognizedPdf = await download.getAttribute('href');
  await expect(image).toHaveAttribute('href', originalImage!);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  const text = page.getByRole('textbox', { name: names.text, exact: true });
  await expect(text).toHaveValue('Synthetic Grüße from the current page.');
  await expect(text).toHaveAttribute('readonly', '');
  await text.focus();
  await text.press('ControlOrMeta+A');
  const selection = await text.evaluate((element: HTMLTextAreaElement) => ({
    selection: element.value.slice(element.selectionStart, element.selectionEnd),
    userSelect: getComputedStyle(element).userSelect,
  }));
  expect(selection.selection).toBe('Synthetic Grüße from the current page.');
  expect(selection.userSelect).toBe('text');
  expect(await page.evaluate(() => (window as any).ocrHarness.languages)).toEqual(['eng', 'eng']);

  await page.evaluate(() => {
    (window as any).ocrHarness.behavior = 'hold';
  });
  await page.getByRole('button', { name: names.again, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).ocrHarness.held.length)).toBe(2);
  await page.evaluate((locale) => {
    const h = (window as any).ocrHarness;
    h.result = {
      ...h.result,
      sessionId: 'new-result',
      pages: [{ ...h.result.pages[0], id: 'new-confirmed-page' }],
    };
    h.showResults(h.result, locale);
  }, locale);
  await expect(page.getByRole('button', { name: names.start, exact: true })).toBeVisible();
  await page.evaluate(() => {
    const h = (window as any).ocrHarness;
    for (const late of h.held)
      late.listener?.call(
        late.worker,
        new MessageEvent('message', { data: { ...late.message, status: 'resolve', data: {} } }),
      );
  });
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeDisabled();
  await expect(text).toHaveCount(0);
  await expect(download).not.toHaveAttribute('href', recognizedPdf!);
  expect(
    await download.evaluate(async (link: HTMLAnchorElement) => {
      const actual = new Uint8Array(await (await fetch(link.href)).arrayBuffer());
      const original = new Uint8Array(await (window as any).ocrHarness.result.pdf.arrayBuffer());
      return (
        actual.length === original.length && actual.every((byte, index) => byte === original[index])
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as any).ocrHarness.ocrWorkers.every((entry: any) => entry.terminated),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const h = (window as any).ocrHarness;
    h.root.unmount();
    window.Worker = h.NativeWorker;
  });
});
