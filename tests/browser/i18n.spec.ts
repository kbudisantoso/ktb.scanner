import { test, expect } from './fixtures';
import { build } from 'esbuild';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';

let harness: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents:
        "import {createScanner} from './packages/scanner/dist/react/index.js'; window.localeHarness={createScanner};",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  harness = result.outputFiles[0].text;
});
test('library opens in English by default, accepts German and preserves host overrides', async ({
  page,
}) => {
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).localeHarness)).toBe(true);
  for (const [locale, label, override] of [
    [undefined, 'Scan document', undefined],
    ['de', 'Dokument scannen', undefined],
    [undefined, 'Capture paperwork', 'Capture paperwork'],
  ] as const) {
    await page.evaluate(
      ({ locale, override }) => {
        const h = (window as any).localeHarness;
        h.mount = document.body.appendChild(document.createElement('div'));
        h.scanner = h.createScanner({
          mount: h.mount,
          assetBaseUrl: '/scanner-assets/',
          locale,
          texts: override ? { 'Dokument scannen': override } : undefined,
        });
        h.pending = h.scanner.open();
      },
      { locale, override },
    );
    await expect(page.getByRole('dialog', { name: label, exact: true })).toHaveAttribute(
      'lang',
      locale ?? 'en',
    );
    await page.evaluate(async () => {
      const h = (window as any).localeHarness;
      await h.scanner.destroy();
      await h.pending;
      h.mount.remove();
    });
  }
});
test('English demo scans, edits, renders PDF and changes results to German without changing files', async ({
  page,
}) => {
  await page.goto('/?lang=en');
  await expect(
    page.getByRole('heading', { name: 'Scan your documents.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'locale.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data.split(',')[1], 'base64'),
  });
  await expect(page.getByRole('dialog', { name: 'Scan document', exact: true })).toHaveAttribute(
    'lang',
    'en',
  );
  await expect(page.getByRole('img', { name: 'Edited page', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Anpassen', exact: true })
    .count()
    .then((count) => expect(count).toBe(0));
  await page.getByRole('button', { name: 'Adjust', exact: true }).click();
  await page.getByRole('button', { name: 'Lens', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Lens correction mode', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 page ready', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(page.getByRole('img', { name: 'PDF page 1', exact: true })).toBeVisible();
  const pdf = page.getByRole('link', { name: 'Download PDF', exact: true });
  const bytes = await pdf.evaluate(async (link: HTMLAnchorElement) =>
    Array.from(new Uint8Array(await (await fetch(link.href)).arrayBuffer())),
  );
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await page.getByLabel('Sprache / Language', { exact: true }).selectOption('de');
  await page.getByRole('button', { name: 'Optionen schließen', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { name: '1 Seite fertig', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'PDF-Seite 1', exact: true })).toBeVisible();
  expect(
    await page
      .getByRole('link', { name: 'PDF herunterladen', exact: true })
      .evaluate(async (link: HTMLAnchorElement) =>
        Array.from(new Uint8Array(await (await fetch(link.href)).arrayBuffer())),
      ),
  ).toEqual(bytes);
});
test('Astro supports English host text, scanner and result downloads', async ({ page }) => {
  await page.goto('http://127.0.0.1:4377/?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Scan document', exact: true })).toBeVisible();
  const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.locator('#file').setInputFiles({
    name: 'locale.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data.split(',')[1], 'base64'),
  });
  await expect(page.getByRole('img', { name: 'Edited page', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download PDF', exact: true })).toBeVisible();
  await page.getByLabel('Sprache / Language', { exact: true }).selectOption('de');
  await expect(page.getByRole('link', { name: 'PDF herunterladen', exact: true })).toBeVisible();
});

for (const [width, height] of [
  [320, 568],
  [844, 390],
]) {
  test(`English controls fit the mobile workspace at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?lang=en');
    await page.getByRole('button', { name: 'Options', exact: true }).click();
    await expect(page.getByLabel('Sprache / Language', { exact: true })).toHaveValue('en');
    await page.getByRole('button', { name: 'Close options', exact: true }).click();
    const data = await page.evaluate(fixtureInBrowser, fixtures[1]);
    await page.locator('main > input[type=file]').setInputFiles({
      name: 'mobile-en.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1], 'base64'),
    });
    await expect(page.getByRole('img', { name: 'Edited page', exact: true })).toBeVisible();
    for (const panel of [undefined, 'Filter', 'Adjust', 'Format']) {
      if (panel) await page.getByRole('button', { name: panel, exact: true }).click();
      const issues = await page.locator('.scanner').evaluate((root) => {
        const issues: string[] = [];
        for (const target of root.querySelectorAll<HTMLElement>(
          'button,select,input:not([type=file])',
        )) {
          if (!target.getClientRects().length || getComputedStyle(target).visibility === 'hidden')
            continue;
          const r = target.getBoundingClientRect();
          if (
            r.width < 43 ||
            r.height < 43 ||
            r.left < -1 ||
            r.top < -1 ||
            r.right > innerWidth + 1 ||
            r.bottom > innerHeight + 1
          )
            issues.push(
              `${target.getAttribute('aria-label') || target.textContent}: ${r.x},${r.y} ${r.width}x${r.height}`,
            );
        }
        return issues;
      });
      expect(issues).toEqual([]);
      if (panel) await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  });
}
