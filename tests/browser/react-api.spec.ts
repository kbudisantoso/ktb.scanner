import { acceptPage } from './helpers';
import { build } from 'esbuild';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import { tool } from './helpers';
let harness: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
 import React,{StrictMode} from './packages/scanner/node_modules/react/index.js';
 import {createRoot} from './packages/scanner/node_modules/react-dom/client.js';
 import {Scanner,createScanner} from './packages/scanner/dist/react/index.js';
 window.reactHarness={React,StrictMode,createRoot,Scanner,createScanner,events:[],results:[],errors:[]};
 `,
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
  await expect.poll(() => page.evaluate(() => !!(window as any).reactHarness)).toBe(true);
});
for (const [configured, requested, expected] of [
  [undefined, undefined, 'Auto'],
  ['photo', undefined, 'Foto'],
  ['photo', 'bw', 'Schwarz-Weiß'],
  ['color', 'auto', 'Auto'],
] as const) {
  test(`controller profile ${configured}/${requested} resolves to ${expected} for every initial page`, async ({
    page,
  }) => {
    const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
    await page.evaluate(
      async ({ data, configured, requested }) => {
        const h = (window as any).reactHarness;
        h.mount = document.body.appendChild(document.createElement('div'));
        h.controller = h.createScanner({
          locale: 'de',
          mount: h.mount,
          assetBaseUrl: '/scanner-assets/',
          defaultProfile: configured,
        });
        const file = new File([await (await fetch(data)).blob()], 'fixture.png', {
          type: 'image/png',
        });
        h.promise = h.controller.open({ defaultProfile: requested, initialFiles: [file, file] });
      },
      { data, configured, requested },
    );
    for (const index of [1, 2]) {
      await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toBeVisible();
      await tool(page, 'Filter');
      await expect(
        page.getByRole('group', { name: 'Bildprofil', exact: true }).getByRole('button'),
      ).toHaveCount(5);
      await expect(page.getByRole('button', { name: expected, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await acceptPage(page);
    }
    await page.evaluate(async () => {
      const h = (window as any).reactHarness;
      await h.controller.destroy();
      h.mount.remove();
    });
  });
}
test('invalid configuration and per-open profile fail before creating a dialog', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const h = (window as any).reactHarness,
      mount = document.body.appendChild(document.createElement('div'));
    let configured;
    try {
      h.createScanner({
        locale: 'de',
        mount,
        assetBaseUrl: '/scanner-assets/',
        defaultProfile: 'document',
      });
    } catch (e: any) {
      configured = e.code;
    }
    const controller = h.createScanner({ locale: 'de', mount, assetBaseUrl: '/scanner-assets/' });
    const requested = await controller
      .open({ defaultProfile: 'invalid' })
      .catch((e: any) => e.code);
    const children = mount.childElementCount;
    await controller.destroy();
    mount.remove();
    return { configured, requested, children };
  });
  expect(result).toEqual({
    configured: 'CONFIG_INVALID',
    requested: 'CONFIG_INVALID',
    children: 0,
  });
});
test('stability configuration and per-open overrides are validated before opening and recorded', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const h = (window as any).reactHarness;
    const mount = document.body.appendChild(document.createElement('div'));
    const invalid: string[] = [];
    for (const value of [0, 99, 100.5, 5001, NaN, Infinity, null, '100']) {
      try {
        h.createScanner({
          locale: 'de',
          mount,
          assetBaseUrl: '/scanner-assets/',
          autoCaptureStabilityMs: value,
        });
        invalid.push('accepted');
      } catch (error: any) {
        invalid.push(error.code);
      }
      const controller = h.createScanner({ locale: 'de', mount, assetBaseUrl: '/scanner-assets/' });
      invalid.push(
        await controller.open({ autoCaptureStabilityMs: value }).catch((error: any) => error.code),
      );
      await controller.destroy();
    }
    const childrenAfterInvalid = mount.childElementCount;
    const durations: number[] = [];
    for (const [configured, requested] of [
      [undefined, undefined],
      [5000, undefined],
      [5000, 100],
      [1000, 875],
    ]) {
      const controller = h.createScanner({
        locale: 'de',
        mount,
        assetBaseUrl: '/scanner-assets/',
        autoCaptureStabilityMs: configured,
        diagnostics: {
          onEvent: (event: any) => {
            if (event.type === 'session-open') durations.push(event.data.autoCaptureStabilityMs);
          },
        },
      });
      const pending = controller.open({ autoCaptureStabilityMs: requested });
      await controller.destroy();
      await pending;
    }
    mount.remove();
    return { invalid, childrenAfterInvalid, durations };
  });
  expect(result.invalid).toEqual(Array(16).fill('CONFIG_INVALID'));
  expect(result.childrenAfterInvalid).toBe(0);
  expect(result.durations).toEqual([1000, 5000, 100, 875]);
});
test('declarative component survives StrictMode and callback updates, snapshots options, cleans up and reopens', async ({
  page,
}) => {
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.evaluate(async (data) => {
    const h = (window as any).reactHarness;
    h.mount = document.body.appendChild(document.createElement('div'));
    h.root = h.createRoot(h.mount);
    h.file = new File([await (await fetch(data)).blob()], 'fixture.png', { type: 'image/png' });
    h.render = (open: boolean, profile: string, callback: string) =>
      h.root.render(
        h.React.createElement(
          h.StrictMode,
          null,
          h.React.createElement(h.Scanner, {
            open,
            className: 'host-scanner',
            options: {
              locale: 'de',
              assetBaseUrl: '/scanner-assets/',
              defaultProfile: profile,
              theme: { '--scanner-accent': '#4931aa' },
              diagnostics: { onEvent: (e: any) => h.events.push(e) },
            },
            openOptions: { initialFiles: [h.file] },
            onResult: (result: any) => h.results.push({ callback, result }),
            onError: (e: any) => h.errors.push(e.code),
          }),
        ),
      );
    h.render(true, 'photo', 'first');
  }, data);
  await tool(page, 'Filter');
  await expect(page.getByRole('button', { name: 'Foto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.evaluate(() => (window as any).reactHarness.render(true, 'bw', 'latest'));
  await expect(page.getByRole('button', { name: 'Foto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await page
      .locator('.scanner')
      .evaluate((e) => getComputedStyle(e).getPropertyValue('--scanner-accent').trim()),
  ).toBe('#4931aa');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Scans verwerfen', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).reactHarness.results))
    .toEqual([{ callback: 'latest', result: { status: 'cancelled' } }]);
  expect(
    await page.evaluate(
      () =>
        (window as any).reactHarness.events.filter((e: any) => e.type === 'session-open').length,
    ),
  ).toBe(1);
  await page.evaluate(() => (window as any).reactHarness.render(false, 'bw', 'latest'));
  await expect(page.locator('.host-scanner .scanner-backdrop')).toHaveCount(0);
  await page.evaluate(() => (window as any).reactHarness.render(true, 'bw', 'reopened'));
  await tool(page, 'Filter');
  await expect(page.getByRole('button', { name: 'Schwarz-Weiß', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.evaluate(() => {
    const h = (window as any).reactHarness;
    h.root.unmount();
    h.mount.remove();
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await page.evaluate(() => {
    const h = (window as any).reactHarness;
    return {
      opens: h.events.filter((e: any) => e.type === 'session-open').length,
      closes: h.events.filter((e: any) => e.type === 'session-close').length,
      callbacks: h.results.length,
      errors: h.errors,
    };
  });
  expect(state).toEqual({ opens: 2, closes: 2, callbacks: 1, errors: [] });
});

test('twenty imported pages remain navigable in a bounded scrolling tile grid', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const data = await page.evaluate(fixtureInBrowser, {
    ...fixtures[1],
    width: 600,
    height: 800,
    paper: [80, 60, 440, 680] as [number, number, number, number],
  });
  await page.evaluate(async (data) => {
    const h = (window as any).reactHarness;
    h.mount = document.body.appendChild(document.createElement('div'));
    const file = new File([await (await fetch(data)).blob()], 'page.png', { type: 'image/png' });
    h.controller = h.createScanner({
      locale: 'de',
      mount: h.mount,
      assetBaseUrl: '/scanner-assets/',
      createPdf: false,
      shutterSound: 'off',
    });
    h.promise = h.controller.open({ initialFiles: Array.from({ length: 20 }, () => file) });
  }, data);
  for (let i = 0; i < 20; i++) await acceptPage(page);
  await expect(page.locator('.scanner-pages article')).toHaveCount(20);
  await expect(page.locator('.scanner-pages article:visible')).toHaveCount(20);
  expect(
    await page.locator('.scanner-pages').evaluate((e) => e.scrollHeight > e.clientHeight),
  ).toBe(true);
  await page.getByRole('button', { name: 'Seite 20: Seitenaktionen', exact: true }).click();
  await page.getByRole('button', { name: 'Seite 20: Nach oben', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Seite 19', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(page.locator('.scanner-pages article')).toHaveCount(19);
  await expect(page.getByRole('button', { name: 'Abschließen', exact: true })).toBeInViewport();
  expect(
    await page.locator('.scanner-body').evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
  ).toBe(true);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  expect(
    await page.evaluate(async () => {
      const h = (window as any).reactHarness,
        result = await h.promise;
      await h.controller.destroy();
      h.mount.remove();
      return { status: result.status, count: result.pages.length, pdf: !!result.pdf };
    }),
  ).toEqual({ status: 'confirmed', count: 19, pdf: false });
});

test('declarative configuration errors are reported once and hidden when closed', async ({
  page,
}) => {
  await page.evaluate(() => {
    const h = (window as any).reactHarness;
    h.mount = document.body.appendChild(document.createElement('div'));
    h.root = h.createRoot(h.mount);
    h.renderError = (open: boolean) =>
      h.root.render(
        h.React.createElement(
          h.StrictMode,
          null,
          h.React.createElement(h.Scanner, {
            open,
            className: 'host-scanner',
            options: {
              locale: 'de',
              assetBaseUrl: '/scanner-assets/',
              defaultProfile: 'invalid',
              shutterSound: 'off',
            },
            onResult: (r: any) => h.results.push(r),
            onError: (e: any) => h.errors.push(e.code),
          }),
        ),
      );
    h.renderError(true);
  });
  await expect(page.locator('.host-scanner').getByRole('alert')).toContainText(
    'Ungültiges Startprofil',
  );
  expect(await page.evaluate(() => (window as any).reactHarness.errors)).toEqual([
    'CONFIG_INVALID',
  ]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => (window as any).reactHarness.renderError(false));
  await expect(page.locator('.host-scanner').getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => {
    const h = (window as any).reactHarness;
    h.root.unmount();
    h.mount.remove();
  });
  expect(await page.evaluate(() => (window as any).reactHarness.results)).toEqual([]);
});

test('a failed queued page cannot duplicate the accepted page or disappear during finish', async ({
  page,
}) => {
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.evaluate(async (data) => {
    const h = (window as any).reactHarness;
    h.mount = document.body.appendChild(document.createElement('div'));
    h.controller = h.createScanner({
      locale: 'de',
      mount: h.mount,
      assetBaseUrl: '/scanner-assets/',
      limits: { pages: 1 },
      createPdf: false,
      shutterSound: 'off',
    });
    const file = new File([await (await fetch(data)).blob()], 'page.png', { type: 'image/png' });
    h.promise = h.controller.open({ initialFiles: [file, file] });
  }, data);
  await expect(page.getByRole('button', { name: 'Abschließen', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/limit/i);
  await expect(page.locator('.scanner-pages article')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Abschließen', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Verbleibende Importe verwerfen', exact: true }).click();
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  expect(
    await page.evaluate(async () => {
      const h = (window as any).reactHarness,
        result = await h.promise;
      await h.controller.destroy();
      h.mount.remove();
      return { status: result.status, count: result.pages.length };
    }),
  ).toEqual({ status: 'confirmed', count: 1 });
});
