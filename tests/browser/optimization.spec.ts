import { acceptPage } from './helpers';
import {
  showPdf,
  chooseProfile,
  closeTool,
  tool,
  tone,
  previewHash,
  waitForPreview,
  expectRangeReset,
} from './helpers';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session';
import type { Locator } from '@playwright/test';

test('visible automatic optimization, manual controls, reset and export keep the same confirmed pixels', async ({
  page,
  hasTouch,
}, testInfo) => {
  await page.goto('/');
  const source = await page.evaluate(fixtureInBrowser, fixtures[1]);
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'controls.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source.split(',')[1], 'base64'),
  });
  const preview = page.getByRole('img', { name: 'Bearbeitete Seite', exact: true });
  await tool(page, 'Filter');
  const auto = page.getByRole('button', { name: 'Auto', exact: true });
  await expect(auto).toBeVisible();
  if (testInfo.project.name === 'mobile-webkit') {
    const box = await auto.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(page.viewportSize()!.height);
  }
  const hash = () => previewHash(page);
  const activateReset = (button: Locator) => (hasTouch ? button.tap() : button.click());
  const action = async (fn: () => Promise<unknown>) => {
    const old = await preview.getAttribute('src');
    await fn();
    await waitForPreview(page, old);
  };
  await action(() => chooseProfile(page, 'none'));
  const baseline = await hash();
  await action(() => auto.click());
  await tool(page, 'Filter');
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await tone(page, 'Linse');
  await expect(
    page
      .getByRole('group', { name: 'Linsenentzerrung', exact: true })
      .getByRole('button', { name: /^Auto/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Linse zurücksetzen', exact: true }),
  ).toBeDisabled();
  const values: Record<string, string> = {};
  for (const name of ['Helligkeit', 'Kontrast', 'Schärfe'] as const) {
    await tone(page, name);
    const range = page.getByRole('slider', { name, exact: true });
    await range.focus();
    await action(() => range.press(name === 'Schärfe' ? 'End' : 'ArrowRight'));
    values[name] = await range.inputValue();
  }
  for (const name of ['Helligkeit', 'Kontrast', 'Schärfe'] as const) {
    await tone(page, name);
    const reset = page.getByRole('button', { name: `${name} zurücksetzen`, exact: true });
    await expect(reset).toBeEnabled();
    await expectRangeReset(page, name, `${name} zurücksetzen`);
    await expect(reset).toHaveAccessibleDescription(
      'Setzt nur diese Anpassung auf 0 zurück. Andere Einstellungen bleiben erhalten.',
    );
    await action(() => activateReset(reset));
    await expect(reset).toBeDisabled();
    values[name] = '0';
    for (const other of ['Helligkeit', 'Kontrast', 'Schärfe'] as const) {
      await tone(page, other);
      await expect(page.getByRole('slider', { name: other, exact: true })).toHaveValue(
        values[other],
      );
    }
  }
  await tone(page, 'Helligkeit');
  const pendingRange = page.getByRole('slider', { name: 'Helligkeit', exact: true }),
    pendingReset = page.getByRole('button', { name: 'Helligkeit zurücksetzen', exact: true }),
    unchangedPreview = await preview.getAttribute('src');
  await pendingRange.focus();
  await page.keyboard.down('ArrowRight');
  await expect(pendingRange).toHaveValue('1');
  await expect(pendingReset).toBeEnabled();
  await activateReset(pendingReset);
  await page.keyboard.up('ArrowRight');
  await expect(pendingRange).toHaveValue('0');
  await expect(pendingReset).toBeDisabled();
  await waitForPreview(page);
  await expect(preview).toHaveAttribute('src', unchangedPreview!);
  const neutral = await hash();
  await action(() => pendingRange.press('End'));
  await expect(pendingRange).toHaveValue('100');
  const applied = await hash(),
    appliedPreview = await preview.getAttribute('src');
  expect(applied).not.toBe(neutral);
  for (const failure of ['post-message', 'working-budget']) {
    await page.evaluate((failure) => {
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, message: any, transfer?: any) {
        if (message.kind === 'process') {
          Worker.prototype.postMessage = post;
          if (failure === 'post-message') throw new Error('Synthetic slider reset failure');
          const observe = ({ data }: MessageEvent) => {
            if (data.id !== message.id || data.diagnostic) return;
            (window as any).resetGuardCode = data.error?.code;
            this.removeEventListener('message', observe);
          };
          this.addEventListener('message', observe);
          message = {
            ...message,
            request: {
              ...message.request,
              limits: { ...message.request.limits, workingBytes: 1024 ** 2 },
            },
          };
        }
        post.call(this, message, transfer ?? []);
      };
    }, failure);
    await activateReset(pendingReset);
    const alert = page.getByRole('dialog').getByRole('alert');
    await expect(alert).toBeVisible();
    if (failure === 'post-message')
      await expect(alert).toHaveText('Verarbeitung fehlgeschlagen. Bitte erneut versuchen.');
    else
      await expect
        .poll(() => page.evaluate(() => (window as any).resetGuardCode))
        .toBe('LIMIT_EXCEEDED');
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'false');
    await expect(pendingRange).toHaveValue('100');
    await expect(pendingReset).toBeEnabled();
    await expect(preview).toHaveAttribute('src', appliedPreview!);
    expect(await hash()).toBe(applied);
  }
  await action(() => activateReset(pendingReset));
  await expect(pendingRange).toHaveValue('0');
  await expect(pendingReset).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  expect(await hash()).toBe(neutral);
  await tone(page, 'Linse');
  await action(() =>
    page
      .getByRole('group', { name: 'Linsenentzerrung', exact: true })
      .getByRole('button', { name: 'Manuell', exact: true })
      .click(),
  );
  const lens = page.getByRole('slider', { name: 'Linsenkorrektur', exact: true });
  await lens.focus();
  await action(() => lens.press('End'));
  await expect(lens).toHaveValue('100');
  const edited = await hash();
  expect(edited).not.toEqual(baseline);
  await closeTool(page);
  await tone(page, 'Linse');
  const resetLens = page.getByRole('button', { name: 'Linse zurücksetzen', exact: true });
  await expectRangeReset(page, 'Linsenkorrektur', 'Linse zurücksetzen');
  await action(() => activateReset(resetLens));
  await expect(page.getByRole('slider', { name: 'Linsenkorrektur', exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole('group', { name: 'Linsenentzerrung', exact: true })
      .getByRole('button', { name: /^Auto/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  const resetPreview = await preview.getAttribute('src');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Anpassen', exact: true })).toBeFocused();
  await waitForPreview(page, resetPreview);
  expect(await hash()).toEqual(edited);
  await tone(page, 'Linse');
  await expect(lens).toHaveValue('100');
  await action(() => activateReset(resetLens));
  await action(() => page.getByRole('button', { name: 'Rückgängig', exact: true }).click());
  expect(await hash()).toEqual(edited);
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toBeDisabled();
  await closeTool(page);
  await tone(page, 'Linse');
  await expect(lens).toHaveValue('100');
  for (const name of ['Helligkeit', 'Kontrast', 'Schärfe'] as const) {
    await tone(page, name);
    await expect(page.getByRole('slider', { name, exact: true })).toHaveValue('0');
  }
  await tone(page, 'Linse');
  await action(() =>
    page
      .getByRole('group', { name: 'Linsenentzerrung', exact: true })
      .getByRole('button', { name: 'Aus', exact: true })
      .click(),
  );
  await tool(page, 'Filter');
  await expect(
    page.getByRole('button', { name: 'Optimierung zurücksetzen', exact: true }),
  ).toHaveCount(0);
  await action(() => chooseProfile(page, 'none'));
  expect(await hash()).toEqual(baseline);
  await tone(page, 'Linse');
  await expect(
    page
      .getByRole('group', { name: 'Linsenentzerrung', exact: true })
      .getByRole('button', { name: 'Aus', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await tool(page, 'Filter');
  await action(() => auto.click());
  await tone(page, 'Linse');
  await action(() =>
    page
      .getByRole('group', { name: 'Linsenentzerrung', exact: true })
      .getByRole('button', { name: 'Manuell', exact: true })
      .click(),
  );
  await page.getByRole('slider', { name: 'Linsenkorrektur', exact: true }).focus();
  await action(() =>
    page.getByRole('slider', { name: 'Linsenkorrektur', exact: true }).press('End'),
  );
  await tone(page, 'Helligkeit');
  await page.getByRole('slider', { name: 'Helligkeit', exact: true }).focus();
  await action(() =>
    page.getByRole('slider', { name: 'Helligkeit', exact: true }).press('ArrowRight'),
  );
  const confirmed = await hash();
  await testInfo.attach('review-controls.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  const result = await page.evaluate(async () => {
    const image = document.querySelector<HTMLImageElement>('.result-page img')!;
    const metadata = JSON.parse(document.querySelector('pre')!.textContent!).pages[0].metadata;
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', await (await fetch(image.src)).arrayBuffer()),
      ),
    ).join(',');
    return { metadata, hash };
  });
  expect(result.hash).toEqual(confirmed);
  expect(result.metadata.recipe).toMatchObject({
    enhancement: 'auto',
    dewarp: 'manual',
    lensStrength: 0.18,
    adjustments: { brightness: 1, contrast: 0, sharpness: 20 },
  });
  expect(result.metadata.lensCorrection).toMatchObject({ status: 'applied', strength: 0.18 });
});

test('real worker straightens a radial grid and retains the truly unoptimized crop', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async (limits) => {
    const width = 640,
      height = 800,
      k = -0.09,
      cx = (width - 1) / 2,
      cy = (height - 1) / 2,
      s = Math.max(cx, cy);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!,
      image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const radius = ((x - cx) ** 2 + (y - cy) ** 2) / s ** 2,
          ux = cx + (x - cx) / (1 + k * radius),
          uy = cy + (y - cy) / (1 + k * radius);
        const inside = ux >= 95 && ux <= 545 && uy >= 95 && uy <= 705;
        let value = inside ? 240 : 45;
        if (inside && Math.abs(ux - 155) < 2) value = 25;
        image.data.set([value, value, value, 255], (y * width + x) * 4);
      }
    ctx.putImageData(image, 0, 0);
    const original = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const corners = [
      { x: 95, y: 95 },
      { x: 545, y: 95 },
      { x: 545, y: 705 },
      { x: 95, y: 705 },
    ].map((p) => {
      const r = ((p.x - cx) ** 2 + (p.y - cy) ** 2) / s ** 2,
        f = 2 / (1 + Math.sqrt(1 - 4 * k * r));
      return { x: (cx + (p.x - cx) * f) / (width - 1), y: (cy + (p.y - cy) * f) / (height - 1) };
    });
    const worker = new Worker('/scanner-assets/processing.worker.js', { type: 'module' });
    let id = 0;
    const run = async (dewarp: string, previewComparison = true): Promise<any> =>
      new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => {
          if (data.diagnostic) return;
          if (data.error) reject(data.error);
          else resolve(data.result);
        };
        worker.onerror = reject;
        worker.postMessage({
          id: ++id,
          kind: 'process',
          request: {
            original,
            corners,
            limits,
            rotation: 0,
            revision: 1,
            mime: 'image/png',
            format: { kind: 'original-ratio', origin: 'user' },
            previewComparison,
            recipe: { version: 1, enhancement: 'none', dewarp },
          },
        });
      });
    try {
      const off = await run('off'),
        auto = await run('auto'),
        exported = await run('auto', false);
      const hash = async (blob: Blob) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
        ).join(',');
      const curvature = async (blob: Blob) => {
        const bitmap = await createImageBitmap(blob),
          c = new OffscreenCanvas(bitmap.width, bitmap.height),
          context = c.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const d = context.getImageData(0, 0, c.width, c.height).data,
          xs: number[] = [];
        for (let y = 20; y < c.height - 20; y += 5) {
          let sum = 0,
            n = 0;
          for (let x = Math.floor(c.width * 0.05); x < c.width * 0.25; x++)
            if (d[(y * c.width + x) * 4] < 90) {
              sum += x;
              n++;
            }
          if (n) xs.push(sum / n);
        }
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        return {
          spread: Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length),
          samples: xs.length,
        };
      };
      return {
        lens: auto.lensCorrection,
        off: await curvature(off.preview),
        auto: await curvature(auto.preview),
        baseMatches: (await hash(off.preview)) === (await hash(auto.unoptimizedPreview)),
        exportMatches: (await hash(auto.preview)) === (await hash(exported.preview)),
        exportHasBase: !!exported.unoptimizedPreview,
        sourceCornersMatch: JSON.stringify(auto.corners) === JSON.stringify(corners),
      };
    } finally {
      worker.terminate();
    }
  }, DEFAULT_LIMITS);
  expect(result.lens.status).toBe('applied');
  expect(result.lens.strength).toBeCloseTo(-0.09, 2);
  expect(result.auto.samples).toBeGreaterThan(80);
  expect(result.auto.spread).toBeLessThan(result.off.spread * 0.5);
  expect(result.baseMatches).toBe(true);
  expect(result.exportMatches).toBe(true);
  expect(result.exportHasBase).toBe(false);
  expect(result.sourceCornersMatch).toBe(true);
});

test(
  '12 MP filters preserve full output with a simulated retention reserve and recover after rejection',
  {
    tag: '@worker-only',
  },
  async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    const results = await page.evaluate(async (defaults) => {
      const worker = new Worker('/scanner-assets/processing.worker.js', { type: 'module' });
      let id = 0;
      const run = (request: any): Promise<any> =>
        new Promise((resolve, reject) => {
          const job = ++id;
          worker.onmessage = ({ data }) => {
            if (data.id === job && !data.diagnostic) resolve(data);
          };
          worker.onerror = reject;
          worker.postMessage({ id: job, kind: 'process', request });
        });
      const sha = async (bytes: ArrayBuffer) =>
        Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).join(',');
      const fingerprint = async (result: any) => {
        const bitmap = await createImageBitmap(result.preview);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        try {
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          return {
            size: result.size,
            outputSize: result.outputSize,
            decodedSize: { width: canvas.width, height: canvas.height },
            corners: result.corners,
            format: result.format,
            lens: result.lensCorrection,
            auto: result.autoOptimization,
            pixels: await sha(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer),
            bytes: await sha(await result.preview.arrayBuffer()),
            comparison: result.unoptimizedPreview
              ? await sha(await result.unoptimizedPreview.arrayBuffer())
              : null,
          };
        } finally {
          bitmap.close();
          canvas.width = canvas.height = 1;
        }
      };
      const records = [];
      let retryRequest: any;
      try {
        for (const { width, height, crop, left, top, right, bottom, enhancements } of [
          {
            width: 4096,
            height: 3072,
            crop: 'nearly-full',
            left: 0.01,
            top: 0.01,
            right: 0.99,
            bottom: 0.99,
            enhancements: ['auto', 'bw', 'none'],
          },
          {
            width: 4032,
            height: 3024,
            crop: 'small',
            left: 0.3,
            top: 0.25,
            right: 0.7,
            bottom: 0.75,
            enhancements: ['bw'],
          },
        ]) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d')!;
          const background = context.createLinearGradient(0, 0, width, height);
          background.addColorStop(0, '#aaaaaa');
          background.addColorStop(1, '#eeeeee');
          context.fillStyle = background;
          context.fillRect(0, 0, width, height);
          context.fillStyle = '#303030';
          context.font = '48px monospace';
          for (let y = 180; y < height - 160; y += 130)
            context.fillText('SYNTHETIC 0123456789 12,34 EUR', 140, y);
          context.fillStyle = '#b52a45';
          context.fillRect(width * 0.7, height * 0.7, 110, 65);
          const original = await new Promise<Blob>((resolve) =>
            canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.92),
          );
          canvas.width = canvas.height = 1;
          const base = {
            original,
            corners: [
              { x: left, y: top },
              { x: right, y: top },
              { x: right, y: bottom },
              { x: left, y: bottom },
            ],
            rotation: 0,
            revision: 1,
            mime: 'image/jpeg',
            format: { kind: 'original-ratio', origin: 'user' },
            previewComparison: true,
          };
          const samples = [];
          for (const workingBytes of [defaults.workingBytes - 16 * 1024 ** 2, 512 * 1024 ** 2]) {
            let adjustments;
            const profiles = [];
            for (const enhancement of enhancements) {
              const request = {
                ...base,
                limits: { ...defaults, workingBytes },
                recipe: { version: 1, enhancement, dewarp: 'auto', adjustments },
              };
              const response = await run(request);
              if (response.error)
                throw new Error(
                  `${width}x${height}/${crop}/${enhancement}: ${response.error.code}`,
                );
              if (enhancement !== 'none' && !(response.result.unoptimizedPreview instanceof Blob))
                throw new Error(`${width}x${height}/${crop}/${enhancement}: missing Before image`);
              if (enhancement === 'auto')
                adjustments = response.result.autoOptimization?.adjustments;
              profiles.push(await fingerprint(response.result));
              if (workingBytes < defaults.workingBytes && enhancement === 'none')
                retryRequest = request;
            }
            samples.push(profiles);
          }
          records.push({ width, height, crop, samples });
        }
        const rejected = await run({
          ...retryRequest,
          limits: { ...defaults, workingBytes: 1024 ** 2 },
          recipe: { ...retryRequest.recipe, enhancement: 'bw' },
        });
        const recovered = await run(retryRequest);
        if (recovered.error) throw new Error(`Worker did not recover: ${recovered.error.code}`);
        return {
          records,
          rejection: rejected.error?.code,
          recovered: await fingerprint(recovered.result),
        };
      } finally {
        worker.terminate();
      }
    }, DEFAULT_LIMITS);
    expect(results.records).toHaveLength(2);
    for (const result of results.records) {
      const [reservedBudget, higherBudget] = result.samples;
      expect(reservedBudget).toEqual(higherBudget);
      for (const output of reservedBudget) {
        expect(output.size).toEqual({ width: result.width, height: result.height });
        expect(output.decodedSize).toEqual(output.outputSize);
        const pixels = output.outputSize.width * output.outputSize.height;
        expect(pixels).toBeLessThanOrEqual(DEFAULT_LIMITS.outputPixels);
        expect(pixels).toBeGreaterThan(result.crop === 'nearly-full' ? 7_900_000 : 2_000_000);
        expect(output.corners).toEqual(higherBudget[0].corners);
        expect(output.lens.status).not.toBe('off');
      }
    }
    expect(results.rejection).toBe('LIMIT_EXCEEDED');
    expect(results.recovered).toEqual(results.records[0].samples[0][2]);
  },
);
