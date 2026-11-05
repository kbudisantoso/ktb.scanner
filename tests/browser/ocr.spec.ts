import { build } from 'esbuild';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { ScanPage } from '../../packages/scanner/src/types';
import type { OcrEngine } from '../../packages/scanner/src/ocr';
import type { HostOcrOptions } from '../../apps/demo-next/app/OcrControls';

let harness: string;
test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {createSearchablePdf} from './packages/scanner/dist/ocr.js';
import {metadataFor,fitImage} from './packages/scanner/dist/index.js';
import {WorkerClient} from './packages/scanner/src/worker-client.ts';
import * as pdfjs from './apps/demo-next/node_modules/pdfjs-dist/build/pdf.mjs';
import {PDFDocument} from './packages/scanner/node_modules/pdf-lib/es/index.js';
import React from './apps/demo-next/node_modules/react/index.js';
import {createRoot} from './apps/demo-next/node_modules/react-dom/client.js';
import Results from './apps/demo-next/app/Results.tsx';
import {DemoLocaleProvider,useDemoLocale} from './apps/demo-next/app/i18n.tsx';
pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
function HostResults(props){
 const h=window.ocrHarness;
 h.changeLocale=useDemoLocale().setLocale;
 React.useEffect(()=>{h.effectSetups++;return()=>h.effectCleanups++;},[]);
 return React.createElement(Results,props);
}
window.ocrHarness={createSearchablePdf,metadataFor,fitImage,WorkerClient,pdfjs,PDFDocument,
 effectSetups:0,effectCleanups:0,
 showResults(result,locale,options={}){
  const h=window.ocrHarness;
  if(!h.root){const mount=document.createElement('main');mount.className='has-result';document.body.replaceChildren(mount);h.root=createRoot(mount);}
  h.root.render(React.createElement(React.StrictMode,null,React.createElement(DemoLocaleProvider,{initialLocale:locale},React.createElement(HostResults,{result,hidden:false,reset(){},scan(){},back(){},...options}))));
 }};`,
    },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    write: false,
    define: { 'process.env.NODE_ENV': '"development"' },
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
    const mime = index === 0 ? 'image/jpeg' : 'image/png';
    const image = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), mime, 0.96),
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
      metadata: h.metadataFor(draft, mime, { width, height }),
    });
    canvas.width = canvas.height = 1;
  }
  h.pages = pages;
}

type ResultHostArgs = {
  locale: 'en' | 'de';
  ocrOptions?: HostOcrOptions;
  batch?: boolean;
};
async function controlledResultHost({
  locale,
  ocrOptions,
  batch = false,
}: ResultHostArgs): Promise<void> {
  const h = (window as any).ocrHarness;
  const pages = batch ? h.pages : h.pages.slice(0, 1);
  const raster = new h.WorkerClient(new URL('/scanner-assets/pdf.worker.js', location.href));
  let pdf: Blob;
  try {
    pdf = await raster.run({ pages, maxBytes: 16 * 1024 ** 2 });
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
  h.engines = [];
  h.scanCalls = 0;
  h.recognitions = 0;
  const NativeWorker = window.Worker;
  h.NativeWorker = NativeWorker;
  window.Worker = class extends NativeWorker {
    readonly controlled: boolean;
    readonly engine: OcrEngine;
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.engine = String(url).endsWith('/paddle.worker.js') ? 'paddle' : 'tesseract';
      this.controlled =
        String(url).endsWith('/ocr/worker.min.js') || String(url).endsWith('/paddle.worker.js');
      if (this.controlled) {
        h.ocrWorkers.push({ worker: this, engine: this.engine, terminated: false });
        h.engines.push(this.engine);
      }
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
      if (message.action === 'recognize') h.recognitions++;
      queueMicrotask(() => {
        const reject =
          h.behavior === 'reject' &&
          (message.action === 'loadLanguage' || message.action === 'initialize');
        const recognized = {
          text: 'Synthetic Grüße from the current page.',
          confidence: 93,
        };
        const size = h.result.pages.find((page: ScanPage) => page.id === message.pageId)?.metadata
          .outputSizePx ?? { width: 1200, height: 848 };
        listener?.call(
          this,
          new MessageEvent('message', {
            data:
              this.engine === 'paddle'
                ? {
                    requestId: message.requestId,
                    action: message.action,
                    pageId: message.pageId,
                    revision: message.revision,
                    type: reject ? 'error' : 'result',
                    result:
                      message.action === 'recognize'
                        ? {
                            ...recognized,
                            ...size,
                            lines: [
                              {
                                text: recognized.text,
                                poly: [
                                  [40, 60],
                                  [size.width - 40, 60],
                                  [size.width - 40, 120],
                                  [40, 120],
                                ],
                              },
                            ],
                          }
                        : { ready: true },
                    code: reject ? 'ENGINE_LOAD_FAILED' : undefined,
                  }
                : {
                    ...message,
                    status: reject ? 'reject' : 'resolve',
                    data:
                      message.action === 'recognize'
                        ? {
                            ...recognized,
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
    pages,
    pdf: pdf!,
  };
  h.hostOptions = ocrOptions;
  h.hidden = false;
  h.renderHost = () =>
    h.showResults(h.result, locale, {
      hidden: h.hidden,
      ocrOptions: h.hostOptions,
      onOcrLanguageChange: ocrOptions
        ? (language: HostOcrOptions['language']) => {
            h.hostOptions = { ...h.hostOptions, language };
            h.renderHost();
          }
        : undefined,
      onOcrEngineChange: ocrOptions
        ? (engine: OcrEngine) => {
            h.hostOptions = { ...h.hostOptions, engine };
            h.renderHost();
          }
        : undefined,
      scan: () => {
        h.scanCalls++;
        h.scanSawTerminated = h.ocrWorkers.every((entry: any) => entry.terminated);
        h.hidden = true;
        h.renderHost();
      },
    });
  h.renderHost();
}

async function mountControlledHost(page: Page, options: ResultHostArgs) {
  // UI lifecycle uses the real client protocol without starting either native OCR engine.
  await page.route(/\/scanner-assets\/(?:paddle\.worker\.js|ocr\/worker\.min\.js)$/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage = () => {};' }),
  );
  await page.evaluate<void, ResultHostArgs>(controlledResultHost, options);
}

async function realOcrContract(page: Page, engine: OcrEngine) {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).ocrHarness)).toBe(true);
  expect(requests.filter((url) => url.includes('/scanner-assets/ocr/'))).toEqual([]);
  await page.evaluate(confirmedPages);
  const result = await page.evaluate(async (engine: OcrEngine) => {
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
    const textLayers: Uint8Array<ArrayBuffer>[] = [];
    const paddleLayers: {
      width: number;
      height: number;
      lines: { text: string; poly: [number, number][] }[];
    }[] = [];
    const paddleImages: Promise<boolean>[] = [];
    const paddedImages: Promise<{
      width: number;
      height: number;
      sameInterior: boolean;
      whiteBorder: boolean;
    }>[] = [];
    window.Worker = class extends NativeWorker {
      readonly recordedUrl: string;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.recordedUrl = new URL(String(url), location.href).href;
        events.push({ type: 'create', url: this.recordedUrl });
        if (this.recordedUrl.endsWith('/ocr/worker.min.js'))
          this.addEventListener('message', ({ data }) => {
            if (data.action === 'recognize' && data.status === 'resolve')
              textLayers.push(new Uint8Array(data.data.pdf));
          });
        if (this.recordedUrl.endsWith('/paddle.worker.js'))
          this.addEventListener('message', ({ data }) => {
            if (data.action === 'recognize' && data.type === 'result')
              paddleLayers.push(structuredClone(data.result));
          });
      }
      postMessage(message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (message.action === 'initialize')
          events.push({ type: 'initialize', url: this.recordedUrl });
        if (this.recordedUrl.endsWith('/paddle.worker.js') && message.action === 'recognize') {
          const source = h.pages[paddleImages.length];
          paddleImages.push(
            (async () =>
              message.pageId === source.id &&
              message.revision === source.revision &&
              message.image.type === source.image.type &&
              (await sha(message.image)) === (await sha(source.image)))(),
          );
        }
        if (this.recordedUrl.endsWith('/ocr/worker.min.js') && message.action === 'recognize') {
          const encoded = new Blob([new Uint8Array(message.payload.image)], { type: 'image/png' });
          const source = h.pages[paddedImages.length].image;
          paddedImages.push(
            (async () => {
              const original = await createImageBitmap(source);
              let padded: ImageBitmap | undefined;
              const full = document.createElement('canvas');
              const inner = document.createElement('canvas');
              try {
                padded = await createImageBitmap(encoded);
                full.width = padded.width;
                full.height = padded.height;
                const ctx = full.getContext('2d')!;
                ctx.drawImage(padded, 0, 0);
                const all = ctx.getImageData(0, 0, full.width, full.height).data;
                let whiteBorder = true;
                for (let y = 0; y < full.height; y++)
                  for (let x = 0; x < full.width; x++) {
                    if (x >= 10 && x < original.width + 10 && y >= 10 && y < original.height + 10)
                      continue;
                    const offset = (y * full.width + x) * 4;
                    if (
                      all[offset] !== 255 ||
                      all[offset + 1] !== 255 ||
                      all[offset + 2] !== 255 ||
                      all[offset + 3] !== 255
                    )
                      whiteBorder = false;
                  }
                const pixels = ctx.getImageData(10, 10, original.width, original.height).data;
                inner.width = original.width;
                inner.height = original.height;
                inner.getContext('2d')!.drawImage(original, 0, 0);
                const originalPixels = inner
                  .getContext('2d')!
                  .getImageData(0, 0, inner.width, inner.height).data;
                return {
                  width: padded.width,
                  height: padded.height,
                  whiteBorder,
                  sameInterior:
                    pixels.length === originalPixels.length &&
                    pixels.every((value, index) => value === originalPixels[index]),
                };
              } finally {
                original.close();
                padded?.close();
                full.width = full.height = inner.width = inner.height = 1;
              }
            })(),
          );
        }
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
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
        previousPages: [],
        assetBaseUrl: '/scanner-assets/',
        ...(engine === 'paddle' ? { engine } : {}),
        languages: ['deu', 'eng'],
        onProgress(value: (typeof progress)[number]) {
          progress.push(value);
          throw new Error('Synthetic host progress failure');
        },
      });
      const inspect = async (blob: Blob, render = true, exactUnicode = false) => {
        const loading = h.pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const documentPdf = await loading.promise;
        const pages = [];
        try {
          for (let number = 1; number <= documentPdf.numPages; number++) {
            const pdfPage = await documentPdf.getPage(number);
            const natural = pdfPage.getViewport({ scale: 1 });
            const viewport = pdfPage.getViewport({ scale: 500 / natural.width });
            const canvas = document.createElement('canvas');
            if (render) {
              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);
              await pdfPage.render({ canvas, viewport }).promise;
            }
            const text = await pdfPage.getTextContent({ disableNormalization: exactUnicode });
            const items = text.items.filter((item: any) => typeof item.str === 'string');
            const first = items.find((item: any) => /ERSTE|SECOND/.test(item.str));
            pages.push({
              width: natural.width,
              height: natural.height,
              text: items.map((item: any) => item.str).join(' '),
              anchor: first ? { x: first.transform[4], y: first.transform[5] } : null,
              mediaBox: pdfPage.view as number[],
              pixels: render
                ? canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
                : new Uint8ClampedArray(),
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
      const firstPdfHash = await sha(recognized.pdf);
      const beforeCached = events.length;
      const reordered = await h.createSearchablePdf({
        pages: h.pages.slice().reverse(),
        previousPages: recognized.pages,
        assetBaseUrl: '/scanner-assets/',
        ...(engine === 'paddle' ? { engine } : {}),
        languages: ['deu', 'eng'],
      });
      const cachedEvents = events.slice(beforeCached);
      const cached = {
        ids: reordered.pages.map((page: { id: string }) => page.id),
        text: (await inspect(reordered.pdf, false)).map((page) => page.text),
        newPdf: reordered.pdf !== recognized.pdf,
        unchangedFirstPdf: (await sha(recognized.pdf)) === firstPdfHash,
        ocrWorkers: cachedEvents.filter(
          (event) =>
            event.type === 'create' &&
            (event.url.endsWith('/paddle.worker.js') || event.url.endsWith('/ocr/worker.min.js')),
        ).length,
        pdfWorkers: cachedEvents.filter(
          (event) => event.type === 'create' && event.url.endsWith('/ocr-pdf.worker.js'),
        ).length,
      };
      let glyphless: { error: string; text: string[] } | undefined;
      if (engine === 'paddle') {
        // This is an assembly contract, independent of whether an OCR model recognizes emoji.
        const known = ['Grüße € — e\u0301 😀', 'SECOND assembly page'];
        const font = new Uint8Array(
          await (await fetch('/scanner-assets/ocr/paddle/pdf.ttf')).arrayBuffer(),
        );
        const assembly = new h.WorkerClient(
          new URL('/scanner-assets/ocr-pdf.worker.js', location.href),
        );
        const request = {
          pages: h.pages.map((page: ScanPage, index: number) => ({
            id: page.id,
            revision: page.revision,
            image: page.image,
            metadata: page.metadata,
            paddleText: {
              imageSize: page.metadata.outputSizePx,
              lines: [
                {
                  text: known[index],
                  poly: [
                    [40, 60],
                    [page.metadata.outputSizePx.width - 40, 60],
                    [page.metadata.outputSizePx.width - 40, 140],
                    [40, 140],
                  ],
                },
              ],
            },
          })),
          maxBytes: 16 * 1024 ** 2,
          workingBytes: 384 * 1024 ** 2,
          textBytes: known.reduce((sum, text) => sum + new TextEncoder().encode(text).length, 0),
          externalBytes: 0,
        };
        try {
          const corrupt = font.slice();
          corrupt[100] ^= 1;
          let code = '';
          try {
            await assembly.run({ ...request, paddleFont: corrupt });
          } catch (error) {
            code = (error as { code?: string }).code ?? '';
          }
          const valid = await assembly.run({ ...request, paddleFont: font });
          glyphless = {
            error: code,
            text: (await inspect(valid, false, true)).map((page) => page.text),
          };
        } finally {
          assembly.destroy();
        }
      }
      const rawLayers: typeof searchable = [];
      for (const layer of textLayers)
        rawLayers.push((await inspect(new Blob([layer], { type: 'application/pdf' }), false))[0]);
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
        const metadata = h.pages[index].metadata;
        const source = metadata.outputSizePx;
        const box =
          metadata.format.kind === 'standard'
            ? { x: 0, y: 0, ...metadata.outputLayoutMm }
            : h.fitImage(source, metadata.outputLayoutMm);
        const pt = 72 / 25.4;
        let expected: { x: number; y: number };
        if (!entry.anchor) throw new Error('Missing positioned OCR text');
        if (engine === 'paddle') {
          const layer = paddleLayers[index];
          if (layer.width !== source.width || layer.height !== source.height)
            throw new Error('Paddle coordinates changed final-image dimensions');
          const first = layer.lines.find((line) => /ERSTE|SECOND/.test(line.text));
          if (!first) throw new Error('Missing recognized Paddle line');
          const points = first.poly.map(([x, y]) => ({
            x: box.x * pt + (x / source.width) * box.width * pt,
            y: (metadata.outputLayoutMm.height - box.y - (y / source.height) * box.height) * pt,
          }));
          const [tl, tr, br, bl] = points;
          const u = { x: (tr.x - tl.x + br.x - bl.x) / 2, y: (tr.y - tl.y + br.y - bl.y) / 2 };
          const v = { x: (tl.x - bl.x + tr.x - br.x) / 2, y: (tl.y - bl.y + tr.y - br.y) / 2 };
          expected = {
            x: points.reduce((sum, p) => sum + p.x, 0) / 4 - u.x / 2 - v.x / 2,
            y: points.reduce((sum, p) => sum + p.y, 0) / 4 - u.y / 2 - v.y / 2,
          };
        } else {
          const raw = rawLayers[index];
          if (!raw?.anchor) throw new Error('Missing positioned Tesseract text');
          const [left, bottom, right, top] = raw.mediaBox;
          const cropLeft = left + ((right - left) * 10) / (source.width + 20);
          const cropBottom = bottom + ((top - bottom) * 10) / (source.height + 20);
          const cropWidth = ((right - left) * source.width) / (source.width + 20);
          const cropHeight = ((top - bottom) * source.height) / (source.height + 20);
          expected = {
            x: box.x * pt + ((raw.anchor.x - cropLeft) * box.width * pt) / cropWidth,
            y:
              (metadata.outputLayoutMm.height - box.y - box.height) * pt +
              ((raw.anchor.y - cropBottom) * box.height * pt) / cropHeight,
          };
        }
        return {
          width: entry.width,
          height: entry.height,
          text: entry.text,
          positionErrorPt: {
            x: Math.abs(entry.anchor.x - expected.x),
            y: Math.abs(entry.anchor.y - expected.y),
          },
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
        paddedImages: await Promise.all(paddedImages),
        paddleImages: await Promise.all(paddleImages),
        glyphless,
        cached,
      };
    } finally {
      window.Worker = NativeWorker;
    }
  }, engine);
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
  expect(result.cached.ids).toEqual(['final-2', 'final-1']);
  expect(result.cached.text).toHaveLength(2);
  expect(result.cached.text[0]).toContain('SECOND');
  expect(result.cached.text[0]).not.toContain('ERSTE');
  expect(result.cached.text[1]).toContain('ERSTE');
  expect(result.cached.text[1]).not.toContain('SECOND');
  expect(result.cached.newPdf).toBe(true);
  expect(result.cached.unchangedFirstPdf).toBe(true);
  expect(result.cached.ocrWorkers).toBe(0);
  expect(result.cached.pdfWorkers).toBe(1);
  for (const [index, pdf] of result.pdfPages.entries()) {
    expect(pdf.width).toBeCloseTo((result.layouts[index].width * 72) / 25.4, 2);
    expect(pdf.height).toBeCloseTo((result.layouts[index].height * 72) / 25.4, 2);
    expect(pdf.positionErrorPt.x).toBeLessThan(0.02);
    expect(pdf.positionErrorPt.y).toBeLessThan(0.02);
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
  expect(result.paddedImages).toEqual(
    engine === 'tesseract'
      ? [
          { width: 1220, height: 868, whiteBorder: true, sameInterior: true },
          { width: 620, height: 1520, whiteBorder: true, sameInterior: true },
        ]
      : [],
  );
  expect(result.paddleImages).toEqual(engine === 'paddle' ? [true, true] : []);
  if (engine === 'paddle') {
    expect(result.glyphless?.error).toBe('EXPORT_FAILED');
    expect(result.glyphless?.text).toEqual(['Grüße € — e\u0301 😀', 'SECOND assembly page']);
  }
  expect(result.afterStorage).toEqual(result.beforeStorage);
  expect(result.progress.some((value) => value.stage === 'assembling')).toBe(true);
  for (const number of [1, 2])
    expect(
      result.progress.some(
        (value) => value.stage === 'recognizing' && value.page === number && value.pages === 2,
      ),
    ).toBe(true);
  const workerPath = engine === 'paddle' ? '/paddle.worker.js' : '/ocr/worker.min.js';
  const ocrCreated = result.events.filter(
    (event) => event.type === 'create' && event.url.endsWith(workerPath),
  );
  expect(ocrCreated).toHaveLength(1);
  expect(
    result.events.filter((event) => event.type === 'initialize' && event.url.endsWith(workerPath)),
  ).toHaveLength(1);
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
  const coreRequests = requests.filter((url) => url.includes('/scanner-assets/ocr/core/'));
  if (engine === 'tesseract') {
    for (const model of ['deu', 'eng'])
      expect(requests.some((url) => url.endsWith(`/ocr/models/${model}.traineddata`))).toBe(true);
    expect(coreRequests).toHaveLength(1);
    expect([
      '/scanner-assets/ocr/core/tesseract-core-lstm.wasm.js',
      '/scanner-assets/ocr/core/tesseract-core-simd-lstm.wasm.js',
      '/scanner-assets/ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js',
    ]).toContain(new URL(coreRequests[0]).pathname);
    expect(requests.some((url) => url.includes('/ocr/paddle/'))).toBe(false);
  } else {
    expect(coreRequests).toEqual([]);
    for (const asset of [
      'det.tar',
      'rec.tar',
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
      'pdf.ttf',
    ])
      expect(
        requests.some((url) => url.endsWith(`/ocr/paddle/${asset}`)),
        asset,
      ).toBe(true);
    expect(requests.some((url) => url.includes('/ocr/models/'))).toBe(false);
  }
}

test('local Tesseract OCR preserves final DE/EN JPEG/PNG, searchable Unicode, positions and pixels @worker-only', async ({
  page,
}) => {
  await realOcrContract(page, 'tesseract');
});

test('local Paddle OCR preserves final DE/EN JPEG/PNG, searchable Unicode, positions and pixels @worker-only', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'firefox',
    'Representative Paddle engine smoke runs in Chromium and WebKit.',
  );
  await realOcrContract(page, 'paddle');
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
          engine: 'Texterkennungs-Engine',
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
          engine: 'Text recognition engine',
          languages: 'Text languages',
          pdf: 'Download PDF',
          image: 'Download image',
          text: 'Recognized text: page 1',
        };
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).ocrHarness)).toBe(true);
  await page.evaluate(confirmedPages);
  await mountControlledHost(page, { locale });
  const download = page.getByRole('link', { name: names.pdf, exact: true });
  const image = page.getByRole('link', { name: names.image, exact: true });
  await expect(download).toHaveAttribute('href', /^blob:/);
  const originalPdf = await download.getAttribute('href');
  const originalImage = await image.getAttribute('href');
  await expect(page.getByRole('combobox', { name: names.engine })).toHaveValue('paddle');
  await page.getByRole('combobox', { name: names.engine }).selectOption('tesseract');
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
  await page.getByRole('combobox', { name: names.languages }).selectOption('deu');
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

test('manual OCR snapshots engine and languages across StrictMode, cancellation and a new scan', async ({
  page,
}) => {
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  const optionEngine = page.getByRole('combobox', { name: 'Text recognition engine', exact: true });
  await expect(optionEngine).toHaveValue('paddle');
  await expect(page.getByText('Latin model (including DE + EN)', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Text languages', exact: true })).toHaveCount(0);
  await optionEngine.selectOption('tesseract');
  await page.getByRole('combobox', { name: 'Text languages', exact: true }).selectOption('eng');
  await page.getByRole('button', { name: 'Close options', exact: true }).click();
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).ocrHarness)).toBe(true);
  await page.evaluate(confirmedPages);
  await mountControlledHost(page, {
    locale: 'en',
    batch: true,
    ocrOptions: { engine: 'tesseract', language: 'eng' },
  });
  const ocrCount = () => page.evaluate(() => (window as any).ocrHarness.ocrWorkers.length);
  const settled = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  await expect(page.getByRole('button', { name: 'Recognize text', exact: true })).toBeVisible();
  await settled();
  expect(await ocrCount()).toBe(0);
  expect(
    await page.evaluate(() => ({
      setups: (window as any).ocrHarness.effectSetups,
      cleanups: (window as any).ocrHarness.effectCleanups,
    })),
  ).toEqual({ setups: 2, cleanups: 1 });
  const image = page.getByRole('link', { name: 'Download image', exact: true });
  const imageUrl = await image.getAttribute('href');
  await page.getByRole('button', { name: 'Recognize text', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).ocrHarness.held.length)).toBe(1);
  await expect(
    page.getByRole('combobox', { name: 'Text recognition engine', exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    const h = (window as any).ocrHarness;
    h.hostOptions = { engine: 'paddle', language: 'deu' };
    h.renderHost();
    h.changeLocale('de');
  });
  await expect(
    page.getByRole('button', { name: 'Texterkennung abbrechen', exact: true }),
  ).toBeVisible();
  await settled();
  expect(await ocrCount()).toBe(1);
  expect(await page.evaluate(() => (window as any).ocrHarness.ocrWorkers[0].terminated)).toBe(
    false,
  );
  await page.evaluate(() => {
    const h = (window as any).ocrHarness;
    h.changeLocale('en');
    h.behavior = 'success';
    const held = h.held[0];
    held.listener.call(
      held.worker,
      new MessageEvent('message', {
        data: { ...held.message, status: 'resolve', data: {} },
      }),
    );
  });
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).ocrHarness.recognitions)).toBe(2);
  expect(await page.evaluate(() => (window as any).ocrHarness.languages)).toEqual(['eng']);
  expect(await page.evaluate(() => (window as any).ocrHarness.engines)).toEqual(['tesseract']);
  await expect(image).toHaveAttribute('href', imageUrl!);

  // A different engine is a real cache miss; opening a new job still requires a click.
  await expect(
    page.getByRole('combobox', { name: 'Text recognition engine', exact: true }),
  ).toHaveValue('paddle');
  await settled();
  expect(await ocrCount()).toBe(1);
  await page.evaluate(() => {
    (window as any).ocrHarness.behavior = 'hold';
  });
  await page.getByRole('button', { name: 'Recognize text again', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).ocrHarness.held.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).ocrHarness.engines)).toEqual([
    'tesseract',
    'paddle',
  ]);
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  expect(
    await page.evaluate(() => ({
      scans: (window as any).ocrHarness.scanCalls,
      terminatedBeforeScan: (window as any).ocrHarness.scanSawTerminated,
    })),
  ).toEqual({ scans: 1, terminatedBeforeScan: true });
  await page.evaluate(() => {
    const h = (window as any).ocrHarness;
    for (const late of h.held)
      late.listener?.call(
        late.worker,
        new MessageEvent('message', {
          data: { ...late.message, status: 'resolve', type: 'result', data: {}, result: {} },
        }),
      );
    h.result = {
      ...h.result,
      sessionId: 'new-manual-batch',
      pages: h.result.pages.map((page: ScanPage, index: number) => ({
        ...page,
        id: `new-${index}`,
      })),
    };
    h.hidden = false;
    h.renderHost();
  });
  await expect(page.getByRole('button', { name: 'Recognize text', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeDisabled();
  await settled();
  expect(await ocrCount()).toBe(2);
  await page.getByRole('button', { name: 'Recognize text', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).ocrHarness.held.length)).toBe(3);
  await page.getByRole('button', { name: 'Cancel text recognition', exact: true }).click();
  for (const hidden of [true, false]) {
    await page.evaluate((hidden) => {
      const h = (window as any).ocrHarness;
      h.hidden = hidden;
      h.renderHost();
    }, hidden);
    await settled();
  }
  await expect(
    page.getByRole('button', { name: 'Retry text recognition', exact: true }),
  ).toBeVisible();
  expect(await ocrCount()).toBe(3);
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
