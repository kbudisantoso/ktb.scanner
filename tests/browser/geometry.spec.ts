import { acceptPage, chooseFormat, discardResult, closeTool } from './helpers';
import { showPdf, tool } from './helpers';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
test('perspective contour stays close to known document edges', async ({ page }, testInfo) => {
  await page.goto('/');
  const fixture = fixtures.find((item) => item.name === 'acceptance-perspective')!;
  const data = await page.evaluate(fixtureInBrowser, fixture);
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'perspective.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data.split(',')[1], 'base64'),
  });
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  const manifest = JSON.parse((await page.locator('pre').textContent()) ?? '{}');
  const measured = manifest.pages[0].metadata.corners as { x: number; y: number }[];
  const deviations = measured.map((p, index) =>
    Math.hypot(
      p.x * (fixture.width - 1) - fixture.destination![index][0],
      p.y * (fixture.height - 1) - fixture.destination![index][1],
    ),
  );
  await testInfo.attach('edge-deviations.json', {
    body: JSON.stringify({ fixture: fixture.name, deviations }),
    contentType: 'application/json',
  });
  expect(Math.max(...deviations)).toBeLessThanOrEqual(16);
});

test('separate calibration fixtures distinguish sharp structure from blur', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const measurements = [];
  for (const fixture of fixtures.filter((f) => f.split === 'calibration')) {
    const data = await page.evaluate(fixtureInBrowser, fixture);
    await page.locator('main > input[type=file]').setInputFiles({
      name: `${fixture.name}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1], 'base64'),
    });
    await acceptPage(page);
    await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
    await showPdf(page, 1);
    const manifest = JSON.parse((await page.locator('pre').textContent()) ?? '{}');
    const quality = manifest.pages[0].metadata.quality;
    measurements.push({ fixture: fixture.name, quality });
    expect(quality.sharpness).toBe(fixture.blur ? 'blur' : 'sharp');
    await discardResult(page);
  }
  await testInfo.attach('calibration-metrics.json', {
    body: JSON.stringify(measurements),
    contentType: 'application/json',
  });
});

test('paper selection rectifies preview and image and fills the rotated PDF without margins', async ({
  page,
}) => {
  await page.goto('/');
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#287b8b';
    ctx.fillRect(0, 0, 600, 600);
    return canvas.toDataURL('image/png');
  });
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data.split(',')[1], 'base64'),
  });
  await page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }).click();
  await tool(page, 'Format');
  await chooseFormat(page, 'A4');
  const preview = page.getByRole('img', { name: 'Bearbeitete Seite' });
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight))
    .toBeCloseTo(210 / 297, 2);
  await closeTool(page);
  await page.getByRole('button', { name: '90° drehen' }).click();
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight))
    .toBeCloseTo(297 / 210, 2);
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  const output = await page.evaluate(() => {
    const metadata = JSON.parse(document.querySelector('pre')!.textContent!).pages[0].metadata;
    const pdf = document.querySelector<HTMLCanvasElement>('.pdf-pages canvas')!;
    const ctx = pdf.getContext('2d')!;
    return {
      metadata,
      edges: [1, pdf.height - 2].map((y) => [
        ...ctx.getImageData(Math.floor(pdf.width / 2), y, 1, 1).data,
      ]),
    };
  });
  expect(output.metadata.outputLayoutMm).toEqual({ width: 297, height: 210 });
  expect(output.metadata.outputSizePx.width / output.metadata.outputSizePx.height).toBeCloseTo(
    297 / 210,
    2,
  );
  // The full-color source must reach both page edges; a centered square would leave white bands.
  for (const rgba of output.edges) expect(Math.min(...rgba.slice(0, 3))).toBeLessThan(180);
});
