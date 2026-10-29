import { build } from 'esbuild';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import { chooseFormat, chooseProfile, closeTool, tone } from './helpers';

let harness: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
        import React from './packages/scanner/node_modules/react/index.js';
        import {createRoot} from './packages/scanner/node_modules/react-dom/client.js';
        import {CornerEditor} from './packages/scanner/src/react/CornerEditor.tsx';
        import {createScanner} from './packages/scanner/dist/react/index.js';
        import {createTranslator} from './packages/scanner/dist/index.js';
        window.edgeHarness={React,createRoot,CornerEditor,createScanner,createTranslator,
          jobs:[],applied:[],cancelled:0,requests:[],cameraRequests:0};`,
    },
    bundle: true,
    format: 'esm',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  harness = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/redetect-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="mount"></div></body></html>',
    }),
  );
  await page.goto('/redetect-fixture');
  await page.addStyleTag({ path: 'packages/scanner/dist/styles.css' });
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).edgeHarness)).toBe(true);
  await page.evaluate(() => {
    const h = (window as any).edgeHarness;
    h.mount = document.querySelector('#mount');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          h.cameraRequests++;
          throw new DOMException('Synthetic camera denied', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (message.kind === 'process') h.requests.push(message.request);
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    };
    h.open = async (url: string, locale = 'de') => {
      const original = await (await fetch(url)).blob();
      h.controller = h.createScanner({
        mount: h.mount,
        assetBaseUrl: '/scanner-assets/',
        locale,
        createPdf: false,
        includeOriginals: true,
        shutterSound: 'off',
      });
      h.result = h.controller.open({
        initialFiles: [new File([original], 'synthetic.png', { type: 'image/png' })],
      });
    };
    h.editor = async (locale = 'en') => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      canvas.getContext('2d')!.fillRect(0, 0, 600, 800);
      h.source = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
      h.abort = new AbortController();
      h.root = h.createRoot(h.mount);
      h.renderEditor = () =>
        h.root.render(
          h.React.createElement(
            'section',
            { className: 'scanner scanner-workspace' },
            h.React.createElement(
              'div',
              { className: 'scanner-body' },
              h.React.createElement(h.CornerEditor, {
                page: {
                  original: h.source,
                  corners: [
                    { x: 0.2, y: 0.2 },
                    { x: 0.8, y: 0.2 },
                    { x: 0.8, y: 0.8 },
                    { x: 0.2, y: 0.8 },
                  ],
                },
                signal: h.abort.signal,
                t: h.createTranslator(locale),
                findEdges: (signal: AbortSignal) =>
                  new Promise((resolve, reject) => h.jobs.push({ signal, resolve, reject })),
                onApply: (corners: unknown) => h.applied.push(corners),
                onCancel: () => {
                  h.cancelled++;
                  h.root.render(null);
                },
              }),
            ),
          ),
        );
      h.renderEditor();
    };
  });
});

const detected = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

for (const locale of ['en', 'de']) {
  test(`edge suggestions remain provisional and unsuccessful searches retain the selection (${locale})`, async ({
    page,
  }) => {
    await page.evaluate((locale) => (window as any).edgeHarness.editor(locale), locale);
    const find = page.getByRole('button', {
      name: locale === 'de' ? 'Kanten finden' : 'Find edges',
      exact: true,
    });
    const apply = page.getByRole('button', {
      name: locale === 'de' ? 'Zuschnitt übernehmen' : 'Apply crop',
      exact: true,
    });
    await expect(find).toBeEnabled();
    await find.click();
    await find.dispatchEvent('click');
    expect(await page.evaluate(() => (window as any).edgeHarness.jobs.length)).toBe(1);
    await expect(apply).toBeDisabled();
    await page.evaluate(() => (window as any).edgeHarness.jobs[0].resolve(null));
    await expect(page.getByRole('alert')).toHaveText(
      locale === 'de'
        ? 'Keine Dokumentkanten gefunden. Die bisherige Auswahl bleibt erhalten.'
        : 'No document edges found. Your current selection is unchanged.',
    );
    await apply.click();
    expect(await page.evaluate(() => (window as any).edgeHarness.applied[0][0])).toEqual({
      x: 0.2,
      y: 0.2,
    });
    await find.click();
    await page.evaluate(() =>
      (window as any).edgeHarness.jobs[1].reject(new Error('Synthetic worker failure')),
    );
    await expect(page.getByRole('alert')).toHaveText(
      locale === 'de'
        ? 'Kanten konnten nicht gefunden werden. Bitte erneut versuchen oder Ecken manuell setzen.'
        : 'Could not find edges. Try again or adjust the corners manually.',
    );
    await find.click();
    await page.evaluate(
      (corners) => (window as any).edgeHarness.jobs[2].resolve(corners),
      detected,
    );
    await expect(find).toBeEnabled();
    expect(await page.evaluate(() => (window as any).edgeHarness.applied.length)).toBe(1);
    await apply.click();
    expect(await page.evaluate(() => (window as any).edgeHarness.applied[1])).toEqual(detected);
  });
}

test('manual input aborts a pending search and its late answer cannot overwrite the current corners', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).edgeHarness.editor());
  const find = page.getByRole('button', { name: 'Find edges', exact: true });
  await expect(find).toBeEnabled();
  await find.click();
  await page.getByRole('button', { name: 'Top-left corner', exact: true }).press('ArrowRight');
  expect(await page.evaluate(() => (window as any).edgeHarness.jobs[0].signal.aborted)).toBe(true);
  await expect(find).toBeEnabled();
  await find.click();
  await page.evaluate((corners) => (window as any).edgeHarness.jobs[0].resolve(corners), detected);
  await expect(page.getByRole('button', { name: 'Apply crop', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).edgeHarness.jobs[1].resolve(null));
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click();
  const corner = await page.evaluate(() => (window as any).edgeHarness.applied[0][0]);
  expect(corner.x).toBeCloseTo(0.2 + 1 / 599, 7);
  expect(corner.y).toBeCloseTo(0.2, 7);
});

test('Enter cannot apply while finding; Escape cancels the search and ignores a late answer', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).edgeHarness.editor());
  const find = page.getByRole('button', { name: 'Find edges', exact: true });
  await expect(find).toBeEnabled();
  await find.click();
  const corner = page.getByRole('button', { name: 'Top-left corner', exact: true });
  await corner.press('Enter');
  expect(await page.evaluate(() => (window as any).edgeHarness.applied.length)).toBe(0);
  await corner.press('Escape');
  await expect(page.locator('.scanner-corners')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).edgeHarness.jobs[0].signal.aborted)).toBe(true);
  await page.evaluate((corners) => (window as any).edgeHarness.jobs[0].resolve(corners), detected);
  expect(await page.evaluate(() => (window as any).edgeHarness.applied.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).edgeHarness.cancelled)).toBe(1);
});

test('Escape immediately after starting a search cancels from the Find edges button', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).edgeHarness.editor());
  const find = page.getByRole('button', { name: 'Find edges', exact: true });
  await expect(find).toBeEnabled();
  await find.click();
  await expect(find).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.scanner-corners')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).edgeHarness.jobs[0].signal.aborted)).toBe(true);
  await page.evaluate((corners) => (window as any).edgeHarness.jobs[0].resolve(corners), detected);
  expect(await page.evaluate(() => (window as any).edgeHarness.applied.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).edgeHarness.cancelled)).toBe(1);
});

test('session abort and editor unmount invalidate unfinished searches', async ({ page }) => {
  await page.evaluate(() => (window as any).edgeHarness.editor());
  const find = page.getByRole('button', { name: 'Find edges', exact: true });
  await expect(find).toBeEnabled();
  await find.click();
  await page.evaluate(() => (window as any).edgeHarness.abort.abort());
  expect(await page.evaluate(() => (window as any).edgeHarness.jobs[0].signal.aborted)).toBe(true);
  await page.evaluate((corners) => (window as any).edgeHarness.jobs[0].resolve(corners), detected);
  await page.getByRole('button', { name: 'Top-left corner', exact: true }).press('Enter');
  expect(await page.evaluate(() => (window as any).edgeHarness.applied.length)).toBe(0);
  await page.evaluate(() => (window as any).edgeHarness.root.unmount());
  await page.evaluate(() => (window as any).edgeHarness.editor());
  await expect(find).toBeEnabled();
  await find.click();
  await page.evaluate(() => (window as any).edgeHarness.root.unmount());
  expect(await page.evaluate(() => (window as any).edgeHarness.jobs[1].signal.aborted)).toBe(true);
  await page.evaluate((corners) => (window as any).edgeHarness.jobs[1].resolve(corners), detected);
  await expect(page.locator('.scanner-corners')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).edgeHarness.applied.length)).toBe(0);
});

test('real redetection preserves original, rotation, recipe and paper format through Cancel, repeated Apply and export', async ({
  page,
}, testInfo) => {
  const source = await page.evaluate(
    fixtureInBrowser,
    fixtures.find((fixture) => fixture.name === 'calibration-flat')!,
  );
  await page.evaluate((source) => (window as any).edgeHarness.open(source), source);
  const image = page.getByRole('img', { name: 'Bearbeitete Seite', exact: true });
  await expect(image).toBeVisible();
  await chooseProfile(page, 'grayscale');
  await tone(page, 'Helligkeit');
  await page.getByRole('slider', { name: 'Helligkeit', exact: true }).press('End');
  await closeTool(page);
  await chooseFormat(page, 'A6');
  await page.getByRole('button', { name: 'Querformat', exact: true }).click();
  await closeTool(page);
  await page.getByRole('button', { name: '90° drehen', exact: true }).click();
  await page.getByRole('button', { name: 'Ecken korrigieren', exact: true }).click();
  const corner = page.getByRole('button', { name: 'Ecke oben links', exact: true });
  await corner.press('Shift+ArrowRight');
  await corner.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }).click();
  await expect(page.locator('.scanner')).toHaveAttribute('aria-busy', 'false');
  const hash = () =>
    image.evaluate(async (img: HTMLImageElement) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', await (await fetch(img.src)).arrayBuffer()),
        ),
      ).join(','),
    );
  await expect(image).toBeVisible();
  const manualHash = await hash();
  await page.evaluate(() => {
    const h = (window as any).edgeHarness;
    h.manual = h.requests.at(-1);
  });
  const find = page.getByRole('button', { name: 'Kanten finden', exact: true });
  const search = async () => {
    const count = await page.evaluate(() => (window as any).edgeHarness.requests.length);
    await page.getByRole('button', { name: 'Ecken korrigieren', exact: true }).click();
    await expect(find).toBeEnabled();
    await find.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).edgeHarness.requests.length))
      .toBe(count + 1);
    await expect(find).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  };
  await search();
  if (testInfo.project.name === 'mobile-webkit')
    await page.screenshot({ path: 'artifacts/local/redetect-corners-mobile-webkit.png' });
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(async () => expect(await hash()).toBe(manualHash)).toPass();
  await search();
  await page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }).click();
  await expect(page.locator('.scanner')).toHaveAttribute('aria-busy', 'false');
  await expect(async () => expect(await hash()).not.toBe(manualHash)).toPass();
  const after = await page.evaluate(async () => {
    const h = (window as any).edgeHarness;
    const applied = h.requests.at(-1);
    const searched = h.requests.at(-2);
    const digest = async (blob: Blob) =>
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())));
    return {
      before: { rotation: h.manual.rotation, recipe: h.manual.recipe, format: h.manual.format },
      searched: { rotation: searched.rotation, recipe: searched.recipe, format: searched.format },
      applied: { rotation: applied.rotation, recipe: applied.recipe, format: applied.format },
      searchHadCorners: searched.corners !== undefined,
      searchHadHint: searched.captureHint !== undefined,
      originalUnchanged:
        JSON.stringify(await digest(searched.original)) ===
        JSON.stringify(await digest(h.manual.original)),
    };
  });
  expect(after.searched).toEqual(after.before);
  expect(after.applied).toEqual(after.before);
  expect(after.searchHadCorners).toBe(false);
  expect(after.searchHadHint).toBe(false);
  expect(after.originalUnchanged).toBe(true);
  expect(after.before.rotation).toBe(90);
  expect(after.before.recipe.enhancement).toBe('grayscale');
  expect(after.before.recipe.adjustments.brightness).toBe(100);
  expect(after.before.format.preset).toBe('A6');
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toHaveCount(0);
  const appliedHash = await hash();
  await search();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(async () => expect(await hash()).toBe(appliedHash)).toPass();
  await search();
  await page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }).click();
  await expect(async () => expect(await hash()).toBe(appliedHash)).toPass();
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  const result = await page.evaluate(async () => {
    const h = (window as any).edgeHarness;
    const result = await h.result;
    await h.controller.destroy();
    return {
      status: result.status,
      pages: result.pages.length,
      metadata: result.pages[0].metadata,
      cameraRequests: h.cameraRequests,
    };
  });
  expect(result.status).toBe('confirmed');
  expect(result.pages).toBe(1);
  expect(result.metadata.rotationDegrees).toBe(after.before.rotation);
  expect(result.metadata.recipe).toEqual(after.before.recipe);
  expect(result.metadata.format).toEqual(after.before.format);
  expect(result.cameraRequests).toBe(0);
});

test('required crop replacement keeps rollback budgets during redetection and remains unconfirmed after failure', async ({
  page,
}) => {
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    canvas.getContext('2d')!.fillRect(0, 0, 600, 800);
    return canvas.toDataURL('image/png');
  });
  await page.evaluate((source) => (window as any).edgeHarness.open(source), source);
  await expect(page.getByRole('heading', { name: 'Dokumentecken festlegen' })).toBeVisible();
  const baseline = await page.evaluate(() => {
    const initial = (window as any).edgeHarness.requests[0];
    return { limits: initial.limits, originalBytes: initial.original.size };
  });
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Bild tauschen', exact: true }).click();
  await (
    await picker
  ).setFiles({
    name: 'replacement-blank.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source.split(',')[1], 'base64'),
  });
  await expect.poll(() => page.evaluate(() => (window as any).edgeHarness.requests.length)).toBe(2);
  await expect(page.locator('.scanner')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('heading', { name: 'Dokumentecken festlegen' })).toBeVisible();
  const find = page.getByRole('button', { name: 'Kanten finden', exact: true });
  await expect(find).toBeEnabled();
  await find.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Keine Dokumentkanten gefunden. Die bisherige Auswahl bleibt erhalten.',
  );
  await expect(page.getByRole('button', { name: 'Abschließen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toBeVisible();
  const limits = await page.evaluate(() =>
    (window as any).edgeHarness.requests.slice(1).map((request: any) => request.limits),
  );
  expect(limits).toHaveLength(3);
  expect(limits[0].workingBytes).toBe(baseline.limits.workingBytes - baseline.originalBytes);
  expect(limits[1]).toEqual(limits[0]);
  expect(limits[2]).toEqual(limits[0]);
  await page.evaluate(async () => {
    const h = (window as any).edgeHarness;
    await h.controller.destroy();
    await h.result;
  });
});
