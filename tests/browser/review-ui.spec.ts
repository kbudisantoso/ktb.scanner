import { test, expect } from './fixtures';
import {
  openOptions,
  closeAppPanel,
  tool,
  tone,
  closeTool,
  chooseFormat,
  showPdf,
  pageActions,
  discardResult,
  expectReviewControls,
  expectViewerControls,
  expectRangeReset,
} from './helpers';
import type { Page } from '@playwright/test';
import { fixtureInBrowser, type Fixture } from '../fixtures/generate';

async function openReview(page: Page, deep: boolean) {
  if (deep) {
    await page.getByRole('button', { name: 'Mit zwei Beispielbelegen ausprobieren' }).click();
    return;
  }
  const documents: Fixture[] = [
    {
      name: 'layout-invoice',
      width: 1100,
      height: 1400,
      paper: [80, 70, 940, 1260],
      split: 'acceptance',
      blur: 0,
      background: '#677568',
    },
    {
      name: 'layout-receipt',
      width: 660,
      height: 1800,
      paper: [80, 70, 500, 1660],
      split: 'acceptance',
      blur: 0,
      background: '#677568',
    },
  ];
  const files = [];
  for (const fixture of documents) {
    const original = await page.evaluate(fixtureInBrowser, fixture);
    const compact = await page.evaluate(async (data) => {
      const image = await createImageBitmap(await (await fetch(data)).blob());
      const scale = 700 / Math.max(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.close();
      const result = canvas.toDataURL('image/png').split(',')[1];
      canvas.width = canvas.height = 1;
      return result;
    }, original);
    files.push({
      name: `${fixture.name}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(compact, 'base64'),
    });
  }
  await page.locator('main > input[type=file]').setInputFiles(files);
}

async function fits(page: Page, selector: string) {
  const issues = await page.locator(selector).evaluate((root) => {
    const issues: string[] = [];
    for (const element of root.querySelectorAll<HTMLElement>(
      'button,select,input:not([type=file]),a[download]',
    )) {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden')
        continue;
      const target =
        element instanceof HTMLInputElement && element.type === 'checkbox'
          ? element.closest('label')!
          : element;
      const b = target.getBoundingClientRect(),
        name = element.getAttribute('aria-label') || element.textContent;
      if (b.width < 43 || b.height < 43) issues.push(`${name}: target ${b.width}x${b.height}`);
      // Page tiles are intentionally reachable by scrolling their own bounded region.
      if (element.closest('.scanner-pages')) continue;
      if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1)
        issues.push(`${name}: outside viewport`);
      for (let p = element.parentElement; p && root.contains(p); p = p.parentElement) {
        const style = getComputedStyle(p),
          r = p.getBoundingClientRect();
        if (
          ['auto', 'hidden', 'scroll', 'clip'].includes(style.overflowY) &&
          (b.top < r.top - 1 || b.bottom > r.bottom + 1)
        )
          issues.push(`${name}: clipped by ${p.className}`);
      }
    }
    return issues;
  });
  expect(issues).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
}
async function equallyDistributed(page: Page, selector: string) {
  const geometry = await page.locator(selector).evaluate((row) => {
    const bounds = row.getBoundingClientRect();
    const buttons = [...row.querySelectorAll('button')].map((button) =>
      button.getBoundingClientRect(),
    );
    return {
      widthDifference:
        Math.max(...buttons.map((b) => b.width)) - Math.min(...buttons.map((b) => b.width)),
      topDifference:
        Math.max(...buttons.map((b) => b.top)) - Math.min(...buttons.map((b) => b.top)),
      left: Math.abs(buttons[0].left - bounds.left),
      right: Math.abs(buttons.at(-1)!.right - bounds.right),
    };
  });
  for (const difference of Object.values(geometry)) expect(difference).toBeLessThan(1);
}
for (const theme of ['forest', 'ink'])
  for (const [width, height] of [
    [320, 568],
    [390, 664],
    [844, 390],
  ]) {
    test(`focused ${theme} ${width}x${height}: review, detail tools, tiles and direct finish`, async ({
      page,
    }, info) => {
      const deep = width === 390;
      const next = page.getByRole('button', { name: 'Weiter', exact: true }),
        finish = page.getByRole('button', { name: 'Abschließen', exact: true });
      await test.step('Fresh workspace and review', async () => {
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await fits(page, 'main');
        await openOptions(page);
        await page.getByLabel('Gestaltung').selectOption(theme);
        await closeAppPanel(page);
        await openReview(page, deep);
        await expect(next).toBeEnabled();
        await expect(finish).toBeDisabled();
        await expect(
          page.getByRole('button', { name: 'Bild tauschen', exact: true }),
        ).toBeVisible();
        const actions = page.locator('.scanner-review-quick').getByRole('button');
        await expect(actions).toHaveCount(3);
        await expect(actions.nth(0)).toHaveText('Bild tauschen');
        await expect(actions.nth(1)).toHaveAccessibleName('Aufnahme verwerfen');
        await expect(actions.nth(2)).toHaveAccessibleName('Weitere Seite');
        await expect(
          page
            .locator('.scanner-header')
            .getByRole('button', { name: 'Weitere Seite', exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Weitere Aktionen', exact: true }),
        ).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Original vergleichen', exact: true }),
        ).toHaveCount(0);
        await expect(page.locator('.scanner-review-utility')).toHaveCount(0);
        await equallyDistributed(page, '.scanner-review-quick');
        await expectReviewControls(page);
        await fits(page, '.scanner');
        if (info.project.name === 'mobile-webkit')
          await info.attach('review-actions.png', {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
      });
      await test.step('Focused tools and held comparison', async () => {
        const surface = page.locator('.scanner-image-surface');
        await surface.press('Enter');
        await expect(surface).toHaveAttribute('data-zoom', '100');
        for (const panel of ['Filter', 'Anpassen', 'Format'] as const) {
          await tool(page, panel);
          await expect(page.locator('.scanner-hints')).toHaveCount(0);
          await expect(page.locator('.scanner-review-footer')).toHaveCount(0);
          await expect(page.getByRole('button', { name: /^Seitenübersicht/ })).toHaveCount(0);
          await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toHaveCount(0);
          await expect(surface).toHaveAttribute('data-zoom', '100');
          const footer = page.locator('.scanner-detail-footer');
          await expect(
            footer.getByRole('button', { name: 'Rückgängig', exact: true }),
          ).toBeDisabled();
          await expect(footer.getByRole('button')).toHaveCount(3);
          await expect(footer.getByRole('button')).toHaveText([
            'Abbrechen',
            'Rückgängig',
            'Übernehmen',
          ]);
          await expect(
            page
              .locator('.scanner-tool-panel')
              .getByRole('button', { name: 'Rückgängig', exact: true }),
          ).toHaveCount(0);
          if (panel === 'Filter')
            await expect(
              page.getByRole('button', { name: 'Optimierung zurücksetzen', exact: true }),
            ).toHaveCount(0);
          if (panel === 'Anpassen') {
            for (const name of ['Helligkeit', 'Kontrast', 'Schärfe', 'Linse'] as const) {
              await tone(page, name);
              if (name !== 'Linse') await expectRangeReset(page, name, `${name} zurücksetzen`);
              await fits(page, '.scanner');
            }
            const modes = page.getByRole('group', { name: 'Linsenentzerrung', exact: true });
            await modes.getByRole('button', { name: 'Manuell', exact: true }).click();
            await expect(
              page.getByRole('slider', { name: 'Linsenkorrektur', exact: true }),
            ).toBeEnabled();
            await expectRangeReset(page, 'Linsenkorrektur', 'Linse zurücksetzen');
          }
          if (panel === 'Format') {
            const portrait = page
                .getByRole('button', { name: 'Hochformat', exact: true })
                .locator('path'),
              landscape = page
                .getByRole('button', { name: 'Querformat', exact: true })
                .locator('path');
            expect(await portrait.getAttribute('d')).toEqual(await landscape.getAttribute('d'));
            const postcard = page.getByRole('button', {
              name: 'Postkarte 10 × 15 cm',
              exact: true,
            });
            await expect(postcard).toContainText('Post-');
            await chooseFormat(page, 'receipt');
            await page.getByLabel('Bonbreite in mm', { exact: true }).fill('76');
          }
          await fits(page, '.scanner');
          await info.attach(`${panel}.png`, {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
          await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
          await expect(page.getByRole('button', { name: panel, exact: true })).toBeFocused();
        }
        const before = page.getByRole('button', {
          name: 'Vorher anzeigen - gedrückt halten',
          exact: true,
        });
        await before.focus();
        await page.keyboard.down('Space');
        await expect(before).toHaveAttribute('aria-pressed', 'true');
        await expect(
          page.getByRole('img', { name: 'Unoptimierter Zuschnitt', exact: true }),
        ).toBeVisible();
        await page.keyboard.up('Space');
        await expect(before).toHaveAttribute('aria-pressed', 'false');
        const hints = page.getByRole('button', { name: /^Hinweise: [1-9]\d*$/ });
        if (await hints.count()) {
          const count = Number((await hints.getAttribute('aria-label'))!.split(': ')[1]);
          await expect(hints).toHaveText(String(count));
          await hints.click();
          await expect(page.locator('.scanner-quality li')).toHaveCount(count);
          await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toHaveCount(0);
          await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toHaveCount(
            0,
          );
          await page.getByRole('button', { name: 'OK', exact: true }).click();
          await expect(hints).toBeFocused();
          await hints.click();
          await page.getByRole('dialog').focus();
          await page.keyboard.press('Escape');
          await expect(hints).toBeFocused();
        }
        await expectReviewControls(page);
      });
      await test.step('Corners, page navigation and tiles', async () => {
        await page.getByRole('button', { name: 'Ecken korrigieren', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toHaveCount(0);
        const tl = page.getByRole('button', { name: 'Ecke oben links', exact: true });
        await tl.focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('.scanner-corner-loupe')).toHaveAttribute(
          'data-position',
          'bottom',
        );
        await fits(page, '.scanner');
        await page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Ecken korrigieren', exact: true }),
        ).toBeFocused();
        await expect(next).toBeEnabled();
        await next.click();
        await expect(finish).toBeEnabled();
        await expect(next).toBeDisabled();
        await page.getByRole('button', { name: /^Seitenübersicht/ }).click();
        await expect(page.locator('.scanner-pages article')).toHaveCount(2);
        await fits(page, '.scanner');
        // Blob preview URLs mount after the page cards themselves.
        await expect(page.locator('.scanner-page-tile img')).toHaveCount(2);
        const thumbs = await page.locator('.scanner-page-tile').evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            const image = n.querySelector('img')!;
            return {
              width: r.width,
              height: r.height,
              fit: getComputedStyle(image).objectFit,
              position: getComputedStyle(image).objectPosition,
            };
          }),
        );
        for (const thumb of thumbs) {
          expect(thumb.width).toBeGreaterThanOrEqual(120);
          expect(thumb.height).toBeGreaterThanOrEqual(156);
          expect(thumb.fit).toBe('cover');
          expect(thumb.position).toBe('0% 0%');
        }
        if (deep) {
          await pageActions(page, 2);
          await page.getByRole('button', { name: 'Seite 2: Nach oben', exact: true }).click();
          await pageActions(page, 2);
        } else {
          await page.getByRole('button', { name: 'Seite 1: Bearbeiten', exact: true }).click();
          await page.getByRole('button', { name: /^Seitenübersicht/ }).click();
          await pageActions(page, 1);
        }
        await page
          .locator('.scanner-footer')
          .getByRole('button', { name: 'Zurück', exact: true })
          .click();
        await expect(
          page
            .locator('.scanner-review-footer')
            .getByRole('button', { name: 'Zurück', exact: true }),
        ).toBeDisabled();
        await expect(
          page
            .locator('.scanner-review-footer')
            .getByRole('button', { name: 'Weiter', exact: true }),
        ).toBeEnabled();
        await page.getByRole('button', { name: /^Seitenübersicht/ }).click();
        await page.getByRole('button', { name: 'Seite 1: Bearbeiten', exact: true }).click();
      });
      await test.step('Confirmed results, PDF and viewer', async () => {
        await finish.click();
        await expect(
          page.getByRole('heading', { name: '2 Seiten fertig', exact: true }),
        ).toBeVisible();
        await fits(page, '.results');
        await showPdf(page, 2);
        await fits(page, '.results');
        await info.attach('PDF.png', { body: await page.screenshot(), contentType: 'image/png' });
        await page.getByRole('button', { name: 'Bilder', exact: true }).click();
        await page.getByRole('button', { name: 'Seite 2 vergrößern', exact: true }).click();
        const viewer = page.getByRole('dialog');
        await expect(
          viewer.getByRole('img', { name: 'Vergrößerte Seite 2', exact: true }),
        ).toBeVisible();
        const imageViewer = viewer.locator('.scanner-image-viewer');
        await expect(imageViewer.locator('.scanner-before-control,.scanner-hints')).toHaveCount(0);
        await expectViewerControls(imageViewer);
        await fits(page, '.result-viewer');
        if (deep && info.project.name === 'mobile-webkit')
          await info.attach('result-viewer.png', {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
        await viewer.getByRole('button', { name: '100 Prozent', exact: true }).click();
        await expect(viewer.locator('.scanner-image-surface')).toHaveAttribute('data-zoom', '100');
        await viewer.getByRole('button', { name: 'Vorherige Seite', exact: true }).click();
        await expect(viewer.locator('.scanner-image-surface')).toHaveAttribute('data-zoom', 'fit');
        const downloadLink = viewer.getByRole('link', { name: 'Herunterladen', exact: true });
        await expect(downloadLink).toBeVisible();
        await expect(downloadLink).toHaveAttribute('download', 'scan-1.jpg');
        await expect(downloadLink).toHaveAttribute('href', /^blob:/);
        if (deep) {
          const download = page.waitForEvent('download');
          await downloadLink.click();
          expect((await download).suggestedFilename()).toBe('scan-1.jpg');
        }
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'Seite 1 vergrößern', exact: true }),
        ).toBeFocused();
        await page.getByRole('button', { name: 'Zurück', exact: true }).click();
        await page.getByRole('button', { name: 'Letztes Ergebnis öffnen', exact: true }).click();
        await expect(
          page.getByRole('link', { name: 'PDF herunterladen', exact: true }),
        ).toBeVisible();
        await discardResult(page);
        await fits(page, 'main');
      });
    });
  }
