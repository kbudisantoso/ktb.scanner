import { acceptPage } from './helpers';
import { showPdf } from './helpers';
import { test, expect } from './fixtures';
import { fixtureInBrowser } from '../fixtures/generate';
import type { Fixture } from '../fixtures/generate';

for (const angle of [-30, 20, 40])
  test(`in-plane rotation ${angle} degrees keeps all four paper corners`, async ({
    page,
  }, info) => {
    const radians = (angle * Math.PI) / 180;
    const destination = [
      [-320, -450],
      [320, -450],
      [320, 450],
      [-320, 450],
    ].map(([x, y]) => [
      700 + x * Math.cos(radians) - y * Math.sin(radians),
      850 + x * Math.sin(radians) + y * Math.cos(radians),
    ]) as [number, number][];
    const fixture: Fixture = {
      name: `rotation-${angle}`,
      split: 'acceptance',
      width: 1400,
      height: 1700,
      paper: [0, 0, 640, 900],
      blur: 0,
      background: '#a08b69',
      destination,
    };
    await page.goto('/');
    const data = await page.evaluate(fixtureInBrowser, fixture);
    await page.locator('main > input[type=file]').setInputFiles({
      name: 'rotated.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1], 'base64'),
    });
    await acceptPage(page);
    await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
    await showPdf(page, 1);
    const metadata = JSON.parse((await page.locator('pre').textContent())!).pages[0].metadata;
    const deviations = metadata.corners.map((p: { x: number; y: number }, i: number) =>
      Math.hypot(p.x * 1399 - destination[i][0], p.y * 1699 - destination[i][1]),
    );
    await info.attach('rotation-corners', {
      body: JSON.stringify({ angle, deviations }),
      contentType: 'application/json',
    });
    expect(Math.max(...deviations)).toBeLessThanOrEqual(16);
    expect(metadata.outputSizePx.width / metadata.outputSizePx.height).toBeCloseTo(210 / 297, 2);
  });
