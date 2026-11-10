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
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Denied', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    });
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
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Berechtigung');
  await expect(page.getByRole('button', { name: 'Seiten prüfen (0)', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Zurück zum Import', exact: true }).click();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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

for (const [mode, sound, nativePhoto] of [
  ['manual', 'camera', false],
  ['auto', 'camera', false],
  ['manual', 'reflex', false],
  ['auto', 'reflex', false],
  ['auto', 'camera', true],
] as const)
  test(`${mode}/${sound}/${nativePhoto ? 'native-photo' : 'video-fallback'}: ready feedback follows final source selection and preserves the secured pixels`, async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName === 'webkit', 'Physical Safari camera/audio verification required.');
    const soundRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('.mp3')) soundRequests.push(request.url());
    });
    await page.addInitScript((nativePhoto) => {
      const state = {
        encoding: false,
        processing: false,
        sounds: 0,
        decoded: false,
        audioContext: null as AudioContext | null,
        audioAtPhotoRequest: '',
        stopped: 0,
        shutterAt: 0,
        lastDetectionReply: 0,
        photoCalls: 0,
        soundsAtPhotoRequest: 0,
        sceneMoved: false,
        sceneMovedAtPhotoRequest: false,
        canvas: null as HTMLCanvasElement | null,
        draws: 0,
        draw: () => {},
        encodingReady: false,
        photoPending: false,
        photoTrackMatches: false,
        track: null as MediaStreamTrack | null,
        nativeBlob: null as Blob | null,
        processRequest: null as any,
        processResult: null as any,
        processCalls: 0,
        releasePhoto: () => {},
        releaseEncoding: () => {},
        releaseProcessing: () => {},
      };
      Object.assign(window, { shutterTest: state });
      const decode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = async function (bytes) {
        state.audioContext = this;
        const result = await decode.call(this, bytes);
        state.decoded = result.duration > 0 && result.duration < 60;
        return result;
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
        if ((this.buffer?.length ?? 0) > 1) {
          state.sounds++;
          // Moving the phone on the ready cue must be too late to change this capture.
          state.sceneMoved = true;
          state.draw();
        }
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
              state.encodingReady = true;
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
            if (data.result?.preview) state.processResult = data.result;
          });
        }
        postMessage(message: any, transfer?: any) {
          if (message.kind === 'process') state.processCalls++;
          if (message.kind === 'process' && !state.processing) {
            state.processing = true;
            state.processRequest = message.request;
            state.releaseProcessing = () => super.postMessage(message, transfer ?? []);
            return;
          }
          super.postMessage(message, transfer ?? []);
        }
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: ControlledWorker });
      Object.defineProperty(window, 'ImageCapture', {
        configurable: true,
        // The four sound combinations deliberately cover browsers without Photo API support.
        value: nativePhoto
          ? class {
              constructor(track: MediaStreamTrack) {
                state.photoTrackMatches = track === state.track;
              }
              takePhoto() {
                state.photoCalls++;
                state.nativeBlob = null;
                state.soundsAtPhotoRequest = state.sounds;
                state.sceneMovedAtPhotoRequest = state.sceneMoved;
                state.audioAtPhotoRequest = state.audioContext?.state ?? 'missing';
                state.photoPending = true;
                state.shutterAt = performance.now();
                const photo = document.createElement('canvas');
                photo.width = 1200;
                photo.height = 1600;
                const ctx = photo.getContext('2d')!;
                ctx.fillStyle = state.sceneMoved ? '#a33422' : '#493327';
                ctx.fillRect(0, 0, photo.width, photo.height);
                ctx.fillStyle = '#fffdf6';
                ctx.fillRect(150, 164, 900, 1272);
                ctx.fillStyle = '#30372f';
                ctx.font = '28px monospace';
                for (let y = 240; y < 1380; y += 44)
                  ctx.fillText('NATIVE PHOTO 0123456789', 205, y);
                ctx.fillStyle = state.sceneMoved ? '#a33422' : '#244bce';
                ctx.fillRect(430, 700, 340, 180);
                return new Promise<Blob>((resolve) => {
                  photo.toBlob((blob) => {
                    state.nativeBlob = blob!;
                    state.releasePhoto = () => {
                      state.photoPending = false;
                      resolve(blob!);
                    };
                    photo.width = photo.height = 1;
                  }, 'image/png');
                });
              }
            }
          : undefined,
      });
      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
        configurable: true,
        value: async () => [],
      });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async (constraints: MediaStreamConstraints) => {
          if (constraints.audio !== false) throw new Error('Unexpected microphone request');
          const canvas = document.createElement('canvas');
          canvas.width = 960;
          canvas.height = 1280;
          state.canvas = canvas;
          const ctx = canvas.getContext('2d')!;
          const draw = () => {
            state.draws++;
            ctx.fillStyle = state.sceneMoved ? '#a33422' : '#435444';
            ctx.fillRect(0, 0, 960, 1280);
            ctx.fillStyle = '#fffdf6';
            ctx.fillRect(180, 120, 600, 1000);
            ctx.fillStyle = '#30372f';
            ctx.font = '23px monospace';
            for (let y = 180; y < 1080; y += 36) ctx.fillText('TEST 0123456789 12,34', 220, y);
          };
          state.draw = draw;
          draw();
          const timer = setInterval(draw, 50),
            stream = canvas.captureStream(20);
          for (const track of stream.getTracks()) {
            state.track = track;
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
    }, nativePhoto);
    await page.goto('/');
    await openOptions(page);
    await page.getByLabel('Aufnahmeablauf', { exact: true }).selectOption('review-each');
    if (nativePhoto) await page.getByLabel('Startprofil', { exact: true }).selectOption('photo');
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
    await expect(page.locator('.scanner-capture')).toHaveAttribute('data-phase', 'capturing');
    await expect(page.locator('.scanner-photo-processing strong')).toHaveText('Aufnahme läuft...');
    await expect(page.getByText('Bitte weiter ruhig halten.', { exact: true })).toBeVisible();
    if (nativePhoto)
      await expect
        .poll(() => page.evaluate(() => !!(window as any).shutterTest.nativeBlob))
        .toBe(true);
    else
      await expect
        .poll(() => page.evaluate(() => (window as any).shutterTest.encodingReady))
        .toBe(true);
    const pending = await page.evaluate(() => {
      const state = (window as any).shutterTest;
      const video = document.querySelector('video')!;
      const snapshot = document.querySelector<HTMLCanvasElement>('.scanner-captured-photo')!;
      const progress = document.querySelector('.scanner-camera svg')?.getAttribute('data-progress');
      return {
        sounds: state.sounds,
        processing: state.processing,
        stopped: state.stopped,
        sceneMoved: state.sceneMoved,
        photoCalls: state.photoCalls,
        soundsAtPhotoRequest: state.soundsAtPhotoRequest,
        sceneMovedAtPhotoRequest: state.sceneMovedAtPhotoRequest,
        photoTrackMatches: state.photoTrackMatches,
        encoding: state.encoding,
        snapshotHidden: snapshot.hidden,
        videoPaused: video.paused,
        videoVisible: getComputedStyle(video).visibility,
        flashes: document.querySelectorAll('.scanner-shutter-flash').length,
        progress: progress === null || progress === undefined ? null : Number(progress),
        draws: state.draws,
      };
    });
    expect(pending).toMatchObject({
      sounds: 0,
      processing: false,
      stopped: 0,
      sceneMoved: false,
      photoCalls: nativePhoto ? 1 : 0,
      soundsAtPhotoRequest: 0,
      sceneMovedAtPhotoRequest: false,
      photoTrackMatches: nativePhoto,
      encoding: !nativePhoto,
      snapshotHidden: true,
      videoPaused: false,
      videoVisible: 'visible',
      flashes: 0,
    });
    if (mode === 'auto') expect(pending.progress).not.toBeNull();
    if (pending.progress !== null) expect(pending.progress).toBeLessThan(1);
    await expect(photo).toBeHidden();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).shutterTest.draws)).toBeGreaterThan(
      pending.draws,
    );
    expect(await page.evaluate(() => (window as any).shutterTest.sounds)).toBe(0);
    if (mode === 'auto') {
      const lag = await page.evaluate(() => {
        const s = (window as any).shutterTest;
        return s.shutterAt - s.lastDetectionReply;
      });
      expect(lag).toBeGreaterThanOrEqual(0);
      expect(lag).toBeLessThan(150);
    }
    if (nativePhoto) await page.evaluate(() => (window as any).shutterTest.releasePhoto());
    else {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await info.attach('capture-pending-desktop', {
        body: await page.screenshot({
          path: `artifacts/local/shutter-${info.project.name}-${mode}-${sound}-${page.viewportSize()!.width}.png`,
        }),
        contentType: 'image/png',
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await info.attach('capture-pending-mobile', {
        body: await page.screenshot({
          path: `artifacts/local/shutter-${info.project.name}-${mode}-${sound}-${page.viewportSize()!.width}.png`,
        }),
        contentType: 'image/png',
      });
      await page.evaluate(() => (window as any).shutterTest.releaseEncoding());
    }
    await expect(page.locator('.scanner-capture')).toHaveAttribute('data-phase', 'processing');
    await expect.poll(() => page.evaluate(() => (window as any).shutterTest.sounds)).toBe(1);
    await expect(page.locator('.scanner-photo-processing strong')).toHaveText('Foto aufgenommen');
    await expect(
      page.getByText('Zuschnitt und Bildoptimierung laufen...', { exact: true }),
    ).toBeVisible();
    await expect(photo).toBeVisible();
    const ready = await page.evaluate(() => {
      const state = (window as any).shutterTest;
      const snapshot = document.querySelector<HTMLCanvasElement>('.scanner-captured-photo')!;
      return {
        frozen: [...snapshot.getContext('2d')!.getImageData(0, 0, 1, 1).data],
        movedScene: [...state.canvas.getContext('2d').getImageData(0, 0, 1, 1).data],
        sceneMoved: state.sceneMoved,
        sounds: state.sounds,
        soundsAtPhotoRequest: state.soundsAtPhotoRequest,
        stopped: state.stopped,
        paused: document.querySelector('video')!.paused,
      };
    });
    expect(ready).toEqual({
      frozen: [67, 84, 68, 255],
      movedScene: [163, 52, 34, 255],
      sceneMoved: true,
      sounds: 1,
      soundsAtPhotoRequest: 0,
      stopped: 1,
      paused: true,
    });
    expect(
      await photo.evaluate(
        (c) => c.getBoundingClientRect().width / c.getBoundingClientRect().height,
      ),
    ).toBeCloseTo(960 / 1280, 2);
    await info.attach('shutter-audio.json', {
      contentType: 'application/json',
      body: JSON.stringify(
        await page.evaluate(() => {
          const state = (window as any).shutterTest;
          return {
            decoded: state.decoded,
            contextState: state.audioContext?.state,
            atPhotoRequest: state.audioAtPhotoRequest,
            sounds: state.sounds,
            soundsAtPhotoRequest: state.soundsAtPhotoRequest,
            sceneMovedAtPhotoRequest: state.sceneMovedAtPhotoRequest,
            photoCalls: state.photoCalls,
            encoding: state.encoding,
          };
        }),
      ),
    });
    expect(await page.evaluate(() => (window as any).testMutedOutput.gains.length)).toBeGreaterThan(
      0,
    );
    expect(
      await page.evaluate(() =>
        (window as any).testMutedOutput.gains.every((gain: GainNode) => gain.gain.value === 0),
      ),
    ).toBe(true);
    await page.evaluate(() => (window as any).shutterTest.releaseProcessing());
    await expect(page.getByRole('img', { name: 'Bearbeitete Seite', exact: true })).toBeVisible();
    await expect(photo).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).shutterTest.sounds)).toBe(1);
    if (nativePhoto) {
      const processed = await page.evaluate(async () => {
        const state = (window as any).shutterTest;
        const request = state.processRequest;
        const bitmap = await createImageBitmap(state.processResult.preview);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let blue = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i + 2] > pixels[i] + 60 && pixels[i + 2] > pixels[i + 1] + 40) blue++;
        const result = {
          original: [...new Uint8Array(await request.original.arrayBuffer())],
          native: [...new Uint8Array(await state.nativeBlob.arrayBuffer())],
          hint: request.captureHint,
          explicitCorners: request.corners,
          source: state.processResult.size,
          corners: state.processResult.corners,
          blueFraction: blue / (canvas.width * canvas.height),
          photoCalls: state.photoCalls,
        };
        canvas.width = canvas.height = 1;
        return result;
      });
      expect(processed.original).toEqual(processed.native);
      expect(processed.source).toEqual({ width: 1200, height: 1600 });
      expect(processed.photoCalls).toBe(1);
      expect(processed.explicitCorners).toBeUndefined();
      expect(processed.hint.mapping).toBe('unverified-photo-area');
      expect(processed.hint.stable).toBe(true);
      expect(processed.corners[0].x).toBeCloseTo(150 / 1200, 2);
      expect(processed.corners[0].y).toBeCloseTo(164 / 1600, 2);
      expect(processed.blueFraction).toBeGreaterThan(0.015);
      await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
      await page.getByLabel('Aufnahmemodus').selectOption('manual');
      await page.getByRole('button', { name: 'Jetzt aufnehmen', exact: true }).click();
      await expect(page.locator('.scanner-capture')).toHaveAttribute('data-phase', 'capturing');
      await expect
        .poll(() =>
          page.evaluate(() => {
            const state = (window as any).shutterTest;
            return state.photoCalls === 2 && !!state.nativeBlob;
          }),
        )
        .toBe(true);
      expect(await page.evaluate(() => (window as any).shutterTest.sounds)).toBe(1);
      await page.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      // Resolve hardware only after the UI session ended; no ready cue may escape the abort.
      await page.evaluate(() => (window as any).shutterTest.releasePhoto());
      await page.waitForTimeout(150);
      expect(
        await page.evaluate(() => {
          const state = (window as any).shutterTest;
          return {
            sounds: state.sounds,
            processingCalls: state.processCalls,
            stopped: state.stopped,
            flashes: document.querySelectorAll('.scanner-shutter-flash').length,
            snapshots: document.querySelectorAll('.scanner-captured-photo').length,
          };
        }),
      ).toEqual({ sounds: 1, processingCalls: 1, stopped: 2, flashes: 0, snapshots: 0 });
    } else {
      const source = await page.evaluate(async () => {
        const state = (window as any).shutterTest;
        const image = await createImageBitmap(state.processRequest.original);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const result = {
          width: image.width,
          height: image.height,
          pixel: [...ctx.getImageData(0, 0, 1, 1).data],
          photoCalls: state.photoCalls,
        };
        image.close();
        canvas.width = canvas.height = 1;
        return result;
      });
      expect(source).toMatchObject({ width: 960, height: 1280, photoCalls: 0 });
      for (const [channel, expected] of [67, 84, 68].entries())
        expect(Math.abs(source.pixel[channel] - expected)).toBeLessThanOrEqual(3);
      expect(source.pixel[3]).toBe(255);
    }
  });
