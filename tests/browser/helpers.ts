import { expect } from './fixtures';
import type { Page } from '@playwright/test';
export async function waitForPreview(page: Page, previousSrc: string | null = null) {
  const image = page.getByRole('img', { name: /^(Edited page|Bearbeitete Seite)$/, exact: true });
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'false');
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((img: HTMLImageElement, previousSrc) => {
        const src = img.getAttribute('src');
        return (
          !!src &&
          src.startsWith('blob:') &&
          src !== previousSrc &&
          img.currentSrc === src &&
          img.complete &&
          img.naturalWidth > 0 &&
          img.naturalHeight > 0
        );
      }, previousSrc),
    )
    .toBe(true);
  await image.evaluate((img: HTMLImageElement) => img.decode());
  return image;
}
export async function previewHash(page: Page, previousSrc: string | null = null) {
  const image = await waitForPreview(page, previousSrc);
  return image.evaluate(async (img: HTMLImageElement) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', await (await fetch(img.src)).arrayBuffer()),
      ),
    ).join(','),
  );
}
export async function readCornerOriginal(page: Page) {
  await closeTool(page);
  await waitForPreview(page);
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    const probe = { descriptor, url: '' };
    (window as any).cornerOriginalProbe = probe;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...descriptor,
      set(this: HTMLImageElement, value: string) {
        if (!this.isConnected && value.startsWith('blob:')) probe.url = value;
        descriptor.set!.call(this, value);
      },
    });
  });
  try {
    await page.getByRole('button', { name: /^(Ecken korrigieren|Adjust corners)$/ }).click();
    await expect(
      page.getByRole('button', { name: /^(Zuschnitt übernehmen|Apply crop)$/ }),
    ).toBeEnabled();
    return await page.evaluate(async () => {
      const url = (window as any).cornerOriginalProbe.url;
      if (!url) throw new Error('The corner editor original image was not observed');
      const image = new Image();
      image.src = url;
      await image.decode();
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        bytes: Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),
      };
    });
  } finally {
    await page.evaluate(() => {
      Object.defineProperty(
        HTMLImageElement.prototype,
        'src',
        (window as any).cornerOriginalProbe.descriptor,
      );
      delete (window as any).cornerOriginalProbe;
    });
  }
}
export async function expectReviewControls(page: Page) {
  const geometry = await page.locator('.scanner-review-viewer').evaluate((viewer) => {
    const root = viewer.getBoundingClientRect(),
      strip = viewer.querySelector('.scanner-viewer-controls')!.getBoundingClientRect(),
      zoom = viewer.querySelector('.scanner-zoom-controls')!.getBoundingClientRect(),
      before = viewer.querySelector('.scanner-before-control')?.getBoundingClientRect(),
      hints = viewer.querySelector('.scanner-hints')?.getBoundingClientRect(),
      surface = viewer.querySelector('.scanner-image-surface')!.getBoundingClientRect();
    return {
      stripHeight: strip.height,
      centerDifference: Math.abs(zoom.left + zoom.width / 2 - root.left - root.width / 2),
      bottomDifference: Math.abs(strip.bottom - root.bottom),
      surfaceDifference: Math.abs(surface.bottom - strip.top),
      beforeVerticalDifference: before
        ? Math.abs(before.top + before.height / 2 - zoom.top - zoom.height / 2)
        : 0,
      hintsVerticalDifference: hints
        ? Math.abs(hints.top + hints.height / 2 - zoom.top - zoom.height / 2)
        : 0,
      beforeOverlap: before ? before.right - zoom.left : 0,
      hintsOverlap: hints ? zoom.right - hints.left : 0,
    };
  });
  expect(geometry.stripHeight).toBe(56);
  for (const key of [
    'centerDifference',
    'bottomDifference',
    'surfaceDifference',
    'beforeVerticalDifference',
    'hintsVerticalDifference',
  ] as const)
    expect(geometry[key]).toBeLessThan(1);
  expect(geometry.beforeOverlap).toBeLessThanOrEqual(0);
  expect(geometry.hintsOverlap).toBeLessThanOrEqual(0);
}
export async function expectRangeReset(page: Page, label: string, resetLabel: string) {
  const reset = page.getByRole('button', { name: resetLabel, exact: true });
  await expect(reset.locator('svg')).toHaveCount(1);
  await expect(reset).toHaveText('');
  const slider = (await page.getByRole('slider', { name: label, exact: true }).boundingBox())!,
    button = (await reset.boundingBox())!;
  expect(button.x).toBeGreaterThanOrEqual(slider.x + slider.width - 1);
  expect(Math.abs(button.y + button.height / 2 - slider.y - slider.height / 2)).toBeLessThan(1);
  expect(button.width).toBeGreaterThanOrEqual(44);
  expect(button.height).toBeGreaterThanOrEqual(44);
}
export async function openOptions(page: Page) {
  const button = page.getByRole('button', { name: 'Optionen', exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
export async function chooseCaptureWorkflow(page: Page, workflow: 'review-each' | 'continuous') {
  await openOptions(page);
  await page.getByLabel('Aufnahmeablauf', { exact: true }).selectOption(workflow);
  await closeAppPanel(page);
}
export async function diagnostics(page: Page) {
  const button = page.getByRole('button', {
    name: 'Diagnosedaten für Erkennung und Export',
    exact: true,
  });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
export async function closeTool(page: Page) {
  const apply = page
    .locator('.scanner-detail-footer')
    .getByRole('button', { name: /^(Übernehmen|OK)$/ });
  if (await apply.isVisible()) await apply.click();
}
export async function tool(page: Page, name: 'Filter' | 'Anpassen' | 'Format') {
  const panel = page.locator('.scanner-tool-panel');
  if ((await panel.isVisible()) && (await panel.getAttribute('aria-label')) === name) return;
  await closeTool(page);
  await page.getByRole('button', { name, exact: true }).click();
}
export async function acceptPage(page: Page) {
  await closeTool(page);
  const next = page
    .locator('.scanner-review-footer')
    .getByRole('button', { name: 'Weiter', exact: true });
  await expect(page.locator('.scanner-review-footer')).toBeVisible();
  const ready = page.locator('.scanner-review-footer button').last();
  await expect.poll(async () => (await next.isEnabled()) || (await ready.isEnabled())).toBe(true);
  if ((await next.isEnabled()) && !(await ready.isEnabled())) await next.click();
  else await page.getByRole('button', { name: /^Seitenübersicht/ }).click();
}
export async function chooseFormat(page: Page, value: string) {
  await tool(page, 'Format');
  const name =
    value === 'receipt'
      ? 'Bon'
      : value === 'original-ratio'
        ? 'Originalverhältnis'
        : value === 'letter'
          ? 'Letter'
          : value === 'postcard-100x150'
            ? 'Postkarte 10 × 15 cm'
            : value;
  await page
    .getByRole('group', { name: 'Ausgabeformat', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
  await expect(
    page
      .getByRole('group', { name: 'Ausgabeformat', exact: true })
      .getByRole('button', { name, exact: true }),
  ).toBeEnabled();
}
export async function discardResult(page: Page) {
  await closeAppPanel(page);
  const info = page.getByRole('button', { name: 'Integrationsdetails', exact: true });
  if ((await info.getAttribute('aria-expanded')) !== 'true') await info.click();
  await page.getByRole('button', { name: 'Ergebnisse verwerfen', exact: true }).click();
  await page.getByRole('button', { name: 'Jetzt verwerfen', exact: true }).click();
}
export const profileName = (value: string) =>
  ({ auto: 'Auto', none: 'Foto', paper: 'Farbe', grayscale: 'Graustufen', bw: 'Schwarz-Weiß' })[
    value
  ]!;
export async function chooseProfile(page: Page, value: string) {
  await tool(page, 'Filter');
  await page.getByRole('button', { name: profileName(value), exact: true }).click();
  await expect(page.getByRole('button', { name: profileName(value), exact: true })).toBeEnabled();
}
export async function tone(page: Page, name: 'Helligkeit' | 'Kontrast' | 'Schärfe' | 'Linse') {
  await tool(page, 'Anpassen');
  await page.getByRole('button', { name, exact: true }).click();
}
export async function pageActions(page: Page, index?: number) {
  const grid = page.getByRole('button', { name: /^Seitenübersicht/ });
  if (await grid.isVisible()) await grid.click();
  const buttons = page.getByRole('button', { name: /Seite \d+: Seitenaktionen/ });
  const button = index === undefined ? buttons.last() : buttons.nth(index - 1);
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
export async function showPdf(page: Page, index = 1) {
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const pager = page.locator('.result-pager');
  while (!(await pager.innerText()).includes(`Seite ${index} /`)) {
    const current = Number((await pager.innerText()).match(/Seite (\d+)/)![1]);
    await pager
      .getByRole('button', {
        name: current < index ? 'Nächste Seite' : 'Vorherige Seite',
        exact: true,
      })
      .click();
  }
  await expect(page.getByRole('img', { name: `PDF-Seite ${index}`, exact: true })).toBeVisible();
}

export async function closeAppPanel(page: Page) {
  for (const name of ['Optionen schließen', 'Diagnose schließen']) {
    const button = page.getByRole('button', { name, exact: true });
    if (await button.isVisible()) await button.click();
  }
}

export async function discardDraft(page: Page) {
  await closeTool(page);
  await page.getByRole('button', { name: 'Aufnahme verwerfen', exact: true }).click();
}
