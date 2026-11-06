import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const nextDependencies = JSON.parse(
  readFileSync(new URL('../../apps/demo-next/package.json', import.meta.url), 'utf8'),
).dependencies;
const astroDependencies = JSON.parse(
  readFileSync(new URL('../../apps/demo-astro/package.json', import.meta.url), 'utf8'),
).dependencies;

for (const host of ['next', 'astro']) {
  test(
    `${host}: full license notices are served by the built application`,
    {
      tag: '@http-contract',
    },
    async ({ request }) => {
      const base = host === 'next' ? 'http://127.0.0.1:3177' : 'http://127.0.0.1:4377';
      // Cross-browser host language tests cover visible labels and link targets.
      const response = await request.get(`${base}/third-party-notices.txt`);
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
        expect(text).toContain(`pdfjs-dist@${nextDependencies['pdfjs-dist']} / LICENSE`);
        expect(text).toContain('dist/compiled/react/LICENSE');
      } else expect(text).toContain(`astro@${astroDependencies.astro} / LICENSE`);
    },
  );
}
