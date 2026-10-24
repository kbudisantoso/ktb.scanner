import { test, expect } from './fixtures';
import { chooseProfile, closeTool, tool, tone } from './helpers';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';

test('undo and cancelled tools restore actual pixels; zoom, hold comparison and native pinch remain usable', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto('/');
  const source = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'workspace.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source.split(',')[1], 'base64'),
  });
  const image = page.getByRole('img', { name: 'Bearbeitete Seite', exact: true }),
    surface = page.locator('.scanner-image-surface');
  await expect(image).toBeVisible();
  const hash = () =>
    image.evaluate(async (i: HTMLImageElement) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', await (await fetch(i.src)).arrayBuffer()),
        ),
      ).join(','),
    );
  const baseline = await hash();
  await surface.dblclick();
  await expect(surface).toHaveAttribute('data-zoom', '100');
  await chooseProfile(page, 'grayscale');
  await closeTool(page);
  await expect(surface).toHaveAttribute('data-zoom', '100');
  expect(await hash()).not.toBe(baseline);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(hash).toBe(baseline);
  await tone(page, 'Helligkeit');
  await page.getByRole('slider', { name: 'Helligkeit', exact: true }).press('End');
  await expect(page.locator('.scanner')).toHaveAttribute('aria-busy', 'false');
  expect(await hash()).not.toBe(baseline);
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect.poll(hash).toBe(baseline);
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toBeDisabled();
  await tool(page, 'Filter');
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await closeTool(page);
  const before = page.getByRole('button', {
    name: 'Vorher anzeigen - gedrückt halten',
    exact: true,
  });
  const box = await before.boundingBox();
  await page.mouse.move(box!.x + 20, box!.y + 20);
  await page.mouse.down();
  await expect(before).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(before).toHaveAttribute('aria-pressed', 'false');
  await before.focus();
  await page.keyboard.down('Enter');
  await expect(before).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(before).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.up('Enter');
  await page.getByRole('button', { name: 'Bild einpassen', exact: true }).click();
  if (browserName === 'chromium') {
    const client = await page.context().newCDPSession(page);
    const bounds = await surface.boundingBox();
    const x = bounds!.x + bounds!.width / 2,
      y = bounds!.y + bounds!.height / 2;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 20, y, id: 0 },
        { x: x + 20, y, id: 1 },
      ],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 60, y, id: 0 },
        { x: x + 60, y, id: 1 },
      ],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(surface).not.toHaveAttribute('data-zoom', 'fit');
    await client.detach();
  }
});
