import { chooseCaptureWorkflow } from './helpers';
import { acceptPage, closeTool } from './helpers';
import { chooseProfile, showPdf } from './helpers';
import { test, expect } from './fixtures';

test('blank paper explains unavailable auto sharpness and keeps manual capture available', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'Canvas video streams require physical Safari verification.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const c = document.createElement('canvas');
        c.width = 960;
        c.height = 1280;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#334b40';
        ctx.fillRect(0, 0, 960, 1280);
        ctx.fillStyle = '#fff';
        ctx.fillRect(170, 180, 620, 900);
        const timer = setInterval(() => ctx.fillRect(170, 180, 620, 900), 50);
        const stream = c.captureStream(20);
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(timer);
            stop();
          };
        }
        return stream;
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => [],
    });
  });
  await page.goto('/');
  await chooseCaptureWorkflow(page, 'review-each');
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'Schärfe nicht beurteilbar - bitte manuell auslösen.',
  );
  await page.waitForTimeout(2300);
  await expect(page.getByRole('img', { name: 'Bearbeitete Seite' })).toHaveCount(0);
  await expect(page.getByLabel('Aufnahmemodus')).toHaveValue('auto');
  await page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true }).click();
  await expect(
    page
      .getByRole('img', { name: 'Bearbeitete Seite' })
      .or(page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true })),
  ).toBeVisible();
});

test('paper cleanup is optional and reversible with separate source, crop and optimized output', async ({
  page,
}) => {
  await page.goto('/');
  const bytes = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 1300;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#405448';
    ctx.fillRect(0, 0, 1000, 1300);
    const gradient = ctx.createLinearGradient(100, 0, 900, 0);
    gradient.addColorStop(0, '#999999');
    gradient.addColorStop(1, '#ededed');
    ctx.fillStyle = gradient;
    ctx.fillRect(100, 100, 800, 1100);
    ctx.fillStyle = '#232323';
    ctx.font = '24px monospace';
    for (let y = 190; y < 1150; y += 50) ctx.fillText('TEST 0123456789 12,34', 150, y);
    ctx.fillStyle = '#c83845';
    ctx.fillRect(200, 1060, 120, 30);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'shadow.png',
    mimeType: 'image/png',
    buffer: Buffer.from(bytes, 'base64'),
  });
  const preview = page.getByRole('img', { name: 'Bearbeitete Seite' });
  const confirm = page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true });
  await expect(preview.or(confirm)).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
  await chooseProfile(page, 'paper');
  await expect(page.getByRole('button', { name: 'Farbe', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const pixelMetric = async (name: string) => {
    const image = page.getByRole('img', { name, exact: true });
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    return image.evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i];
      return {
        mean: sum / (data.length / 4),
        bytes: Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
      };
    });
  };
  const optimized = await pixelMetric('Bearbeitete Seite');
  await closeTool(page);
  const compare = page.getByRole('button', {
    name: 'Vorher anzeigen - gedrückt halten',
    exact: true,
  });
  await compare.focus();
  await page.keyboard.down('Space');
  const crop = await pixelMetric('Unoptimierter Zuschnitt');
  expect(optimized.mean).toBeGreaterThan(crop.mean + 15);
  await page.keyboard.up('Space');
  await page.getByRole('button', { name: 'Original vergleichen', exact: true }).click();
  const source = await pixelMetric('Originalaufnahme');
  expect(Buffer.from(source.bytes)).toEqual(Buffer.from(bytes, 'base64'));
  await closeTool(page);
  await chooseProfile(page, 'none');
  expect((await pixelMetric('Bearbeitete Seite')).bytes).toEqual(crop.bytes);
  await chooseProfile(page, 'paper');
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  const metadata = JSON.parse((await page.locator('pre').textContent())!).pages[0].metadata;
  expect(metadata.recipe.enhancement).toBe('paper');
});
