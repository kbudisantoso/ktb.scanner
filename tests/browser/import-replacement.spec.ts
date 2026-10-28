import { build } from 'esbuild';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { previewHash as imageHash } from './helpers';
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
        import {createScanicAdapter} from './packages/scanner/dist/scanic.js';
        import {resolveLimits} from './packages/scanner/dist/index.js';
        window.replacementHarness={React,StrictMode,createRoot,Scanner,createScanner,createScanicAdapter,resolveLimits,
          results:[],events:[],errors:[],requests:0,jobs:[],workers:new Set(),urls:new Set()};`,
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
  await expect.poll(() => page.evaluate(() => !!(window as any).replacementHarness)).toBe(true);
  const documents = [];
  for (const index of [1, 3])
    documents.push(await page.evaluate(fixtureInBrowser, fixtures[index]));
  await page.evaluate(async (documents) => {
    const h = (window as any).replacementHarness;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        h.workers.add(this);
        this.addEventListener('message', (event) => {
          if (event.data.result) h.lastWorkerResult = event.data.result;
        });
      }
      postMessage(message: any, transfer?: any) {
        if (message.kind === 'process') {
          h.jobs.push({ limits: message.request.limits });
          if (h.hold) {
            h.late = () =>
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: { id: message.id, result: h.lastWorkerResult },
                }),
              );
            return;
          }
        }
        super.postMessage(message, transfer ?? []);
      }
      terminate() {
        h.workers.delete(this);
        super.terminate();
      }
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      const url = create(blob);
      h.urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      h.urls.delete(url);
      revoke(url);
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          h.requests++;
          throw new DOMException('No camera for imports', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    });
    h.files = await Promise.all(
      documents.map(
        async (url, index) =>
          new File([await (await fetch(url)).blob()], `synthetic-${index}.png`, {
            type: 'image/png',
          }),
      ),
    );
    for (const color of ['#000', '#fff']) {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, 600, 800);
      h.files.push(
        new File(
          [await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))],
          `blank-${h.files.length}.png`,
          { type: 'image/png' },
        ),
      );
    }
    h.mount = document.body.appendChild(document.createElement('div'));
    h.start = async (
      api: string,
      locale: string,
      indexes: number[],
      budget?: string,
      texts?: any,
    ) => {
      h.abort = new AbortController();
      let limits;
      if (budget === 'originalBytes') limits = { originalBytes: h.files[0].size * 2 - 1 };
      if (budget === 'workingBytes') limits = { workingBytes: 1000 * 1300 * 8 + 8_000_000 * 24 };
      if (budget === 'resultBytes') {
        const engine = h.createScanicAdapter('/scanner-assets/');
        try {
          const result = await engine.process({
            original: h.files[0],
            limits: h.resolveLimits(),
            rotation: 0,
            recipe: { version: 1, enhancement: 'none', dewarp: 'off' },
            revision: 1,
            mime: 'image/jpeg',
          });
          limits = {
            resultBytes:
              result.preview.size +
              result.thumbnail.size +
              (result.unoptimizedPreview?.size ?? 0) +
              1,
          };
        } finally {
          engine.destroy();
        }
      }
      h.options = {
        mount: h.mount,
        assetBaseUrl: '/scanner-assets/',
        locale,
        texts,
        limits,
        defaultProfile: 'photo',
        includeOriginals: true,
        createPdf: false,
        shutterSound: 'off',
        diagnostics: { onEvent: (event: any) => h.events.push(event) },
      };
      const initial = {
        initialFiles: indexes.map((index) => h.files[index]),
        signal: h.abort.signal,
      };
      if (api === 'controller') {
        h.controller = h.createScanner(h.options);
        h.pending = h.controller.open(initial).then((result: any) => h.results.push(result));
      } else {
        h.root = h.createRoot(h.mount);
        h.render = (open: boolean) =>
          h.root.render(
            h.React.createElement(
              h.StrictMode,
              null,
              h.React.createElement(h.Scanner, {
                open,
                className: open ? 'replacement-open' : 'replacement-closed',
                options: h.options,
                openOptions: initial,
                onResult: (result: any) => h.results.push(result),
                onError: (error: any) => h.errors.push(error.code),
              }),
            ),
          );
        h.render(true);
      }
    };
  }, documents);
});

async function start(
  page: Page,
  api = 'controller',
  locale = 'en',
  indexes = [0],
  budget?: string,
) {
  await page.evaluate(
    ({ api, locale, indexes, budget }) =>
      (window as any).replacementHarness.start(api, locale, indexes, budget),
    { api, locale, indexes, budget },
  );
}
async function file(page: Page, index: number) {
  return {
    name: 'same-name.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      await page.evaluate(
        async (index) =>
          Array.from(
            new Uint8Array(await (window as any).replacementHarness.files[index].arrayBuffer()),
          ),
        index,
      ),
    ),
  };
}
async function choose(page: Page, index: number, name = /^(Replace image|Bild tauschen)$/) {
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name, exact: true }).click();
  const chooser = await picker;
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles(await file(page, index));
}
async function result(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as any).replacementHarness.results.length))
    .toBe(1);
  return page.evaluate(async () => {
    const h = (window as any).replacementHarness,
      result = h.results[0];
    return {
      status: result.status,
      requests: h.requests,
      errors: h.errors,
      pages: await Promise.all(
        (result.pages ?? []).map(async (page: any) => ({
          id: page.id,
          revision: page.revision,
          source: page.metadata.source,
          original: Array.from(new Uint8Array(await page.original.arrayBuffer())),
        })),
      ),
    };
  });
}

test.describe('replacement picker at a mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const api of ['controller', 'react'])
    for (const locale of ['en', 'de']) {
      test(`${api}/${locale}: direct single-file replacement, picker cancellation and same filename preserve one page`, async ({
        page,
      }, info) => {
        await start(page, api, locale);
        const replace = page.getByRole('button', {
          name: locale === 'de' ? 'Bild tauschen' : 'Replace image',
          exact: true,
        });
        await expect(replace).toBeVisible();
        const before = await imageHash(page);
        const picker = page.waitForEvent('filechooser');
        await replace.click();
        const chooser = await picker;
        expect(chooser.isMultiple()).toBe(false);
        await page.getByRole('dialog').focus();
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(replace).toBeFocused();
        await chooser.setFiles([]);
        await expect(replace).toBeFocused();
        expect(await imageHash(page)).toBe(before);
        const secondPicker = page.waitForEvent('filechooser');
        await replace.click();
        const cancelledChooser = await secondPicker;
        await page.locator('.scanner input[type=file]:not([multiple])').dispatchEvent('cancel');
        await cancelledChooser.setFiles([]);
        await expect(replace).toBeFocused();
        expect(await imageHash(page)).toBe(before);
        const previousSrc = await page
          .getByRole('img', { name: /^(Edited page|Bearbeitete Seite)$/, exact: true })
          .getAttribute('src');
        expect(previousSrc).toMatch(/^blob:/);
        await choose(page, 1);
        expect(await imageHash(page, previousSrc)).not.toBe(before);
        const processed = await page.evaluate(() => (window as any).replacementHarness.jobs.length);
        await choose(page, 1);
        await expect
          .poll(() => page.evaluate(() => (window as any).replacementHarness.jobs.length))
          .toBe(processed + 1);
        await expect(replace).toBeEnabled();
        if (api === 'controller' && locale === 'de') {
          const screenshot = info.outputPath('mobile-import-replace-image.png');
          await page.screenshot({ path: screenshot });
          await info.attach('mobile-import-replace-image', {
            path: screenshot,
            contentType: 'image/png',
          });
        }
        await page
          .getByRole('button', { name: locale === 'de' ? 'Abschließen' : 'Finish', exact: true })
          .click();
        const finished = await result(page);
        expect(finished.status).toBe('confirmed');
        expect(finished.requests).toBe(0);
        expect(finished.errors).toEqual([]);
        expect(finished.pages).toHaveLength(1);
        expect(finished.pages[0].source).toBe('file');
        expect(finished.pages[0].original).toEqual(Array.from((await file(page, 1)).buffer));
      });
    }
});

test('replacement honors text overrides and rejects an injected multi-file selection without changing the candidate', async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).replacementHarness.start('controller', 'en', [0], undefined, {
      'Replace image': 'Choose replacement',
    }),
  );
  const replace = page.getByRole('button', { name: 'Choose replacement', exact: true });
  await expect(replace).toBeVisible();
  const before = await imageHash(page);
  const picker = page.waitForEvent('filechooser');
  await replace.click();
  await picker;
  await page
    .locator('.scanner input[type=file]:not([multiple])')
    .evaluate((input: HTMLInputElement) => {
      const h = (window as any).replacementHarness,
        transfer = new DataTransfer();
      transfer.items.add(h.files[0]);
      transfer.items.add(h.files[1]);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Choose exactly one image',
  );
  expect(await imageHash(page)).toBe(before);
  expect(await page.evaluate(() => (window as any).replacementHarness.requests)).toBe(0);
});

test('replacement preserves the remaining import queue and does not accept the first candidate early', async ({
  page,
}) => {
  await start(page, 'controller', 'en', [0, 1]);
  await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeVisible();
  await choose(page, 0);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as any).replacementHarness.events.filter(
          (event: any) => event.type === 'page-accepted',
        ).length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const finished = await result(page);
  expect(finished.pages).toHaveLength(2);
  expect(finished.requests).toBe(0);
  for (const index of [0, 1])
    expect(finished.pages[index].original).toEqual(Array.from((await file(page, index)).buffer));
});

test('Escape from required initial corners discards only that candidate and preserves the import queue', async ({
  page,
}) => {
  await start(page, 'controller', 'en', [2, 1]);
  await expect(
    page.getByRole('heading', { name: 'Set document corners', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
  const find = page.getByRole('button', { name: 'Find edges', exact: true });
  await expect(find).toBeEnabled();
  const jobs = await page.evaluate(() => {
    const h = (window as any).replacementHarness;
    h.hold = true;
    h.searchWorker = [...h.workers][0];
    return h.jobs.length;
  });
  await find.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).replacementHarness.jobs.length))
    .toBe(jobs + 1);
  await expect(page.locator('.scanner-corners')).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => ((window as any).replacementHarness.hold = false));
  await page.getByRole('dialog').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeEnabled();
  await expect(page.getByRole('img', { name: 'Edited page', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).replacementHarness.late());
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const h = (window as any).replacementHarness;
      return {
        results: h.results.length,
        accepted: h.events.filter((e: any) => e.type === 'page-accepted').length,
        searchWorkerAlive: h.workers.has(h.searchWorker),
        activeWorkers: h.workers.size,
      };
    }),
  ).toEqual({ results: 0, accepted: 0, searchWorkerAlive: false, activeWorkers: 1 });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const finished = await result(page);
  expect(finished.status).toBe('confirmed');
  expect(finished.requests).toBe(0);
  expect(finished.pages).toHaveLength(1);
  expect(finished.pages[0].original).toEqual(Array.from((await file(page, 1)).buffer));
});

for (const baseline of [0, 2]) {
  test(`unconfirmed replacement crop cancels back to the previous ${baseline === 0 ? 'review' : 'required crop'} with unchanged original`, async ({
    page,
  }) => {
    await start(page, 'controller', 'en', [baseline, 1]);
    await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeVisible();
    const before = baseline === 0 ? await imageHash(page) : undefined;
    await choose(page, 3);
    await expect(
      page.getByRole('heading', { name: 'Set document corners', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    if (baseline === 0) {
      await page.getByRole('dialog').focus();
      await page.keyboard.press('Escape');
    } else await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeFocused();
    if (baseline === 0) expect(await imageHash(page)).toBe(before);
    else {
      await expect(
        page.getByRole('heading', { name: 'Set document corners', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Apply crop', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    const finished = await result(page);
    expect(finished.pages).toHaveLength(2);
    expect(finished.requests).toBe(0);
    expect(finished.pages[0].original).toEqual(Array.from((await file(page, baseline)).buffer));
    expect(finished.pages[1].original).toEqual(Array.from((await file(page, 1)).buffer));
  });
}

test('add, discard and accepted file replacement preserve the saved page; replacement remains atomic', async ({
  page,
}) => {
  await start(page);
  await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).replacementHarness.requests)).toBe(1);
  await expect(page.getByRole('dialog')).toHaveClass(/scanner-camera-mode/);
  await expect(page.getByRole('button', { name: 'Resume camera', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to import', exact: true }).click();
  await expect(page.locator('.scanner-pages article')).toHaveCount(1);
  const original = await page.evaluate(
    () =>
      (window as any).replacementHarness.events.find((event: any) => event.type === 'page-accepted')
        .data.pageId,
  );
  await page.getByRole('button', { name: 'Page 1: Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate 90°', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Discard capture', exact: true }).click();
  await expect(page.locator('.scanner-pages article')).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        (window as any).replacementHarness.events.filter(
          (event: any) => event.type === 'page-accepted',
        ).length,
    ),
  ).toBe(1);
  const actions = page.getByRole('button', { name: 'Page 1: Page actions', exact: true });
  await actions.click();
  let picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await (
    await picker
  ).setFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace', exact: true })).toBeFocused();
  picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await (await picker).setFiles(await file(page, 2));
  await expect(
    page.getByRole('heading', { name: 'Set document corners', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.scanner-pages article')).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        (window as any).replacementHarness.events.filter(
          (event: any) => event.type === 'page-accepted',
        ).length,
    ),
  ).toBe(1);
  picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await (await picker).setFiles(await file(page, 1));
  await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const finished = await result(page);
  expect(finished.pages).toHaveLength(1);
  expect(finished.requests).toBe(1);
  expect(finished.pages[0]).toMatchObject({ id: original, revision: 2, source: 'file' });
  expect(finished.pages[0].original).toEqual(Array.from((await file(page, 1)).buffer));
});

for (const budget of ['originalBytes', 'workingBytes', 'resultBytes']) {
  test(`rollback storage counts toward ${budget} and rejection retains the original candidate`, async ({
    page,
  }) => {
    await start(page, 'controller', 'en', [0], budget);
    await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeVisible();
    const before = await imageHash(page);
    await choose(page, 0);
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeEnabled();
    expect(await imageHash(page)).toBe(before);
    await page.getByRole('button', { name: 'Compare original', exact: true }).click();
    const original = await page
      .getByRole('img', { name: 'Original capture', exact: true })
      .evaluate(async (image: HTMLImageElement) =>
        Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer())),
      );
    expect(original).toEqual(Array.from((await file(page, 0)).buffer));
    await page.evaluate(() => (window as any).replacementHarness.controller.destroy());
    const finished = await result(page);
    expect(finished.status).toBe('cancelled');
    expect(finished.requests).toBe(0);
  });
}

for (const scenario of [
  { api: 'controller', end: 'abort', processing: false },
  { api: 'controller', end: 'destroy', processing: true },
  { api: 'react', end: 'close', processing: false },
  { api: 'react', end: 'close', processing: true },
]) {
  test(`${scenario.api}/${scenario.end}/${scenario.processing ? 'worker' : 'picker'}: close ignores late files/results and releases resources`, async ({
    page,
  }) => {
    await start(page, scenario.api);
    await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeVisible();
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Replace image', exact: true }).click();
    const chooser = await picker;
    await page.evaluate(() => {
      const h = (window as any).replacementHarness;
      h.detachedInput = h.mount.querySelector('input[type=file]:not([multiple])');
    });
    if (scenario.processing) {
      await page.evaluate(() => {
        (window as any).replacementHarness.hold = true;
      });
      await chooser.setFiles(await file(page, 1));
      await expect
        .poll(() => page.evaluate(() => !!(window as any).replacementHarness.late))
        .toBe(true);
    }
    await page.evaluate(async (scenario) => {
      const h = (window as any).replacementHarness;
      if (scenario.end === 'abort') h.abort.abort();
      else if (scenario.end === 'destroy') await h.controller.destroy();
      else h.render(false);
    }, scenario);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).replacementHarness.events.filter(
              (event: any) => event.type === 'session-close',
            ).length,
        ),
      )
      .toBe(1);
    await page.evaluate(() => {
      const h = (window as any).replacementHarness;
      const transfer = new DataTransfer();
      transfer.items.add(h.files[1]);
      h.detachedInput.files = transfer.files;
      h.detachedInput.dispatchEvent(new Event('change', { bubbles: true }));
      h.late?.();
      window.dispatchEvent(new Event('focus'));
    });
    expect(
      await page.evaluate(() => {
        const h = (window as any).replacementHarness;
        return {
          results: h.results,
          errors: h.errors,
          workers: h.workers.size,
          urls: h.urls.size,
          requests: h.requests,
          sessions: h.events.filter((event: any) => event.type === 'session-close').length,
        };
      }),
    ).toEqual({
      results: scenario.api === 'react' ? [] : [{ status: 'cancelled' }],
      errors: [],
      workers: 0,
      urls: 0,
      requests: 0,
      sessions: 1,
    });
  });
}
