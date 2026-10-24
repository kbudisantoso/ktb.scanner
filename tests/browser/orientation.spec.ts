import { acceptPage, chooseFormat, closeTool } from './helpers';
import { chooseProfile, showPdf, tool } from './helpers';
import { test, expect } from './fixtures';

test('paper orientation corrects axes without turning the image and survives edit, rotation and PDF export', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 402, height: 714 });
  await page.goto('/');
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#33423b';
    ctx.fillRect(0, 0, 1000, 800);
    ctx.fillStyle = '#287b8b';
    ctx.fillRect(100, 150, 800, 500);
    ctx.fillStyle = '#df2634';
    ctx.fillRect(130, 180, 180, 140);
    return canvas.toDataURL('image/png');
  });
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'foreshortened.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data.split(',')[1], 'base64'),
  });
  const preview = page.getByRole('img', { name: 'Bearbeitete Seite' });
  const confirm = page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true });
  await expect(preview.or(confirm)).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
  await tool(page, 'Format');
  await chooseFormat(page, 'A4');
  await chooseProfile(page, 'none');
  await tool(page, 'Format');
  const portrait = page.getByRole('button', { name: 'Hochformat', exact: true });
  const landscape = page.getByRole('button', { name: 'Querformat', exact: true });
  let marker: { x: number; y: number } | undefined;
  for (const orientation of ['portrait', 'landscape', 'portrait']) {
    await (orientation === 'portrait' ? portrait : landscape).click();
    await expect(orientation === 'portrait' ? portrait : landscape).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight))
      .toBeCloseTo(orientation === 'portrait' ? 210 / 297 : 297 / 210, 2);
    // Paper axes must preserve the mark's normalized position, not turn content.
    const red = await preview.evaluate((img: HTMLImageElement) => {
      const c = document.createElement('canvas');
      c.width = 100;
      c.height = 100;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 100, 100);
      const data = ctx.getImageData(0, 0, 100, 100).data;
      let count = 0,
        x = 0,
        y = 0;
      for (let i = 0; i < 10000; i++) {
        if (data[i * 4] > data[i * 4 + 1] + 60 && data[i * 4] > data[i * 4 + 2] + 40) {
          count++;
          x += i % 100;
          y += Math.floor(i / 100);
        }
      }
      return { count, x: x / count / 100, y: y / count / 100 };
    });
    expect(red.count).toBeGreaterThan(5);
    marker ??= red;
    expect(Math.abs(red.x - marker.x)).toBeLessThan(0.03);
    expect(Math.abs(red.y - marker.y)).toBeLessThan(0.03);
  }
  await closeTool(page);
  await page.getByRole('button', { name: '90° drehen', exact: true }).click();
  await tool(page, 'Format');
  await expect(landscape).toHaveAttribute('aria-pressed', 'true');
  await portrait.click();
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight))
    .toBeCloseTo(210 / 297, 2);
  await chooseProfile(page, 'paper');
  await tool(page, 'Format');
  await expect(portrait).toHaveAttribute('aria-pressed', 'true');
  await tool(page, 'Format');
  await chooseFormat(page, 'A5');
  await expect(page.getByRole('button', { name: 'A5', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(portrait).toBeEnabled();
  await expect(portrait).toHaveAttribute('aria-pressed', 'true');
  await portrait.scrollIntoViewIfNeeded();
  await info.attach('mobile-orientation-controls', {
    body: await page.screenshot({
      path: `artifacts/local/mobile-paper-orientation-${info.project.name}.png`,
    }),
    contentType: 'image/png',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  const metadata = JSON.parse((await page.locator('pre').textContent())!).pages[0].metadata;
  expect(metadata.format).toEqual({
    kind: 'standard',
    preset: 'A5',
    origin: 'user',
    orientation: 'landscape',
  });
  expect(metadata.rotationDegrees).toBe(90);
  expect(metadata.outputLayoutMm).toEqual({ width: 148, height: 210 });
  expect(metadata.outputSizePx.width / metadata.outputSizePx.height).toBeCloseTo(148 / 210, 2);
  await expect
    .poll(() =>
      page
        .getByRole('img', { name: 'PDF-Seite 1' })
        .evaluate((element) =>
          element instanceof HTMLCanvasElement
            ? element.width / element.height
            : (element as HTMLImageElement).naturalWidth /
              (element as HTMLImageElement).naturalHeight,
        ),
    )
    .toBeCloseTo(148 / 210, 2);
});
