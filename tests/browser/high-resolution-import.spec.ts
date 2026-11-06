import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { jpegWithOrientation } from '../fixtures/exif';
import { chooseFormat, closeTool, previewHash, waitForPreview } from './helpers';
import { test, expect } from './fixtures';

let harness: string;
let jpeg: Uint8Array;
test.beforeAll(async () => {
  jpeg = await readFile('tests/fixtures/high-resolution-48mp.jpg');
  const bundle = await build({
    stdin: {
      contents: `import {createScanner} from './packages/scanner/dist/react/index.js';
        import {createScanicAdapter} from './packages/scanner/dist/scanic.js';
        import {resolveLimits} from './packages/scanner/dist/index.js';
        window.highResolution = {createScanner, createScanicAdapter, resolveLimits};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
  });
  harness = bundle.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/processing.worker.js', async (route) => {
    const response = await route.fetch();
    // Forward the real decoder and processing engine; observe only the native bitmap boundary.
    await route.fulfill({
      response,
      body: `{
        const decode = self.createImageBitmap.bind(self);
        self.createImageBitmap = async (...args) => {
          const bitmap = await decode(...args);
          self.postMessage({highResolutionDecode: {
            width: bitmap.width, height: bitmap.height, options: args.at(-1)
          }});
          return bitmap;
        };
      }\n${await response.text()}`,
    });
  });
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).highResolution)).toBe(true);
  await page.evaluate(() => {
    const h = (window as any).highResolution;
    h.workerDecodes = [];
    h.editorDecodes = [];
    h.requests = [];
    h.workers = new Set<Worker>();
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        h.workers.add(this);
        this.addEventListener('message', ({ data }) => {
          if (data.highResolutionDecode) h.workerDecodes.push(data.highResolutionDecode);
          if (data.result?.corners)
            h.lastResult = { corners: data.result.corners, size: data.result.size };
        });
      }
      postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message.kind === 'process')
          h.requests.push(structuredClone({ corners: message.request.corners }));
        Reflect.apply(NativeWorker.prototype.postMessage, this, [message, options ?? []]);
      }
      terminate() {
        h.workers.delete(this);
        super.terminate();
      }
    };
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
      const bitmap: ImageBitmap = await Reflect.apply(decode, window, args);
      h.editorDecodes.push({ width: bitmap.width, height: bitmap.height, options: args.at(-1) });
      if (!h.holdEditor) return bitmap;
      h.holdEditor = false;
      return new Promise<ImageBitmap>((resolve) => {
        const held = (h.held = { closed: 0, release: () => resolve(bitmap) });
        const close = bitmap.close.bind(bitmap);
        bitmap.close = () => {
          held.closed++;
          close();
        };
      });
    }) as typeof createImageBitmap;
    h.digest = async (blob: Blob) =>
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    h.open = (inputPixels?: number) => {
      h.mount = document.createElement('div');
      document.body.append(h.mount);
      h.abort = new AbortController();
      h.controller = h.createScanner({
        mount: h.mount,
        assetBaseUrl: '/scanner-assets/',
        locale: 'de',
        defaultProfile: 'photo',
        createPdf: false,
        includeOriginals: true,
        shutterSound: 'off',
        limits: inputPixels === undefined ? undefined : { inputPixels },
      });
      h.result = h.controller.open({ initialFiles: [h.file], signal: h.abort.signal });
    };
    h.close = async () => {
      h.abort.abort();
      const result = await h.result;
      await h.controller.destroy();
      h.mount.remove();
      return result;
    };
  });
});

test('high-resolution import retains source geometry with a bounded cancellable corner editor', async ({
  page,
}) => {
  const bytes = jpegWithOrientation(jpeg, 6);
  const originalHash = createHash('sha256').update(bytes).digest('hex');
  await page.evaluate((bytes) => {
    const h = (window as any).highResolution;
    h.file = new File([new Uint8Array(bytes)], 'synthetic-48mp-exif6.jpg', { type: 'image/jpeg' });
    h.open(24_000_000);
  }, Array.from(bytes));
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Pixel- oder Arbeitsspeicherlimit',
  );
  expect(await page.evaluate(() => (window as any).highResolution.workerDecodes)).toEqual([]);
  expect(await page.evaluate(() => (window as any).highResolution.close())).toEqual({
    status: 'cancelled',
  });
  await page.evaluate(() => (window as any).highResolution.open());
  const apply = page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true });
  const preview = page.getByRole('img', { name: 'Bearbeitete Seite', exact: true });
  await expect(preview.or(apply)).toBeVisible();
  if (await apply.isVisible()) {
    await expect(apply).toBeEnabled();
    await apply.click();
  }
  await waitForPreview(page);
  const source = await page.evaluate(() => (window as any).highResolution.lastResult.size);
  expect(source).toEqual({ width: 6000, height: 8000 });
  const decode = await page.evaluate(() => (window as any).highResolution.workerDecodes[0]);
  expect(decode.options).toMatchObject({ imageOrientation: 'from-image', resizeQuality: 'high' });
  expect(decode.width).toBe(decode.options.resizeWidth);
  expect(decode.height).toBe(decode.options.resizeHeight);
  expect(decode.width * decode.height).toBeLessThan(48_000_000);
  expect(decode.width / decode.height).toBeCloseTo(0.75, 3);

  // Match the source ratio so A4 rectification cannot reduce the 8 MP output geometrically.
  const beforeFormat = await preview.getAttribute('src');
  await chooseFormat(page, 'original-ratio');
  await closeTool(page);
  await waitForPreview(page, beforeFormat);
  const previousSrc = await preview.getAttribute('src');
  await page.getByRole('button', { name: 'Ecken korrigieren', exact: true }).click();
  await expect(apply).toBeEnabled();
  const editor = await page.evaluate(() => {
    const h = (window as any).highResolution;
    return {
      decoded: h.editorDecodes.at(-1),
      corners: h.lastResult.corners,
      canvases: Array.from(
        document.querySelectorAll<HTMLCanvasElement>('.scanner-corner-host canvas'),
      ).map(({ width, height }) => ({ width, height })),
    };
  });
  expect(editor.decoded).toMatchObject({ width: 1536, height: 2048 });
  expect(editor.decoded.options).toMatchObject({
    imageOrientation: 'from-image',
    resizeWidth: 1536,
    resizeHeight: 2048,
    resizeQuality: 'high',
  });
  expect(editor.canvases.length).toBeGreaterThan(0);
  expect(editor.decoded.width * editor.decoded.height).toBeLessThanOrEqual(4_000_000);
  await page.locator('.scanner-corner-host [data-corner="topLeft"]').press('ArrowRight');
  await apply.click();
  await waitForPreview(page, previousSrc);
  const edited = await page.evaluate(
    () =>
      (window as any).highResolution.requests.filter((request: any) => request.corners).at(-1)
        .corners,
  );
  expect(edited[0].x - editor.corners[0].x).toBeCloseTo(1 / 1535, 6);
  expect(edited[0].y).toBeCloseTo(editor.corners[0].y, 6);
  for (let i = 1; i < 4; i++) {
    expect(edited[i].x).toBeCloseTo(editor.corners[i].x, 6);
    expect(edited[i].y).toBeCloseTo(editor.corners[i].y, 6);
  }

  const appliedHash = await previewHash(page);
  await page.evaluate(() => ((window as any).highResolution.holdEditor = true));
  await page.getByRole('button', { name: 'Ecken korrigieren', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!(window as any).highResolution.held)).toBe(true);
  await page
    .locator('.scanner-corners')
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await expect(page.locator('.scanner-corners')).toHaveCount(0);
  await page.evaluate(() => (window as any).highResolution.held.release());
  await expect.poll(() => page.evaluate(() => (window as any).highResolution.held.closed)).toBe(1);
  await expect(page.locator('.scanner-corner-host canvas')).toHaveCount(0);
  expect(await previewHash(page)).toBe(appliedHash);

  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  const result = await page.evaluate(async () => {
    const h = (window as any).highResolution;
    const result = await h.result;
    if (result.status !== 'confirmed') throw new Error('Expected confirmed high-resolution page');
    const page = result.pages[0];
    const bitmap = await createImageBitmap(page.image);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    const original = await h.digest(page.original);
    await h.controller.destroy();
    h.mount.remove();
    return {
      count: result.pages.length,
      metadata: page.metadata,
      original,
      size,
      workers: h.workers.size,
    };
  });
  expect(result.count).toBe(1);
  expect(result.original).toBe(originalHash);
  expect(result.metadata.normalizedSourceSizePx).toEqual({ width: 6000, height: 8000 });
  expect(result.metadata.corners).toEqual(edited);
  expect(result.metadata.outputSizePx).toEqual(result.size);
  expect(result.size.width * result.size.height).toBeGreaterThanOrEqual(7_900_000);
  expect(result.size.width * result.size.height).toBeLessThanOrEqual(8_000_000);
  expect(Math.max(result.size.width, result.size.height)).toBeLessThanOrEqual(4096);
  expect(result.workers).toBe(0);
});

test(
  '48 MP EXIF 6 and 8 preserve orientation and near-full output in the real worker',
  {
    tag: '@worker-only',
  },
  async ({ page }) => {
    for (const orientation of [6, 8]) {
      const bytes = jpegWithOrientation(jpeg, orientation);
      const originalHash = createHash('sha256').update(bytes).digest('hex');
      const result = await page.evaluate(async (bytes) => {
        const h = (window as any).highResolution;
        const original = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
        const engine = h.createScanicAdapter('/scanner-assets/');
        h.workerDecodes.length = 0;
        try {
          const result = await engine.process({
            original,
            limits: h.resolveLimits(),
            corners: [
              { x: 0.01, y: 0.01 },
              { x: 0.99, y: 0.01 },
              { x: 0.99, y: 0.99 },
              { x: 0.01, y: 0.99 },
            ],
            format: { kind: 'original-ratio', origin: 'user' },
            rotation: 0,
            recipe: { version: 1, enhancement: 'none', dewarp: 'off' },
            revision: 1,
            mime: 'image/jpeg',
            previewComparison: false,
          });
          if ('status' in result) throw new Error('Explicit crop must produce a page');
          const bitmap = await createImageBitmap(result.preview, {
            resizeWidth: 120,
            resizeHeight: 160,
          });
          const canvas = document.createElement('canvas');
          canvas.width = 120;
          canvas.height = 160;
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const colors = [
            [0.12, 0.12],
            [0.88, 0.12],
            [0.88, 0.88],
            [0.12, 0.88],
          ].map(([x, y]) =>
            Array.from(
              context.getImageData(Math.round(x * 119), Math.round(y * 159), 1, 1).data,
            ).slice(0, 3),
          );
          canvas.width = canvas.height = 1;
          return {
            size: result.size,
            output: result.outputSize,
            colors,
            original: await h.digest(original),
            decodes: h.workerDecodes,
          };
        } finally {
          engine.destroy();
        }
      }, Array.from(bytes));
      expect(result.size).toEqual({ width: 6000, height: 8000 });
      expect(result.original).toBe(originalHash);
      expect(result.output.width * result.output.height).toBeGreaterThanOrEqual(7_900_000);
      expect(result.output.width * result.output.height).toBeLessThanOrEqual(8_000_000);
      expect(Math.max(result.output.width, result.output.height)).toBeLessThanOrEqual(4096);
      const decode = result.decodes[0];
      expect(decode.options).toMatchObject({
        imageOrientation: 'from-image',
        resizeQuality: 'high',
      });
      expect(decode.width).toBe(decode.options.resizeWidth);
      expect(decode.height).toBe(decode.options.resizeHeight);
      expect(decode.width * decode.height).toBeLessThan(48_000_000);
      expect(decode.width / decode.height).toBeCloseTo(0.75, 3);
      // Clockwise: yellow/red/green/blue. Counterclockwise: green/blue/yellow/red.
      const expected =
        orientation === 6
          ? [
              [229, 187, 33],
              [223, 38, 52],
              [36, 147, 68],
              [49, 84, 187],
            ]
          : [
              [36, 147, 68],
              [49, 84, 187],
              [229, 187, 33],
              [223, 38, 52],
            ];
      for (let mark = 0; mark < 4; mark++)
        for (let channel = 0; channel < 3; channel++)
          expect(Math.abs(result.colors[mark][channel] - expected[mark][channel])).toBeLessThan(24);
      expect(await page.evaluate(() => (window as any).highResolution.workers.size)).toBe(0);
    }
  },
);
