import { build } from 'esbuild';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import { tool, closeTool } from './helpers';

let harness: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
        import React,{StrictMode} from './packages/scanner/node_modules/react/index.js';
        import {createRoot} from './packages/scanner/node_modules/react-dom/client.js';
        import {Scanner,createScanner} from './packages/scanner/dist/react/index.js';
        window.preferenceHarness={React,StrictMode,createRoot,Scanner,createScanner,
          changes:[],results:[],errors:[],events:[],requests:0,defaults:{initialMode:'auto',imageType:'image/jpeg'}};`,
    },
    bundle: true,
    format: 'esm',
    write: false,
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  harness = result.outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).preferenceHarness)).toBe(true);
  await page.evaluate(() => {
    const h = (window as any).preferenceHarness;
    h.mount = document.body.appendChild(document.createElement('div'));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          h.requests++;
          throw new DOMException('Synthetic denial', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    });
    h.base = {
      assetBaseUrl: '/scanner-assets/',
      shutterSound: 'off',
      createPdf: false,
      diagnostics: { onEvent: (event: any) => h.events.push(event) },
    };
    h.handle = (change: any, handler: string) => {
      h.changes.push({ handler, change });
      h.defaults[change.preference] = change.value;
      if (h.failure === 'throw') throw new Error('Synthetic host callback failure');
      if (h.failure === 'reject') return Promise.reject(new Error('Synthetic async host failure'));
      if (h.closeOnChange) void h.controller.destroy();
    };
    h.open = (api: string, locale = 'en', initialFiles?: File[], entry?: string) => {
      h.api = api;
      h.abort = new AbortController();
      if (api === 'controller') {
        h.controller = h.createScanner({
          ...h.base,
          ...h.defaults,
          locale,
          mount: h.mount,
          onPreferenceChange: (change: any) => h.handle(change, 'controller'),
        });
        h.pending = h.controller
          .open({ entry, initialFiles, signal: h.abort.signal })
          .then((r: any) => h.results.push(r));
      } else {
        h.root ??= h.createRoot(h.mount);
        h.render = (open: boolean, handler = 'first') =>
          h.root.render(
            h.React.createElement(
              h.StrictMode,
              null,
              h.React.createElement(h.Scanner, {
                open,
                className: open ? 'preference-open' : 'preference-closed',
                options: {
                  ...h.base,
                  ...h.defaults,
                  locale,
                  onPreferenceChange: (change: any) => h.handle(change, handler),
                },
                openOptions: { entry, initialFiles, signal: h.abort.signal },
                onResult: (r: any) => h.results.push(r),
                onError: (e: any) => h.errors.push(e.code),
              }),
            ),
          );
        h.render(true);
      }
    };
  });
});

for (const api of ['controller', 'react']) {
  for (const locale of ['en', 'de']) {
    test(`${api}/${locale}: real global UI changes survive cancellation and reapply without events`, async ({
      page,
    }) => {
      await page.evaluate(
        ({ api, locale }) => (window as any).preferenceHarness.open(api, locale),
        { api, locale },
      );
      const dialog = page.getByRole('dialog');
      const imageType = dialog.getByRole('combobox', {
        name: locale === 'de' ? 'Bildexport' : 'Image export',
        exact: true,
      });
      await expect(imageType).toHaveValue('image/jpeg');
      await imageType.selectOption('image/jpeg');
      expect(await page.evaluate(() => (window as any).preferenceHarness.changes)).toEqual([]);
      await imageType.selectOption('image/png');
      await imageType.selectOption('image/png');
      await dialog
        .getByRole('button', {
          name: locale === 'de' ? 'Kamera starten' : 'Start camera',
          exact: true,
        })
        .click();
      const mode = dialog.getByRole('combobox', {
        name: locale === 'de' ? 'Aufnahmemodus' : 'Capture mode',
        exact: true,
      });
      await expect(mode).toHaveValue('auto');
      await mode.selectOption('manual');
      await mode.selectOption('manual');
      await expect
        .poll(() => page.evaluate(() => (window as any).preferenceHarness.requests))
        .toBe(1);
      expect(
        await page.evaluate(() =>
          (window as any).preferenceHarness.changes.map((e: any) => e.change),
        ),
      ).toEqual([
        { preference: 'imageType', value: 'image/png' },
        { preference: 'initialMode', value: 'manual' },
      ]);
      await dialog
        .getByRole('button', {
          name: locale === 'de' ? 'Zurück zum Import' : 'Back to import',
          exact: true,
        })
        .click();
      await expect(imageType).toHaveValue('image/png');
      await dialog
        .getByRole('button', { name: locale === 'de' ? 'Schließen' : 'Close', exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => (window as any).preferenceHarness.results))
        .toEqual([{ status: 'cancelled' }]);
      await page.evaluate(async () => {
        const h = (window as any).preferenceHarness;
        if (h.api === 'controller') await h.controller.destroy();
        else h.render(false);
      });
      await expect(dialog).toHaveCount(0);
      if (api === 'react') await expect(page.locator('.preference-closed')).toHaveCount(1);
      await page.evaluate(
        ({ api, locale }) => (window as any).preferenceHarness.open(api, locale),
        { api, locale },
      );
      await expect(imageType).toHaveValue('image/png');
      await dialog
        .getByRole('button', {
          name: locale === 'de' ? 'Kamera starten' : 'Start camera',
          exact: true,
        })
        .click();
      await expect(mode).toHaveValue('manual');
      expect(await page.evaluate(() => (window as any).preferenceHarness.changes.length)).toBe(2);
      await page.evaluate(() => (window as any).preferenceHarness.abort.abort());
      await expect(dialog).toHaveCount(0);
      expect(
        await page.evaluate(() => {
          const h = (window as any).preferenceHarness;
          return {
            changes: h.changes.length,
            opens: h.events.filter((e: any) => e.type === 'session-open').length,
            closes: h.events.filter((e: any) => e.type === 'session-close').length,
            errors: h.errors,
          };
        }),
      ).toEqual({ changes: 2, opens: 2, closes: 2, errors: [] });
    });
  }
}

for (const failure of ['throw', 'reject']) {
  test(`host callback ${failure} cannot break UI changes or cancellation`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate((failure) => {
      const h = (window as any).preferenceHarness;
      h.failure = failure;
      h.open('controller');
    }, failure);
    const select = page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Image export', exact: true });
    await select.selectOption('image/png');
    await expect(select).toHaveValue('image/png');
    await select.selectOption('image/jpeg');
    await expect(select).toHaveValue('image/jpeg');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).preferenceHarness.results))
      .toEqual([{ status: 'cancelled' }]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as any).preferenceHarness.changes.length)).toBe(2);
  });
}

test('invalid select values and duplicate same-turn changes never escape the allowed preference contract', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).preferenceHarness.open('controller'));
  await page.getByRole('dialog').getByRole('button', { name: 'Start camera', exact: true }).click();
  const mode = page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Capture mode', exact: true });
  await mode.evaluate((select: HTMLSelectElement) => {
    select.add(new Option('Invalid', 'invalid'));
    select.value = 'invalid';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.value = 'manual';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(mode).toHaveValue('manual');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Back to import', exact: true })
    .click();
  const image = page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Image export', exact: true });
  await image.evaluate((select: HTMLSelectElement) => {
    select.add(new Option('Invalid', 'image/webp'));
    select.value = 'image/webp';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.value = 'image/png';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(image).toHaveValue('image/png');
  expect(
    await page.evaluate(() => (window as any).preferenceHarness.changes.map((e: any) => e.change)),
  ).toEqual([
    { preference: 'initialMode', value: 'manual' },
    { preference: 'imageType', value: 'image/png' },
  ]);
});

test('React direct-camera callback updates reach the current handler without opening a session or camera again', async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).preferenceHarness.open('react', 'en', undefined, 'camera'),
  );
  const dialog = page.getByRole('dialog');
  await expect.poll(() => page.evaluate(() => (window as any).preferenceHarness.requests)).toBe(1);
  await page.evaluate(() => (window as any).preferenceHarness.render(true, 'latest'));
  await dialog.getByRole('combobox', { name: 'Capture mode', exact: true }).selectOption('manual');
  await page.evaluate(() => (window as any).preferenceHarness.render(true, 'newest'));
  await dialog.getByRole('combobox', { name: 'Capture mode', exact: true }).selectOption('auto');
  expect(
    await page.evaluate(() => {
      const h = (window as any).preferenceHarness;
      return {
        handlers: h.changes.map((e: any) => e.handler),
        requests: h.requests,
        opens: h.events.filter((e: any) => e.type === 'session-open').length,
      };
    }),
  ).toEqual({ handlers: ['latest', 'newest'], requests: 1, opens: 1 });
  await page.evaluate(() => (window as any).preferenceHarness.root.unmount());
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).preferenceHarness.changes.length)).toBe(2);
});

test('a synchronous host close in a preference callback prevents subsequent changes in the same turn', async ({
  page,
}) => {
  await page.evaluate(() => {
    const h = (window as any).preferenceHarness;
    h.closeOnChange = true;
    h.open('controller');
  });
  const image = page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Image export', exact: true });
  await image.evaluate((select: HTMLSelectElement) => {
    select.value = 'image/png';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.value = 'image/jpeg';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).preferenceHarness.changes.map((e: any) => e.change)),
  ).toEqual([{ preference: 'imageType', value: 'image/png' }]);
  expect(await page.evaluate(() => (window as any).preferenceHarness.results)).toEqual([
    { status: 'cancelled' },
  ]);
});

test('page rotation and profile edits emit no global preferences; selected image type still controls confirmed blobs', async ({
  page,
}) => {
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.evaluate(async (data) => {
    const h = (window as any).preferenceHarness;
    h.file = new File([await (await fetch(data)).blob()], 'synthetic.png', { type: 'image/png' });
    h.open('controller', 'de', [h.file]);
  }, data);
  await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '90° drehen', exact: true }).click();
  await tool(page, 'Filter');
  await page.getByRole('button', { name: 'Graustufen', exact: true }).click();
  await closeTool(page);
  expect(await page.evaluate(() => (window as any).preferenceHarness.changes)).toEqual([]);
  await page.getByRole('button', { name: /^Seitenübersicht/ }).click();
  await page.getByRole('combobox', { name: 'Bildexport', exact: true }).selectOption('image/png');
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).preferenceHarness.results.length))
    .toBe(1);
  expect(
    await page.evaluate(() => {
      const h = (window as any).preferenceHarness,
        r = h.results[0];
      return {
        changes: h.changes.map((e: any) => e.change),
        status: r.status,
        pages: r.pages.length,
        mime: r.pages[0].image.type,
      };
    }),
  ).toEqual({
    changes: [{ preference: 'imageType', value: 'image/png' }],
    status: 'confirmed',
    pages: 1,
    mime: 'image/png',
  });
});

test('session-close diagnostics cannot reenter the UI and emit a late preference', async ({
  page,
}) => {
  await page.evaluate(() => {
    const h = (window as any).preferenceHarness;
    h.base.diagnostics.onEvent = (event: any) => {
      h.events.push(event);
      if (event.type === 'session-close') {
        const select = h.mount.querySelector('.scanner-footer select') as HTMLSelectElement;
        select.value = 'image/png';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    h.open('controller');
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(async () => {
    const h = (window as any).preferenceHarness;
    await h.controller.destroy();
    await h.pending;
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const h = (window as any).preferenceHarness;
      return {
        changes: h.changes,
        results: h.results,
        closes: h.events.filter((event: any) => event.type === 'session-close').length,
      };
    }),
  ).toEqual({ changes: [], results: [{ status: 'cancelled' }], closes: 1 });
});
