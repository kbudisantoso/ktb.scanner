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
export async function openOptions(page: Page) {
  const button = page.getByRole('button', { name: 'Optionen', exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
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
  await page.getByRole('button', { name: 'Weitere Aktionen', exact: true }).click();
  await page.getByRole('button', { name: 'Aufnahme verwerfen', exact: true }).click();
}
