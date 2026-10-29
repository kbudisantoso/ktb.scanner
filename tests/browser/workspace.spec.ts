import { test, expect } from './fixtures';
import {
  chooseProfile,
  chooseFormat,
  closeTool,
  tool,
  tone,
  previewHash,
  waitForPreview,
} from './helpers';
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
  const hash = () => previewHash(page);
  const baseline = await hash();
  const expectBaseline = async () => expect(await hash()).toBe(baseline);
  await surface.dblclick();
  await expect(surface).toHaveAttribute('data-zoom', '100');
  await chooseProfile(page, 'grayscale');
  await expect(surface).toHaveAttribute('data-zoom', '100');
  expect(await hash()).not.toBe(baseline);
  const optimizedPreview = await image.getAttribute('src');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await waitForPreview(page, optimizedPreview);
  await expectBaseline();
  await closeTool(page);
  await tone(page, 'Helligkeit');
  const neutralPreview = await image.getAttribute('src');
  await page.getByRole('slider', { name: 'Helligkeit', exact: true }).press('End');
  await waitForPreview(page, neutralPreview);
  expect(await hash()).not.toBe(baseline);
  const adjustedPreview = await image.getAttribute('src');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await waitForPreview(page, adjustedPreview);
  await expectBaseline();
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toHaveCount(0);
  await tool(page, 'Filter');
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await closeTool(page);
  await test.step('Tool undo never crosses applied filters or rotation, including the twelve-entry cap', async () => {
    await chooseProfile(page, 'grayscale');
    await closeTool(page);
    await page.getByRole('button', { name: '90° drehen', exact: true }).click();
    await expect(surface).toHaveAttribute('data-zoom', 'fit');
    await chooseFormat(page, 'receipt');
    await closeTool(page);
    await tool(page, 'Format');
    const formatUndo = page.getByRole('button', { name: 'Rückgängig', exact: true }),
      width = page.getByRole('spinbutton', { name: 'Bonbreite in mm', exact: true });
    await expect(formatUndo).toBeDisabled();
    await expect(width).toHaveValue('80');
    await page.getByRole('button', { name: '58 mm', exact: true }).click();
    await expect(width).toHaveValue('58');
    await formatUndo.click();
    await expect(width).toHaveValue('80');
    await expect(formatUndo).toBeDisabled();
    await width.fill('76');
    await expect(formatUndo).toBeEnabled();
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await tool(page, 'Format');
    await expect(width).toHaveValue('80');
    await expect(formatUndo).toBeDisabled();
    await closeTool(page);
    const rotated = await hash();
    await tone(page, 'Helligkeit');
    const undo = page.getByRole('button', { name: 'Rückgängig', exact: true });
    await expect(undo).toBeDisabled();
    const slider = page.getByRole('slider', { name: 'Helligkeit', exact: true });
    let firstAdjustment = '';
    for (let index = 0; index < 13; index++) {
      const previous = await image.getAttribute('src');
      await slider.press('ArrowRight');
      await waitForPreview(page, previous);
      if (index === 0) firstAdjustment = await hash();
    }
    for (let index = 0; index < 12; index++) {
      const previous = await image.getAttribute('src');
      await undo.click();
      await waitForPreview(page, previous);
    }
    await expect(undo).toBeDisabled();
    expect(await hash()).toBe(firstAdjustment);
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    expect(await hash()).toBe(rotated);
    await tool(page, 'Filter');
    await expect(undo).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Graustufen', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await closeTool(page);
  });
  await surface.press('Enter');
  await expect(surface).toHaveAttribute('data-zoom', '100');
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
  await expect(page.getByRole('button', { name: 'Original vergleichen', exact: true })).toHaveCount(
    0,
  );
  const corners = page.getByRole('button', { name: 'Ecken korrigieren', exact: true });
  await corners.click();
  await expect(
    page.getByRole('button', { name: 'Zuschnitt übernehmen', exact: true }),
  ).toBeEnabled();
  // Escape remains local even if the browser leaves focus outside the editor.
  await page.getByRole('dialog').focus();
  await page.keyboard.press('Escape');
  await expect(corners).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Scans verwerfen?', exact: true })).toHaveCount(0);
});
