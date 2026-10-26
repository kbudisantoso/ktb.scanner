import { instrumentScanic } from './instrument-scanic.mjs';
import { collectNotices } from './notices.mjs';
import { build } from 'esbuild';
import { cp, copyFile, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const packageManifest = JSON.parse(await readFile('package.json', 'utf8'));
const common = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  legalComments: 'eof',
  platform: 'browser',
  logLevel: 'info',
};
await build({
  ...common,
  entryPoints: ['src/index.ts', 'src/react/index.tsx', 'src/scanic.ts', 'src/export.ts'],
  outdir: 'dist',
  splitting: true,
  external: ['react', 'react-dom/client', 'react/jsx-runtime', 'scanic', 'jspdf'],
});
await mkdir('dist/assets', { recursive: true });
await copyFile('LICENSE', 'dist/assets/ktb-scanner.LICENSE');
await copyFile('NOTICE', 'dist/assets/ktb-scanner.NOTICE');
await cp('third-party', 'dist/assets/third-party', { recursive: true });
for (const file of await readdir('assets')) {
  if (/\.(mp3|NOTICE\.txt|LICENSE)$/.test(file))
    await copyFile(`assets/${file}`, `dist/assets/${file}`);
}
// The version-checked debug adaptation exposes existing buffers; ML is never activated.
const scanicRoot = resolve(dirname(require.resolve('scanic')), '..');
const manifest = JSON.parse(await readFile(resolve(scanicRoot, 'package.json'), 'utf8'));
if (manifest.version !== '1.7.1') throw new Error('Unexpected Scanic version');
await writeFile(
  'dist/assets/scanic.js',
  instrumentScanic(await readFile(resolve(scanicRoot, 'dist/scanic.js'), 'utf8')),
);
await copyFile(resolve(scanicRoot, 'LICENSE'), 'dist/assets/scanic.LICENSE');
await build({
  ...common,
  entryPoints: ['src/processing.worker.ts'],
  outfile: 'dist/assets/processing.worker.js',
  plugins: [
    {
      name: 'local-scanic',
      setup(b) {
        b.onResolve({ filter: /^scanic$/ }, () => ({ path: './scanic.js', external: true }));
      },
    },
  ],
});
await build({
  ...common,
  entryPoints: ['src/pdf.worker.ts'],
  outfile: 'dist/assets/pdf.worker.js',
});
await copyFile('src/react/styles.css', 'dist/styles.css');
await writeFile(
  'dist/assets/versions.json',
  JSON.stringify(
    {
      adapter: packageManifest.version,
      scanic: manifest.version,
      detector: 'classical',
      scanicInstrumentation: 'candidate-selection-and-debug-v2',
      jspdf: '4.2.1',
    },
    null,
    2,
  ),
);

await collectNotices();

async function fixDeclarationImports(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) await fixDeclarationImports(path);
    else if (item.name.endsWith('.d.ts')) {
      const source = await readFile(path, 'utf8');
      await writeFile(path, source.replace(/(from\s+['"][^'"]+)\.tsx?(['"])/g, '$1.js$2'));
    }
  }
}
await fixDeclarationImports('dist');
