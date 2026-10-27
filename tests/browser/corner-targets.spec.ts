import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

let stylesheet: string;
test.beforeAll(async () => {
  stylesheet = await readFile('packages/scanner/dist/styles.css', 'utf8');
});

for (const [width, height] of [
  [320, 568],
  [390, 664],
  [844, 390],
]) {
  test(`corner touch targets remain inside the workspace at source boundaries, ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    const appScripts: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/_next/')) appScripts.push(request.url());
    });
    // This bounds-only fixture must not compete with Next.js hydration for document.body.
    await page.route('**/corner-targets-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="en"><head>
          <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${stylesheet}</style></head><body></body></html>`,
      }),
    );
    await page.goto('/corner-targets-fixture');
    await page.evaluate(async () => {
      const assetUrl = '/scanner-assets/scanic.js';
      const { createCornerEditor } = await import(assetUrl);
      const backdrop = document.createElement('div');
      backdrop.className = 'scanner-backdrop';
      backdrop.innerHTML = `<section class="scanner scanner-workspace">
        <header class="scanner-header"><h2>Corners</h2></header>
        <div class="scanner-body"><section class="scanner-corners">
          <div class="scanner-corner-stage"><div class="scanner-corner-host"></div></div>
          <div class="scanner-actions"><button>Cancel</button><button>Apply</button></div>
        </section></div>
      </section>`;
      document.body.replaceChildren(backdrop);
      const image = document.createElement('canvas');
      image.width = 800;
      image.height = 1000;
      image.getContext('2d')!.fillRect(0, 0, image.width, image.height);
      const corners = {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 799, y: 0 },
        bottomRight: { x: 799, y: 999 },
        bottomLeft: { x: 0, y: 999 },
      };
      const editor = createCornerEditor({
        container: document.querySelector('.scanner-corner-host')!,
        image,
        corners,
        handleHitArea: 48,
        keyboard: true,
        toolbar: { enabled: false },
        nudges: { enabled: false },
        magnifier: { enabled: false },
        classNames: { handle: 'scanner-corner-handle' },
      });
      Object.assign(window, { boundaryEditor: editor, boundaryCorners: corners });
    });
    for (const key of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']) {
      const handle = page.locator(`[data-corner="${key}"]`);
      await handle.focus();
      await expect(handle).toHaveClass(/is-selected/);
      for (const dragging of [false, true]) {
        if (dragging) {
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await expect(handle).toHaveClass(/is-active/);
        }
        await handle.evaluate(async (node) => {
          await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
        });
        const issues = await handle.evaluate((node) => {
          const r = node.getBoundingClientRect();
          const stage = node.closest('.scanner-corner-stage')!.getBoundingClientRect();
          const issues: string[] = [];
          if (r.width < 48 || r.height < 48) issues.push('undersized touch target');
          if (
            r.left < stage.left - 1 ||
            r.top < stage.top - 1 ||
            r.right > stage.right + 1 ||
            r.bottom > stage.bottom + 1
          )
            issues.push(
              `target outside reserved gutter: ${JSON.stringify({ target: r.toJSON(), stage: stage.toJSON() })}`,
            );
          if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
            issues.push('target outside viewport');
          for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent),
              bounds = parent.getBoundingClientRect();
            if (
              ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY) &&
              (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1)
            )
              issues.push(`target clipped by ${parent.className}`);
          }
          return issues;
        });
        expect(issues, `${key}, dragging=${dragging}`).toEqual([]);
        if (dragging) await page.mouse.up();
      }
    }
    expect(await page.evaluate(() => (window as any).boundaryEditor.getCorners())).toEqual(
      await page.evaluate(() => (window as any).boundaryCorners),
    );
    await page.evaluate(() => (window as any).boundaryEditor.destroy());
    expect(appScripts).toEqual([]);
    expect(errors).toEqual([]);
  });
}
