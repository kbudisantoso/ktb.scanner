import { test, expect } from './fixtures';

for (const host of ['next', 'astro']) {
  for (const locale of ['en', 'de']) {
    test(`${host} ${locale}: source and full license notices are reachable in the built application`, async ({
      page,
    }) => {
      const base = host === 'next' ? 'http://127.0.0.1:3177' : 'http://127.0.0.1:4377';
      await page.goto(`${base}/?lang=${locale}`);
      const link = page.getByRole('link', {
        name: locale === 'de' ? 'Lizenzen' : 'Licenses',
        exact: true,
      });
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href).toBe('/third-party-notices.txt');
      const response = await page.request.get(new URL(href!, base).href);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('text/plain');
      const text = await response.text();
      expect(text).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
      expect(text).toContain('react@19.3.1 / LICENSE');
      expect(text).toContain('react-dom@19.3.1 / LICENSE');
      expect(text).toContain('wasm-bindgen 0.2.100');
      expect(text).toContain('UNICODE LICENSE V3');
      expect(text).toContain('CC0-1.0');
      expect(text).toContain('roachpowder');
      expect(text).toContain('AudioSea');
      expect(text).not.toContain('Pixabay Content License');
      expect(text).not.toMatch(/\/Users\/|\/home\/runner\//);
      if (host === 'next') {
        expect(text).toContain('pdfjs-dist@6.4.299 / LICENSE');
        expect(text).toContain('dist/compiled/react/LICENSE');
      } else expect(text).toContain('astro@7.4.1 / LICENSE');
      await expect(
        page.getByRole('link', {
          name: locale === 'de' ? 'Quellcode' : 'Source code',
          exact: true,
        }),
      ).toHaveAttribute('href', 'https://github.com/kbudisantoso/ktb.scanner');
    });
  }
}
