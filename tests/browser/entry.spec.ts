import { build } from 'esbuild';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';

let harness: string;
test.beforeAll(async () => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
        import React,{StrictMode} from './packages/scanner/node_modules/react/index.js';
        import {createRoot} from './packages/scanner/node_modules/react-dom/client.js';
        import {Scanner,createScanner} from './packages/scanner/dist/react/index.js';
        window.entryHarness={React,StrictMode,createRoot,Scanner,createScanner,
          requests:[],stops:0,events:[],results:[],errors:[],workers:new Set()};`,
    },
    bundle: true,
    format: 'esm',
    write: false,
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  harness = bundle.outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).entryHarness)).toBe(true);
  await page.evaluate(() => {
    const h = (window as any).entryHarness;
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
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: (constraints: unknown) =>
          new Promise((resolve, reject) => h.requests.push({ constraints, resolve, reject })),
        enumerateDevices: async () => [],
      },
    });
    h.mount = document.body.appendChild(document.createElement('div'));
    h.options = {
      mount: h.mount,
      assetBaseUrl: '/scanner-assets/',
      shutterSound: 'off',
      createPdf: false,
      diagnostics: { onEvent: (e: any) => h.events.push(e) },
    };
    h.open = (api: string, openOptions: any = {}, locale = 'en') => {
      h.abort = new AbortController();
      const initial = { ...openOptions, signal: h.abort.signal };
      if (api === 'controller') {
        h.controller = h.createScanner({ ...h.options, locale });
        h.pending = h.controller.open(initial).then((r: any) => h.results.push(r));
      } else {
        h.root ??= h.createRoot(h.mount);
        h.render = (open: boolean) =>
          h.root.render(
            h.React.createElement(
              h.StrictMode,
              null,
              h.React.createElement(h.Scanner, {
                open,
                className: open ? 'entry-host-open' : 'entry-host-closed',
                options: { ...h.options, locale },
                openOptions: initial,
                onResult: (r: any) => h.results.push(r),
                onError: (e: any) => h.errors.push(e.code),
              }),
            ),
          );
        h.render(true);
      }
    };
    h.lateStreams = () => {
      for (const request of h.requests)
        request.resolve({
          getTracks: () => [{ stop: () => h.stops++ }, { stop: () => h.stops++ }],
        });
    };
  });
});

for (const api of ['controller', 'react']) {
  test(`${api}: default/empty files preserve workspace; camera entry is separate from mode`, async ({
    page,
  }) => {
    await page.evaluate((api) => (window as any).entryHarness.open(api, { initialFiles: [] }), api);
    await expect(page.locator('.scanner-workspace')).toBeVisible();
    expect(await page.evaluate(() => (window as any).entryHarness.requests.length)).toBe(0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).entryHarness.results.length))
      .toBe(1);
    await page.evaluate(async (api) => {
      const h = (window as any).entryHarness;
      if (api === 'react') h.render(false);
      else await h.controller.destroy();
    }, api);
    await expect(page.locator('.scanner')).toHaveCount(0);
    if (api === 'react') await expect(page.locator('.entry-host-closed')).toHaveCount(1);
    await page.evaluate(() => {
      (window as any).entryHarness.options.initialMode = 'manual';
    });
    await page.evaluate(
      (api) => (window as any).entryHarness.open(api, { entry: 'camera', initialFiles: [] }),
      api,
    );
    await expect(page.locator('.scanner-camera-mode video')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Capture mode', exact: true })).toHaveValue(
      'manual',
    );
    expect(
      await page.evaluate(() =>
        (window as any).entryHarness.requests.map((r: any) => r.constraints.audio),
      ),
    ).toEqual([false]);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).entryHarness.results.length))
      .toBe(2);
    await page.evaluate(() => (window as any).entryHarness.lateStreams());
    await expect.poll(() => page.evaluate(() => (window as any).entryHarness.stops)).toBe(2);
    expect(
      await page.evaluate(
        () =>
          (window as any).entryHarness.events.filter((e: any) => e.type === 'session-open').length,
      ),
    ).toBe(2);
  });

  test(`${api}: camera entry with nonempty files imports without permission and confirms blobs`, async ({
    page,
  }) => {
    const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
    await page.evaluate(
      async ({ api, data }) => {
        const h = (window as any).entryHarness;
        const file = new File([await (await fetch(data)).blob()], 'synthetic.png', {
          type: 'image/png',
        });
        h.open(api, { entry: 'camera', initialFiles: [file] }, 'de');
      },
      { api, data },
    );
    await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).entryHarness.requests.length)).toBe(0);
    await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).entryHarness.results.length))
      .toBe(1);
    expect(
      await page.evaluate(() => {
        const h = (window as any).entryHarness,
          r = h.results[0];
        return {
          status: r.status,
          pages: r.pages.length,
          blob: r.pages[0].image instanceof Blob,
          workers: h.workers.size,
        };
      }),
    ).toEqual({ status: 'confirmed', pages: 1, blob: true, workers: 0 });
  });

  test(`${api}: denied camera allows retry, direct import and cancellation in German`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.evaluate(
      (api) => (window as any).entryHarness.open(api, { entry: 'camera' }, 'de'),
      api,
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).entryHarness.requests.length))
      .toBe(1);
    await page.evaluate(() =>
      (window as any).entryHarness.requests[0].reject(
        new DOMException('Denied', 'NotAllowedError'),
      ),
    );
    await expect(page.locator('.scanner-camera-error')).toBeVisible();
    await info.attach('direct-camera-denied', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Kamera fortsetzen', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).entryHarness.requests.length))
      .toBe(2);
    const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Bilder importieren', exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1], 'base64'),
    });
    await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.getByRole('button', { name: 'Scans verwerfen', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).entryHarness.results))
      .toEqual([{ status: 'cancelled' }]);
    await page.evaluate(() => (window as any).entryHarness.lateStreams());
    await expect.poll(() => page.evaluate(() => (window as any).entryHarness.stops)).toBe(2);
    expect(await page.evaluate(() => (window as any).entryHarness.workers.size)).toBe(0);
  });
}

test('invalid entry values reject before resources, even with files; pre-abort never requests camera', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const h = (window as any).entryHarness,
      c = h.createScanner(h.options),
      invalid = [];
    for (const entry of ['', null, 0, false, 'manual', 'CAMERA', {}]) {
      invalid.push(
        await c
          .open({ entry, initialFiles: [new File(['x'], 'synthetic.png')] })
          .catch((e: any) => e.code),
      );
    }
    const abort = new AbortController();
    abort.abort();
    const pre = await c.open({ entry: 'camera', signal: abort.signal });
    const fast = c.open({ entry: 'camera' });
    await c.destroy();
    const closed = await fast;
    return {
      invalid,
      pre,
      closed,
      requests: h.requests.length,
      children: h.mount.childElementCount,
    };
  });
  expect(result).toEqual({
    invalid: Array(7).fill('CONFIG_INVALID'),
    pre: { status: 'cancelled' },
    closed: { status: 'cancelled' },
    requests: 0,
    children: 0,
  });
});

for (const stop of ['abort', 'destroy', 'react-close', 'react-unmount']) {
  test(`pending camera/${stop}: late tracks stop and sessions close once`, async ({ page }) => {
    await page.evaluate(
      (stop) =>
        (window as any).entryHarness.open(stop.startsWith('react') ? 'react' : 'controller', {
          entry: 'camera',
        }),
      stop,
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).entryHarness.requests.length))
      .toBe(1);
    await page.evaluate(async (stop) => {
      const h = (window as any).entryHarness;
      if (stop === 'abort') h.abort.abort();
      if (stop === 'destroy') await h.controller.destroy();
      if (stop === 'react-close') h.render(false);
      if (stop === 'react-unmount') h.root.unmount();
    }, stop);
    await expect(page.locator('.scanner')).toHaveCount(0);
    await page.evaluate(() => (window as any).entryHarness.lateStreams());
    await expect.poll(() => page.evaluate(() => (window as any).entryHarness.stops)).toBe(2);
    expect(
      await page.evaluate(() => {
        const h = (window as any).entryHarness;
        return {
          opens: h.events.filter((e: any) => e.type === 'session-open').length,
          closes: h.events.filter((e: any) => e.type === 'session-close').length,
          workers: h.workers.size,
          results: h.results,
          errors: h.errors,
        };
      }),
    ).toEqual({
      opens: 1,
      closes: 1,
      workers: 0,
      results: stop.startsWith('react') ? [] : [{ status: 'cancelled' }],
      errors: [],
    });
  });
}

test('abort/destroy and reentrant open during session-open diagnostics cannot start resources', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const h = (window as any).entryHarness,
      outcomes = [];
    for (const action of ['abort', 'destroy']) {
      const abort = new AbortController(),
        events: any[] = [];
      let nested: Promise<string> | undefined;
      const c = h.createScanner({
        ...h.options,
        diagnostics: {
          onEvent: (e: any) => {
            events.push(e.type);
            if (e.type !== 'session-open') return;
            nested = c.open({ entry: 'camera' }).catch((e: any) => e.code);
            if (action === 'abort') abort.abort();
            else void c.destroy();
          },
        },
      });
      const result = await c.open({ entry: 'camera', signal: abort.signal });
      outcomes.push({ result, nested: await nested, events });
      await c.destroy();
    }
    return { outcomes, requests: h.requests.length, children: h.mount.childElementCount };
  });
  expect(result).toEqual({
    outcomes: Array.from({ length: 2 }, () => ({
      result: { status: 'cancelled' },
      nested: 'SCANNER_BUSY',
      events: ['session-open', 'session-close'],
    })),
    requests: 0,
    children: 0,
  });
});

for (const locale of ['en', 'de']) {
  test(`React invalid entry is localized/${locale} without opening`, async ({ page }) => {
    await page.evaluate(
      (locale) => (window as any).entryHarness.open('react', { entry: 'invalid' }, locale),
      locale,
    );
    await expect(page.locator('.entry-host-open').getByRole('alert')).toHaveText(
      locale === 'de' ? 'Ungültiger Scanner-Einstieg.' : 'Invalid scanner entry.',
    );
    expect(
      await page.evaluate(() => ({
        errors: (window as any).entryHarness.errors,
        requests: (window as any).entryHarness.requests.length,
      })),
    ).toEqual({ errors: ['CONFIG_INVALID'], requests: 0 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
