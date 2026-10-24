import { acceptPage } from './helpers';
import { chooseProfile, showPdf } from './helpers';
import { test, expect } from './fixtures';

test('photo, color document, grayscale and black-white produce distinct reversible artifacts', async ({
  page,
}) => {
  await page.goto('/');
  const source = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 1400;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#344f42';
    ctx.fillRect(0, 0, c.width, c.height);
    const g = ctx.createLinearGradient(100, 0, 900, 0);
    g.addColorStop(0, '#878787');
    g.addColorStop(1, '#dcdcdc');
    ctx.fillStyle = g;
    ctx.fillRect(100, 100, 800, 1200);
    ctx.fillStyle = '#202020';
    ctx.font = '22px monospace';
    for (let y = 210; y < 1150; y += 48) ctx.fillText('TEST 012345 12,34 EUR', 160, y);
    ctx.fillStyle = '#b52a45';
    ctx.fillRect(700, 1150, 100, 60);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'profiles.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source, 'base64'),
  });
  const image = page.getByRole('img', { name: 'Bearbeitete Seite', exact: true }),
    confirm = page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true });
  await expect(image.or(confirm)).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
  const metrics = async () => {
    await expect
      .poll(() => image.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
      .toBe(true);
    return image.evaluate(async (i: HTMLImageElement) => {
      const c = document.createElement('canvas');
      c.width = i.naturalWidth;
      c.height = i.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(i, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let colors = 0,
        nearBinary = 0;
      const levels = new Set<number>();
      for (let p = 0; p < d.length; p += 4) {
        levels.add(d[p]);
        if (Math.max(d[p], d[p + 1], d[p + 2]) - Math.min(d[p], d[p + 1], d[p + 2]) > 3) colors++;
        if (d[p] < 16 || d[p] > 239) nearBinary++;
      }
      const paper = ctx.getImageData(
        Math.floor(c.width * 0.15),
        Math.floor(c.height * 0.03),
        16,
        16,
      ).data;
      let brightness = 0;
      for (let p = 0; p < paper.length; p += 4) brightness += paper[p];
      return {
        colors,
        levels: levels.size,
        nearBinary: nearBinary / (d.length / 4),
        brightness: brightness / 256,
        hash: Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', await (await fetch(i.src)).arrayBuffer()),
          ),
        ).join(','),
      };
    });
  };
  const choose = async (value: string) => {
    const old = await image.getAttribute('src');
    await chooseProfile(page, value);
    await expect(image).not.toHaveAttribute('src', old!);
    return metrics();
  };
  const photo = await choose('none'),
    color = await choose('paper'),
    gray = await choose('grayscale'),
    bw = await choose('bw');
  expect(photo.colors).toBeGreaterThan(1000);
  expect(color.colors).toBeGreaterThan(1000);
  expect(color.brightness - photo.brightness).toBeGreaterThan(45);
  expect(color.brightness).toBeGreaterThanOrEqual(247);
  expect(gray.brightness).toBeGreaterThanOrEqual(247);
  expect(gray.colors).toBe(0);
  expect(gray.levels).toBeGreaterThan(32);
  expect(bw.colors).toBe(0);
  expect(bw.nearBinary).toBeGreaterThan(0.95);
  expect((await choose('none')).hash).toEqual(photo.hash);
  await choose('bw');
  await acceptPage(page);
  await page.getByLabel('Bildexport', { exact: true }).selectOption('image/png');
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  const result = await page.evaluate(() => {
    const i = document.querySelector<HTMLImageElement>('.result-page img')!,
      c = document.createElement('canvas');
    c.width = i.naturalWidth;
    c.height = i.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(i, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let monochrome = true;
    for (let p = 0; p < d.length; p += 4)
      if (d[p] !== d[p + 1] || d[p] !== d[p + 2]) {
        monochrome = false;
        break;
      }
    return {
      monochrome,
      levels: new Set(Array.from(d).filter((_, i) => i % 4 === 0)).size,
      metadata: JSON.parse(document.querySelector('pre')!.textContent!).pages[0].metadata,
    };
  });
  expect(result.monochrome).toBe(true);
  expect(result.levels).toBeGreaterThan(16);
  expect(result.metadata.recipe.enhancement).toBe('bw');
  expect(result.metadata.outputMimeType).toBe('image/png');
});
