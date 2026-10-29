import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
export async function packageRoot(name, from) {
  const require = createRequire(join(from, 'package.json'));
  let directory;
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    directory = dirname(require.resolve(name));
  }
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
    if (!notices.length) throw new Error(`License notices missing for ${id}`);
    for (const notice of notices) await copyFile(join(root, notice), join(target, notice));
    inventory.push({
      name: metadata.name,
      version: metadata.version,
      license: metadata.license ?? 'UNKNOWN',
      notices,
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
  await writeFile('dist/assets/licenses/inventory.json', JSON.stringify(inventory, null, 2));
}
