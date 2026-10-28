import { acceptPage } from './helpers';
import { pageActions } from './helpers';
import { build } from 'esbuild';
import { test, expect } from './fixtures';

let harness: string;
test.beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `import { createScanner } from './packages/scanner/dist/react/index.js';
        import { createScanicAdapter } from './packages/scanner/dist/scanic.js';
        import { resolveLimits } from './packages/scanner/dist/index.js';
        window.cropHarness = { createScanner, createScanicAdapter, resolveLimits };`,
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
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Test camera denied', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    }),
  );
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).cropHarness)).toBe(true);
  await page.evaluate(async () => {
    const h = (window as any).cropHarness;
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    canvas.getContext('2d')!.fillRect(0, 0, 600, 800);
    h.file = new File([await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)))], 'blank.png', {
      type: 'image/png',
    });
  });
});

test('no detection produces neither an image nor a format, even with a stable live hint', async ({
  page,
}) => {
  const results = await page.evaluate(async () => {
    const h = (window as any).cropHarness;
    const engine = h.createScanicAdapter('/scanner-assets/');
    try {
      const hints = [
        undefined,
        {
          stable: true,
          ageMs: 50,
          mapping: 'same-frame-area',
          frameSize: { width: 600, height: 800 },
          corners: [
            { x: 0.2, y: 0.2 },
            { x: 0.8, y: 0.2 },
            { x: 0.8, y: 0.8 },
            { x: 0.2, y: 0.8 },
          ],
        },
      ];
      const results = [];
      for (const captureHint of hints) {
        const result = await engine.process({
          original: h.file,
          limits: h.resolveLimits(),
          rotation: 0,
          recipe: { version: 1, enhancement: 'document', dewarp: 'off' },
          revision: 1,
          mime: 'image/jpeg',
          captureHint,
        });
        results.push(result);
      }
      return results;
    } finally {
      engine.destroy();
    }
  });
  for (const result of results) {
    expect(result.status).toBe('crop-required');
    expect(result.reason).toBe('not-detected');
    expect(Object.keys(result).sort()).toEqual(['corners', 'reason', 'size', 'status']);
    expect(result.corners.every((p: any) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1)).toBe(true);
  }
});

test('missing crop blocks acceptance and export until confirmation; cancelled replacement preserves the page', async ({
  page,
}) => {
  await page.evaluate(() => {
    const h = (window as any).cropHarness;
    h.mount = document.body.appendChild(document.createElement('div'));
    h.controller = h.createScanner({
      locale: 'de',
      mount: h.mount,
      assetBaseUrl: '/scanner-assets/',
    });
    h.result = h.controller.open({ initialFiles: [h.file] });
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Dokumentecken festlegen' })).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Bearbeitete Seite' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Abschließen', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Abschließen' })).toHaveCount(0);
  const corner = dialog.getByRole('button', { name: 'Ecke oben links' });
  await corner.focus();
  await page.keyboard.press('ArrowRight');
  await dialog.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }).click();
  await expect(dialog.getByRole('img', { name: 'Bearbeitete Seite' })).toBeVisible();
  await acceptPage(page);
  await dialog.getByRole('button', { name: /Seite \d+: Bearbeiten/ }).click();
  await expect(dialog.getByRole('img', { name: 'Bearbeitete Seite' })).toBeVisible();
  await acceptPage(page);
  await pageActions(page);
  const choosing = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Ersetzen', exact: true }).click();
  const blank = await page.evaluate(async () =>
    Array.from(new Uint8Array(await (window as any).cropHarness.file.arrayBuffer())),
  );
  await (
    await choosing
  ).setFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from(blank) });
  await expect(dialog.getByRole('heading', { name: 'Dokumentecken festlegen' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog.getByRole('img', { name: 'Seite 1', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Abschließen', exact: true }).click();
  const result = await page.evaluate(async () => {
    const h = (window as any).cropHarness,
      result = await h.result;
    await h.controller.destroy();
    h.mount.remove();
    return {
      status: result.status,
      count: result.pages.length,
      corners: result.pages[0].metadata.corners,
      pdf: result.pdf.size,
    };
  });
  expect(result.status).toBe('confirmed');
  expect(result.count).toBe(1);
  expect(result.pdf).toBeGreaterThan(0);
  expect(result.corners[0].x).toBeGreaterThan(0.1);
});

test('a conflicting still contour requires confirmation instead of the complete photo', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const h = (window as any).cropHarness;
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#435444';
    ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(180, 180, 260, 440);
    ctx.fillStyle = '#222';
    ctx.font = '14px monospace';
    for (let y = 220; y < 590; y += 24) ctx.fillText('TEST 0123456789', 200, y);
    const original = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)));
    const engine = h.createScanicAdapter('/scanner-assets/');
    try {
      return await engine.process({
        original,
        limits: h.resolveLimits(),
        rotation: 0,
        recipe: { version: 1, enhancement: 'document', dewarp: 'off' },
        revision: 1,
        mime: 'image/jpeg',
        captureHint: {
          stable: true,
          ageMs: 50,
          mapping: 'same-frame-area',
          frameSize: { width: 600, height: 800 },
          corners: [
            { x: 0.02, y: 0.1 },
            { x: 0.32, y: 0.1 },
            { x: 0.32, y: 0.65 },
            { x: 0.02, y: 0.65 },
          ],
        },
      });
    } finally {
      engine.destroy();
    }
  });
  expect(result.status).toBe('crop-required');
  expect(result.reason).toBe('capture-conflict');
  expect(result).not.toHaveProperty('preview');
  expect(result).not.toHaveProperty('format');
});
