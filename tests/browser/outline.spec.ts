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
