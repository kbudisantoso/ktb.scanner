import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
async function packageRoot(name, from) {
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
  async function visit(name, from, optional = false) {
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
    const notices = (await readdir(root)).filter((file) =>
      /^(licen[cs]e|notice|copying)([._-]|$)/i.test(file),
    );
    for (const notice of notices) await copyFile(join(root, notice), join(target, notice));
    inventory.push({
      name: metadata.name,
      version: metadata.version,
      license: metadata.license ?? 'UNKNOWN',
      notices,
    });
    for (const dependency of Object.keys(metadata.dependencies ?? {}))
      await visit(dependency, root);
    for (const dependency of Object.keys(metadata.optionalDependencies ?? {}))
      await visit(dependency, root, true);
  }
  for (const name of ['scanic', 'jspdf']) await visit(name, process.cwd());
  await writeFile('dist/assets/licenses/inventory.json', JSON.stringify(inventory, null, 2));
}
