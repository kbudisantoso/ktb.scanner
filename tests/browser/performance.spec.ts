import { discardDraft } from './helpers';
import { acceptPage } from './helpers';
import { diagnostics, showPdf } from './helpers';
import { cpus } from 'node:os';
import { test, expect } from './fixtures';
import { fixtureInBrowser, type Fixture } from '../fixtures/generate';

test('record desktop 12-megapixel timings and responsive reference views', async ({
  page,
  browserName,
  isMobile,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium' || isMobile,
    'Desktop measurement; physical mobile benchmarks remain separate.',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await diagnostics(page);
  await page.getByLabel('Diagnose aufzeichnen', { exact: true }).uncheck();
  await diagnostics(page);
  await page.getByRole('button', { name: 'Diagnose schließen', exact: true }).click();
  await testInfo.attach('desktop-home.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  const data = await page.evaluate(fixtureInBrowser, {
    name: 'desktop-12mp',
    split: 'acceptance',
    width: 3000,
    height: 4000,
    paper: [280, 220, 2440, 3500],
    blur: 0,
    background: '#435a52',
  } satisfies Fixture);
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  const durations = [];
  for (let run = 0; run < 6; run++) {
    const start = performance.now();
    await page.locator('.scanner input[type=file]').setInputFiles({
      name: '12mp.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1], 'base64'),
    });
    await expect(page.getByRole('img', { name: 'Bearbeitete Seite' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abschließen', exact: true })).toBeEnabled();
    durations.push(Math.round(performance.now() - start));
    if (run < 5) await discardDraft(page);
  }
  await testInfo.attach('desktop-review.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await testInfo.attach('mobile-review.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await acceptPage(page);
  const exportStart = performance.now();
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  const manifest = JSON.parse((await page.locator('pre').textContent()) ?? '{}');
  const warm = durations.slice(1).sort((a, b) => a - b);
  await testInfo.attach('desktop-benchmark.json', {
    body: JSON.stringify({
      environment: {
        cpu: cpus()[0]?.model,
        platform: process.platform,
        architecture: process.arch,
        browser: page.context().browser()?.version(),
      },
      image: { width: 3000, height: 4000, bytes: Buffer.from(data.split(',')[1], 'base64').length },
      profile: 'auto',
      resolvedProfile: manifest.pages[0].metadata.autoOptimization?.profile,
      diagnostics: false,
      coldMs: durations[0],
      warmMs: durations.slice(1),
      warmMedianMs: warm[2],
      warmMaxMs: warm[4],
      exportAndPdfPreviewMs: Math.round(performance.now() - exportStart),
      outputSizePx: manifest.pages[0].metadata.outputSizePx,
      scope:
        'Synthetic desktop import, includes file transfer and UI readiness; not a physical camera benchmark.',
    }),
    contentType: 'application/json',
  });
});
