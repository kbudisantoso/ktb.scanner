import { test, expect } from './fixtures';
import { noisyDocument } from '../fixtures/noisy-document';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session';
test('worker monochrome suppresses paper noise while keeping faint text, punctuation, gray edges and export pixels', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.addScriptTag({ content: `window.noisyDocument=${noisyDocument.toString()}` });
  const result = await page.evaluate(async (limits) => {
    const source = (window as any).noisyDocument(),
      c = document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    const context = c.getContext('2d')!;
    context.putImageData(new ImageData(source.data, source.width, source.height), 0, 0);
    context.fillStyle = '#222';
    context.font = '22px monospace';
    context.fillText('12,34 EUR Test 012345', 20, 285);
    const original = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const worker = new Worker('/scanner-assets/processing.worker.js', { type: 'module' });
    let id = 0;
    const run = (mime: string, previewComparison: boolean): Promise<any> =>
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
            mime,
            rotation: 0,
            revision: 1,
            previewComparison,
            corners: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
              { x: 0, y: 1 },
            ],
            format: { kind: 'original-ratio', origin: 'user' },
            recipe: { version: 1, enhancement: 'bw', dewarp: 'off' },
          },
        });
      });
    const hash = async (b: Blob) =>
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()))).join(
        ',',
      );
    try {
      const results = [];
      for (const mime of ['image/png', 'image/jpeg']) {
        const review = await run(mime, true),
          exported = await run(mime, false),
          bitmap = await createImageBitmap(review.preview),
          out = new OffscreenCanvas(bitmap.width, bitmap.height),
          ctx = out.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const d = ctx.getImageData(0, 0, out.width, out.height).data;
        const pixel = (x: number, y: number) =>
          d[
            (Math.round((y / 639) * (out.height - 1)) * out.width +
              Math.round((x / 479) * (out.width - 1))) *
              4
          ];
        let dark = 0,
          n = 0,
          weak = 0;
        for (let y = 20; y < 170; y++)
          for (let x = 20; x < 460; x++) {
            n++;
            if (pixel(x, y) < 100) dark++;
          }
        for (let x = 20; x < 460; x++) if (pixel(x, 191) < 252 && pixel(x, 191) > 60) weak++;
        results.push({
          mime,
          noise: dark / n,
          weak,
          ink: pixel(200, 241),
          dot: pixel(80, 360),
          levels: new Set(Array.from(d).filter((_, i) => i % 4 === 0)).size,
          equal: (await hash(review.preview)) === (await hash(exported.preview)),
          png:
            mime === 'image/png'
              ? Array.from(new Uint8Array(await review.preview.arrayBuffer()))
              : undefined,
        });
      }
      return results;
    } finally {
      worker.terminate();
    }
  }, DEFAULT_LIMITS);
  for (const r of result) {
    expect(r.noise).toBeLessThan(0.001);
    expect(r.weak).toBeGreaterThan(390);
    expect(r.ink).toBeLessThan(40);
    expect(r.dot).toBeLessThan(70);
    expect(r.levels).toBeGreaterThan(16);
    expect(r.equal).toBe(true);
  }
  await info.attach('denoised-monochrome.png', {
    body: Buffer.from(result[0].png!),
    contentType: 'image/png',
  });
});
