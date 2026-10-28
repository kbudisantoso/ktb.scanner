import { chooseCaptureWorkflow } from './helpers';
import { acceptPage } from './helpers';
import { showPdf } from './helpers';
import { test, expect } from './fixtures';

for (const scenario of ['three', 'three-perspective', 'two', 'clipped-left'] as const) {
  test(`real still detector selects the intended sheet: ${scenario}`, async ({ page }) => {
    await page.goto('/');
    const data = await page.evaluate((scenario) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 900;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#354b42';
      ctx.fillRect(0, 0, 1200, 900);
      const sheets = scenario.startsWith('three')
        ? [30, 450, 870].map((x) => ({ x, w: 300 }))
        : scenario === 'two'
          ? [
              { x: 90, w: 350 },
              { x: 760, w: 350 },
            ]
          : [
              { x: -90, w: 440 },
              { x: 730, w: 350 },
            ];
      for (const { x, w } of sheets) {
        ctx.fillStyle = '#fffdf7';
        if (scenario === 'three-perspective') {
          ctx.beginPath();
          ctx.moveTo(x + 4, 135);
          ctx.lineTo(x + w - 6, 155);
          ctx.lineTo(x + w - 18, 780);
          ctx.lineTo(x + 8, 795);
          ctx.closePath();
          ctx.fill();
        } else ctx.fillRect(x, 120, w, 660);
        ctx.fillStyle = '#202820';
        ctx.font = '18px monospace';
        for (let y = 170; y < 750; y += 35) ctx.fillText('DOKUMENT 012345', x + 20, y);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, scenario);
    await page.locator('main > input[type=file]').setInputFiles({
      name: `${scenario}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    });
    await acceptPage(page);
    await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
    await showPdf(page, 1);
    const metadata = JSON.parse((await page.locator('pre').textContent())!).pages[0].metadata;
    const x = metadata.corners.reduce((sum: number, p: { x: number }) => sum + p.x, 0) / 4;
    expect(x).toBeCloseTo(
      scenario.startsWith('three') ? 0.5 : scenario === 'two' ? 265 / 1200 : 905 / 1200,
      1,
    );
    expect(metadata.corners[0].y).toBeCloseTo(120 / 900, 1);
    expect(metadata.corners[2].y).toBeCloseTo(780 / 900, 1);
  });
}

test('manual photo cancels a pending live job and independently detects the full-resolution middle sheet', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'Synthetic canvas camera requires a physical Safari check.');
  await page.addInitScript(() => {
    const state = {
      pending: false,
      detections: 0,
      events: [] as string[],
      release: () => {},
      hasConfirmedLiveCorners: false,
    };
    Object.assign(window, { captureRace: state });
    const NativeWorker = window.Worker;
    class ControlledWorker extends NativeWorker {
      isLive = false;
      postMessage(message: any, transfer?: any) {
        if (message.kind === 'detect') {
          this.isLive = true;
          state.detections++;
          message.image.close();
          const reply = () =>
            this.dispatchEvent(
              new MessageEvent('message', {
                data: {
                  id: message.id,
                  result: {
                    timestamp: message.timestamp,
                    sharpness: 'sharp',
                    corners: [
                      { x: 0.01, y: 0.1 },
                      { x: 0.3, y: 0.1 },
                      { x: 0.3, y: 0.9 },
                      { x: 0.01, y: 0.9 },
                    ],
                  },
                },
              }),
            );
          if (state.detections === 1) queueMicrotask(reply);
          else {
            state.pending = true;
            state.release = reply;
          }
          return;
        }
        if (message.kind === 'process') {
          state.events.push('still-process');
          if (message.request.diagnosticContext?.operation === 'initial')
            state.hasConfirmedLiveCorners = !!message.request.corners;
        }
        super.postMessage(message, transfer ?? []);
      }
      terminate() {
        if (this.isLive) state.events.push('live-stopped');
        super.terminate();
      }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: ControlledWorker });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 900;
        const ctx = canvas.getContext('2d')!;
        const draw = () => {
          ctx.fillStyle = '#354b42';
          ctx.fillRect(0, 0, 1200, 900);
          for (const x of [30, 450, 870]) {
            ctx.fillStyle = '#fffdf7';
            ctx.fillRect(x, 120, 300, 660);
            ctx.fillStyle = '#202820';
            ctx.font = '18px monospace';
            for (let y = 170; y < 750; y += 35) ctx.fillText('DOKUMENT 012345', x + 20, y);
          }
        };
        draw();
        const stream = canvas.captureStream(20);
        return stream;
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => [],
    });
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: any[]) {
      if (args[0] instanceof HTMLVideoElement) {
        state.events.push('photo-start');
        state.release(); // A deliberately late live response cannot affect the secured frame.
      }
      return drawImage.apply(this, args as any);
    };
    Object.defineProperty(window, 'ImageCapture', {
      configurable: true,
      value: class {
        constructor() {
          throw new Error('A later native exposure must not replace the shutter frame');
        }
      },
    });
  });
  await page.goto('/');
  await chooseCaptureWorkflow(page, 'review-each');
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
  await page.getByLabel('Aufnahmemodus').selectOption('manual');
  await expect.poll(() => page.evaluate(() => (window as any).captureRace.pending)).toBe(true);
  await page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true }).click();
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  const state = await page.evaluate(() => (window as any).captureRace);
  expect(state.events.indexOf('live-stopped')).toBeLessThan(state.events.indexOf('photo-start'));
  expect(state.events.indexOf('photo-start')).toBeLessThan(state.events.indexOf('still-process'));
  expect(state.hasConfirmedLiveCorners).toBe(false);
  const metadata = JSON.parse((await page.locator('pre').textContent())!).pages[0].metadata;
  expect(metadata.normalizedSourceSizePx).toEqual({ width: 1200, height: 900 });
  expect(metadata.corners.reduce((sum: number, p: { x: number }) => sum + p.x, 0) / 4).toBeCloseTo(
    0.5,
    1,
  );
});
