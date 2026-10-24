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
    h.controller = h.createScanner({ mount, assetBaseUrl: '/scanner-assets/' });
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
      h.controller = h.createScanner({ mount, assetBaseUrl: '/scanner-assets/' });
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
