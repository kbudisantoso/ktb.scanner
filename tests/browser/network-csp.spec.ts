import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { acceptPage, closeAppPanel } from './helpers';

for (const imageType of ['image/jpeg', 'image/png']) {
  test(`${imageType}: import and PDF export use same-origin assets without JavaScript unsafe-eval`, async ({
    context,
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    const requests: string[] = [];
    const external: string[] = [];
    const policy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' blob:",
      "worker-src 'self' blob:",
      "img-src 'self' blob: data:",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');
    context.on('request', (request) => {
      requests.push(request.url());
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin)
        external.push(url.href);
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (!['http:', 'https:'].includes(url.protocol)) {
        await route.continue();
        return;
      }
      if (url.origin !== origin) {
        await route.abort('blockedbyclient');
        return;
      }
      const response = await route.fetch();
      // Workers need their own response policy; document CSP alone does not
      // constrain same-origin worker execution.
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': policy },
      });
    });
    await page.goto('/?lang=de');
    await closeAppPanel(page);
    await page.getByRole('button', { name: 'Mit zwei Beispielbelegen ausprobieren' }).click();
    await acceptPage(page);
    await acceptPage(page);
    await page.getByLabel('Bildexport').selectOption(imageType);
    await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
    const pdfLink = page.getByRole('link', { name: 'PDF herunterladen', exact: true });
    await expect(pdfLink).toBeVisible();
    const downloading = page.waitForEvent('download');
    await pdfLink.click();
    const pdf = await downloading;
    expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
    for (const asset of ['processing.worker.js', 'scanic.js', 'pdf.worker.js'])
      expect(requests.some((url) => url.endsWith(`/scanner-assets/${asset}`))).toBe(true);
    expect(external).toEqual([]);
  });
}
