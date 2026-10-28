import { closeAppPanel } from './helpers';
import { openOptions } from './helpers';
import { test, expect } from './fixtures';

test('silent mode creates no AudioContext and requests no capture sound', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.mp3')) requests.push(request.url());
  });
  await page.addInitScript(() => {
    Object.assign(window, { silentAudioContexts: 0 });
    Object.defineProperty(window, 'AudioContext', {
      value: class {
        constructor() {
          (window as any).silentAudioContexts++;
          throw new Error('Silent mode opened audio');
        }
      },
    });
  });
  await page.goto('/');
  await openOptions(page);
  await page.getByRole('combobox', { name: 'Aufnahmeton', exact: true }).selectOption('off');
  await expect(page.getByRole('button', { name: 'Ton anhören' })).toBeDisabled();
  await closeAppPanel(page);
  await page.getByRole('button', { name: /Dokument scannen/ }).click();
  await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
  await page.getByRole('button', { name: 'Zurück zum Import', exact: true }).click();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => (window as any).silentAudioContexts)).toBe(0);
});

test('all local cues can be previewed before opening the scanner', async ({ page }, info) => {
  await page.goto('/');
  await openOptions(page);
  const audio = page.locator('audio');
  const choices = page.getByRole('combobox', { name: 'Aufnahmeton', exact: true });
  const sounds = await choices
    .locator('option')
    .evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value).filter((id) => id !== 'off'),
    );
  expect(await choices.locator('option').count()).toBe(3);
  expect(sounds).toEqual(['camera', 'reflex']);
  for (const sound of sounds) {
    await page.getByRole('combobox', { name: 'Aufnahmeton', exact: true }).selectOption(sound);
    await page.getByRole('button', { name: 'Ton anhören', exact: true }).click();
    await expect
      .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
      .toBeGreaterThan(0);
    expect(await audio.evaluate((a: HTMLAudioElement) => a.error)).toBeNull();
    expect(await audio.evaluate((a: HTMLAudioElement) => a.muted)).toBe(true);
  }
  await choices.selectOption('off');
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await expect(audio).not.toHaveAttribute('src');
  await info.attach('sound-selection', {
    body: await page.screenshot({
      path: `artifacts/local/sound-selection-${info.project.name}.png`,
    }),
    contentType: 'image/png',
  });
});

for (const [mode, sound] of [
  ['manual', 'camera'],
  ['auto', 'camera'],
  ['manual', 'reflex'],
  ['auto', 'reflex'],
] as const)
  test(`${mode}/${sound}: shutter freezes and sounds before encoding; photo remains during processing`, async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName === 'webkit', 'Physical Safari camera/audio verification required.');
    const soundRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('.mp3')) soundRequests.push(request.url());
    });
    await page.addInitScript(() => {
      const state = {
        encoding: false,
        processing: false,
        sounds: 0,
        decoded: false,
        stopped: 0,
        shutterAt: 0,
        lastDetectionReply: 0,
        releaseEncoding: () => {},
        releaseProcessing: () => {},
      };
      Object.assign(window, { shutterTest: state });
      const decode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = async function (bytes) {
        const result = await decode.call(this, bytes);
        state.decoded = result.duration > 0 && result.duration < 60;
        return result;
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
        if ((this.buffer?.length ?? 0) > 1) state.sounds++;
        return start.apply(this, args);
      };
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        if (quality === 0.98 && this.width === 960) {
          state.encoding = true;
          state.shutterAt = performance.now();
          return toBlob.call(
            this,
            (blob) => {
              state.releaseEncoding = () => callback(blob);
            },
            type,
            quality,
          );
        }
        return toBlob.call(this, callback, type, quality);
      };
      const NativeWorker = window.Worker;
      class ControlledWorker extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener('message', ({ data }) => {
            if (data.result?.timestamp !== undefined) state.lastDetectionReply = performance.now();
          });
        }
        postMessage(message: any, transfer?: any) {
          if (message.kind === 'process' && !state.processing) {
            state.processing = true;
            state.releaseProcessing = () => super.postMessage(message, transfer ?? []);
            return;
          }
          super.postMessage(message, transfer ?? []);
        }
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: ControlledWorker });
      Object.defineProperty(window, 'ImageCapture', {
        configurable: true,
        value: class {
          constructor() {
            throw new Error('Unexpected delayed native exposure');
          }
        },
      });
      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
        configurable: true,
        value: async () => [],
      });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 960;
          canvas.height = 1280;
          const ctx = canvas.getContext('2d')!;
          const draw = () => {
            ctx.fillStyle = state.encoding ? '#a33422' : '#435444';
            ctx.fillRect(0, 0, 960, 1280);
            ctx.fillStyle = '#fffdf6';
            ctx.fillRect(180, 120, 600, 1000);
            ctx.fillStyle = '#30372f';
            ctx.font = '23px monospace';
            for (let y = 180; y < 1080; y += 36) ctx.fillText('TEST 0123456789 12,34', 220, y);
          };
          draw();
          const timer = setInterval(draw, 50),
            stream = canvas.captureStream(20);
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => {
              state.stopped++;
              const video = document.querySelector('video')!;
              Object.defineProperty(video, 'videoWidth', { configurable: true, value: 0 });
              Object.defineProperty(video, 'videoHeight', { configurable: true, value: 0 });
              clearInterval(timer);
              stop();
            };
          }
          return stream;
        },
      });
    });
    await page.goto('/');
    await openOptions(page);
    await page.getByLabel('Aufnahmeablauf', { exact: true }).selectOption('review-each');
    await page.getByRole('combobox', { name: 'Aufnahmeton', exact: true }).selectOption(sound);
    await closeAppPanel(page);
    await page.getByRole('button', { name: /Dokument scannen/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).shutterTest.decoded)).toBe(true);
    expect(soundRequests).toEqual([
      expect.stringContaining(`/scanner-assets/${sound === 'camera' ? 'shutter' : sound}.mp3`),
    ]);
    await page.getByRole('button', { name: 'Kamera starten', exact: true }).click();
    if (mode === 'manual') {
      await page.getByLabel('Aufnahmemodus').selectOption('manual');
      await page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true }).click();
    }
    const photo = page.getByRole('img', { name: 'Aufgenommenes Foto', exact: true });
    await expect(photo).toBeVisible();
    await expect(page.getByText('Bild wird gesichert...', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).shutterTest.sounds)).toBe(1);
    expect(await page.evaluate(() => (window as any).testMutedOutput.gains.length)).toBeGreaterThan(
      0,
    );
    expect(
      await page.evaluate(() =>
        (window as any).testMutedOutput.gains.every((gain: GainNode) => gain.gain.value === 0),
      ),
    ).toBe(true);
    await page.waitForTimeout(300);
    if (mode === 'auto') {
      const lag = await page.evaluate(() => {
        const s = (window as any).shutterTest;
        return s.shutterAt - s.lastDetectionReply;
      });
      expect(lag).toBeGreaterThanOrEqual(0);
      expect(lag).toBeLessThan(150);
    }
    const frozen = await photo.evaluate((canvas: HTMLCanvasElement) => [
      ...canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data,
    ]);
    expect(frozen).toEqual([67, 84, 68, 255]);
    expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await info.attach('shutter-desktop', {
      body: await page.screenshot({
        path: `artifacts/local/shutter-${info.project.name}-${mode}-${sound}-${page.viewportSize()!.width}.png`,
      }),
      contentType: 'image/png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await info.attach('shutter-mobile', {
      body: await page.screenshot({
        path: `artifacts/local/shutter-${info.project.name}-${mode}-${sound}-${page.viewportSize()!.width}.png`,
      }),
      contentType: 'image/png',
    });
    await page.evaluate(() => (window as any).shutterTest.releaseEncoding());
    await expect(
      page.getByText('Zuschnitt und Bildoptimierung laufen...', { exact: true }),
    ).toBeVisible();
    await expect(photo).toBeVisible();
    expect(
      await photo.evaluate(
        (c) => c.getBoundingClientRect().width / c.getBoundingClientRect().height,
      ),
    ).toBeCloseTo(960 / 1280, 2);
    expect(await page.evaluate(() => (window as any).shutterTest.stopped)).toBe(1);
    await page.evaluate(() => (window as any).shutterTest.releaseProcessing());
    await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toBeVisible();
    await expect(photo).toHaveCount(0);
  });
