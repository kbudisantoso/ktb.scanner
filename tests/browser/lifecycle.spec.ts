import { acceptPage } from './helpers';
import { build } from 'esbuild';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';

let harness: string;
test.beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `import { createScanner } from './packages/scanner/dist/react/index.js';
        window.scannerHarness = { createScanner };`,
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
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).scannerHarness))).toBe(true);
});

test('controller handles busy, pre-abort, reopen, host abort and destroy', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const controller = (window as any).scannerHarness.createScanner({
      locale: 'de',
      mount,
      assetBaseUrl: '/scanner-assets/',
    });
    const preAborted = new AbortController();
    preAborted.abort();
    const pre = await controller.open({ signal: preAborted.signal });
    const abort = new AbortController();
    const first = controller.open({ signal: abort.signal });
    const busy = await controller.open().catch((error: any) => error.code);
    abort.abort();
    const cancelled = await first;
    const second = controller.open();
    await controller.destroy();
    const destroyed = await second;
    const disposed = await controller.open().catch((error: any) => error.code);
    const children = mount.childElementCount;
    mount.remove();
    return { pre, busy, cancelled, destroyed, disposed, children };
  });
  expect(result).toEqual({
    pre: { status: 'cancelled' },
    busy: 'SCANNER_BUSY',
    cancelled: { status: 'cancelled' },
    destroyed: { status: 'cancelled' },
    disposed: 'SCANNER_DISPOSED',
    children: 0,
  });
});

test('host abort during PDF generation never confirms a partial result', async ({ page }) => {
  await page.route('**/pdf.worker.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'self.onmessage = () => {};',
    }),
  );
  const data = await page.evaluate(
    fixtureInBrowser,
    fixtures.find((f) => f.name === 'calibration-flat')!,
  );
  await page.evaluate(async (url) => {
    const h = (window as any).scannerHarness;
    const mount = document.createElement('div');
    document.body.append(mount);
    h.mount = mount;
    h.abort = new AbortController();
    h.controller = h.createScanner({ locale: 'de', mount, assetBaseUrl: '/scanner-assets/' });
    h.result = h.controller.open({
      signal: h.abort.signal,
      initialFiles: [
        new File([await (await fetch(url)).blob()], 'synthetic.png', { type: 'image/png' }),
      ],
    });
  }, data);
  await acceptPage(page);
  const pdfStarted = page.waitForRequest('**/pdf.worker.js');
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await pdfStarted;
  const result = await page.evaluate(async () => {
    const h = (window as any).scannerHarness;
    h.abort.abort();
    const result = await h.result;
    await h.controller.destroy();
    h.mount.remove();
    return result;
  });
  expect(result).toEqual({ status: 'cancelled' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('repeated real processing releases workers and preview URLs on host abort', async ({
  page,
}) => {
  const data = await page.evaluate(
    fixtureInBrowser,
    fixtures.find((f) => f.name === 'calibration-flat')!,
  );
  await page.evaluate(() => {
    const state = { workers: new Set<Worker>(), urls: new Set<string>() };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.workers.add(this);
      }
      terminate() {
        state.workers.delete(this);
        super.terminate();
      }
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      const url = create(blob);
      state.urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      state.urls.delete(url);
      revoke(url);
    };
    Object.assign((window as any).scannerHarness, { state });
  });
  for (let iteration = 0; iteration < 20; iteration++) {
    await page.evaluate(async (url) => {
      const h = (window as any).scannerHarness;
      const mount = document.createElement('div');
      document.body.append(mount);
      const bytes = await (await fetch(url)).blob();
      h.abort = new AbortController();
      h.controller = h.createScanner({ locale: 'de', mount, assetBaseUrl: '/scanner-assets/' });
      h.result = h.controller.open({
        signal: h.abort.signal,
        initialFiles: [new File([bytes], 'synthetic.png', { type: 'image/png' })],
      });
      h.mount = mount;
    }, data);
    if (iteration % 2 === 0) {
      await expect(page.getByRole('img', { name: 'Bearbeitete Seite' })).toBeVisible();
    } else {
      await expect
        .poll(() => page.evaluate(() => (window as any).scannerHarness.state.workers.size))
        .toBe(1);
    }
    const resources = await page.evaluate(async () => {
      const h = (window as any).scannerHarness;
      h.abort.abort();
      const result = await h.result;
      await h.controller.destroy();
      h.mount.remove();
      return { result, workers: h.state.workers.size, urls: h.state.urls.size };
    });
    expect(resources).toEqual({ result: { status: 'cancelled' }, workers: 0, urls: 0 });
  }
});

test('camera presentation identity skips repeats and format changes release late bitmaps', async ({
  page,
}) => {
  await page.route('**/processing.worker.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `self.onmessage=({data})=>{data.image.close();self.postMessage({id:data.id,result:{timestamp:data.timestamp,sharpness:'sharp',corners:[{x:.2,y:.1},{x:.8,y:.1},{x:.8,y:.9},{x:.2,y:.9}]}});};`,
    }),
  );
  await page.evaluate(() => {
    const h = (window as any).scannerHarness;
    const state = {
      width: 640,
      height: 480,
      next: 0,
      copies: 0,
      holdNext: false,
      callbacks: new Map<number, VideoFrameRequestCallback>(),
      workers: new Set<Worker>(),
      sizes: [] as number[][],
      closes: new Map<number, number>(),
      pending: [] as Array<() => void>,
    };
    h.frames = state;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => new MediaStream(),
        enumerateDevices: async () => [],
      },
    });
    Object.defineProperties(HTMLVideoElement.prototype, {
      videoWidth: { configurable: true, get: () => state.width },
      videoHeight: { configurable: true, get: () => state.height },
      readyState: { configurable: true, get: () => 2 },
    });
    HTMLVideoElement.prototype.play = async () => {};
    HTMLVideoElement.prototype.requestVideoFrameCallback = (callback) => {
      const id = ++state.next;
      state.callbacks.set(id, callback);
      return id;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = (id) => {
      state.callbacks.delete(id);
    };
    const nativeBitmap = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((source: any, options: any) => {
      if (!(source instanceof HTMLVideoElement)) return nativeBitmap(source, options);
      const id = ++state.copies,
        held = state.holdNext;
      state.holdNext = false;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 4;
      canvas.getContext('2d')!.fillRect(0, 0, 4, 4);
      return nativeBitmap(canvas, options).then((image) => {
        const close = image.close.bind(image);
        image.close = () => {
          state.closes.set(id, (state.closes.get(id) || 0) + 1);
          close();
        };
        return held
          ? new Promise<ImageBitmap>((resolve) => state.pending.push(() => resolve(image)))
          : image;
      });
    }) as typeof createImageBitmap;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.workers.add(this);
      }
      postMessage(message: any, transfer: Transferable[] | StructuredSerializeOptions = []) {
        if (message.kind === 'detect')
          state.sizes.push([message.image.width, message.image.height]);
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
      terminate() {
        state.workers.delete(this);
        super.terminate();
      }
    };
    h.fire = (mediaTime: number, presentedFrames: number) => {
      const entry = state.callbacks.entries().next().value;
      if (!entry) throw new Error('No presentation callback pending');
      state.callbacks.delete(entry[0]);
      entry[1](performance.now(), { mediaTime, presentedFrames } as VideoFrameCallbackMetadata);
    };
    h.abort = new AbortController();
    h.mount = document.createElement('div');
    document.body.append(h.mount);
    h.controller = h.createScanner({
      mount: h.mount,
      locale: 'en',
      initialMode: 'manual',
      shutterSound: 'off',
      assetBaseUrl: '/scanner-assets/',
    });
    h.result = h.controller.open({ entry: 'camera', signal: h.abort.signal });
  });
  const pendingFrame = () =>
    expect
      .poll(() => page.evaluate(() => (window as any).scannerHarness.frames.callbacks.size))
      .toBe(1);
  await pendingFrame();
  await page.evaluate(() => (window as any).scannerHarness.fire(10, 1));
  await expect(page.locator('.scanner-camera svg polygon')).toBeVisible();
  await pendingFrame();
  await page.evaluate(() => (window as any).scannerHarness.fire(10, 1));
  await pendingFrame();
  expect(await page.evaluate(() => (window as any).scannerHarness.frames.sizes)).toEqual([
    [800, 600],
  ]);
  await page.evaluate(() => {
    const h = (window as any).scannerHarness;
    h.frames.holdNext = true;
    h.fire(10.1, 2);
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).scannerHarness.frames.pending.length))
    .toBe(1);
  await page.evaluate(() => {
    const h = (window as any).scannerHarness;
    h.frames.width = 480;
    h.frames.height = 640;
    document.querySelector('video')!.dispatchEvent(new Event('resize'));
  });
  await pendingFrame();
  await page.evaluate(() => (window as any).scannerHarness.fire(10.2, 3));
  await expect
    .poll(() => page.evaluate(() => (window as any).scannerHarness.frames.sizes.length))
    .toBe(2);
  await expect
    .poll(() =>
      page.locator('.scanner-camera').evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.width / box.height;
      }),
    )
    .toBeCloseTo(480 / 640, 2);
  await page.evaluate(() => (window as any).scannerHarness.frames.pending.shift()());
  await expect
    .poll(() => page.evaluate(() => (window as any).scannerHarness.frames.closes.get(2)))
    .toBe(1);
  await pendingFrame();
  const cleanup = await page.evaluate(async () => {
    const h = (window as any).scannerHarness,
      late = [...h.frames.callbacks.values()][0] as VideoFrameRequestCallback;
    const before = h.frames.copies;
    h.abort.abort();
    const result = await h.result;
    await h.controller.destroy();
    late(performance.now(), { mediaTime: 10.3, presentedFrames: 4 } as VideoFrameCallbackMetadata);
    await Promise.resolve();
    h.mount.remove();
    return {
      result,
      callbacks: h.frames.callbacks.size,
      workers: h.frames.workers.size,
      extraCopies: h.frames.copies - before,
    };
  });
  expect(cleanup).toEqual({
    result: { status: 'cancelled' },
    callbacks: 0,
    workers: 0,
    extraCopies: 0,
  });
});
