import { test, expect } from './fixtures';

test('mobile camera prioritizes the preview, reachable controls, options and direct import', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    browserName === 'webkit',
    'Physical Safari canvas camera and torch verification required.',
  );
  await page.setViewportSize({ width: 402, height: 714 });
  await page.addInitScript(() => {
    const state = { stops: 0, requests: 0, torch: false };
    Object.assign(window, { mobileCameraTest: state });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        state.requests++;
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 1280;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#727565';
        ctx.fillRect(0, 0, 960, 1280);
        ctx.fillStyle = '#fffdf6';
        ctx.fillRect(170, 220, 620, 850);
        ctx.fillStyle = '#25362a';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('DOKUMENT', 220, 290);
        ctx.font = '19px monospace';
        for (let y = 355; y < 1000; y += 38) ctx.fillText('TEST 0123456789  12,34', 220, y);
        const stream = canvas.captureStream(20);
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            state.stops++;
            stop();
          };
          Object.defineProperty(track, 'getCapabilities', { value: () => ({ torch: true }) });
          track.applyConstraints = async (constraints) => {
            state.torch = !!(
              constraints?.advanced?.[0] as MediaTrackConstraintSet & { torch?: boolean }
            )?.torch;
          };
        }
        return stream;
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => [
        { kind: 'videoinput', deviceId: 'back', label: 'Rückkamera' },
        { kind: 'videoinput', deviceId: 'front', label: 'Frontkamera' },
      ],
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Aufnahmemodus').selectOption('manual');
  const shutter = dialog.getByRole('button', { name: 'Jetzt aufnehmen', exact: true });
  await expect(shutter).toBeEnabled();
  await expect(dialog.locator('.scanner-header')).toBeHidden();
  await expect(dialog.getByText('Dokument ausrichten und auslösen', { exact: true })).toBeVisible();
  for (const viewport of [
    { width: 402, height: 714 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const button = await shutter.boundingBox();
    expect(button).not.toBeNull();
    expect(button!.width).toBeGreaterThanOrEqual(80);
    expect(button!.x).toBeGreaterThanOrEqual(0);
    expect(button!.x + button!.width).toBeLessThanOrEqual(viewport.width);
    expect(button!.y).toBeGreaterThanOrEqual(0);
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height);
    const video = await dialog.locator('video').boundingBox();
    expect(video!.width / video!.height).toBeCloseTo(960 / 1280, 2);
    expect(
      await dialog.evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeLessThanOrEqual(1);
    await info.attach(`camera-${viewport.width}x${viewport.height}`, {
      body: await page.screenshot({
        path: `artifacts/local/mobile-camera-${info.project.name}-${viewport.width}x${viewport.height}.png`,
      }),
      contentType: 'image/png',
    });
  }
  await page.setViewportSize({ width: 402, height: 714 });
  await dialog.getByRole('button', { name: 'Licht einschalten', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Licht ausschalten', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).mobileCameraTest.torch)).toBe(true);
  await dialog.getByRole('button', { name: 'Kameraoptionen', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Kamera', exact: true }).selectOption('front');
  await expect.poll(() => page.evaluate(() => (window as any).mobileCameraTest.requests)).toBe(2);
  await dialog.getByRole('button', { name: 'Optionen schließen', exact: true }).click();
  await expect(shutter).toBeEnabled();
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 320;
    c.getContext('2d')!.fillRect(0, 0, 240, 320);
    return c.toDataURL('image/png').split(',')[1];
  });
  const choosing = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Bilder importieren', exact: true }).click();
  await (
    await choosing
  ).setFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(dialog.getByRole('heading', { name: 'Dokumentecken festlegen' })).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).mobileCameraTest.stops)).toBeGreaterThanOrEqual(
    2,
  );
});

test('mobile denied camera keeps clear exit, import and restart actions', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 714 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Denied', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Berechtigung');
  await expect(
    dialog.getByRole('button', { name: 'Kamera fortsetzen', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Licht einschalten', exact: true })).toHaveCount(
    0,
  );
  await dialog.getByRole('button', { name: 'Kameraoptionen', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Kamera neu starten', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Optionen schließen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Zurück zum Import', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Bilder importieren', exact: true }),
  ).toBeVisible();
});
