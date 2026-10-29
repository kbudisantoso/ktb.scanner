import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { build } from 'esbuild';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import { expectReviewControls, expectRangeReset } from './helpers';

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
    await expect(page.getByRole('button', { name: 'Compare original', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    await expectReviewControls(page);
    for (const panel of [undefined, 'Filter', 'Adjust', 'Format']) {
      if (panel) await page.getByRole('button', { name: panel, exact: true }).click();
      if (panel === 'Filter')
        await expect(
          page.getByRole('button', { name: 'Reset optimization', exact: true }),
        ).toHaveCount(0);
      if (panel === 'Adjust') {
        await expectRangeReset(page, 'Brightness', 'Reset brightness');
        await expect(
          page.getByRole('button', { name: 'Reset brightness', exact: true }),
        ).toBeDisabled();
      }
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

async function expectHostLinks(page: Page, locale: 'en' | 'de') {
  const license = page.getByRole('link', {
    name: locale === 'de' ? 'Lizenzen' : 'Licenses',
    exact: true,
  });
  const source = page.getByRole('link', {
    name: locale === 'de' ? 'Quellcode' : 'Source code',
    exact: true,
  });
  await expect(license).toBeVisible();
  await expect(license).toHaveAttribute('href', '/third-party-notices.txt');
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('href', 'https://github.com/kbudisantoso/ktb.scanner');
}

async function closeNextOptions(page: Page, locale: 'en' | 'de') {
  await page
    .getByRole('button', {
      name: locale === 'de' ? 'Optionen schließen' : 'Close options',
      exact: true,
    })
    .click();
}

async function interactWithNextOptions(page: Page, locale: 'en' | 'de') {
  // A real client interaction prevents a matching English SSR shell from passing before hydration.
  await page.getByRole('button', { name: /^(Options|Optionen)$/ }).click();
  await closeNextOptions(page, locale);
}

async function expectNextHtml(page: Page, html: string, locale: 'en' | 'de') {
  const rendered = await page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const button = document.querySelector('.hero button.primary')?.cloneNode(true) as
      HTMLElement | undefined;
    button?.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    const text = (node: Element | undefined | null) =>
      node?.textContent?.replace(/\s+/g, ' ').trim();
    return {
      language: document.documentElement.lang,
      title: text(document.querySelector('title')),
      heading: text(document.querySelector('h1')),
      scan: text(button),
    };
  }, html);
  expect(rendered).toEqual({
    language: locale,
    title: locale === 'de' ? 'Scanner Werkstatt' : 'Scanner workshop',
    heading: locale === 'de' ? 'Dokumente erfassen.' : 'Scan your documents.',
    scan: locale === 'de' ? 'Dokument scannen' : 'Scan document',
  });
}

const hostLanguages = [
  { browser: 'en-US', expected: 'en', allEngines: true },
  { browser: 'de-DE', expected: 'de', allEngines: true },
  { browser: 'de-CH', expected: 'de', allEngines: false },
  { browser: 'fr-FR', expected: 'en', allEngines: false },
  { browser: 'de-DE', query: 'en', expected: 'en', allEngines: false },
  { browser: 'en-US', query: 'de', expected: 'de', allEngines: false },
  { browser: 'de-AT', query: 'fr', expected: 'de', allEngines: false },
] as const;

for (const host of ['next', 'astro'] as const)
  for (const scenario of hostLanguages) {
    test.describe(`${host} language ${scenario.browser} / ${'query' in scenario ? scenario.query : 'automatic'}`, () => {
      test.use({ locale: scenario.browser });
      test(
        'detects browser language and retains an explicit selection after reload',
        {
          tag: scenario.allEngines ? [] : '@host-locale-matrix',
        },
        async ({ page }) => {
          const base = host === 'next' ? 'http://127.0.0.1:3177/' : 'http://127.0.0.1:4377/';
          const query = 'query' in scenario ? scenario.query : undefined;
          const hydrationErrors: string[] = [];
          if (host === 'next') {
            page.on('pageerror', (error) => hydrationErrors.push(error.message));
            page.on('console', (message) => {
              if (
                message.type() === 'error' &&
                /hydrat|server rendered|didn't match|Minified React error #4(?:18|23|25)/i.test(
                  message.text(),
                )
              )
                hydrationErrors.push(message.text());
            });
            await page.addInitScript(() => {
              const languages: string[] = [];
              Object.assign(window, { firstClientLanguages: languages });
              const record = () => {
                const language = document.documentElement?.lang;
                if (language && languages.at(-1) !== language) languages.push(language);
              };
              record();
              new MutationObserver(record).observe(document, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['lang'],
              });
            });
          }
          const response = await page.goto(base + (query ? `?lang=${query}` : ''));
          if (host === 'next') {
            expect(response?.status()).toBe(200);
            await expectNextHtml(page, await response!.text(), scenario.expected);
            await interactWithNextOptions(page, scenario.expected);
            expect(await page.evaluate(() => (window as any).firstClientLanguages)).toEqual([
              scenario.expected,
            ]);
            expect(hydrationErrors).toEqual([]);
          }
          const selector = page.getByLabel('Sprache / Language', { exact: true });
          await expect(selector).toHaveValue(scenario.expected);
          await expect(page.locator('html')).toHaveAttribute('lang', scenario.expected);
          await expect(
            page.getByRole('button', {
              name: scenario.expected === 'de' ? 'Dokument scannen' : 'Scan document',
              exact: true,
            }),
          ).toBeVisible();
          expect(new URL(page.url()).searchParams.get('lang')).toBe(query ?? null);
          await expectHostLinks(page, scenario.expected);
          if (host === 'next')
            await page
              .getByRole('button', {
                name: scenario.expected === 'de' ? 'Optionen' : 'Options',
                exact: true,
              })
              .click();
          const manual = scenario.expected === 'de' ? 'en' : 'de';
          await selector.selectOption(manual);
          await expect(page.locator('html')).toHaveAttribute('lang', manual);
          expect(new URL(page.url()).searchParams.get('lang')).toBe(manual);
          if (host === 'next') await closeNextOptions(page, manual);
          await expectHostLinks(page, manual);
          const reloaded = await page.reload();
          if (host === 'next') {
            expect(reloaded?.status()).toBe(200);
            await expectNextHtml(page, await reloaded!.text(), manual);
            await interactWithNextOptions(page, manual);
            expect(await page.evaluate(() => (window as any).firstClientLanguages)).toEqual([
              manual,
            ]);
            expect(hydrationErrors).toEqual([]);
          }
          await expect(selector).toHaveValue(manual);
          await expect(page.locator('html')).toHaveAttribute('lang', manual);
          await expectHostLinks(page, manual);
        },
      );
    });
  }

test(
  'Next SSR uses only the primary request language and overwrites incoming locale headers',
  {
    tag: '@host-locale-matrix',
  },
  async ({ page, request }) => {
    await page.goto('/?lang=en');
    for (const scenario of [
      { language: 'de-CH,de;q=0.9,en;q=0.8', supplied: 'en', expected: 'de' },
      { language: 'en-US,de;q=0.9', supplied: 'de', expected: 'en' },
      { language: '', supplied: 'de', expected: 'en' },
      { language: 'de-DE,en;q=0.9', supplied: 'de', query: 'en', expected: 'en' },
    ] as const) {
      const response = await request.get(
        `/${'query' in scenario ? `?lang=${scenario.query}` : ''}`,
        {
          headers: {
            'accept-language': scenario.language,
            'x-ktb-demo-locale': scenario.supplied,
          },
        },
      );
      expect(response.status()).toBe(200);
      await expectNextHtml(page, await response.text(), scenario.expected);
    }
  },
);

test.describe('Next server-rendered German without JavaScript', () => {
  test.use({ locale: 'de-DE', javaScriptEnabled: false });
  test('renders the localized page and metadata before client code', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expectNextHtml(page, await response!.text(), 'de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page).toHaveTitle('Scanner Werkstatt');
    await expect(
      page.getByRole('heading', { name: 'Dokumente erfassen.', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dokument scannen', exact: true })).toBeVisible();
  });
});
