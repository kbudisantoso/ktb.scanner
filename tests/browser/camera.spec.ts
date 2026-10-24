import { closeAppPanel } from './helpers';
import { diagnostics } from './helpers';
import { test, expect } from './fixtures';
import { execFileSync } from 'node:child_process';

test('manual capture uses a full synthetic video frame and releases its tracks', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Canvas captureStream support is checked separately on physical Safari devices.',
  );
  await page.addInitScript(() => {
    const state = { stops: 0, requests: 0, dimensions: [1280, 960] };
    Object.assign(window, { cameraTest: state });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        if (constraints.audio !== false) throw new Error('Unexpected microphone request');
        state.requests++;
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 960;
        const ctx = canvas.getContext('2d')!;
        const draw = () => {
          ctx.fillStyle = '#435444';
          ctx.fillRect(0, 0, 1280, 960);
          ctx.fillStyle = '#fffdf6';
          ctx.fillRect(290, 60, 700, 840);
          ctx.fillStyle = '#30372f';
          ctx.font = '23px monospace';
          for (let y = 130; y < 860; y += 36) ctx.fillText('TEST 0123456789   12,34', 330, y);
        };
        draw();
        const timer = setInterval(draw, 50);
        const stream = canvas.captureStream(20);
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            state.stops++;
            clearInterval(timer);
            stop();
          };
        }
        return stream;
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => [],
    });
    // Exercise the complete video-frame fallback deterministically.
    Object.defineProperty(window, 'ImageCapture', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await diagnostics(page);
  await page.getByLabel('Diagnose aufzeichnen', { exact: true }).check();
  await closeAppPanel(page);
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
  await page.getByLabel('Aufnahmemodus').selectOption('manual');
  await expect(page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true })).toBeEnabled();
  await page.waitForTimeout(2300);
  await expect(page.getByRole('img', { name: 'Bearbeitete Seite' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Bearbeitete Seite' })).toBeVisible();
  await page.getByRole('button', { name: 'Original vergleichen' }).click();
  await expect
    .poll(() =>
      page
        .getByRole('img', { name: 'Originalaufnahme' })
        .evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]),
    )
    .toEqual([1280, 960]);
  expect(await page.evaluate(() => (window as any).cameraTest.stops)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Scans verwerfen', exact: true }).click();
  await diagnostics(page);
  await page.getByRole('button', { name: 'Diagnose-ZIP erstellen', exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }).click();
  const path = await (await waiting).path();
  const manifest = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(z.read("manifest.json").decode())',
        path!,
      ],
      { maxBuffer: 10 * 1024 ** 2 },
    ).toString(),
  );
  for (const type of [
    'camera-start',
    'live-detection',
    'live-decision',
    'manual-trigger',
    'capture-complete',
    'camera-stop',
  ])
    expect(manifest.events.some((event: any) => event.type === type)).toBe(true);
  expect(
    manifest.events.some(
      (event: any) => event.type === 'live-decision' && event.data.reason === 'manual',
    ),
  ).toBe(true);
  expect(
    manifest.events
      .flatMap((event: any) => event.artifacts ?? [])
      .some((artifact: any) => artifact.stage === 'live-input'),
  ).toBe(true);
  expect(manifest.events.at(-1).data.status).toBe('cancelled');
});

test('denied camera leaves import accessible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
        enumerateDevices: async () => [],
      },
    });
  });
  await page.goto('/');
  await closeAppPanel(page);
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Berechtigung');
  await page.getByRole('button', { name: 'Zurück zum Import' }).click();
  await expect(
    page.getByRole('button', { name: 'Bilder importieren', exact: true }).last(),
  ).toBeEnabled();
});

test('recurring live outliers and short losses retain the outline and complete auto capture', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Physical Safari camera required; Canvas streams are unavailable in this profile.',
  );
  await page.addInitScript(() => {
    const state = {
      detections: 0,
      stops: 0,
      first: 0,
      last: 0,
      missingOutlines: 0,
      wrongOutlines: 0,
    };
    Object.assign(window, { liveStability: state });
    const NativeWorker = window.Worker;
    class SequenceWorker extends NativeWorker {
      postMessage(message: any, transfer?: any) {
        if (message.kind !== 'detect') return super.postMessage(message, transfer ?? []);
        message.image.close();
        const n = ++state.detections;
        if (n === 1) state.first = message.timestamp;
        state.last = message.timestamp;
        if (n > 1) {
          const outline = document.querySelector('.scanner-camera polygon');
          if (!outline) state.missingOutlines++;
          else if (Number(outline.getAttribute('points')!.split(',')[0]) < 150)
            state.wrongOutlines++;
        }
        const corners =
          n % 10 === 4
            ? null
            : n % 10 === 7
              ? [
                  { x: 0.03, y: 0.02 },
                  { x: 0.95, y: 0.25 },
                  { x: 0.9, y: 0.95 },
                  { x: 0.1, y: 0.9 },
                ]
              : [
                  { x: 0.2, y: 0.1 },
                  { x: 0.8, y: 0.1 },
                  { x: 0.8, y: 0.9 },
                  { x: 0.2, y: 0.9 },
                ];
        setTimeout(
          () =>
            this.dispatchEvent(
              new MessageEvent('message', {
                data: {
                  id: message.id,
                  result: {
                    timestamp: message.timestamp,
                    corners,
                    sharpness: corners ? 'sharp' : 'unknown',
                  },
                },
              }),
            ),
          60,
        );
      }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: SequenceWorker });
    Object.defineProperty(window, 'ImageCapture', { configurable: true, value: undefined });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => [],
    });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 960;
        const ctx = canvas.getContext('2d')!;
        const draw = () => {
          ctx.fillStyle = '#435444';
          ctx.fillRect(0, 0, 1280, 960);
          ctx.fillStyle = '#fffdf6';
          ctx.fillRect(290, 60, 700, 840);
          ctx.fillStyle = '#30372f';
          ctx.font = '23px monospace';
          for (let y = 130; y < 860; y += 36) ctx.fillText('TEST 0123456789 12,34', 330, y);
        };
        draw();
        const timer = setInterval(draw, 50),
          stream = canvas.captureStream(20);
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            state.stops++;
            clearInterval(timer);
            stop();
          };
        }
        return stream;
      },
    });
  });
  await page.goto('/');
  await closeAppPanel(page);
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Bearbeitete Seite' })).toBeVisible();
  const state = await page.evaluate(() => (window as any).liveStability);
  expect(state.detections).toBeGreaterThan(8);
  expect(state.last - state.first).toBeGreaterThanOrEqual(1000);
  expect(state.missingOutlines).toBe(0);
  expect(state.wrongOutlines).toBe(0);
  expect(state.stops).toBe(1);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).liveStability.detections)).toBe(
    state.detections,
  );
});
