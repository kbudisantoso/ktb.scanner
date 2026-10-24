import { acceptPage, chooseFormat, closeTool } from './helpers';
import { chooseProfile, tool } from './helpers';
import { build } from 'esbuild';
import { test, expect } from './fixtures';
import { fixtureInBrowser } from '../fixtures/generate';
import type { Fixture } from '../fixtures/generate';
import { photograph, size } from '../fixtures/paper-projection';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session';

let harness: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import { createScanner } from './packages/scanner/dist/react/index.js'; window.paperHarness = { createScanner };`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
  });
  harness = result.outputFiles[0].text;
});

for (const scenario of [
  { name: 'German primary locale', locale: 'de-DE', expected: 'A4' },
  { name: 'US primary locale', locale: 'en-US', expected: 'letter' },
  { name: 'host region overrides browser locale', locale: 'en-US', region: 'DE', expected: 'A4' },
  { name: 'tilted A4 overrides US prior', locale: 'en-US', expected: 'A4', project: [210, 297] },
  {
    name: 'single-axis tilt A4 with unresolved focal length',
    locale: 'de-DE',
    expected: 'A4',
    project: [210, 297],
    singleAxis: true,
  },
  {
    name: 'single-axis tilt Letter with regional prior',
    locale: 'en-US',
    expected: 'letter',
    project: [215.9, 279.4],
    singleAxis: true,
  },
  {
    name: 'tilted Letter overrides German prior',
    locale: 'de-DE',
    expected: 'letter',
    project: [215.9, 279.4],
  },
])
  test(`paper suggestion: ${scenario.name}`, async ({ page }) => {
    await page.addInitScript((locale) => {
      Object.defineProperty(navigator, 'languages', { configurable: true, value: [locale] });
      Object.assign(window, { locationRequests: 0 });
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: () => {
            (window as any).locationRequests++;
            throw new Error('Unexpected GPS request');
          },
          watchPosition: () => {
            (window as any).locationRequests++;
            throw new Error('Unexpected GPS request');
          },
        },
      });
    }, scenario.locale);
    await page.goto('/');
    await page.addScriptTag({ type: 'module', content: harness });
    await expect.poll(() => page.evaluate(() => !!(window as any).paperHarness)).toBe(true);
    const fixture: Fixture = scenario.project
      ? {
          name: 'projective-paper',
          split: 'acceptance',
          ...size,
          paper: [
            100,
            100,
            Math.round(scenario.project[0] * 2),
            Math.round(scenario.project[1] * 2),
          ],
          blur: 0,
          background: '#435444',
          destination: photograph(
            scenario.project[0],
            scenario.project[1],
            scenario.singleAxis ? 25 : 35,
            scenario.singleAxis ? 0 : 25,
            20,
          ).map((p) => [p.x * size.width, p.y * size.height]),
        }
      : {
          name: 'ambiguous-paper',
          split: 'acceptance',
          width: 1000,
          height: 1300,
          paper: [130, 150, 740, 1000],
          blur: 0,
          background: '#435444',
        };
    const data = await page.evaluate(fixtureInBrowser, fixture);
    await page.evaluate(
      async ({ data, region }) => {
        const h = (window as any).paperHarness;
        h.mount = document.body.appendChild(document.createElement('div'));
        h.events = [];
        h.controller = h.createScanner({
          mount: h.mount,
          assetBaseUrl: '/scanner-assets/',
          paperRegion: region,
          createPdf: true,
          diagnostics: { onEvent: (event: any) => h.events.push(event) },
        });
        h.result = h.controller.open({
          initialFiles: [
            new File([await (await fetch(data)).blob()], 'synthetic.png', { type: 'image/png' }),
          ],
        });
      },
      { data, region: scenario.region },
    );
    await tool(page, 'Format');
    const format = page
      .getByRole('group', { name: 'Ausgabeformat', exact: true })
      .locator('button[aria-pressed=true]');
    await expect(format).toHaveText(scenario.expected === 'letter' ? 'Letter' : scenario.expected);
    const preview = page.getByRole('img', { name: 'Bearbeitete Seite', exact: true });
    const expectedRatio = scenario.expected === 'A4' ? 210 / 297 : 215.9 / 279.4;
    await expect
      .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight))
      .toBeCloseTo(expectedRatio, 2);
    if (scenario.project && !scenario.singleAxis) {
      expect(
        await page.evaluate(
          () =>
            (window as any).paperHarness.events.find((e: any) => e.type === 'format-suggestion')
              ?.data.method,
        ),
      ).toBe('projective');
    }
    if (scenario.name === 'German primary locale') {
      await closeTool(page);
      await page.getByRole('button', { name: 'Ecken korrigieren', exact: true }).click();
      await page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }).click();
      await tool(page, 'Format');
      await expect(format).toBeEnabled();
      await expect(format).toHaveText('A4');
    }
    // A manual choice must survive processing and export, regardless of the prior.
    await tool(page, 'Format');
    await chooseFormat(page, 'A6');
    await chooseProfile(page, 'none');
    await tool(page, 'Format');
    await expect(format).toHaveText('A6');
    await acceptPage(page);
    await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
    const result = await page.evaluate(async () => {
      const h = (window as any).paperHarness,
        result = await h.result;
      const image = await createImageBitmap(result.pages[0].image);
      const value = {
        metadata: result.pages[0].metadata,
        width: image.width,
        height: image.height,
        pdfBytes: result.pdf.size,
        locationRequests: (window as any).locationRequests,
      };
      image.close();
      await h.controller.destroy();
      h.mount.remove();
      return value;
    });
    expect(result.metadata.format).toEqual({ kind: 'standard', preset: 'A6', origin: 'user' });
    expect(result.metadata.outputLayoutMm).toEqual({ width: 105, height: 148 });
    expect(result.width / result.height).toBeCloseTo(105 / 148, 2);
    expect(result.pdfBytes).toBeGreaterThan(0);
    expect(result.locationRequests).toBe(0);
  });

test('manual corners alone do not prove Letter on an unsupported border', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async (limits) => {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 1300;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#aaa';
    ctx.fillRect(0, 0, c.width, c.height);
    const original = await new Promise<Blob>((resolve) =>
      c.toBlob((b) => resolve(b!), 'image/png'),
    );
    const worker = new Worker('/scanner-assets/processing.worker.js', { type: 'module' });
    try {
      const request = (id: number, format?: object) =>
        new Promise<any>((resolve, reject) => {
          worker.onerror = reject;
          worker.onmessage = ({ data }) => {
            if (data.error) reject(new Error(data.error.message));
            else resolve(data.result);
          };
          worker.postMessage({
            id,
            kind: 'process',
            request: {
              original,
              limits,
              recipe: { version: 1, enhancement: 'none', dewarp: 'off' },
              corners: [
                { x: 0.15, y: 0.15 },
                { x: 0.85, y: 0.15 },
                { x: 0.85, y: 0.85 },
                { x: 0.15, y: 0.85 },
              ],
              rotation: 0,
              revision: 1,
              mime: 'image/jpeg',
              preferredPaper: 'A4',
              format,
            },
          });
        });
      return {
        automatic: (await request(1)).format,
        manual: (await request(2, { kind: 'standard', preset: 'letter', origin: 'user' })).format,
      };
    } finally {
      worker.terminate();
    }
  }, DEFAULT_LIMITS);
  expect(result.automatic.preset).toBe('A4');
  expect(result.manual).toEqual({ kind: 'standard', preset: 'letter', origin: 'user' });
});
