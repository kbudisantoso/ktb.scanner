import { build } from 'esbuild';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import type { Locator } from '@playwright/test';
import { expectReviewControls, previewHash, waitForPreview } from './helpers';

let harness: string;
test.beforeAll(async () => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import React from './packages/scanner/node_modules/react/index.js';
        import {createRoot} from './packages/scanner/node_modules/react-dom/client.js';
        import {Scanner,createScanner,ImageViewer} from './packages/scanner/dist/react/index.js';
        import {CaptureOutline} from './packages/scanner/src/react/CaptureOutline.tsx';
        window.themeHarness={React,createRoot,Scanner,createScanner,ImageViewer,CaptureOutline,results:[]};`,
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
  await expect.poll(() => page.evaluate(() => !!(window as any).themeHarness)).toBe(true);
  await page.evaluate(() => {
    const h = (window as any).themeHarness;
    h.mount = document.body.appendChild(document.createElement('div'));
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', ({ data }) => {
          // Keep native image processing while controlling only the warning UI fixture.
          if (h.hintFixture && data.result?.quality) {
            data.result.quality.reasons = h.hintFixture.reasons;
            data.result.edgesUncertain = h.hintFixture.edges;
          }
        });
      }
    };
    h.open = (api: string, theme?: Record<string, string>, camera = false, locale = 'en') => {
      const options = {
        assetBaseUrl: '/scanner-assets/',
        shutterSound: 'off',
        createPdf: false,
        theme,
        locale,
      };
      if (api === 'controller') {
        h.controller = h.createScanner({ ...options, mount: h.mount });
        h.pending = h.controller
          .open({ entry: camera ? 'camera' : 'workspace' })
          .then((result: any) => h.results.push(result));
      } else {
        h.root = h.createRoot(h.mount);
        h.root.render(
          h.React.createElement(h.Scanner, {
            open: true,
            options,
            openOptions: { entry: camera ? 'camera' : 'workspace' },
            onResult: (result: any) => h.results.push(result),
          }),
        );
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Denied', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    });
  });
});

const custom = {
  '--scanner-background': '#101827',
  '--scanner-surface': '#172536',
  '--scanner-text': '#eaf0fa',
  '--scanner-accent': '#a4c8ff',
  '--scanner-primary-text': '#101827',
  '--scanner-border': '#677c94',
  '--scanner-warning': '#593d11',
  '--scanner-warning-text': '#fff3c4',
  '--scanner-warning-border': '#f0c969',
  '--scanner-focus': '#e6a8ff',
  '--scanner-backdrop': '#203040cc',
  '--scanner-z-index': '12001',
  '--scanner-control-radius': '13px',
  '--scanner-panel-radius': '17px',
  '--scanner-mobile-radius': '7px',
  '--scanner-spacing': '1.25',
  '--scanner-font': 'monospace',
  '--scanner-select-arrow': '#eaf0fa',
  '--scanner-panel-shadow': 'rgb(1, 2, 3) 0px 1px 2px',
  '--scanner-control-shadow': 'rgb(4, 5, 6) 0px 2px 3px',
  '--scanner-camera-text-shadow': 'rgb(7, 8, 9) 0px 3px 4px',
  '--scanner-camera-flash': '#c0d0e0',
  '--scanner-camera-background': '#102030',
  '--scanner-camera-preview': '#213141',
  '--scanner-camera-text': '#fff0df',
  '--scanner-camera-muted': '#d6d0c7',
  '--scanner-camera-control': '#24384c',
  '--scanner-camera-control-border': '#8a9bad',
  '--scanner-camera-hint': '#364758',
  '--scanner-camera-hint-border': '#9ba8b7',
  '--scanner-camera-mode-surface': '#435466',
  '--scanner-camera-mode-border': '#abbaaf',
  '--scanner-camera-options': '#27394b',
  '--scanner-camera-options-control': '#35485b',
  '--scanner-camera-selected': '#546879',
  '--scanner-camera-selected-text': '#f7e4d2',
  '--scanner-camera-shutter': '#dfedff',
  '--scanner-camera-top-overlay': 'linear-gradient(#405060, #102030)',
  '--scanner-camera-bottom-overlay': 'linear-gradient(#102030, #405060)',
  '--scanner-camera-side-overlay': 'linear-gradient(90deg, #102030, #405060)',
};

for (const api of ['controller', 'react']) {
  test(`${api}: theme reaches backdrop, workspace controls and focus without host selectors`, async ({
    page,
  }, info) => {
    await page.evaluate(({ api, custom }) => (window as any).themeHarness.open(api, custom), {
      api,
      custom,
    });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(
      await page.locator('.scanner-backdrop').evaluate((e) => ({
        background: getComputedStyle(e).backgroundColor,
        z: getComputedStyle(e).zIndex,
      })),
    ).toEqual({ background: 'rgba(32, 48, 64, 0.8)', z: '12001' });
    const primary = dialog.getByRole('button', { name: 'Start camera', exact: true });
    expect(
      await primary.evaluate((e) => ({
        background: getComputedStyle(e).backgroundColor,
        color: getComputedStyle(e).color,
        radius: getComputedStyle(e).borderRadius,
      })),
    ).toEqual({ background: 'rgb(164, 200, 255)', color: 'rgb(16, 24, 39)', radius: '13px' });
    expect(
      await dialog.locator('.scanner-body').evaluate((e) => getComputedStyle(e).paddingLeft),
    ).toBe('15px');
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => ({
        outline: getComputedStyle(document.activeElement!).outlineColor,
        style: getComputedStyle(document.activeElement!).outlineStyle,
      })),
    ).toEqual({ outline: 'rgb(230, 168, 255)', style: 'solid' });
    expect(await primary.evaluate((e) => getComputedStyle(e).boxShadow)).toBe(
      'rgb(4, 5, 6) 0px 2px 3px 0px',
    );
    expect(await dialog.evaluate((e) => getComputedStyle(e).boxShadow)).toBe(
      'rgb(1, 2, 3) 0px 1px 2px 0px',
    );
    const select = dialog.getByRole('combobox', { name: 'Image export', exact: true });
    expect(await select.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain(
      'rgb(234, 240, 250)',
    );
    await test.step('Zero and positive hints keep the zoom centered, preserve Before and restore focus in both languages', async () => {
      await page.setViewportSize({ width: 390, height: 664 });
      const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
      for (const locale of ['en', 'de']) {
        if (locale === 'de')
          await page.evaluate(
            async ({ api, custom, locale }) => {
              const h = (window as any).themeHarness;
              if (api === 'controller') {
                await h.controller.destroy();
                await h.pending;
              } else h.root.unmount();
              h.open(api, custom, false, locale);
            },
            { api, custom, locale },
          );
        await page.evaluate(() => {
          (window as any).themeHarness.hintFixture = { reasons: [], edges: false };
        });
        const file = {
          name: 'synthetic-hints.png',
          mimeType: 'image/png',
          buffer: Buffer.from(data.split(',')[1], 'base64'),
        };
        await dialog.locator('input[type=file][multiple]').setInputFiles(file);
        await waitForPreview(page);
        const hash = await previewHash(page);
        await expect(dialog.locator('.scanner-hints')).toHaveCount(0);
        await expectReviewControls(page);
        if (locale === 'de' && ['chromium', 'mobile-webkit'].includes(info.project.name))
          await info.attach('review-0-hints-390.png', {
            contentType: 'image/png',
            body: await page.screenshot(),
          });
        await page.evaluate(() => {
          (window as any).themeHarness.hintFixture = { reasons: ['blur', 'exposure'], edges: true };
        });
        const previous = await (await waitForPreview(page)).getAttribute('src');
        const choosing = page.waitForEvent('filechooser');
        await dialog.getByRole('button', { name: /^(Replace image|Bild tauschen)$/ }).click();
        await (await choosing).setFiles(file);
        await waitForPreview(page, previous);
        expect(await previewHash(page)).toBe(hash);
        const hints = dialog.getByRole('button', {
          name: `${locale === 'de' ? 'Hinweise' : 'Hints'}: 3`,
          exact: true,
        });
        await expect(hints).toHaveText('3');
        await expect(hints.locator('svg')).toHaveCount(1);
        await expectReviewControls(page);
        if (locale === 'de' && ['chromium', 'mobile-webkit'].includes(info.project.name))
          await info.attach('review-3-hints-390.png', {
            contentType: 'image/png',
            body: await page.screenshot(),
          });
        await hints.click();
        await expect(dialog.locator('.scanner-quality li')).toHaveCount(3);
        await expect(dialog.getByRole('button', { name: /^(Close|Schließen)$/ })).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: /^(Undo|Rückgängig)$/ })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'OK', exact: true }).click();
        await expect(hints).toBeFocused();
        await hints.click();
        await dialog.focus();
        await page.keyboard.press('Escape');
        await expect(hints).toBeFocused();
        const before = dialog.getByRole('button', {
          name: /^(Hold to view before|Vorher anzeigen - gedrückt halten)$/,
        });
        await before.focus();
        await page.keyboard.down('Space');
        await expect(
          dialog.getByRole('img', { name: /^(Unoptimized crop|Unoptimierter Zuschnitt)$/ }),
        ).toBeVisible();
        await page.keyboard.up('Space');
        await expect(before).toHaveAttribute('aria-pressed', 'false');
      }
    });
  });

  test(`${api}: mobile camera uses explicit palette and inherited root focus, including denied errors`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.evaluate(({ api, custom }) => (window as any).themeHarness.open(api, custom, true), {
      api,
      custom,
    });
    const dialog = page.getByRole('dialog');
    const error = dialog.locator('.scanner-camera-error');
    await expect(error).toBeVisible();
    expect(
      await error.evaluate((e) => ({
        background: getComputedStyle(e).backgroundColor,
        color: getComputedStyle(e).color,
        radius: getComputedStyle(e).borderRadius,
      })),
    ).toEqual({ background: 'rgb(89, 61, 17)', color: 'rgb(255, 243, 196)', radius: '17px' });
    expect(
      await dialog.evaluate((e) => ({
        background: getComputedStyle(e).backgroundColor,
        color: getComputedStyle(e).color,
        radius: getComputedStyle(e).borderRadius,
      })),
    ).toEqual({ background: 'rgb(16, 32, 48)', color: 'rgb(255, 240, 223)', radius: '7px' });
    const mode = dialog.getByRole('combobox', { name: 'Capture mode', exact: true });
    expect(
      await mode.evaluate((e) => ({
        background: getComputedStyle(e).backgroundColor,
        color: getComputedStyle(e).color,
        border: getComputedStyle(e).borderColor,
      })),
    ).toEqual({
      background: 'rgb(67, 84, 102)',
      color: 'rgb(255, 240, 223)',
      border: 'rgb(171, 186, 175)',
    });
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineColor)).toBe(
      'rgb(230, 168, 255)',
    );
    const shutter = dialog.locator('.scanner-shutter-button');
    expect(
      await shutter.evaluate((e) => ({
        border: getComputedStyle(e).borderColor,
        fill: getComputedStyle(e, '::before').backgroundColor,
      })),
    ).toEqual({ border: 'rgb(223, 237, 255)', fill: 'rgb(223, 237, 255)' });
    expect(
      await dialog.locator('.scanner-camera-title').evaluate((e) => getComputedStyle(e).textShadow),
    ).toBe('rgb(7, 8, 9) 0px 3px 4px');
    expect(await shutter.evaluate((e) => getComputedStyle(e).boxShadow)).toBe(
      'rgb(4, 5, 6) 0px 2px 3px 0px',
    );
    await dialog.getByRole('button', { name: 'Camera options', exact: true }).click();
    expect(
      await dialog
        .locator('.scanner-camera-options')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe('rgb(39, 57, 75)');
    await dialog.getByRole('button', { name: 'Close options', exact: true }).click();
    await info.attach(`themed-denied-${api}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

test('specific camera focus overrides root focus; omitted theme retains defaults', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.evaluate(() => (window as any).themeHarness.open('controller', undefined, true));
  await expect(page.locator('.scanner-camera-error')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    'rgb(16, 24, 19)',
  );
  expect(
    await page.locator('.scanner-camera-error').evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
    })),
  ).toEqual({ background: 'rgb(255, 242, 212)', color: 'rgb(41, 37, 24)' });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineColor)).toBe(
    'rgb(162, 235, 198)',
  );
  await page.evaluate(async () => {
    const h = (window as any).themeHarness;
    await h.controller.destroy();
    await h.pending;
    h.open(
      'controller',
      { '--scanner-focus': '#123456', '--scanner-camera-focus': '#abcdef' },
      true,
    );
  });
  await expect(page.locator('.scanner-camera-error')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineColor)).toBe(
    'rgb(171, 205, 239)',
  );
});

test('standalone viewer consumes inherited font, palette, radius and focus; absent font still inherits', async ({
  page,
}) => {
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.evaluate(async (data) => {
    const h = (window as any).themeHarness,
      image = await (await fetch(data)).blob();
    h.mount.style.cssText =
      'height:400px;display:flex;font-family:serif;--scanner-font:monospace;--scanner-text:#eef2ff;--scanner-surface:#123456;--scanner-border:#667788;--scanner-viewer-background:#234567;--scanner-viewer-radius:19px;--scanner-control-radius:11px;--scanner-focus:#fedcba;--scanner-spacing:1.25';
    h.root = h.createRoot(h.mount);
    h.root.render(
      h.React.createElement(h.ImageViewer, { image, alt: 'Synthetic page', resetKey: 'one' }),
    );
  }, data);
  await expect(page.getByRole('img', { name: 'Synthetic page' })).toBeVisible();
  const viewer = page.locator('.scanner-image-viewer');
  expect(
    await viewer.evaluate((e) => ({
      font: getComputedStyle(e).fontFamily,
      background: getComputedStyle(e).backgroundColor,
      radius: getComputedStyle(e).borderRadius,
    })),
  ).toEqual({ font: 'monospace', background: 'rgb(35, 69, 103)', radius: '19px' });
  const fit = viewer.getByRole('button', { name: '100 percent', exact: true });
  expect(
    await fit.evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
    })),
  ).toEqual({ background: 'rgb(18, 52, 86)', color: 'rgb(238, 242, 255)' });
  await page.evaluate(() => {
    const h = (window as any).themeHarness;
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Keyboard focus starting point');
    h.mount.before(input);
    input.focus();
  });
  await page.keyboard.press('Tab');
  const surface = viewer.locator('.scanner-image-surface');
  await expect(surface).toBeFocused();
  expect(await surface.evaluate((e) => getComputedStyle(e).outlineColor)).toBe(
    'rgb(254, 220, 186)',
  );
  await page.evaluate(() =>
    (window as any).themeHarness.mount.style.removeProperty('--scanner-font'),
  );
  expect(await viewer.evaluate((e) => getComputedStyle(e).fontFamily)).toBe('serif');
});

test('scanner chrome and standalone viewer resist native selection while host text and editable fields retain it', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const selected = () => page.evaluate(() => window.getSelection()?.toString() ?? '');
  const drag = async (target: Locator) => {
    const b = (await target.boundingBox())!;
    await page.mouse.move(b.x + 10, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 10, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  };
  const host = page.locator('main h1');
  await host.dblclick();
  expect(await selected()).not.toBe('');
  await page.mouse.click(2, 2);
  expect(await selected()).toBe('');
  await page.evaluate(() => {
    const h = (window as any).themeHarness;
    h.nativeDrags = 0;
    document.addEventListener('dragstart', () => h.nativeDrags++, true);
    h.open('controller');
  });
  const dialog = page.getByRole('dialog');
  const heading = dialog.getByRole('heading').first();
  await heading.dblclick();
  expect(await selected()).toBe('');
  await drag(heading);
  expect(await selected()).toBe('');
  await page.evaluate(() => {
    const fields = document.createElement('div');
    fields.id = 'selection-fields';
    fields.style.cssText = 'position:absolute;inset:60px 16px auto;z-index:20;background:white';
    fields.innerHTML =
      '<input aria-label="Text input"><textarea aria-label="Text area"></textarea><select aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><div contenteditable="true" role="textbox" aria-label="Editable note"></div>';
    document.querySelector('.scanner-body')!.append(fields);
  });
  for (const name of ['Text input', 'Text area']) {
    const field = page.getByLabel(name, { exact: true });
    await field.fill('abcdef');
    await field.press('Shift+ArrowLeft');
    await field.press('Shift+ArrowLeft');
    expect(
      await field.evaluate((e: HTMLInputElement | HTMLTextAreaElement) => [
        e.selectionStart,
        e.selectionEnd,
      ]),
    ).toEqual([4, 6]);
    await field.press('Z');
    await expect(field).toHaveValue('abcdZ');
    expect(
      await field.evaluate((e: HTMLInputElement | HTMLTextAreaElement) => e.selectionStart),
    ).toBe(5);
  }
  const editable = page.getByRole('textbox', { name: 'Editable note', exact: true });
  await editable.fill('abcdef');
  await editable.press('Shift+ArrowLeft');
  expect(await selected()).toBe('f');
  await editable.press('Z');
  await expect(editable).toHaveText('abcdeZ');
  await page.getByLabel('Choice', { exact: true }).selectOption('b');
  await expect(page.getByLabel('Choice', { exact: true })).toHaveValue('b');
  expect(
    await page
      .locator('#selection-fields > *')
      .evaluateAll((nodes) => nodes.map((e) => getComputedStyle(e).userSelect)),
  ).toEqual(['text', 'text', 'text', 'text']);
  await page.locator('#selection-fields').evaluate((e) => e.remove());
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await dialog.locator('input[type=file][multiple]').setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data.split(',')[1], 'base64'),
  });
  await expect(dialog.getByRole('img', { name: 'Edited page', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /^Page overview/ }).click();
  const tile = dialog.locator('.scanner-page-tile img');
  await expect(tile).toBeVisible();
  expect(await tile.evaluate((e: HTMLImageElement) => e.draggable)).toBe(false);
  await drag(tile);
  expect(await selected()).toBe('');
  if (info.project.name === 'mobile-webkit')
    await info.attach('scanner-selection.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  await page.evaluate(async (data) => {
    const h = (window as any).themeHarness;
    await h.controller.destroy();
    await h.pending;
    h.mount.style.cssText =
      'position:fixed;top:80px;left:16px;right:16px;height:480px;display:flex';
    h.root = h.createRoot(h.mount);
    const image = await (await fetch(data)).blob();
    h.root.render(
      h.React.createElement(h.ImageViewer, {
        image,
        before: image,
        alt: 'Standalone synthetic page',
        resetKey: 'selection',
      }),
    );
  }, data);
  await expect(page.locator('.scanner')).toHaveCount(0);
  const viewer = page.locator('.scanner-image-viewer');
  const image = viewer.getByRole('img', { name: 'Standalone synthetic page', exact: true });
  await expect(image).toBeVisible();
  expect(await viewer.evaluate((e) => getComputedStyle(e).userSelect)).toBe('none');
  await viewer.getByRole('button', { name: 'Hold to view before', exact: true }).dblclick();
  expect(await selected()).toBe('');
  await viewer.evaluate((e) => {
    const field = document.createElement('input');
    field.setAttribute('aria-label', 'Standalone text input');
    field.style.cssText = 'position:absolute;top:4px;left:4px;z-index:1';
    e.append(field);
  });
  const viewerField = viewer.getByLabel('Standalone text input', { exact: true });
  await viewerField.fill('viewer');
  await viewerField.press('Shift+ArrowLeft');
  expect(
    await viewerField.evaluate((e: HTMLInputElement) => [e.selectionStart, e.selectionEnd]),
  ).toEqual([5, 6]);
  await viewerField.press('Z');
  await expect(viewerField).toHaveValue('vieweZ');
  await viewerField.evaluate((e) => e.remove());
  expect(await image.evaluate((e: HTMLImageElement) => e.draggable)).toBe(false);
  await drag(image);
  expect(await page.evaluate(() => (window as any).themeHarness.nativeDrags)).toBe(0);
  if (info.project.name === 'mobile-webkit')
    await info.attach('viewer-selection.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  await page.evaluate(() => {
    const h = (window as any).themeHarness;
    h.root.unmount();
    h.mount.remove();
  });
  await host.dblclick();
  expect(await selected()).not.toBe('');
});

test('capture contour and corner loupe use their tokens in actual SVG and canvas output', async ({
  page,
}) => {
  await page.evaluate(() => {
    const h = (window as any).themeHarness;
    h.mount.style.cssText =
      '--scanner-capture-outline:#123456;--scanner-capture-progress:#abcdef;--scanner-capture-fill:#234567';
    h.root = h.createRoot(h.mount);
    h.root.render(
      h.React.createElement(h.CaptureOutline, {
        corners: [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.1 },
          { x: 0.9, y: 0.9 },
          { x: 0.1, y: 0.9 },
        ],
        size: { width: 800, height: 800 },
        progress: 0.5,
        opacity: 1,
      }),
    );
  });
  await expect(page.locator('svg[data-progress="0.5"] polygon')).toHaveCount(1);
  expect(
    await page
      .locator('svg[data-progress="0.5"] polygon')
      .evaluate((e) => ({ stroke: getComputedStyle(e).stroke, fill: getComputedStyle(e).fill })),
  ).toEqual({ stroke: 'rgb(18, 52, 86)', fill: 'rgb(35, 69, 103)' });
  expect(
    await page
      .locator('svg[data-progress="0.5"] polyline')
      .evaluate((e) => getComputedStyle(e).stroke),
  ).toBe('rgb(171, 205, 239)');
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.evaluate(async (data) => {
    const h = (window as any).themeHarness;
    h.root.unmount();
    h.root = undefined;
    const file = new File([await (await fetch(data)).blob()], 'synthetic.png', {
      type: 'image/png',
    });
    h.controller = h.createScanner({
      mount: h.mount,
      assetBaseUrl: '/scanner-assets/',
      shutterSound: 'off',
      theme: { '--scanner-loupe-crosshair': '#b03070', '--scanner-loupe-background': '#102030' },
    });
    h.pending = h.controller.open({ initialFiles: [file] });
  }, data);
  await expect(page.getByRole('img', { name: 'Edited page', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adjust corners', exact: true }).click();
  await page.getByRole('button', { name: 'Top-left corner', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  const canvas = page.locator('.scanner-corner-loupe');
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((e) => {
      const c = e as HTMLCanvasElement;
      return Array.from(c.getContext('2d')!.getImageData(c.width / 2, 2, 1, 1).data);
    }),
  ).toEqual([176, 48, 112, 255]);
});

test('default desktop tokens and select arrow retain published fallback values', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.evaluate(() => (window as any).themeHarness.open('controller'));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
      radius: getComputedStyle(e).borderRadius,
    })),
  ).toEqual({ background: 'rgb(244, 246, 242)', color: 'rgb(23, 42, 34)', radius: '12px' });
  expect(
    await page.locator('.scanner-backdrop').evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      z: getComputedStyle(e).zIndex,
    })),
  ).toEqual({ background: 'rgba(20, 40, 31, 0.8)', z: '10000' });
  expect(
    await dialog
      .getByRole('combobox', { name: 'Image export', exact: true })
      .evaluate((e) => getComputedStyle(e).backgroundImage),
  ).toContain('rgb(82, 103, 92)');
});

test('selected paper orientation retains primary foreground over its accent surface', async ({
  page,
}) => {
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.evaluate(
    async ({ data, custom }) => {
      const h = (window as any).themeHarness;
      const file = new File([await (await fetch(data)).blob()], 'synthetic.png', {
        type: 'image/png',
      });
      h.controller = h.createScanner({
        mount: h.mount,
        assetBaseUrl: '/scanner-assets/',
        shutterSound: 'off',
        theme: custom,
      });
      h.pending = h.controller.open({ initialFiles: [file] });
    },
    { data, custom },
  );
  await expect(page.getByRole('img', { name: 'Edited page', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  const selected = page.locator('.scanner-orientation button[aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  expect(
    await selected.evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
    })),
  ).toEqual({ background: 'rgb(164, 200, 255)', color: 'rgb(16, 24, 39)' });
});
