import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

let harness: string;
test.beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `import {createScanicAdapter} from './packages/scanner/dist/scanic.js';
        import {resolveLimits} from './packages/scanner/dist/index.js';
        window.stillHarness = {createScanicAdapter, resolveLimits};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    write: false,
  });
  harness = bundle.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/independent-still-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Synthetic still</title>',
    }),
  );
  await page.goto('/independent-still-fixture');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).stillHarness)).toBe(true);
  await page.evaluate(() => {
    const h = (window as any).stillHarness;
    h.digest = async (blob: Blob) =>
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    h.make = async (scenario: 'sheet' | 'crease' | 'three' | 'blank') => {
      const canvas = document.createElement('canvas');
      canvas.width = scenario === 'three' ? 1200 : 600;
      canvas.height = scenario === 'three' ? 900 : 800;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#354b42';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (scenario === 'blank')
        return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!)));
      const sheets =
        scenario === 'three'
          ? [30, 450, 870].map((x) => ({ x, y: 120, width: 300, height: 660 }))
          : [{ x: 80, y: 80, width: 440, height: 620 }];
      for (const { x, y, width, height } of sheets) {
        ctx.fillStyle = '#fffdf7';
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = '#202820';
        ctx.font = '14px monospace';
        for (let row = y + 50; row < y + height - 40; row += 30)
          ctx.fillText('SYNTHETIC 012345', x + 20, row);
        ctx.fillStyle = '#a83239';
        ctx.fillRect(x + 25, y + 15, 35, 15);
        ctx.fillStyle = '#3050ae';
        ctx.fillRect(x + 25, y + height - 30, 35, 15);
        if (scenario === 'crease') {
          const fold = y + height / 3;
          const band = ctx.createLinearGradient(0, fold - 4, 0, fold + 4);
          band.addColorStop(0, '#fffdf7');
          band.addColorStop(0.5, '#85857f');
          band.addColorStop(1, '#fffdf7');
          ctx.fillStyle = band;
          ctx.fillRect(x, fold - 4, width, 8);
        }
      }
      return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!)));
    };
    h.process = async (original: Blob, captureHint?: unknown, overrides = {}) => {
      const engine = h.createScanicAdapter('/scanner-assets/');
      try {
        const result = await engine.process({
          original,
          limits: h.resolveLimits(),
          rotation: 0,
          recipe: { version: 1, enhancement: 'none', dewarp: 'off' },
          revision: 1,
          mime: 'image/png',
          captureHint,
          previewComparison: false,
          ...overrides,
        });
        if ((captureHint as any)?.stable === true) h.automaticPreview = result.preview;
        return {
          ...result,
          preview: result.preview ? await h.digest(result.preview) : undefined,
          thumbnail: result.thumbnail ? await h.digest(result.thumbnail) : undefined,
        };
      } finally {
        engine.destroy();
      }
    };
    h.hint = (corners: unknown, width = 600, height = 800) => ({
      stable: true,
      ageMs: 50,
      mapping: 'same-frame-area',
      frameSize: { width, height },
      corners,
    });
  });
});

for (const scenario of ['sheet', 'crease'] as const) {
  test(`a stable wrong live contour cannot replace the independent still crop: ${scenario}`, async ({
    page,
  }, testInfo) => {
    const results = await page.evaluate(async (scenario) => {
      const h = (window as any).stillHarness;
      const original = (h.original = await h.make(scenario));
      const before = await h.digest(original);
      const baseline = await h.process(original);
      const hint = h.hint(
        scenario === 'crease'
          ? [
              { x: 80 / 599, y: (80 + 620 / 3) / 799 },
              { x: 519 / 599, y: (80 + 620 / 3) / 799 },
              { x: 519 / 599, y: 699 / 799 },
              { x: 80 / 599, y: 699 / 799 },
            ]
          : [
              { x: 0.01, y: 0.05 },
              { x: 0.3, y: 0.05 },
              { x: 0.3, y: 0.6 },
              { x: 0.01, y: 0.6 },
            ],
      );
      return {
        baseline,
        automatic: await h.process(original, hint),
        manual: await h.process(original, { ...hint, stable: false }),
        before,
        after: await h.digest(original),
      };
    }, scenario);
    expect(results.baseline).not.toHaveProperty('status');
    for (const result of [results.baseline, results.automatic, results.manual]) {
      expect(result).not.toHaveProperty('status');
      expect(result.size).toEqual({ width: 600, height: 800 });
      expect(result.corners).toEqual(results.baseline.corners);
      expect(result.preview).toBe(results.baseline.preview);
      expect(result.corners[0].x * 599).toBeCloseTo(80, -1);
      expect(result.corners[0].y * 799).toBeCloseTo(80, -1);
      expect(result.corners[2].x * 599).toBeCloseTo(520, -1);
      expect(result.corners[2].y * 799).toBeCloseTo(700, -1);
    }
    expect(results.after).toBe(results.before);
    if (scenario === 'crease') {
      const images = await page.evaluate(async () => {
        const h = (window as any).stillHarness;
        return {
          original: Array.from(new Uint8Array(await h.original.arrayBuffer())),
          automatic: Array.from(new Uint8Array(await h.automaticPreview.arrayBuffer())),
        };
      });
      await mkdir(testInfo.outputDir, { recursive: true });
      for (const [name, bytes] of Object.entries(images)) {
        const path = testInfo.outputPath(`synthetic-crease-${name}.png`);
        await writeFile(path, Buffer.from(bytes));
        await testInfo.attach(`synthetic-crease-${name}`, { path, contentType: 'image/png' });
      }
    }
  });
}

test('a live hint for a side sheet does not override independent middle-sheet selection', async ({
  page,
}) => {
  const results = await page.evaluate(async () => {
    const h = (window as any).stillHarness;
    const original = await h.make('three');
    const hint = h.hint(
      [
        { x: 30 / 1199, y: 120 / 899 },
        { x: 330 / 1199, y: 120 / 899 },
        { x: 330 / 1199, y: 780 / 899 },
        { x: 30 / 1199, y: 780 / 899 },
      ],
      1200,
      900,
    );
    return { baseline: await h.process(original), hinted: await h.process(original, hint) };
  });
  expect(results.baseline).not.toHaveProperty('status');
  expect(results.hinted).not.toHaveProperty('status');
  expect(results.hinted.corners).toEqual(results.baseline.corners);
  expect(results.hinted.preview).toBe(results.baseline.preview);
  const center = results.hinted.corners.reduce((sum: number, p: { x: number }) => sum + p.x, 0) / 4;
  expect(center).toBeCloseTo(0.5, 2);
});

test('missing still geometry remains confirmation-required and explicit corners remain authoritative', async ({
  page,
}) => {
  const results = await page.evaluate(async () => {
    const h = (window as any).stillHarness;
    const original = await h.make('blank');
    const corners = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ];
    const hint = h.hint(corners);
    const missing = await h.process(original, hint);
    const explicit = await h.process(original, hint, {
      corners,
      rotation: 90,
      format: { kind: 'standard', preset: 'A6', origin: 'user' },
      recipe: { version: 1, enhancement: 'grayscale', dewarp: 'off' },
    });
    return { missing, explicit, corners };
  });
  expect(results.missing.status).toBe('crop-required');
  expect(results.missing.reason).toBe('not-detected');
  expect(results.missing).not.toHaveProperty('format');
  expect(results.missing.preview).toBeUndefined();
  expect(results.explicit).not.toHaveProperty('status');
  expect(results.explicit.corners).toEqual(results.corners);
  expect(results.explicit.format).toEqual({ kind: 'standard', preset: 'A6', origin: 'user' });
  expect(results.explicit.outputSize.width).toBeGreaterThan(results.explicit.outputSize.height);
  expect(results.explicit.preview).toHaveLength(64);
});
