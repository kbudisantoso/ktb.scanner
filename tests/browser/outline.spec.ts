import { test, expect } from './fixtures';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import type { Quad } from '../../packages/scanner/src/types';

// Compile the real component with React's JSX runtime; Playwright's JSX transform
// otherwise produces component-test descriptors instead of renderable elements.
const compiled = buildSync({
  entryPoints: [
    new URL('../../packages/scanner/src/react/CaptureOutline.tsx', import.meta.url).pathname,
  ],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
}).outputFiles[0].text;
const componentModule = {
  exports: {} as typeof import('../../packages/scanner/src/react/CaptureOutline'),
};
new Function('require', 'module', 'exports', compiled)(
  createRequire(import.meta.url),
  componentModule,
  componentModule.exports,
);
const { CaptureOutline } = componentModule.exports;

const motionHarness = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
import React, {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {CaptureOutline} from './packages/scanner/src/react/CaptureOutline.tsx';
let now=1000, id=0, hidden=false, root, current, preferenceEvents=0;
const frames=new Map(), cancelled=[];
const preference=matchMedia('(prefers-reduced-motion: reduce)');
preference.addEventListener('change',()=>preferenceEvents++);
Object.defineProperty(performance,'now',{value:()=>now});
Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
window.requestAnimationFrame=callback=>{frames.set(++id,callback);return id};
window.cancelAnimationFrame=id=>{const callback=frames.get(id);if(callback)cancelled.push(callback);frames.delete(id)};
window.outlineMotion={
 render(patch){
  if(!root)root=createRoot(document.getElementById('motion'));
  current={...current,...patch};
  flushSync(()=>root.render(React.createElement(StrictMode,null,React.createElement(CaptureOutline,current))));
 },
 step(time){now=time;const ready=[...frames.values()];frames.clear();ready.forEach(callback=>callback(now))},
 hidden(value){hidden=value;document.dispatchEvent(new Event('visibilitychange'))},
 stale(){cancelled.splice(0).forEach(callback=>callback(now+1000))},
 unmount(){flushSync(()=>root.unmount());root=null},
 read(){return {points:document.querySelector('polygon')?.getAttribute('points'),green:document.querySelector('polyline')?.getAttribute('points'),pending:frames.size,progress:document.querySelector('svg')?.getAttribute('data-progress'),preferenceEvents}}
};`,
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
}).outputFiles[0].text;

const motionQuad: Quad = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.1 },
  { x: 0.8, y: 0.9 },
  { x: 0.2, y: 0.9 },
];
const motionShift = (distance: number) =>
  motionQuad.map((point) => ({ ...point, x: point.x + distance })) as Quad;

async function mountMotion(page: import('@playwright/test').Page) {
  await page.setContent(
    '<style>body{margin:0;background:#182b25}#motion{width:390px;height:560px}svg{width:100%;height:100%;display:block}</style><main id="motion"></main>',
  );
  await page.addScriptTag({ type: 'module', content: motionHarness });
  await page.waitForFunction(() => !!(window as any).outlineMotion);
  await page.evaluate((corners) => {
    (window as any).outlineMotion.render({
      corners,
      size: { width: 390, height: 560 },
      progress: 0.5,
      opacity: 1,
      generation: 1,
      animate: true,
    });
  }, motionQuad);
}

test('white and green contours move together, finish despite progress renders and snap new scenes', async ({
  page,
}, testInfo) => {
  await mountMotion(page);
  await page.screenshot({ path: testInfo.outputPath('contour-start.png') });
  await page.evaluate(
    (corners) => (window as any).outlineMotion.render({ corners }),
    motionShift(0.02),
  );
  expect(await page.evaluate(() => (window as any).outlineMotion.read().pending)).toBe(1);
  await page.evaluate(() => (window as any).outlineMotion.step(1060));
  const middle = await page.evaluate(() => (window as any).outlineMotion.read());
  expect(parseFloat(middle.points)).toBeCloseTo(215, 6);
  expect(middle.green.split(' ')[0]).toBe(middle.points.split(' ')[0]);
  expect(middle.progress).toBe('0.5');
  await page.screenshot({ path: testInfo.outputPath('contour-mid-transition.png') });
  await page.evaluate(() => {
    (window as any).outlineMotion.render({ progress: 0.7, opacity: 0.9 });
    (window as any).outlineMotion.step(1120);
  });
  const end = await page.evaluate(() => (window as any).outlineMotion.read());
  expect(parseFloat(end.points)).toBeCloseTo(220, 6);
  expect(end.pending).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('contour-end.png') });
  await page.evaluate(
    (corners) => (window as any).outlineMotion.render({ corners }),
    motionShift(0.12),
  );
  expect(
    await page.evaluate(() => {
      const value = (window as any).outlineMotion.read();
      return { x: parseFloat(value.points), pending: value.pending };
    }),
  ).toEqual({ x: 320, pending: 0 });
  await page.evaluate(
    (corners) => (window as any).outlineMotion.render({ corners }),
    motionShift(0.13),
  );
  expect(await page.evaluate(() => (window as any).outlineMotion.read().pending)).toBe(1);
  await page.evaluate((corners) => {
    (window as any).outlineMotion.render({ corners, generation: 2 });
    (window as any).outlineMotion.stale();
  }, motionShift(0.14));
  const reset = await page.evaluate(() => (window as any).outlineMotion.read());
  expect(parseFloat(reset.points)).toBeCloseTo(340, 6);
  expect(reset.pending).toBe(0);
});

test('loss, hidden pages, reduced motion and unmount cancel contour frames without replaying them', async ({
  page,
}) => {
  await mountMotion(page);
  const render = async (distance: number, animate = true) => {
    await page.evaluate(
      ({ corners, animate }) => (window as any).outlineMotion.render({ corners, animate }),
      { corners: motionShift(distance), animate },
    );
  };
  await render(0.02);
  await page.evaluate(() => (window as any).outlineMotion.step(1060));
  await render(0.02, false);
  await page.evaluate(() => (window as any).outlineMotion.stale());
  expect(await page.evaluate(() => (window as any).outlineMotion.read().pending)).toBe(0);
  await render(0.03);
  await page.evaluate(() => {
    (window as any).outlineMotion.hidden(true);
    (window as any).outlineMotion.stale();
  });
  expect(await page.evaluate(() => (window as any).outlineMotion.read().pending)).toBe(0);
  await page.evaluate(() => (window as any).outlineMotion.hidden(false));
  expect(await page.evaluate(() => (window as any).outlineMotion.read().pending)).toBe(0);
  await render(0.04);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.evaluate(() => (window as any).outlineMotion.read().pending))
    .toBe(0);
  await render(0.05);
  const reduced = await page.evaluate(() => (window as any).outlineMotion.read());
  expect(parseFloat(reduced.points)).toBeCloseTo(250, 6);
  expect(reduced.pending).toBe(0);
  const preferenceEvents = await page.evaluate(
    () => (window as any).outlineMotion.read().preferenceEvents,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect
    .poll(() => page.evaluate(() => (window as any).outlineMotion.read().preferenceEvents))
    .toBeGreaterThan(preferenceEvents);
  await render(0.06);
  expect(await page.evaluate(() => (window as any).outlineMotion.read().pending)).toBe(1);
  await page.evaluate(() => {
    (window as any).outlineMotion.unmount();
    (window as any).outlineMotion.stale();
  });
  const closed = await page.evaluate(() => (window as any).outlineMotion.read());
  expect(closed.points).toBeUndefined();
  expect(closed.pending).toBe(0);
});

test('painted green perimeter matches capture progress at every screen scale', async ({ page }) => {
  const corners: Quad = [
    { x: 0.2, y: 0.1 },
    { x: 0.8, y: 0.1 },
    { x: 0.8, y: 0.9 },
    { x: 0.2, y: 0.9 },
  ];
  for (const size of [
    { width: 300, height: 400 },
    { width: 600, height: 200 },
  ]) {
    for (const progress of [0, 0.25, 0.5, 0.9, 0.999, 1]) {
      const markup = renderToStaticMarkup(
        createElement(CaptureOutline, { corners, size, progress, opacity: 1 }),
      );
      await page.setContent(markup);
      const fraction = await page.evaluate(
        async ({ size }) => {
          const svg = document.querySelector('svg')!;
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          svg.setAttribute('width', String(size.width));
          svg.setAttribute('height', String(size.height));
          const img = new Image();
          img.src = 'data:image/svg+xml,' + encodeURIComponent(svg.outerHTML);
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = size.width;
          canvas.height = size.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const pixels = ctx.getImageData(0, 0, size.width, size.height).data;
          const points: [number, number][] = [
            [0.2, 0.1],
            [0.8, 0.1],
            [0.8, 0.9],
            [0.2, 0.9],
          ];
          let green = 0,
            count = 0;
          for (let edge = 0; edge < 4; edge++) {
            const start = points[edge],
              end = points[(edge + 1) % 4];
            const length = Math.hypot(
              (end[0] - start[0]) * size.width,
              (end[1] - start[1]) * size.height,
            );
            for (let step = 3; step < length - 3; step++) {
              const x = Math.round((start[0] + ((end[0] - start[0]) * step) / length) * size.width);
              const y = Math.round(
                (start[1] + ((end[1] - start[1]) * step) / length) * size.height,
              );
              const offset = (y * size.width + x) * 4;
              if (pixels[offset] < 80 && pixels[offset + 1] > 150 && pixels[offset + 2] < 180)
                green++;
              count++;
            }
          }
          return green / count;
        },
        { size },
      );
      expect(
        Math.abs(fraction - progress),
        `${size.width}x${size.height} at ${progress}`,
      ).toBeLessThan(0.025);
      if (progress < 1) expect(fraction).toBeLessThan(1);
    }
  }
});
