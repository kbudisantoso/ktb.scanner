import { acceptPage } from './helpers';
import { closeAppPanel } from './helpers';
import { diagnostics, showPdf } from './helpers';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fixtureInBrowser, fixtures } from '../fixtures/generate';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

async function discardFailedImport(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Scans verwerfen?', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Scans verwerfen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('explicitly enabled diagnostics export originals, intermediate images and the actual final artifacts', async ({
  page,
}) => {
  await page.goto('/');
  await diagnostics(page);
  await expect(page.getByLabel('Diagnose aufzeichnen', { exact: true })).not.toBeChecked();
  await page.getByLabel('Diagnose aufzeichnen', { exact: true }).check();
  await closeAppPanel(page);
  await page.getByRole('button', { name: 'Mit zwei Beispielbelegen ausprobieren' }).click();
  await acceptPage(page);
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 2);
  await diagnostics(page);
  await page.getByRole('button', { name: 'Diagnose-ZIP erstellen', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }).click();
  const path = await (await download).path();
  const manifest = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import zipfile,json,sys,struct
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 m=json.loads(z.read('manifest.json'))
 for event in m['events']:
  for a in event.get('artifacts',[]):
   b=z.read(a['path']); assert len(b)==a['bytes']
   if a['mime']=='image/png':
    assert b[:8]==bytes([137,80,78,71,13,10,26,10])
    if 'width' in a: assert struct.unpack('>II',b[16:24])==(a['width'],a['height'])
   if a['mime']=='application/pdf': assert b.startswith(b'%PDF-')
 print(json.dumps(m))
`,
        path!,
      ],
      { maxBuffer: 10 * 1024 ** 2 },
    ).toString(),
  );
  expect(manifest.truncated).toBe(false);
  expect(manifest.mode).toBe('pipeline');
  const stages = manifest.events.flatMap((event: any) =>
    (event.artifacts ?? []).map((artifact: any) => artifact.stage),
  );
  for (const stage of [
    'original',
    'normalized-original',
    'detection-input',
    'perspective-corrected',
    'format-and-rotation',
    'enhanced',
    'processed-image',
    'thumbnail',
    'export-image',
    'export-pdf',
  ])
    expect(stages).toContain(stage);
  expect(manifest.events.filter((event: any) => event.type === 'export-page')).toHaveLength(2);
  expect(manifest.events.at(-1).data.status).toBe('confirmed');
  const actualPdf = await page
    .locator('.result-downloads a[download="scan.pdf"]')
    .evaluate(async (link: HTMLAnchorElement) => [
      ...new Uint8Array(await (await fetch(link.href)).arrayBuffer()),
    ]);
  const recordedPdf = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read('manifest.json')); a=next(a for e in m['events'] for a in e.get('artifacts',[]) if a['stage']=='export-pdf'); print(json.dumps(list(z.read(a['path']))))`,
        path!,
      ],
      { maxBuffer: 10 * 1024 ** 2 },
    ).toString(),
  );
  expect(recordedPdf).toEqual(actualPdf);
  await page.getByRole('button', { name: 'Diagnosedaten löschen', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }),
  ).toHaveCount(0);
});

test('processing failure and cancellation preserve partial diagnostic evidence', async ({
  page,
}) => {
  await page.goto('/');
  await diagnostics(page);
  await page.getByLabel('Diagnose aufzeichnen', { exact: true }).check();
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('broken image'),
  });
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await discardFailedImport(page);
  await diagnostics(page);
  await page.getByRole('button', { name: 'Diagnose-ZIP erstellen', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }),
  ).toBeVisible();
});

test('multiple sessions accumulate, download shortens retention, and new evidence resets it', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await diagnostics(page);
  await page.getByLabel('Diagnose aufzeichnen', { exact: true }).check();
  const cancelledImport = async () => {
    await page.locator('main > input[type=file]').setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('broken image'),
    });
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await discardFailedImport(page);
  };
  await cancelledImport();
  await cancelledImport();
  await diagnostics(page);
  await expect(page.locator('.diagnostics [role=status]')).toContainText('2 Sitzungen');
  await diagnostics(page);
  await page.getByRole('button', { name: 'Diagnose-ZIP erstellen', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }).click();
  const path = await (await downloading).path();
  const manifest = JSON.parse(
    execFileSync('python3', [
      '-c',
      'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(z.read("manifest.json").decode())',
      path!,
    ]).toString(),
  );
  expect(manifest.sessions).toHaveLength(2);
  expect(
    manifest.events
      .filter((event: any) => event.type === 'session-open')
      .map((event: any) => event.sessionId),
  ).toEqual([1, 2]);
  await page.clock.fastForward(9 * 60_000);
  await expect(
    page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }),
  ).toBeVisible();
  await cancelledImport();
  await diagnostics(page);
  await expect(page.locator('.diagnostics [role=status]')).toContainText('3 Sitzungen');
  await expect(
    page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }),
  ).toHaveCount(0);
  await page.clock.fastForward(11 * 60_000);
  await diagnostics(page);
  await expect(page.locator('.diagnostics [role=status]')).toContainText('3 Sitzungen');
  await diagnostics(page);
  await page.getByRole('button', { name: 'Diagnose-ZIP erstellen', exact: true }).click();
  await page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }).click();
  await page.clock.fastForward(10 * 60_000);
  await expect(page.locator('.diagnostics [role=status]')).toHaveCount(0);
  await cancelledImport();
  await diagnostics(page);
  await page.clock.fastForward(59 * 60_000);
  await expect(page.locator('.diagnostics [role=status]')).toContainText('1 Sitzungen');
  await page.clock.fastForward(60_000);
  await expect(page.locator('.diagnostics [role=status]')).toHaveCount(0);
});

test('diagnostic adaptation preserves default detection and rectified pixels', async ({ page }) => {
  const require = createRequire(new URL('../../packages/scanner/package.json', import.meta.url));
  const source = readFileSync(join(dirname(require.resolve('scanic')), 'scanic.js'), 'utf8');
  await page.goto('/');
  const url = await page.evaluate(
    fixtureInBrowser,
    fixtures.find((f) => f.name === 'calibration-flat')!,
  );
  const outputs = await page.evaluate(
    async ({ source, url }) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      try {
        const original = await import(moduleUrl);
        const adapted = await import(new URL('/scanner-assets/scanic.js', location.href).href);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        const results = [];
        for (const engine of [original, adapted]) {
          const detection = await engine.scanDocument(pixels, {
            mode: 'detect',
            detector: 'classical',
            maxProcessingDimension: 1000,
            output: 'imagedata',
          });
          if (!detection.corners) throw new Error('Fixture document not detected');
          const extracted = await engine.extractDocument(pixels, detection.corners, {
            output: 'imagedata',
          });
          if (!(extracted.output instanceof ImageData))
            throw new Error('Fixture extraction failed');
          results.push({
            corners: detection.corners,
            confidence: detection.confidence,
            width: extracted.output.width,
            height: extracted.output.height,
            hash: [
              ...new Uint8Array(
                await crypto.subtle.digest('SHA-256', new Uint8Array(extracted.output.data).buffer),
              ),
            ],
          });
        }
        return results;
      } finally {
        bitmap.close();
        URL.revokeObjectURL(moduleUrl);
      }
    },
    { source, url },
  );
  expect(outputs[1]).toEqual(outputs[0]);
});

test('detailed engine diagnostics expose raw and viewable buffers on a bounded fixture', async ({
  page,
}) => {
  await page.goto('/');
  await diagnostics(page);
  await page.getByLabel('Diagnose aufzeichnen', { exact: true }).check();
  await page.getByLabel('Interne Scanic-Puffer einschließen', { exact: true }).check();
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#35423a';
    ctx.fillRect(0, 0, 240, 320);
    ctx.fillStyle = '#fff';
    ctx.fillRect(20, 20, 200, 280);
    ctx.fillStyle = '#222';
    ctx.font = '10px monospace';
    for (let y = 40; y < 280; y += 18) ctx.fillText('TEST 0123 12,34', 30, y);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('main > input[type=file]').setInputFiles({
    name: 'diagnostic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  });
  await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await showPdf(page, 1);
  await diagnostics(page);
  await page.getByRole('button', { name: 'Diagnose-ZIP erstellen', exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Diagnose-ZIP herunterladen', exact: true }).click();
  const path = await (await waiting).path();
  const result = JSON.parse(
    execFileSync('python3', [
      '-c',
      `import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; m=json.loads(z.read('manifest.json')); a=[a for e in m['events'] for a in e.get('artifacts',[])]; assert all(len(z.read(f['path']))==f['bytes'] for f in a); print(json.dumps({'truncated':m['truncated'],'mode':m['mode'],'raw':sum(f['mime']=='application/octet-stream' for f in a),'views':sum(f['stage'].startswith('scanic.') and f['mime']=='image/png' for f in a)}))`,
      path!,
    ]).toString(),
  );
  expect(result.truncated).toBe(false);
  expect(result.mode).toBe('engine-buffers');
  expect(result.raw).toBeGreaterThan(0);
  expect(result.views).toBeGreaterThan(0);
});

test('reference diagnostics stay off by default through a successful scan and can be switched off again', async ({
  page,
}) => {
  await page.goto('/');
  await diagnostics(page);
  await expect(page.getByLabel('Diagnose aufzeichnen', { exact: true })).not.toBeChecked();
  await expect(
    page.getByLabel('Interne Scanic-Puffer einschließen', { exact: true }),
  ).toBeDisabled();
  await closeAppPanel(page);
  await page.getByRole('button', { name: 'Mit zwei Beispielbelegen ausprobieren' }).click();
  for (let i = 0; i < 2; i++) await acceptPage(page);
  await page.getByRole('button', { name: 'Abschließen', exact: true }).click();
  await diagnostics(page);
  await expect(
    page.getByRole('button', { name: 'Diagnose-ZIP erstellen', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Diagnose aufzeichnen', { exact: true }).check();
  await page.getByLabel('Diagnose aufzeichnen', { exact: true }).uncheck();
  await closeAppPanel(page);
  await page
    .locator('main > input[type=file]')
    .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await discardFailedImport(page);
  await diagnostics(page);
  await expect(
    page.getByRole('button', { name: 'Diagnose-ZIP erstellen', exact: true }),
  ).toHaveCount(0);
});
