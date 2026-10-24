import { build } from 'esbuild';
import { test, expect } from './fixtures';
let harness: string;
test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import React from './apps/demo-next/node_modules/react/index.js';
import {createRoot} from './apps/demo-next/node_modules/react-dom/client.js';
import Results from './apps/demo-next/app/Results.tsx';
window.showReceiptResults=(pages)=>{
 const mount=document.createElement('main');mount.className='has-result';document.body.replaceChildren(mount);
 createRoot(mount).render(React.createElement(Results,{result:{status:'confirmed',schemaVersion:1,sessionId:'synthetic',pages},hidden:false,reset(){},scan(){},back(){}}));
};`,
    },
    bundle: true,
    format: 'esm',
    write: false,
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  harness = compiled.outputFiles[0].text;
});
test('long receipts stay fully visible when fitted, after scrolling at 100 percent and switching pages', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/');
  await page.addScriptTag({ type: 'module', content: harness });
  await expect.poll(() => page.evaluate(() => !!(window as any).showReceiptResults)).toBe(true);
  await page.evaluate(async () => {
    const pages = [];
    for (const [i, [width, height]] of [
      [600, 800],
      [220, 1698],
      [324, 965],
      [160, 4096],
    ].entries()) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#f00';
      ctx.fillRect(0, 0, width, 25);
      ctx.fillStyle = '#00f';
      ctx.fillRect(0, height - 25, width, 25);
      ctx.fillStyle = '#222';
      ctx.font = '14px monospace';
      for (let y = 50; y < height - 30; y += 28) ctx.fillText('TEST 0123 12,34', 8, y);
      const image = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      pages.push({
        id: String(i),
        revision: 1,
        image,
        metadata: { outputSizePx: { width, height } },
      });
    }
    (window as any).showReceiptResults(pages);
  });
  await page.getByRole('button', { name: 'Seite 1 vergrößern', exact: true }).click();
  const dialog = page.getByRole('dialog'),
    image = dialog.getByRole('img');
  const fitted = async () => {
    await expect
      .poll(() =>
        image.evaluate(
          (i: HTMLImageElement) =>
            i.complete && i.naturalWidth > 0 && getComputedStyle(i).opacity === '1',
        ),
      )
      .toBe(true);
    await expect(async () => {
      const r = await image.evaluate((i: HTMLImageElement) => {
        const b = i.getBoundingClientRect(),
          p = i.parentElement!,
          c = p.getBoundingClientRect();
        return {
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
          left: c.left + 12,
          top: c.top + 12,
          right: c.right - 12,
          bottom: c.bottom - 12,
          ratio: i.naturalWidth / i.naturalHeight,
          scrollTop: p.scrollTop,
          scrollLeft: p.scrollLeft,
        };
      });
      expect(r.w).toBeGreaterThan(2);
      expect(r.h).toBeGreaterThan(100);
      expect(r.x).toBeGreaterThanOrEqual(r.left - 1);
      expect(r.y).toBeGreaterThanOrEqual(r.top - 1);
      expect(r.x + r.w).toBeLessThanOrEqual(r.right + 1);
      expect(r.y + r.h).toBeLessThanOrEqual(r.bottom + 1);
      expect(r.w / r.h).toBeCloseTo(r.ratio, 3);
      expect(r.scrollTop).toBe(0);
      expect(r.scrollLeft).toBe(0);
    }).toPass({ timeout: 10000 });
  };
  for (let i = 0; i < 4; i++) {
    await expect(image).toHaveAttribute('alt', `Vergrößerte Seite ${i + 1}`);
    await fitted();
    await dialog.getByRole('button', { name: '100 Prozent', exact: true }).click();
    await expect(dialog.locator('.scanner-image-surface')).toHaveAttribute('data-zoom', '100');
    const box = await dialog.locator('.scanner-image-surface').boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 20, { steps: 8 });
    await page.mouse.up();
    await dialog.getByRole('button', { name: 'Bild einpassen', exact: true }).click();
    await fitted();
    if (i === 1)
      await info.attach('long-receipt-fit.png', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    if (i < 3) await dialog.getByRole('button', { name: 'Nächste Seite', exact: true }).click();
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await fitted();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Seite 4 vergrößern', exact: true })).toBeFocused();
});
