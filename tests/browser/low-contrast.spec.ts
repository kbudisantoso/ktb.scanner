import { buildSync } from 'esbuild';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { Quad } from '../../packages/scanner/src/types';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session';
import {
  contrastDocumentInBrowser,
  contrastPaperCases,
  contrastContextCases,
  contrastMissingCases,
} from '../fixtures/low-contrast-document';
import type { ContrastFixture } from '../fixtures/low-contrast-document';

const adapter = buildSync({
  entryPoints: [new URL('../../packages/scanner/src/scanic.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
}).outputFiles[0].text;

async function prepare(page: Page) {
  await page.route('**/contrast-test-adapter.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: adapter }),
  );
  for (const asset of ['processing.worker.js', 'scanic.js'])
    await page.route(`**/scanner-assets/${asset}`, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        path: new URL(`../../packages/scanner/dist/assets/${asset}`, import.meta.url).pathname,
      }),
    );
  await page.route('**/contrast-test.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>Synthetic document contrast</title>',
    }),
  );
  await page.goto('/contrast-test.html');
}

async function measure(page: Page, fixture: ContrastFixture, debug = false, withImages = false) {
  const source = await page.evaluate(contrastDocumentInBrowser, fixture);
  return page.evaluate(
    async ({ source, limits, debug, withImages }) => {
      const moduleUrl = '/contrast-test-adapter.js';
      const { createScanicAdapter } = await import(moduleUrl);
      const engine = createScanicAdapter(
        '/scanner-assets/',
        debug ? { engineBuffers: true, isActive: () => false, onEvent: () => {} } : undefined,
      );
      const original = await (await fetch(source)).blob();
      const dataUrl = (blob: Blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      const recipe = { version: 1, enhancement: 'none', dewarp: 'off' };
      try {
        const started = performance.now();
        const live = await engine.detect(await createImageBitmap(original), started);
        const liveMs = performance.now() - started;
        const still = await engine.process({
          original,
          limits,
          rotation: 0,
          recipe,
          revision: 1,
          mime: 'image/png',
        });
        let background: number[] | undefined;
        let preview: string | undefined, overlay: string | undefined;
        if (still.status !== 'crop-required') {
          const bitmap = await createImageBitmap(still.preview);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          background = [
            ...context.getImageData(
              Math.floor(canvas.width / 2),
              Math.floor(canvas.height * 0.95),
              1,
              1,
            ).data,
          ];
          if (withImages) preview = await dataUrl(still.preview);
        }
        if (withImages && live.corners) {
          const bitmap = await createImageBitmap(original);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          context.strokeStyle = 'white';
          context.lineWidth = 4;
          context.beginPath();
          live.corners.forEach((point: { x: number; y: number }, index: number) => {
            const x = point.x * (canvas.width - 1),
              y = point.y * (canvas.height - 1);
            if (index) context.lineTo(x, y);
            else context.moveTo(x, y);
          });
          context.closePath();
          context.stroke();
          overlay = await dataUrl(await canvas.convertToBlob({ type: 'image/png' }));
        }
        return {
          live,
          liveMs,
          still: {
            status: still.status ?? 'processed',
            corners: still.corners,
            edgesUncertain: still.edgesUncertain,
          },
          background,
          images: withImages ? { source, preview, overlay } : undefined,
        };
      } finally {
        engine.destroy();
      }
    },
    { source, limits: DEFAULT_LIMITS, debug, withImages },
  );
}

function deviations(
  corners: Quad,
  expected: [number, number, number, number],
  quad?: [number, number][],
) {
  const [x, y, width, height] = expected;
  const truth = quad ?? [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  return corners.map((point, index) =>
    Math.hypot(point.x * 799 - truth[index][0], point.y * 999 - truth[index][1]),
  );
}

test(
  'moderate contrast retains actual outer edges in live and independent still processing',
  { tag: '@worker-only' },
  async ({ page }, info) => {
    await prepare(page);
    const results = [];
    for (const fixture of contrastPaperCases) {
      const result = await measure(
        page,
        fixture,
        false,
        ['20-level contrast', 'interior table', 'two creases'].includes(fixture.name),
      );
      expect(result.live.corners, fixture.name).not.toBeNull();
      expect(
        Math.max(...deviations(result.live.corners, [140, 80, 520, 735])),
        fixture.name,
      ).toBeLessThanOrEqual(8);
      expect(result.still.status, fixture.name).toBe('processed');
      expect(
        Math.max(...deviations(result.still.corners, [140, 80, 520, 735])),
        fixture.name,
      ).toBeLessThanOrEqual(8);
      if (fixture.name === '30-level contrast')
        expect(result.background).toEqual([235, 235, 235, 255]);
      if (fixture.name === 'colored paper') expect(result.background).toEqual([175, 235, 255, 255]);
      if (fixture.name === 'dark paper') expect(result.background).toEqual([110, 110, 110, 255]);
      if (result.images)
        for (const [kind, data] of Object.entries(result.images)) {
          if (data)
            await info.attach(`${fixture.name}-${kind}.png`, {
              contentType: 'image/png',
              body: Buffer.from(data.split(',')[1], 'base64'),
            });
        }
      results.push({
        fixture: fixture.name,
        live: result.live,
        liveMs: result.liveMs,
        still: result.still,
      });
    }
    await info.attach('contrast-geometry.json', {
      contentType: 'application/json',
      body: JSON.stringify(results),
    });
  },
);

test(
  'document context, sheet identity and independently specified geometry retain observed boundaries',
  { tag: '@worker-only' },
  async ({ page }, info) => {
    await prepare(page);
    const results = [];
    for (const fixture of contrastContextCases) {
      const result = await measure(page, fixture);
      // This independent perspective still has no live contour in some engines.
      // Any automatic contour must be correct; still processing remains required below.
      if (fixture.name !== 'perspective paper')
        expect(result.live.corners, fixture.name).not.toBeNull();
      expect(result.still.status, fixture.name).toBe('processed');
      const expected = fixture.expected ?? [140, 80, 520, 735];
      if (result.live.corners)
        expect(
          Math.max(...deviations(result.live.corners, expected, fixture.corners)),
          fixture.name,
        ).toBeLessThanOrEqual(8);
      expect(
        Math.max(...deviations(result.still.corners, expected, fixture.corners)),
        fixture.name,
      ).toBeLessThanOrEqual(8);
      results.push({
        fixture: fixture.name,
        liveFound: result.live.corners !== null,
        live: result.live,
        still: result.still,
      });
    }
    await info.attach('contrast-context.json', {
      contentType: 'application/json',
      body: JSON.stringify(results),
    });
  },
);

test(
  'missing material boundaries stay missing and detailed diagnostics preserve geometry',
  { tag: '@worker-only' },
  async ({ page }, info) => {
    await prepare(page);
    for (const fixture of contrastMissingCases) {
      const result = await measure(page, fixture);
      expect(result.live.corners, fixture.name).toBeNull();
      expect(result.still.status, fixture.name).toBe('crop-required');
    }
    const fixture = contrastPaperCases.find((item) => item.name === 'interior table')!;
    const normal = await measure(page, fixture);
    const detailed = await measure(page, fixture, true);
    expect(detailed.live.corners).toEqual(normal.live.corners);
    expect(detailed.still.corners).toEqual(normal.still.corners);
    await info.attach('contrast-diagnostics-paths.json', {
      contentType: 'application/json',
      body: JSON.stringify({
        normal: { live: normal.live, still: normal.still, liveMs: normal.liveMs },
        detailed: { live: detailed.live, still: detailed.still, liveMs: detailed.liveMs },
      }),
    });
  },
);
