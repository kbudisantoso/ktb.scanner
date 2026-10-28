import { build } from 'esbuild';
import { test, expect } from './fixtures';
import { previewHash, waitForPreview } from './helpers';
import type { Page } from '@playwright/test';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';

let harness: string;
test.beforeAll(async () => {
  harness = (
    await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `import React,{StrictMode} from './packages/scanner/node_modules/react/index.js';
        import {createRoot} from './packages/scanner/node_modules/react-dom/client.js';
        import {Scanner,createScanner,ImageViewer} from './packages/scanner/dist/react/index.js';
        window.continuousHarness={React,StrictMode,createRoot,Scanner,createScanner,ImageViewer,results:[],errors:[],events:[],requests:0,stops:0,workers:new Set(),urls:new Set(),scene:1};`,
      },
      bundle: true,
      format: 'esm',
      write: false,
      define: { 'process.env.NODE_ENV': '"development"' },
    })
  ).outputFiles[0].text;
});

async function prepare(page: Page) {
  await page.route('**/continuous-test.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic capture workflow</title>',
    }),
  );
  await page.route('**/scanner-styles.css', (route) =>
    route.fulfill({ contentType: 'text/css', path: 'packages/scanner/dist/styles.css' }),
  );
  for (const asset of ['processing.worker.js', 'scanic.js'])
    await page.route(`**/scanner-assets/${asset}`, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        path: `packages/scanner/dist/assets/${asset}`,
      }),
    );
  await page.goto('/continuous-test.html');
  await page.addStyleTag({ url: '/scanner-styles.css' });
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).continuousHarness)).toBe(true);
  await page.evaluate(() => {
    const h = (window as any).continuousHarness;
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    h.canvas = canvas;
    h.draw = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = h.scene === 0 ? '#999999' : '#435444';
      ctx.fillRect(0, 0, 600, 800);
      if (!h.scene) return;
      ctx.fillStyle = '#fffdf6';
      ctx.fillRect(100, 60, 400, 680);
      ctx.fillStyle = h.scene === 1 ? '#96302a' : h.scene === 2 ? '#244b98' : '#385f2c';
      ctx.fillRect(140, 100, 320, 100);
      ctx.fillStyle = '#202820';
      if (h.scene === 4) {
        // Different printed content, with exactly the same paper/background geometry.
        for (let y = 240; y < 680; y += 24)
          for (let x = 140; x < 455; x += 24) {
            ctx.fillStyle = ((x + y) / 24) % 2 < 1 ? '#182b49' : '#687e95';
            ctx.fillRect(x, y, 20, 20);
          }
      } else
        for (let y = 240; y < 680; y += 28)
          for (let x = 140; x < 455; x += 52) ctx.fillRect(x, y, 36, 6);
    };
    h.draw();
    // A deterministic camera facade supplies synthetic pixels on all engines, including
    // WebKit without canvas.captureStream. Encoding, detection, processing and exports stay native.
    const streams = new WeakMap<HTMLMediaElement, any>();
    const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get() {
        return streams.get(this) ?? src.get?.call(this);
      },
      set(value) {
        if (value?.synthetic) streams.set(this, value);
        else src.set?.call(this, value);
      },
    });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      return streams.has(this) ? Promise.resolve() : play.call(this);
    };
    const ready = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get() {
        return streams.has(this) ? 4 : ready.get?.call(this);
      },
    });
    for (const [name, value] of [
      ['videoWidth', 600],
      ['videoHeight', 800],
    ] as const) {
      const native = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, name)!;
      Object.defineProperty(HTMLVideoElement.prototype, name, {
        configurable: true,
        get() {
          return streams.has(this) ? value : native.get?.call(this);
        },
      });
    }
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      source: CanvasImageSource,
      ...args: number[]
    ) {
      return Reflect.apply(draw, this, [
        source instanceof HTMLVideoElement && streams.has(source) ? canvas : source,
        ...args,
      ]);
    } as typeof draw;
    const bitmap = window.createImageBitmap;
    window.createImageBitmap = ((source: ImageBitmapSource, ...args: any[]) =>
      Reflect.apply(bitmap, window, [
        source instanceof HTMLVideoElement && streams.has(source) ? canvas : source,
        ...args,
      ])) as typeof bitmap;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          if (constraints.audio !== false) throw new Error('Unexpected microphone');
          h.requests++;
          let stopped = false;
          const track = {
            get readyState() {
              return stopped ? 'ended' : 'live';
            },
            stop: () => {
              if (!stopped) {
                stopped = true;
                h.stops++;
              }
            },
            getSettings: () => ({ width: 600, height: 800 }),
            getCapabilities: () => ({ torch: true }),
            applyConstraints: async (constraints: MediaTrackConstraints) => {
              if (constraints.advanced?.some((value: any) => value.torch !== undefined)) {
                h.scene = 1;
                h.draw();
                await new Promise((resolve) => setTimeout(resolve, 800));
              }
            },
          };
          return { synthetic: true, getTracks: () => [track], getVideoTracks: () => [track] };
        },
        enumerateDevices: async () => {
          h.enumCalls = (h.enumCalls ?? 0) + 1;
          return h.holdEnumeration
            ? new Promise((resolve) => {
                h.releaseEnumeration = resolve;
              })
            : [];
        },
      },
    });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        h.workers.add(this);
      }
      terminate() {
        h.workers.delete(this);
        super.terminate();
      }
    };
    const createUrl = URL.createObjectURL,
      revokeUrl = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => {
      const value = createUrl(blob);
      h.urls.add(value);
      return value;
    };
    URL.revokeObjectURL = (url) => {
      h.urls.delete(url);
      revokeUrl(url);
    };
    h.mount = document.body.appendChild(document.createElement('div'));
    h.open = (api = 'controller', extra = {}, initial = {}) => {
      h.abort = new AbortController();
      h.options = {
        mount: h.mount,
        assetBaseUrl: '/scanner-assets/',
        locale: 'en',
        captureWorkflow: 'continuous',
        initialMode: 'manual',
        defaultProfile: 'photo',
        shutterSound: 'off',
        createPdf: false,
        imageType: 'image/png',
        diagnostics: { onEvent: (event: any) => h.events.push(event) },
        ...extra,
      };
      const openOptions = { entry: 'camera', signal: h.abort.signal, ...initial };
      if (api === 'controller') {
        h.controller = h.createScanner(h.options);
        h.promise = h.controller.open(openOptions).then((result: any) => h.results.push(result));
      } else {
        h.root = h.createRoot(h.mount);
        h.render = (handler: string) =>
          h.root.render(
            h.React.createElement(
              h.StrictMode,
              null,
              h.React.createElement(h.Scanner, {
                open: true,
                options: h.options,
                openOptions,
                onResult: (result: any) => h.results.push({ ...result, handler }),
                onError: (error: any) => h.errors.push(error.code),
              }),
            ),
          );
        h.render('first');
      }
    };
  });
}
async function scene(page: Page, value: number) {
  await page.evaluate((value) => {
    const h = (window as any).continuousHarness;
    h.scene = value;
    h.draw();
  }, value);
}
async function capture(page: Page, count: number) {
  const shutter = page.getByRole('button', { name: 'Capture now', exact: true });
  await expect(shutter).toBeEnabled();
  await shutter.click();
  await expect(
    page.getByRole('button', { name: `Review pages (${count})`, exact: true }),
  ).toBeEnabled();
}
test('continuous collection reuses the stream, reviews FIFO and retakes only the current accepted page', async ({
  page,
}, info) => {
  await prepare(page);
  await page.evaluate(() => {
    const h = (window as any).continuousHarness;
    h.holdEnumeration = true;
    h.open();
  });
  await page.getByRole('button', { name: 'Capture now', exact: true }).click();
  const feedback = page.getByRole('img', { name: 'Captured page', exact: true });
  await expect(feedback).toBeVisible();
  const actualPreview = await feedback.evaluate(async (image: HTMLImageElement) => [
    ...new Uint8Array(await (await fetch(image.src)).arrayBuffer()),
  ]);
  await info.attach('actual-extracted-preview.jpg', {
    contentType: 'image/jpeg',
    body: Buffer.from(actualPreview),
  });
  await info.attach('capture-feedback.png', {
    contentType: 'image/png',
    body: await page.screenshot(),
  });
  await expect(page.getByRole('button', { name: 'Review pages (1)', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const h = (window as any).continuousHarness;
    h.holdEnumeration = false;
    h.releaseEnumeration([]);
  });
  await page.waitForTimeout(500);
  await info.attach('camera-ready.png', {
    contentType: 'image/png',
    body: await page.screenshot(),
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).continuousHarness.events.some(
        (event: any) =>
          event.type === 'job-error' && event.data.message === 'Verarbeitung läuft bereits.',
      ),
    ),
  ).toBe(false);
  await scene(page, 2);
  await capture(page, 2);
  await scene(page, 3);
  await capture(page, 3);
  expect(
    await page.evaluate(() => {
      const h = (window as any).continuousHarness;
      return [h.requests, h.stops];
    }),
  ).toEqual([1, 0]);
  await page.getByRole('button', { name: 'Review pages (3)', exact: true }).click();
  const first = await previewHash(page);
  await test.step('The next processed camera page is the real incoming layer before the first acceptance', async () => {
    const surface = page.locator('.scanner-image-surface');
    await expect(surface).toHaveAttribute('data-page-motion', 'idle');
    const box = (await surface.boundingBox())!;
    const x = box.x + box.width * 0.8,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - box.width / 2, y, { steps: 5 });
    const neighbour = surface.locator('[data-motion-layer="neighbour"]');
    await expect(neighbour).toBeVisible();
    const incoming = await neighbour.evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      return Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', await (await fetch(image.src)).arrayBuffer()),
        ),
      ).join(',');
    });
    expect(incoming).not.toBe(first);
    await expect(surface.locator('[data-motion-layer]')).toHaveCount(2);
    expect(
      await page.evaluate(() =>
        (window as any).continuousHarness.events.filter(
          (event: any) => event.type === 'page-accepted',
        ),
      ),
    ).toHaveLength(0);
    await info.attach('camera-ready-mid-drag.png', {
      contentType: 'image/png',
      body: await page.screenshot(),
    });
    await page.mouse.up();
    await expect(surface).toHaveAttribute('data-page-motion', 'idle');
    await expect(surface).toHaveAttribute('data-zoom', 'fit');
    expect(await previewHash(page)).toBe(incoming);
    expect(
      await page.evaluate(() =>
        (window as any).continuousHarness.events.filter(
          (event: any) => event.type === 'page-accepted',
        ),
      ),
    ).toHaveLength(1);
  });
  const second = await previewHash(page);
  expect(second).not.toBe(first);
  const firstId = await page.evaluate(
    () =>
      (window as any).continuousHarness.events.find((event: any) => event.type === 'page-accepted')
        .data.pageId,
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  expect(await previewHash(page)).toBe(first);
  await page.getByRole('button', { name: /^Page overview/ }).click();
  const firstTile = page.locator('.scanner-pages article').first();
  await firstTile.getByRole('button', { name: 'Page 1: Page actions', exact: true }).click();
  await firstTile.getByRole('button', { name: 'Replace', exact: true }).click();
  await page.getByRole('button', { name: 'Back to import', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Review next page (1)', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeDisabled();
  await firstTile.getByRole('button', { name: 'Page 1: Edit', exact: true }).click();
  expect(await previewHash(page)).toBe(first);
  await page.getByRole('button', { name: 'Retake', exact: true }).click();
  await scene(page, 3);
  await page.getByRole('button', { name: 'Capture now', exact: true }).click();
  await expect(page.locator('.scanner-capture')).toHaveCount(0);
  expect(await previewHash(page)).not.toBe(first);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  expect(await previewHash(page)).toBe(second);
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retake', exact: true }).click();
  const original = await page.evaluate(() =>
    (window as any).continuousHarness.canvas.toDataURL('image/png'),
  );
  const chooseMany = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import images', exact: true }).click();
  await (
    await chooseMany
  ).setFiles(
    [1, 2].map((n) => ({
      name: `replacement-${n}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(original.split(',')[1], 'base64'),
    })),
  );
  await expect(page.getByRole('alert')).toContainText('exactly one');
  await page.getByRole('button', { name: 'Back to import', exact: true }).click();
  expect(await previewHash(page)).toBe(second);
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retake', exact: true }).click();
  await scene(page, 1);
  const replacement = await page.evaluate(() =>
    (window as any).continuousHarness.canvas.toDataURL('image/png'),
  );
  const chooseOne = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import images', exact: true }).click();
  await (
    await chooseOne
  ).setFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: Buffer.from(replacement.split(',')[1], 'base64'),
  });
  await expect(page.locator('.scanner-capture')).toHaveCount(0);
  const replacedSecond = await previewHash(page);
  expect(replacedSecond).not.toBe(second);
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await waitForPreview(page);
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review pages (3)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Review pages (3)', exact: true }).click();
  // With no pending page, review starts at the first accepted page.
  expect(await previewHash(page)).not.toBe(first);
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  expect(await previewHash(page)).toBe(replacedSecond);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await waitForPreview(page);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).continuousHarness.results.length))
    .toBe(1);
  const result = await page.evaluate(() => {
    const h = (window as any).continuousHarness,
      r = h.results[0];
    return {
      status: r.status,
      ids: r.pages.map((p: any) => p.id),
      revisions: r.pages.map((p: any) => p.revision),
      requests: h.requests,
      stops: h.stops,
    };
  });
  expect(result.status).toBe('confirmed');
  expect(result.ids).toHaveLength(3);
  expect(result.ids[0]).toBe(firstId);
  expect(result.revisions[0]).toBeGreaterThan(1);
  expect(result.requests).toBe(6);
  expect(result.stops).toBe(6);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = (window as any).continuousHarness;
        return [h.workers.size, h.urls.size];
      }),
    )
    .toEqual([0, 0]);
  await info.attach('continuous-result.json', {
    contentType: 'application/json',
    body: JSON.stringify(result),
  });
});

test('required corners and rejected batches retain pending pages and enforce the combined page limit', async ({
  page,
}) => {
  await prepare(page);
  await scene(page, 0);
  await page.evaluate(() =>
    (window as any).continuousHarness.open('controller', { locale: 'de', limits: { pages: 2 } }),
  );
  await page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true }).click();
  await expect(page.getByText('Ecken später bestätigen', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Aufgenommene Seite' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Seiten prüfen (1)', exact: true })).toBeEnabled();
  const files = await page.evaluate(async () => {
    const h = (window as any).continuousHarness;
    return h.canvas.toDataURL('image/png');
  });
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Bilder importieren', exact: true }).click();
  await (
    await choosing
  ).setFiles(
    [1, 2].map((n) => ({
      name: `synthetic-${n}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(files.split(',')[1], 'base64'),
    })),
  );
  await expect(page.getByRole('alert')).toContainText('Sitzungslimit');
  await expect(page.getByRole('button', { name: 'Seiten prüfen (1)', exact: true })).toBeEnabled();
  await scene(page, 2);
  await page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Seiten prüfen (2)', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Seiten prüfen (2)', exact: true }).click();
  await expect(
    page.getByText('Bitte die vier Blattecken bestätigen.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abschließen', exact: true })).toHaveCount(0);
  await page
    .locator('.scanner-corners')
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).continuousHarness.results.length))
    .toBe(1);
  expect(await page.evaluate(() => (window as any).continuousHarness.results[0].pages.length)).toBe(
    1,
  );
});

test('React snapshots workflow, keeps its current result handler and aborts owned preview resources once', async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate(() =>
    (window as any).continuousHarness.open('react', {
      initialMode: 'auto',
      autoCaptureStabilityMs: 100,
    }),
  );
  await expect(page.getByRole('button', { name: 'Review pages (1)', exact: true })).toBeEnabled();
  // Observe several complete configured windows on the unchanged scene.
  await page.waitForTimeout(1600);
  expect(
    await page.evaluate(
      () =>
        (window as any).continuousHarness.events.filter(
          (event: any) => event.type === 'capture-complete',
        ).length,
    ),
  ).toBe(1);
  await page.evaluate(() => {
    const h = (window as any).continuousHarness;
    h.sceneChangeAt = performance.now();
    h.scene = 4;
    h.draw();
  });
  await expect(page.getByRole('button', { name: 'Review pages (2)', exact: true })).toBeEnabled();
  const captures = await page.evaluate(() => {
    const h = (window as any).continuousHarness;
    return {
      changedAt: h.sceneChangeAt,
      captures: h.events
        .filter((event: any) => event.type === 'capture-complete')
        .map((event: any) => ({
          at: event.data.details.capturedAtMs,
          corners: event.data.hint.corners,
        })),
    };
  });
  expect(captures.captures).toHaveLength(2);
  expect(captures.captures[1].at - captures.changedAt).toBeGreaterThanOrEqual(700);
  expect(
    Math.max(
      ...captures.captures[1].corners.map((point: { x: number; y: number }, index: number) =>
        Math.hypot(
          point.x - captures.captures[0].corners[index].x,
          point.y - captures.captures[0].corners[index].y,
        ),
      ),
    ),
  ).toBeLessThan(0.03);
  await page.waitForTimeout(1600);
  expect(
    await page.evaluate(
      () =>
        (window as any).continuousHarness.events.filter(
          (event: any) => event.type === 'capture-complete',
        ).length,
    ),
  ).toBe(2);
  await page.getByRole('button', { name: 'Turn light on', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Turn light off', exact: true })).toBeEnabled();
  await page.waitForTimeout(1600);
  expect(
    await page.evaluate(
      () =>
        (window as any).continuousHarness.events.filter(
          (event: any) => event.type === 'capture-complete',
        ).length,
    ),
  ).toBe(2);
  await page.evaluate(() => {
    const h = (window as any).continuousHarness;
    h.options = { ...h.options, captureWorkflow: 'review-each' };
    h.render('latest');
  });
  await page.getByRole('button', { name: 'Capture now', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Captured page', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).continuousHarness.abort.abort());
  await expect
    .poll(() => page.evaluate(() => (window as any).continuousHarness.results))
    .toEqual([{ status: 'cancelled', handler: 'latest' }]);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = (window as any).continuousHarness;
        return [h.requests, h.stops, h.workers.size, h.urls.size];
      }),
    )
    .toEqual([1, 1, 0, 0]);
  await page.evaluate(() => (window as any).continuousHarness.root.unmount());
});

test('invalid workflows fail before resources and the omitted option retains review after one capture', async ({
  page,
}) => {
  await prepare(page);
  const invalid = await page.evaluate(() => {
    const h = (window as any).continuousHarness;
    try {
      h.createScanner({
        mount: h.mount,
        assetBaseUrl: '/scanner-assets/',
        captureWorkflow: 'auto',
      });
    } catch (error: any) {
      return [error.code, h.requests, h.workers.size, h.mount.childElementCount];
    }
  });
  expect(invalid).toEqual(['CONFIG_INVALID', 0, 0, 0]);
  await page.evaluate(() =>
    (window as any).continuousHarness.open('controller', { captureWorkflow: undefined }),
  );
  await page.getByRole('button', { name: 'Capture now', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Edited page', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const h = (window as any).continuousHarness;
      return [h.requests, h.stops];
    }),
  ).toEqual([1, 1]);
  await page.evaluate(() => (window as any).continuousHarness.controller.destroy());
  for (const eventType of ['camera-start', 'capture-complete']) {
    await page.evaluate((eventType) => {
      const h = (window as any).continuousHarness;
      h.results = [];
      h.events = [];
      h.enumCalls = 0;
      h.open('controller', {
        diagnostics: {
          onEvent: (event: any) => {
            h.events.push(event);
            if (event.type === eventType) void h.controller.destroy();
          },
        },
      });
    }, eventType);
    if (eventType === 'capture-complete')
      await page.getByRole('button', { name: 'Capture now', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).continuousHarness.results))
      .toEqual([{ status: 'cancelled' }]);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const h = (window as any).continuousHarness;
          return [h.workers.size, h.urls.size, h.mount.childElementCount];
        }),
      )
      .toEqual([0, 0, 0]);
    const state = await page.evaluate(() => {
      const h = (window as any).continuousHarness;
      return {
        enumerations: h.enumCalls,
        processed: h.events.some(
          (event: any) => event.type === 'job-start' && event.data.kind === 'process',
        ),
      };
    });
    expect(state.processed).toBe(false);
    if (eventType === 'camera-start') expect(state.enumerations).toBe(0);
  }
});

test('page swipes are single-pointer fit gestures and never replace zoom, pan, held Before or disabled navigation', async ({
  page,
}, info) => {
  await prepare(page);
  await page.evaluate(async () => {
    const h = (window as any).continuousHarness;
    h.mount.style.cssText = 'width:360px;height:500px;display:flex';
    h.viewerImage = await new Promise((resolve) => h.canvas.toBlob(resolve, 'image/png'));
    h.swipes = [];
    h.root = h.createRoot(h.mount);
    h.renderViewer = (enabled: boolean, resetKey = 'page-1') =>
      h.root.render(
        h.React.createElement(h.ImageViewer, {
          image: h.viewerImage,
          before: h.viewerImage,
          alt: 'Synthetic page',
          resetKey,
          onPageSwipe: enabled
            ? (direction: string) => {
                h.swipes.push(direction);
                h.renderViewer(true, `swipe-${h.swipes.length}`);
              }
            : undefined,
        }),
      );
    h.renderViewer(true);
  });
  const surface = page.locator('.scanner-image-surface');
  await expect(page.getByRole('img', { name: 'Synthetic page', exact: true })).toBeVisible();
  const drag = async (dx: number) => {
    const box = (await surface.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 5 });
    await page.mouse.up();
  };
  await drag(-90);
  await expect(surface).toHaveAttribute('data-zoom', 'fit');
  expect(await page.evaluate(() => (window as any).continuousHarness.swipes)).toEqual(['next']);
  await surface.focus();
  await page.keyboard.press('Enter');
  await expect(surface).not.toHaveAttribute('data-zoom', 'fit');
  await drag(90);
  expect(await page.evaluate(() => (window as any).continuousHarness.swipes)).toEqual(['next']);
  await page.getByRole('button', { name: 'Fit image', exact: true }).click();
  const before = page.getByRole('button', { name: 'Hold to view before', exact: true });
  await before.focus();
  await page.keyboard.down('Space');
  await drag(90);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => (window as any).continuousHarness.swipes)).toEqual(['next']);
  await page.evaluate(() => (window as any).continuousHarness.renderViewer(false));
  await drag(90);
  expect(await page.evaluate(() => (window as any).continuousHarness.swipes)).toEqual(['next']);
  await page.evaluate(() => (window as any).continuousHarness.renderViewer(true, 'page-2'));
  await expect(surface).toHaveAttribute('data-zoom', 'fit');
  await drag(90);
  expect(await page.evaluate(() => (window as any).continuousHarness.swipes)).toEqual([
    'next',
    'previous',
  ]);
  await page.evaluate(() => (window as any).continuousHarness.root.unmount());
  await expect.poll(() => page.evaluate(() => (window as any).continuousHarness.urls.size)).toBe(0);
  const documents = [];
  for (const index of [1, 4])
    documents.push(await page.evaluate(fixtureInBrowser, fixtures[index]));
  // Camera workflow selection does not disable page gestures on ordinary imports.
  await page.evaluate(async (documents) => {
    const h = (window as any).continuousHarness,
      post = Worker.prototype.postMessage;
    h.files = await Promise.all(
      documents.map(
        async (url, index) =>
          new File([await (await fetch(url)).blob()], `synthetic-${index}.png`, {
            type: 'image/png',
          }),
      ),
    );
    h.corruptFile = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'corrupt.png', {
      type: 'image/png',
    });
    h.processes = [];
    Worker.prototype.postMessage = function (message: any, transfer?: any) {
      if (message.kind === 'process') {
        h.processes.push({
          accepted: h.events.filter((event: any) => event.type === 'page-accepted').length,
          layers: document.querySelectorAll('[data-motion-layer]').length,
          outgoingLive: h.urls.has(h.outgoingSource),
        });
        if (h.holdNextProcess) {
          h.holdNextProcess = false;
          h.releaseProcess = () => {
            h.releaseProcess = null;
            post.call(this, message, transfer ?? []);
          };
          return;
        }
      }
      post.call(this, message, transfer ?? []);
    };
    h.open('controller', { captureWorkflow: 'review-each' }, { initialFiles: h.files });
    h.mount.addEventListener('pointerdown', (event: PointerEvent) => {
      h.pointerId = event.pointerId;
    });
  }, documents);
  const first = await previewHash(page);
  const firstSource = await (await waitForPreview(page)).getAttribute('src');
  const accepted = () =>
    page.evaluate(
      () =>
        (window as any).continuousHarness.events.filter(
          (event: any) => event.type === 'page-accepted',
        ).length,
    );
  const idle = async () => {
    await expect(surface).toHaveAttribute('data-page-motion', 'idle');
    await expect(surface).toHaveAttribute('data-zoom', 'fit');
  };
  const beginDrag = async (fraction: number) => {
    const box = (await surface.boundingBox())!;
    const x = box.x + box.width * (fraction < 0 ? 0.8 : 0.2),
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const dx = Math.round(box.width * fraction);
    await page.mouse.move(x + dx, y, { steps: 5 });
    return dx;
  };
  const cancelDrag = async () => {
    await surface.dispatchEvent('pointercancel', {
      pointerId: await page.evaluate(() => (window as any).continuousHarness.pointerId),
      pointerType: 'mouse',
      button: 0,
    });
    await page.mouse.up();
    await idle();
  };
  const layers = () =>
    surface.locator('[data-motion-layer]').evaluateAll(async (images: HTMLImageElement[]) => {
      const box = images[0].parentElement!.getBoundingClientRect();
      return Promise.all(
        images.map(async (image) => {
          const rect = image.getBoundingClientRect();
          return {
            layer: image.dataset.motionLayer,
            hash: Array.from(
              new Uint8Array(
                await crypto.subtle.digest('SHA-256', await (await fetch(image.src)).arrayBuffer()),
              ),
            ).join(','),
            ready: image.complete && image.naturalWidth > 0,
            visible: getComputedStyle(image).visibility,
            natural: [image.naturalWidth, image.naturalHeight],
            rendered: [rect.width, rect.height],
            available: [box.width, box.height],
            translate: parseFloat(getComputedStyle(image).translate),
            visibleWidth: Math.max(
              0,
              Math.min(rect.right, box.right) - Math.max(rect.left, box.left),
            ),
            live: (window as any).continuousHarness.urls.has(image.src),
          };
        }),
      );
    });
  await test.step('Raw files do not process or accept during drag, bounds, short swipes or cancellation', async () => {
    await idle();
    await drag(3);
    await expect(surface).toHaveAttribute('data-zoom', '100');
    await page.waitForTimeout(510);
    await surface.dblclick();
    await idle();
    for (const fraction of [0.5, -0.03, -0.5]) {
      await beginDrag(fraction);
      await expect(surface.locator('[data-motion-layer]')).toHaveCount(1);
      expect(await accepted()).toBe(0);
      expect(await page.evaluate(() => (window as any).continuousHarness.processes.length)).toBe(1);
      if (fraction === -0.5) await cancelDrag();
      else {
        await page.mouse.up();
        await idle();
      }
      expect(await previewHash(page)).toBe(first);
      expect(await accepted()).toBe(0);
      expect((await layers())[0].translate).toBe(0);
    }
  });
  let second: string;
  await test.step('A valid raw-file swipe saves once and frees the old decoder before native processing', async () => {
    await page.evaluate((source) => {
      const h = (window as any).continuousHarness;
      h.outgoingSource = source;
      h.holdNextProcess = true;
    }, firstSource);
    const dx = await beginDrag(-0.5);
    expect((await layers())[0].translate).toBeCloseTo(dx, 0);
    expect(await accepted()).toBe(0);
    await info.attach('raw-file-mid-drag.png', {
      contentType: 'image/png',
      body: await page.screenshot(),
    });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).continuousHarness.releaseProcess))
      .toBe('function');
    expect(await accepted()).toBe(1);
    expect(await page.evaluate(() => (window as any).continuousHarness.processes.at(-1))).toEqual({
      accepted: 1,
      layers: 0,
      outgoingLive: false,
    });
    await expect(surface).toHaveCount(0);
    await page.evaluate(() => (window as any).continuousHarness.releaseProcess());
    second = await previewHash(page, firstSource);
    expect(second).not.toBe(first);
    await idle();
    const receipt = (await layers())[0];
    expect(receipt.natural[0] / receipt.natural[1]).toBeLessThan(0.3);
    expect(await accepted()).toBe(1);
    const saved = await page.evaluate(
      () =>
        (window as any).continuousHarness.events.find(
          (event: any) => event.type === 'page-accepted',
        ).data,
    );
    expect(saved.pageId).not.toBe(saved.draftId);
    await info.attach('raw-file-receipt-ready.png', {
      contentType: 'image/png',
      body: await page.screenshot(),
    });
  });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  expect(await previewHash(page)).toBe(first);
  await idle();
  await test.step('Ready A4 and receipt pages follow the finger from the matching edge in both directions', async () => {
    for (const direction of ['next', 'previous'] as const) {
      const beforeAccepted = await accepted();
      const urlCount = await page.evaluate(() => (window as any).continuousHarness.urls.size);
      const dx = await beginDrag(direction === 'next' ? -0.5 : 0.5);
      const neighbour = surface.locator('[data-motion-layer="neighbour"]');
      await expect(neighbour).toBeVisible();
      await expect.poll(async () => (await layers()).every((image) => image.ready)).toBe(true);
      const images = await layers();
      expect(images.map((image) => image.layer)).toEqual(['current', 'neighbour']);
      expect(images.map((image) => image.hash)).toEqual(
        direction === 'next' ? [first, second!] : [second!, first],
      );
      expect(images[0].translate).toBeCloseTo(dx, 0);
      expect(images[1].translate).toBeCloseTo(
        dx + (direction === 'next' ? 1 : -1) * images[0].available[0],
        0,
      );
      for (const image of images) {
        expect(image.visible).toBe('visible');
        expect(image.visibleWidth).toBeGreaterThan(5);
        expect(image.live).toBe(true);
        expect(image.rendered[0] / image.rendered[1]).toBeCloseTo(
          image.natural[0] / image.natural[1],
          3,
        );
        const fit = Math.min(
          1,
          (image.available[0] - 24) / image.natural[0],
          (image.available[1] - 24) / image.natural[1],
        );
        expect(image.rendered[0]).toBeCloseTo(image.natural[0] * fit, 0);
        expect(image.rendered[1]).toBeCloseTo(image.natural[1] * fit, 0);
      }
      expect(await accepted()).toBe(beforeAccepted);
      expect(await page.evaluate(() => (window as any).continuousHarness.urls.size)).toBe(
        urlCount + 1,
      );
      await info.attach(`ready-${direction}-mid-drag.png`, {
        contentType: 'image/png',
        body: await page.screenshot(),
      });
      await page.evaluate(() => {
        window.addEventListener(
          'pointerup',
          () => ((window as any).continuousHarness.swipeReleasedAt = performance.now()),
          { once: true },
        );
      });
      await page.mouse.up();
      // Mouse up generates the release click; it must keep both pages fitted.
      await expect(surface).toHaveAttribute('data-zoom', 'fit');
      await idle();
      expect(await previewHash(page)).toBe(direction === 'next' ? second! : first);
      expect(await accepted()).toBe(beforeAccepted + 1);
      await expect(surface.locator('[data-motion-layer]')).toHaveCount(1);
      await expect
        .poll(() => page.evaluate(() => (window as any).continuousHarness.urls.size))
        .toBe(urlCount);
      await expect
        .poll(() =>
          page.evaluate(
            () => performance.now() - (window as any).continuousHarness.swipeReleasedAt,
          ),
        )
        .toBeGreaterThanOrEqual(500);
      await surface.dispatchEvent('click', { detail: 1 });
      await expect(surface).toHaveAttribute('data-zoom', '100');
      await page.getByRole('button', { name: 'Fit image', exact: true }).click();
      await expect(surface).toHaveAttribute('data-zoom', 'fit');
    }
  });
  await test.step('Resize cancels a drag, while resize or reduced motion after acceptance finish the real navigation', async () => {
    const resize = () =>
      surface.evaluate((element: HTMLElement) => {
        element.style.width = `${element.getBoundingClientRect().width - 40}px`;
      });
    const restoreSize = () =>
      surface.evaluate((element: HTMLElement) => element.style.removeProperty('width'));
    const beforeAccepted = await accepted();
    await beginDrag(-0.5);
    await resize();
    await idle();
    await page.mouse.up();
    expect(await accepted()).toBe(beforeAccepted);
    expect(await previewHash(page)).toBe(first);
    await expect(surface.locator('[data-motion-layer]')).toHaveCount(1);
    await restoreSize();
    for (const interruption of ['resize', 'reduced-motion', 'footer'] as const) {
      const before = await accepted();
      await beginDrag(-0.5);
      await page.mouse.up();
      await expect(surface).toHaveAttribute('data-page-motion', 'navigating');
      // Hold a real in-progress exit so the interruption cannot race its 190 ms completion.
      await surface.evaluate((element) => {
        for (const animation of element.getAnimations({ subtree: true })) animation.pause();
      });
      expect(await accepted()).toBe(before + 1);
      if (interruption === 'resize') await resize();
      else if (interruption === 'reduced-motion')
        await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.getByRole('button', { name: 'Next', exact: true }).click();
      expect(await previewHash(page)).toBe(second!);
      await idle();
      await expect(surface.locator('[data-motion-layer]')).toHaveCount(1);
      expect(
        await surface.evaluate((element) => element.getAnimations({ subtree: true }).length),
      ).toBe(0);
      expect(await accepted()).toBe(before + (interruption === 'footer' ? 2 : 1));
      await restoreSize();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      expect(await previewHash(page)).toBe(first);
      await idle();
    }
  });
  await test.step('A failed neighbour decode and changed motion preference cancel without accepting', async () => {
    const beforeAccepted = await accepted();
    await beginDrag(-0.5);
    await expect(surface.locator('[data-motion-layer="neighbour"]')).toBeVisible();
    await surface.locator('[data-motion-layer="neighbour"]').dispatchEvent('error');
    await page.mouse.up();
    await idle();
    expect(await previewHash(page)).toBe(first);
    expect(await accepted()).toBe(beforeAccepted);
    await expect(surface.locator('[data-motion-layer]')).toHaveCount(1);
    await beginDrag(-0.5);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await idle();
    await page.mouse.up();
    expect(await accepted()).toBe(beforeAccepted);
    expect(await previewHash(page)).toBe(first);
    await beginDrag(-0.5);
    expect((await layers())[0].translate).toBe(0);
    expect(
      await surface.evaluate((element) => element.getAnimations({ subtree: true }).length),
    ).toBe(0);
    await page.mouse.up();
    await idle();
    expect(await previewHash(page)).toBe(second!);
    expect(await accepted()).toBe(beforeAccepted + 1);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await page.evaluate(() => (window as any).continuousHarness.controller.destroy());
  await expect.poll(() => page.evaluate(() => (window as any).continuousHarness.urls.size)).toBe(0);
  await test.step('Delayed raw processing failure and abort keep accepted bytes and release all owned resources', async () => {
    for (const fail of [true, false]) {
      await page.evaluate((fail) => {
        const h = (window as any).continuousHarness;
        h.events = [];
        h.results = [];
        h.open(
          'controller',
          { captureWorkflow: 'review-each' },
          {
            initialFiles: fail ? [h.files[0], h.corruptFile] : h.files,
          },
        );
      }, fail);
      expect(await previewHash(page)).toBe(first);
      await idle();
      await page.evaluate(() => ((window as any).continuousHarness.holdNextProcess = true));
      await beginDrag(-0.5);
      await page.mouse.up();
      await expect
        .poll(() => page.evaluate(() => typeof (window as any).continuousHarness.releaseProcess))
        .toBe('function');
      expect(await accepted()).toBe(1);
      if (fail) {
        await page.evaluate(() => (window as any).continuousHarness.releaseProcess());
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.locator('[data-motion-layer]')).toHaveCount(0);
        await page.getByRole('button', { name: 'Page 1: Edit', exact: true }).click();
        expect(await previewHash(page)).toBe(first);
        await idle();
        await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeDisabled();
      } else await page.evaluate(() => (window as any).continuousHarness.abort.abort());
      await page.evaluate(() => (window as any).continuousHarness.controller.destroy());
      await expect
        .poll(() =>
          page.evaluate(() => {
            const h = (window as any).continuousHarness;
            return [h.workers.size, h.urls.size, h.mount.childElementCount];
          }),
        )
        .toEqual([0, 0, 0]);
      if (!fail) {
        await page.evaluate(() => (window as any).continuousHarness.releaseProcess());
        await page.waitForTimeout(250);
      }
      expect(await page.evaluate(() => (window as any).continuousHarness.results)).toEqual([
        { status: 'cancelled' },
      ]);
      expect(await accepted()).toBe(1);
    }
  });
});

test('editing an accepted source at its exact original-byte budget does not count its cloned Blob twice', async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate(async () => {
    const h = (window as any).continuousHarness;
    const original = await new Promise<Blob>((resolve) =>
      h.canvas.toBlob((blob: Blob) => resolve(blob), 'image/png'),
    );
    const file = new File([original], 'bounded-synthetic.png', { type: 'image/png' });
    h.open('controller', { limits: { originalBytes: file.size } }, { initialFiles: [file] });
  });
  await waitForPreview(page);
  await page.getByRole('button', { name: /^Page overview/ }).click();
  await page.getByRole('button', { name: 'Page 1: Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Adjust corners', exact: true }).click();
  await page.getByRole('button', { name: 'Find edges', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply crop', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click();
  await waitForPreview(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).continuousHarness.results.length))
    .toBe(1);
  expect(
    await page.evaluate(() => {
      const h = (window as any).continuousHarness;
      return [h.results[0].status, h.results[0].pages.length, h.requests];
    }),
  ).toEqual(['confirmed', 1, 0]);
});
