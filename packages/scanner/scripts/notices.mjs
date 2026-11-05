import { readFile, readdir, mkdir, copyFile, writeFile, realpath } from 'node:fs/promises';
import { basename, dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const paddleVersions = {
  '@paddleocr/paddleocr-js': '0.4.2',
  '@techstark/opencv-js': '4.10.0-release.1',
  'onnxruntime-web': '1.31.1',
  'onnxruntime-common': '1.31.1',
};
// Only these reviewed versions omit their original full root notices.
// Unknown missing notices still fail the build rather than accepting SPDX alone.
const noticeFallbacks = {
  '@paddleocr/paddleocr-js@0.4.2': ['paddleocr-js-0.4.2/LICENSE'],
  'onnxruntime-web@1.31.1': ['onnxruntime-1.31.1/LICENSE'],
  'onnxruntime-common@1.31.1': ['onnxruntime-1.31.1/LICENSE'],
  'clipper-lib@6.4.2': [
    'clipper-lib-6.4.2/LICENSE-Boost',
    'clipper-lib-6.4.2/LICENSE-JSBN',
    'clipper-lib-6.4.2/NOTICE-original-headers',
  ],
  'guid-typescript@1.0.9': [
    'guid-typescript-1.0.9/LICENSE-ISC-standard',
    'guid-typescript-1.0.9/NOTICE-publisher-package.json',
  ],
};
export async function packageRoot(name, from) {
  const require = createRequire(join(from, 'package.json'));
  let directory;
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {}
  // ESM packages may export only the import condition and hide package.json.
  // Resolve their installed root without executing their entry or losing pnpm's
  // physical dependency boundary behind a workspace symlink.
  for (const modules of require.resolve.paths(name) ?? []) {
    const root = join(modules, name);
    try {
      const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      if (metadata.name === name) return await realpath(root);
    } catch {}
  }
  directory = dirname(require.resolve(name));
  while (directory !== dirname(directory)) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (metadata.name === name) return directory;
    } catch {}
    directory = dirname(directory);
  }
  throw new Error(`Package root missing: ${name}`);
}
export async function collectNotices() {
  const seen = new Set(),
    inventory = [];
  async function visit(name, from, optional = false, recurse = true) {
    let root;
    try {
      root = await packageRoot(name, from);
    } catch (error) {
      if (optional) return;
      throw error;
    }
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const id = `${metadata.name}@${metadata.version}`;
    if (paddleVersions[metadata.name] && paddleVersions[metadata.name] !== metadata.version)
      throw new Error(`Review Paddle notices before using ${id}`);
    if (seen.has(id)) return;
    seen.add(id);
    const target = resolve('dist/assets/licenses', id.replaceAll('/', '__'));
    await mkdir(target, { recursive: true });
    const notices = (await readdir(root, { withFileTypes: true }))
      .filter(
        (file) =>
          file.isFile() && /^(licen[cs]e|notice|copying|copyright)([._-]|$)/i.test(file.name),
      )
      .map((file) => file.name)
      .sort();
    const sourceFiles = notices.length
      ? notices.map((name) => ({ source: join(root, name), name }))
      : (noticeFallbacks[id] ?? []).map((file) => ({
          source: join('third-party/paddle-ocr', file),
          name: basename(file),
        }));
    if (!sourceFiles.length) throw new Error(`License notices missing for ${id}`);
    for (const { source, name } of sourceFiles) await copyFile(source, join(target, name));
    inventory.push({
      name: metadata.name,
      version: metadata.version,
      license: metadata.license ?? 'UNKNOWN',
      notices: sourceFiles.map((file) => file.name),
    });
    if (recurse) {
      for (const dependency of Object.keys(metadata.dependencies ?? {}))
        await visit(dependency, root);
      for (const dependency of Object.keys(metadata.optionalDependencies ?? {}))
        await visit(dependency, root, true);
    }
  }
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  for (const name of Object.keys(manifest.dependencies ?? {})) await visit(name, process.cwd());
  // These build inputs supply copied browser assets, not their Node.js factory/dependency tree.
  // Bundled worker and native dependencies have their own source-bound third-party supplements.
  for (const name of ['tesseract.js', 'tesseract.js-core'])
    await visit(name, process.cwd(), false, false);
  // The Paddle main entry and the selected ORT WASM entry are bundled from this
  // installed graph. Do not substitute the separately prebuilt SDK worker's graph.
  for (const name of ['@paddleocr/paddleocr-js', 'onnxruntime-web', '@techstark/opencv-js'])
    await visit(name, process.cwd());
  await writeFile('dist/assets/licenses/inventory.json', JSON.stringify(inventory, null, 2));
}
