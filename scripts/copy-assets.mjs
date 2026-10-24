import { cp, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const files = [
  'processing.worker.js',
  'pdf.worker.js',
  'scanic.js',
  'scanic.LICENSE',
  'versions.json',
  ...[
    'shutter',
    'deepscan',
    'soul',
    'notification',
    'xylophone',
    'beep',
    'warp',
    'powerdown',
    'instant',
    'teleport',
    'transformer',
    'electric',
  ].flatMap((name) => [`${name}.mp3`, `${name}.NOTICE.txt`]),
];
for (const app of ['demo-next', 'demo-astro']) {
  const target = `apps/${app}/public/scanner-assets`;
  await mkdir(target, { recursive: true });
  const hashes = {};
  for (const file of files) {
    const source = `packages/scanner/dist/assets/${file}`;
    await copyFile(source, `${target}/${file}`);
    hashes[file] = createHash('sha256')
      .update(await readFile(source))
      .digest('hex');
  }
  await cp('packages/scanner/dist/assets/licenses', `${target}/licenses`, { recursive: true });
  await writeFile(`${target}/sha256.json`, `${JSON.stringify(hashes, null, 2)}\n`);
}
const require = createRequire(resolve('apps/demo-next/package.json'));
const root = dirname(require.resolve('pdfjs-dist/package.json'));
await cp(resolve(root, 'build/pdf.worker.min.mjs'), 'apps/demo-next/public/pdf.worker.min.mjs');
await cp(resolve(root, 'LICENSE'), 'apps/demo-next/public/pdfjs.LICENSE');
