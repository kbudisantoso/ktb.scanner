import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { writeHostNotices } from './host-notices.mjs';
const files = [
  'processing.worker.js',
  'pdf.worker.js',
  'scanic.js',
  'scanic.LICENSE',
  'ktb-scanner.LICENSE',
  'ktb-scanner.NOTICE',
  'versions.json',
  ...(await readdir('packages/scanner/dist/assets'))
    .filter((name) => /\.(mp3|NOTICE\.txt)$/.test(name) || name === 'CC0-1.0.LICENSE')
    .sort(),
];
for (const app of ['demo-next', 'demo-astro']) {
  const target = `apps/${app}/public/scanner-assets`;
  // This is a build-owned directory. Remove retired assets as well as copying
  // current ones; host-owned custom sounds belong outside this directory.
  await rm(target, { recursive: true, force: true });
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
  await cp('packages/scanner/dist/assets/third-party', `${target}/third-party`, {
    recursive: true,
  });
  await writeFile(`${target}/sha256.json`, `${JSON.stringify(hashes, null, 2)}\n`);
  await writeHostNotices(app);
}
const require = createRequire(resolve('apps/demo-next/package.json'));
const root = dirname(require.resolve('pdfjs-dist/package.json'));
await cp(resolve(root, 'build/pdf.worker.min.mjs'), 'apps/demo-next/public/pdf.worker.min.mjs');
await cp(resolve(root, 'LICENSE'), 'apps/demo-next/public/pdfjs.LICENSE');
