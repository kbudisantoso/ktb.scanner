import { test, expect } from './fixtures';
import { whitePaperFixture } from '../fixtures/white-paper';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session';

test('real worker whitens color and grayscale in JPEG/PNG, preserves weak strokes and reproduces exports', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.addScriptTag({
    content: `window.whitePaperFixture = ${whitePaperFixture.toString()};`,
  });
  const result = await page.evaluate(async (limits) => {
    const fixture = (window as any).whitePaperFixture(),
      source = document.createElement('canvas');
    source.width = fixture.width;
    source.height = fixture.height;
    const sourceContext = source.getContext('2d')!;
    sourceContext.putImageData(new ImageData(fixture.data, fixture.width, fixture.height), 0, 0);
    sourceContext.font = '24px monospace';
    sourceContext.fillStyle = '#252525';
    sourceContext.fillText('Rechnung 0123456789  12,34 EUR', 35, 70);
    sourceContext.fillStyle = 'rgba(20,20,20,0.06)';
    sourceContext.fillText('Blasse Zahlen 0123456789', 35, 410);
    const original = await new Promise<Blob>((r) => source.toBlob((b) => r(b!), 'image/png'));
    const comparison = document.createElement('canvas');
    comparison.width = fixture.width * 3;
    comparison.height = fixture.height;
    const comparisonContext = comparison.getContext('2d')!;
    comparisonContext.drawImage(source, 0, 0);
    const worker = new Worker('/scanner-assets/processing.worker.js', { type: 'module' });
    let id = 0;
    const process = (enhancement: string, mime: string, previewComparison: boolean): Promise<any> =>
      new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => {
          if (data.diagnostic) return;
          data.error ? reject(data.error) : resolve(data.result);
        };
        worker.onerror = reject;
        worker.postMessage({
          id: ++id,
          kind: 'process',
          request: {
            original,
            limits,
            rotation: 0,
            revision: 1,
            mime,
            previewComparison,
            // The fixture's known paper fills this image; these are explicitly confirmed corners.
            corners: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
              { x: 0, y: 1 },
            ],
            format: { kind: 'original-ratio', origin: 'user' },
            recipe: { version: 1, enhancement, dewarp: 'off' },
          },
        });
      });
    const hash = async (b: Blob) =>
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()))).join(
        ',',
      );
    const results = [];
    try {
      for (const mime of ['image/png', 'image/jpeg'])
        for (const profile of ['paper', 'grayscale']) {
          const preview = await process(profile, mime, true),
            exported = await process(profile, mime, false);
          const bitmap = await createImageBitmap(preview.preview),
            c = new OffscreenCanvas(bitmap.width, bitmap.height),
            ctx = c.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          if (mime === 'image/png')
            comparisonContext.drawImage(
              bitmap,
              profile === 'paper' ? fixture.width : fixture.width * 2,
              0,
              fixture.width,
              fixture.height,
            );
          bitmap.close();
          const pixel = (x: number, y: number) =>
            Array.from(
              ctx.getImageData(
                Math.round((x / 639) * (c.width - 1)),
                Math.round((y / 479) * (c.height - 1)),
                1,
                1,
              ).data,
            ).slice(0, 3);
          results.push({
            mime,
            profile,
            cleanup: preview.paperCleanup,
            samples: [20, 320, 600].map((x) => ({
              paper: pixel(x, 210),
              weak: pixel(x, 221),
              dark: pixel(x, 262),
            })),
            marker: pixel(320, 160),
            equal: (await hash(preview.preview)) === (await hash(exported.preview)),
            comparison: !!preview.unoptimizedPreview,
            exportComparison: !!exported.unoptimizedPreview,
          });
        }
      return { results, comparison: comparison.toDataURL('image/png') };
    } finally {
      worker.terminate();
    }
  }, DEFAULT_LIMITS);
  for (const row of result.results) {
    expect(row.cleanup.applied).toBe(true);
    for (const sample of row.samples) {
      expect(Math.min(...sample.paper)).toBeGreaterThanOrEqual(248);
      expect(Math.min(...sample.paper.map((v, c) => v - sample.weak[c]))).toBeGreaterThanOrEqual(
        row.mime === 'image/png' ? 6 : 4,
      );
      expect(Math.max(...sample.dark)).toBeLessThan(55);
    }
    expect(row.equal).toBe(true);
    expect(row.comparison).toBe(true);
    expect(row.exportComparison).toBe(false);
    if (row.profile === 'paper') {
      expect(Math.abs(row.marker[0] - 180)).toBeLessThan(6);
      expect(Math.abs(row.marker[1] - 40)).toBeLessThan(6);
      expect(Math.abs(row.marker[2] - 80)).toBeLessThan(6);
    } else expect(Math.max(...row.marker) - Math.min(...row.marker)).toBeLessThanOrEqual(1);
  }
  await info.attach('paper-color-gray.png', {
    body: Buffer.from(result.comparison.split(',')[1], 'base64'),
    contentType: 'image/png',
  });
});
