import { acceptPage } from './helpers';
import { showPdf, chooseProfile, tool, tone } from './helpers';
import { test, expect } from './fixtures';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session';

test('visible automatic optimization, manual controls, reset and export keep the same confirmed pixels', async ({
  page,
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
  const hash = async () => {
    await expect
      .poll(() => preview.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
      .toBe(true);
    return preview.evaluate(async (i: HTMLImageElement) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', await (await fetch(i.src)).arrayBuffer()),
        ),
      ).join(','),
    );
  };
  const action = async (fn: () => Promise<unknown>) => {
    const old = await preview.getAttribute('src');
    await fn();
    await expect(preview).not.toHaveAttribute('src', old!);
    await expect(page.locator('.scanner')).toHaveAttribute('aria-busy', 'false');
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
  for (const name of ['Helligkeit', 'Kontrast', 'Schärfe'] as const) {
    await tone(page, name);
    const range = page.getByRole('slider', { name, exact: true });
    await range.focus();
    await action(() => range.press(name === 'Schärfe' ? 'End' : 'ArrowRight'));
  }
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
  await tool(page, 'Filter');
  await action(() =>
    page.getByRole('button', { name: 'Optimierung zurücksetzen', exact: true }).click(),
  );
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
