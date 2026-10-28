import { buildSync } from 'esbuild';
import { test, expect } from './fixtures';
import {
  perspectiveFoldedCorners,
  perspectiveFoldedDocumentInBrowser,
} from '../fixtures/folded-document';
import type { LiveDetection } from '../../packages/scanner/src/types';
import type { Page } from '@playwright/test';

const adapter = buildSync({
  entryPoints: [new URL('../../packages/scanner/src/scanic.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
}).outputFiles[0].text;

async function prepareLiveHarness(page: Page) {
  await page.route('**/folded-test-adapter.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: adapter }),
  );
  for (const asset of ['processing.worker.js', 'scanic.js'])
    await page.route(`**/scanner-assets/${asset}`, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        path: new URL(`../../packages/scanner/dist/assets/${asset}`, import.meta.url).pathname,
      }),
    );
  await page.route('**/folded-live-harness.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>Synthetic folded paper</title>',
    }),
  );
  await page.goto('/folded-live-harness.html');
}

async function detectFrames(page: Page, frames: string[]): Promise<LiveDetection[]> {
  return page.evaluate(async (frames) => {
    const moduleUrl = '/folded-test-adapter.js';
    const { createScanicAdapter } = await import(moduleUrl);
    const engine = createScanicAdapter('/scanner-assets/');
    try {
      const detections = [];
      for (const [index, data] of frames.entries()) {
        const image = await createImageBitmap(await (await fetch(data)).blob());
        detections.push(await engine.detect(image, index * 125));
      }
      return detections;
    } finally {
      await engine.destroy();
    }
  }, frames);
}

test(
  'the real live detector selects the observed perspective sheet instead of its stronger fold panel',
  {
    tag: '@worker-only',
  },
  async ({ page }, testInfo) => {
    await prepareLiveHarness(page);
    const frames = [];
    for (const shadow of [55, 90, 55])
      frames.push(await page.evaluate(perspectiveFoldedDocumentInBrowser, shadow));
    const detections = await detectFrames(page, frames);
    await testInfo.attach('perspective-folds.png', {
      body: Buffer.from(frames[0].split(',')[1], 'base64'),
      contentType: 'image/png',
    });
    await testInfo.attach('perspective-folded-live-boundaries.json', {
      body: JSON.stringify({ expected: perspectiveFoldedCorners, detections }),
      contentType: 'application/json',
    });
    for (const detection of detections) {
      expect(detection.corners).not.toBeNull();
      for (const [index, expected] of perspectiveFoldedCorners.entries()) {
        const point = detection.corners![index];
        expect(
          Math.hypot(point.x * 799 - expected[0], point.y * 999 - expected[1]),
        ).toBeLessThanOrEqual(12);
      }
    }
  },
);
