import { discardDraft, previewHash } from './helpers';
import { acceptPage, chooseFormat, discardResult, closeTool } from './helpers';
import { closeAppPanel } from './helpers';
import { openOptions, pageActions, showPdf, tool } from './helpers';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
async function acceptExamples(page: import('@playwright/test').Page) {
  await closeAppPanel(page);
  await page.getByRole('button', { name: 'Mit zwei Beispielbelegen ausprobieren' }).click();
  await acceptPage(page);
  await acceptPage(page);
}
test('visible image replacement replaces an unaccepted import without camera access or adding a page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Denied', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    }),
  );
  await page.goto('/');
  const blank = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 600, 800);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'blank.png',
    mimeType: 'image/png',
    buffer: Buffer.from(blank, 'base64'),
  });
  const repeat = page.getByRole('button', { name: 'Bild tauschen', exact: true });
  await expect(
    page.getByRole('heading', { name: 'Dokumentecken festlegen', exact: true }),
  ).toBeVisible();
  const importRetake = async (index: number) => {
    const replacement = await page.evaluate(fixtureInBrowser, fixtures[index]);
    const choosing = page.waitForEvent('filechooser');
    await repeat.click();
    await (
      await choosing
    ).setFiles({
      name: 'retake.png',
      mimeType: 'image/png',
      buffer: Buffer.from(replacement.split(',')[1], 'base64'),
    });
  };
  await importRetake(1);
  const preview = page.getByRole('img', { name: 'Bearbeitete Seite', exact: true });
  await expect(preview).toBeVisible();
  const before = await previewHash(page);
  const cancelled = page.waitForEvent('filechooser');
  await repeat.click();
  await (await cancelled).setFiles([]);
  await expect(repeat).toBeFocused();
  expect(await previewHash(page)).toBe(before);
  const previousPreviewSrc = await preview.getAttribute('src');
  expect(previousPreviewSrc).toMatch(/^blob:/);
  await importRetake(3);
  expect(await previewHash(page, previousPreviewSrc)).not.toBe(before);
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 Seite fertig', exact: true })).toBeVisible();
});
test('initial page does not load scanner engine or PDF and opens with focus', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  expect(requests.filter((url) => /processing.worker|scanic\.js|pdf.worker/.test(url))).toEqual([]);
  await closeAppPanel(page);
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await expect(page.getByRole('dialog')).toBeFocused();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.getByRole('button', { name: /Dokument scannen/ })).toBeFocused();
});
test('two-page import, manual layout, sort, PNG export, PDF.js preview and download', async ({
  page,
}) => {
  await page.goto('/');
  await acceptExamples(page);
  await pageActions(page, 2);
  await page.getByRole('button', { name: 'Seite 2: Nach oben' }).click();
  await page
    .getByRole('button', { name: /Seite \d+: Bearbeiten/ })
    .first()
    .click();
  await tool(page, 'Format');
  await chooseFormat(page, 'A6');
  await closeTool(page);
  await page.getByRole('button', { name: '90° drehen' }).click();
  await acceptPage(page);
  await page.getByLabel('Bildexport').selectOption('image/png');
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await showPdf(page, 2);
  await page.getByRole('button', { name: 'Bilder', exact: true }).click();
  await page
    .locator('.result-pager')
    .getByRole('button', { name: 'Vorherige Seite', exact: true })
    .click();
  await expect(page.getByRole('img', { name: 'Exportierte Seite 1' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'PDF herunterladen', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('scan.pdf');
  await page.getByRole('button', { name: 'Integrationsdetails', exact: true }).click();
  await expect(page.locator('pre')).toContainText('"preset": "A6"');
  await expect(page.locator('pre')).toContainText('"rotationDegrees": 90');
  await expect(page.locator('pre')).toContainText('"outputMimeType": "image/png"');
  await discardResult(page);
  await expect(page.getByRole('link', { name: 'PDF herunterladen', exact: true })).toHaveCount(0);
});
test('corrupt input is recoverable and original pages survive a failed replacement', async ({
  page,
}) => {
  await page.goto('/');
  await acceptExamples(page);
  await pageActions(page);
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ersetzen', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG'),
  });
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.locator('.scanner-pages article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 2);
});
test('narrow theme, keyboard corner editor and cancellation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openOptions(page);
  await page.getByLabel('Gestaltung').selectOption('ink');
  await closeAppPanel(page);
  await page.getByRole('button', { name: 'Mit zwei Beispielbelegen ausprobieren' }).click();
  await page.getByRole('button', { name: 'Ecken korrigieren' }).click();
  await expect(page.locator('.scanner-corner-host canvas')).toBeVisible();
  await expect(page.locator('.scanner-corner-nudges')).toHaveCount(0);
  await expect(
    page.getByText('Pfeiltasten: 1 Pixel. Mit Umschalt: 10 Pixel.', { exact: true }),
  ).toHaveCount(0);
  const handle = page.getByRole('button', { name: 'Ecke oben links', exact: true });
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Zuschnitt übernehmen' }).click();
  await acceptPage(page);
  await discardDraft(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Scans verwerfen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('Astro uses the built package for real import and PDF download', async ({ page }) => {
  await page.goto('http://127.0.0.1:4377');
  const data = await page.evaluate(
    fixtureInBrowser,
    fixtures.find((item) => item.name === 'acceptance-grid')!,
  );
  await page.locator('#file').setInputFiles({
    name: 'acceptance.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data.split(',')[1], 'base64'),
  });
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await expect(page.getByRole('link', { name: 'PDF herunterladen' })).toBeVisible();
});
test('all acceptance fixtures pass through the real engine without losing the source', async ({
  page,
}) => {
  await page.goto('/');
  for (const fixture of fixtures.filter((f) => f.split === 'acceptance')) {
    const data = await page.evaluate(fixtureInBrowser, fixture);
    await page.locator('main > input[type=file]').setInputFiles({
      name: `${fixture.name}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1], 'base64'),
    });
    const preview = page.getByRole('img', { name: 'Bearbeitete Seite' });
    const confirmCrop = page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true });
    await expect(preview.or(confirmCrop)).toBeVisible();
    if (await confirmCrop.isVisible()) {
      await expect(page.getByRole('button', { name: 'Abschließen', exact: true })).toHaveCount(0);
      await confirmCrop.click();
    }
    await expect(preview).toBeVisible();
    await page.getByRole('button', { name: 'Original vergleichen' }).click();
    await expect
      .poll(() =>
        page.getByRole('img', { name: 'Originalaufnahme' }).evaluate((img: HTMLImageElement) => ({
          width: img.naturalWidth,
          height: img.naturalHeight,
        })),
      )
      .toEqual({ width: fixture.width, height: fixture.height });
    await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.getByRole('button', { name: 'Scans verwerfen', exact: true }).click();
  }
});

test('exported image dimensions and independently rendered PDF layout match metadata', async ({
  page,
}) => {
  await page.goto('/');
  await acceptExamples(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 2);
  await showPdf(page, 1);
  const metrics = await page.evaluate(() => {
    const manifest = JSON.parse(document.querySelector('pre')!.textContent!);
    return manifest.pages.map((entry: any, index: number) => {
      const image = document.querySelectorAll<HTMLImageElement>('.result-page img')[index];
      const pdf = document.querySelector<HTMLCanvasElement>(
        `canvas[aria-label="PDF-Seite ${index + 1}"]`,
      )!;
      const source = document.createElement('canvas');
      source.width = image.naturalWidth;
      source.height = image.naturalHeight;
      source.getContext('2d')!.drawImage(image, 0, 0);
      const imageData = source.getContext('2d')!.getImageData(0, 0, source.width, source.height);
      const pdfData = pdf.getContext('2d')!.getImageData(0, 0, pdf.width, pdf.height);
      const scale = Math.min(pdf.width / source.width, pdf.height / source.height);
      const x = (pdf.width - source.width * scale) / 2,
        y = (pdf.height - source.height * scale) / 2;
      let difference = 0,
        count = 0;
      for (let row = 1; row < 12; row++)
        for (let col = 1; col < 8; col++) {
          const ix = Math.floor((source.width * col) / 8),
            iy = Math.floor((source.height * row) / 12);
          const px = Math.min(pdf.width - 1, Math.floor(x + ix * scale)),
            py = Math.min(pdf.height - 1, Math.floor(y + iy * scale));
          for (let channel = 0; channel < 3; channel++) {
            difference += Math.abs(
              imageData.data[(iy * source.width + ix) * 4 + channel] -
                pdfData.data[(py * pdf.width + px) * 4 + channel],
            );
            count++;
          }
        }
      return {
        actual: [image.naturalWidth, image.naturalHeight],
        expected: [entry.metadata.outputSizePx.width, entry.metadata.outputSizePx.height],
        actualRatio: pdf.width / pdf.height,
        expectedRatio: entry.metadata.outputLayoutMm.width / entry.metadata.outputLayoutMm.height,
        pixelDifference: difference / count,
      };
    });
  });
  for (const result of metrics) {
    expect(result.actual).toEqual(result.expected);
    expect(Math.abs(result.actualRatio - result.expectedRatio)).toBeLessThan(0.01);
    expect(result.pixelDifference).toBeLessThan(20);
  }
  await page.getByRole('button', { name: 'Bilder', exact: true }).click();
  const pager = page.locator('.result-pager');
  for (const index of [1, 2]) {
    const image = page.getByRole('img', { name: `Exportierte Seite ${index}`, exact: true });
    const displayed = await image.getAttribute('src');
    const sameBytes = await page
      .getByRole('link', { name: 'Bild herunterladen', exact: true })
      .evaluate(async (a: HTMLAnchorElement, imageUrl: string) => {
        const bytes = async (url: string) =>
          Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())).join(',');
        return (await bytes(a.href)) === (await bytes(imageUrl));
      }, displayed!);
    expect(sameBytes).toBe(true);
    if (index === 1)
      await pager.getByRole('button', { name: 'Nächste Seite', exact: true }).click();
  }
});

test('EXIF orientation is normalized once and original bytes remain unchanged', async ({
  page,
}) => {
  const { jpegWithOrientation } = await import('../fixtures/exif');
  await page.goto('/');
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 900, 600);
    context.fillStyle = '#c02030';
    context.fillRect(0, 0, 150, 150);
    context.fillStyle = '#303030';
    context.font = '30px monospace';
    context.fillText('ORIENTIERUNG TEST', 180, 100);
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  });
  for (const orientation of [2, 6, 8]) {
    const bytes = jpegWithOrientation(new Uint8Array(Buffer.from(base64, 'base64')), orientation);
    await page.locator('main > input[type=file]').setInputFiles({
      name: 'orientation.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(bytes),
    });
    const confirm = page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true });
    const preview = page.getByRole('img', { name: 'Bearbeitete Seite' });
    await expect(preview.or(confirm)).toBeVisible();
    if (await confirm.isVisible()) await confirm.click();
    await expect(preview).toBeVisible();
    await page.getByRole('button', { name: 'Original vergleichen' }).click();
    await expect
      .poll(() =>
        page
          .getByRole('img', { name: 'Originalaufnahme' })
          .evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]),
      )
      .toEqual(orientation === 2 ? [900, 600] : [600, 900]);
    const source = await page
      .getByRole('img', { name: 'Originalaufnahme' })
      .evaluate(async (img: HTMLImageElement) => ({
        size: [img.naturalWidth, img.naturalHeight],
        bytes: Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
      }));
    expect(source.size).toEqual(orientation === 2 ? [900, 600] : [600, 900]);
    expect(source.bytes).toEqual(Array.from(bytes));
    await acceptPage(page);
    await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
    await showPdf(page, 1);
    const manifest = JSON.parse((await page.locator('pre').textContent()) ?? '{}');
    expect(manifest.pages[0].metadata.normalizedSourceSizePx).toEqual(
      orientation === 2 ? { width: 900, height: 600 } : { width: 600, height: 900 },
    );
    await discardResult(page);
  }
});
