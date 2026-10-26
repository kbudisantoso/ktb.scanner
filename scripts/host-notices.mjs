import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { packageRoot } from '../packages/scanner/scripts/notices.mjs';

// Minified host bundles do not reliably preserve upstream license comments.
// Include all supplied notices in Next's vendored tree and PDF.js, even where
// only a subset is used, rather than relying on package-level SPDX metadata.
async function noticesIn(root, recursive = false) {
  const files = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name === 'node_modules') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory() && recursive) files.push(...(await noticesIn(path, true)));
    else if (entry.isFile() && /^(licen[cs]e|notice|copying|copyright)([._-]|$)/i.test(entry.name))
      files.push(path);
  }
  return files;
}

export async function writeHostNotices(app) {
  const sections = [
    'ktb.scanner reference application\n' +
      'Project source: https://github.com/kbudisantoso/ktb.scanner\n' +
      'Project source license: AGPL-3.0-only. No warranty; see the full license below.\n' +
      'Third-party code and audio retain their separate terms.\n' +
      'This is a conservative notice collection, not a claim that every listed component is shipped.',
  ];
  const add = async (label, path) => sections.push(`${label}\n\n${await readFile(path, 'utf8')}`);
  for (const file of ['LICENSE', 'NOTICE']) await add(`ktb.scanner / ${file}`, file);
  const assets = 'packages/scanner/dist/assets';
  await add('Capture audio / CC0-1.0.LICENSE', join(assets, 'CC0-1.0.LICENSE'));
  for (const file of (await readdir(assets)).filter((name) => name.endsWith('.NOTICE.txt')).sort())
    await add(`Capture audio / ${file}`, join(assets, file));
  for (const path of await noticesIn(join(assets, 'licenses'), true))
    await add(path.slice(assets.length + 1), path);
  for (const path of await noticesIn(join(assets, 'third-party'), true))
    await add(path.slice(assets.length + 1), path);
  const host = resolve(`apps/${app}`);
  const packages = ['react', 'react-dom', 'scheduler', app === 'demo-next' ? 'next' : 'astro'];
  if (app === 'demo-next') packages.push('pdfjs-dist', '@swc/helpers', 'styled-jsx');
  for (const name of packages) {
    const from =
      name === 'scheduler'
        ? await packageRoot('react-dom', host)
        : ['@swc/helpers', 'styled-jsx'].includes(name)
          ? await packageRoot('next', host)
          : host;
    const root = await packageRoot(name, from);
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const files = await noticesIn(root, name === 'pdfjs-dist');
    if (name === 'next') files.push(...(await noticesIn(join(root, 'dist/compiled'), true)));
    if (!files.length) throw new Error(`Host license notices missing for ${name}`);
    for (const path of files)
      await add(`${metadata.name}@${metadata.version} / ${path.slice(root.length + 1)}`, path);
  }
  const destination = `apps/${app}/public/third-party-notices.txt`;
  await writeFile(
    destination,
    `${sections.join('\n\n------------------------------------------------------------\n\n')}\n`,
  );
}
