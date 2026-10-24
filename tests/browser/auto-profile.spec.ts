import { acceptPage, closeTool } from './helpers';
import { test, expect } from './fixtures';
import { chooseProfile, tool, tone, showPdf } from './helpers';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session';

test('omitted profile automatically optimizes, manual changes survive edits and export', async ({
  page,
}) => {
  await page.goto('/');
  const source = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'auto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source.split(',')[1], 'base64'),
  });
  const image = page.getByRole('img', { name: 'Bearbeitete Seite', exact: true });
  await tool(page, 'Filter');
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Auto', exact: true }).locator('small')).toHaveText(
    'Farbe',
  );
  await tone(page, 'Schärfe');
  await expect(page.getByRole('slider', { name: 'Schärfe', exact: true })).toHaveValue('20');
  const change = async (action: () => Promise<unknown>) => {
    const old = await image.getAttribute('src');
    await action();
    await expect(image).not.toHaveAttribute('src', old!);
    await expect(page.locator('.scanner')).toHaveAttribute('aria-busy', 'false');
  };
  await tone(page, 'Helligkeit');
  await change(() =>
    page.getByRole('slider', { name: 'Helligkeit', exact: true }).press('ArrowRight'),
  );
  await closeTool(page);
  await change(() => page.getByRole('button', { name: '90° drehen', exact: true }).click());
  await tone(page, 'Helligkeit');
  await expect(page.getByRole('slider', { name: 'Helligkeit', exact: true })).toHaveValue('1');
  await tone(page, 'Schärfe');
  await expect(page.getByRole('slider', { name: 'Schärfe', exact: true })).toHaveValue('20');
  await change(() => chooseProfile(page, 'grayscale'));
  await expect(page.getByRole('status').filter({ hasText: 'Auto:' })).toHaveCount(0);
  await closeTool(page);
  await change(() => page.getByRole('button', { name: '90° drehen', exact: true }).click());
  await tool(page, 'Filter');
  await expect(page.getByRole('button', { name: 'Graustufen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page);
  const metadata = await page.evaluate(
    () => JSON.parse(document.querySelector('pre')!.textContent!).pages[0].metadata,
  );
  expect(metadata.recipe).toMatchObject({
    enhancement: 'grayscale',
    adjustments: { brightness: 1, contrast: 0, sharpness: 20 },
  });
  expect(metadata.autoOptimization).toBeUndefined();
});

test('real worker auto brightens shaded paper, preserves colorful photos and reproduces export pixels', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async (limits) => {
    const worker = new Worker('/scanner-assets/processing.worker.js', { type: 'module' });
    let id = 0;
    const run = (original: Blob, enhancement: string, previewComparison = true): Promise<any> =>
      new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => {
          if (data.diagnostic) return;
          data.error ? reject(data.error) : resolve(data.result);
        };
        worker.onerror = reject;
        worker.postMessage({
          id: ++id,
          kind: 'process',
          request: {
            original,
            limits,
            rotation: 0,
            revision: 1,
            mime: 'image/png',
            previewComparison,
            corners: [
              { x: 0.08, y: 0.06 },
              { x: 0.92, y: 0.06 },
              { x: 0.92, y: 0.94 },
              { x: 0.08, y: 0.94 },
            ],
            format: { kind: 'original-ratio', origin: 'user' },
            recipe: { version: 1, enhancement, dewarp: 'off' },
          },
        });
      });
    const hash = async (b: Blob) =>
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()))).join(
        ',',
      );
    const metrics = async (b: Blob) => {
      const image = await createImageBitmap(b),
        c = new OffscreenCanvas(image.width, image.height),
        ctx = c.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      image.close();
      const d = ctx.getImageData(
        Math.round(c.width * 0.15),
        Math.round(c.height * 0.04),
        16,
        16,
      ).data;
      let value = 0;
      for (let i = 0; i < d.length; i += 4) value += d[i];
      return value / (d.length / 4);
    };
    try {
      const results = [];
      for (const photo of [false, true]) {
        const c = document.createElement('canvas');
        c.width = 600;
        c.height = 800;
        const ctx = c.getContext('2d')!;
        const g = ctx.createLinearGradient(0, 0, c.width, 0);
        g.addColorStop(0, photo ? '#125078' : '#999999');
        g.addColorStop(1, photo ? '#be5020' : '#dddddd');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#303030';
        ctx.font = '18px monospace';
        for (let y = 150; y < 700; y += 40) ctx.fillText('TEST 123456789', 100, y);
        ctx.fillStyle = '#b52a45';
        ctx.fillRect(430, 660, 60, 40);
        const original = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
        const off = await run(original, 'none'),
          auto = await run(original, 'auto'),
          exported = await run(original, 'auto', false);
        results.push({
          decision: auto.autoOptimization,
          brightness: await metrics(auto.preview),
          baseline: await metrics(off.preview),
          unchanged: (await hash(auto.preview)) === (await hash(off.preview)),
          comparison: (await hash(auto.unoptimizedPreview)) === (await hash(off.preview)),
          exported: (await hash(exported.preview)) === (await hash(auto.preview)),
          exportDecision: exported.autoOptimization,
        });
      }
      return results;
    } finally {
      worker.terminate();
    }
  }, DEFAULT_LIMITS);
  expect(result[0].decision).toMatchObject({
    profile: 'color',
    reason: 'paper-background',
    adjustments: { sharpness: 20 },
  });
  expect(result[0].brightness - result[0].baseline).toBeGreaterThan(40);
  expect(result[1].decision).toMatchObject({
    profile: 'photo',
    reason: 'preserve-photo',
    adjustments: { sharpness: 0 },
  });
  expect(result[1].unchanged).toBe(true);
  for (const item of result) {
    expect(item.comparison).toBe(true);
    expect(item.exported).toBe(true);
    expect(item.exportDecision).toEqual(item.decision);
  }
});
