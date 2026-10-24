import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const files = [];
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        '.git',
        'dist',
        'artifacts',
        '.next',
        '.astro',
        'test-results',
        'playwright-report',
        'coverage',
      ].includes(entry.name)
    )
      continue;
    const location = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(location);
    else if (entry.name.endsWith('.md')) files.push(location);
  }
}
await walk('.');
const errors = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let link = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^[a-z]+:/i.test(link) || link.startsWith('/')) continue;
    link = decodeURIComponent(link);
    try {
      await stat(resolve(dirname(file), link));
    } catch {
      errors.push(`${file}: missing ${link}`);
    }
  }
}
const requirements = await readFile('docs/REQUIREMENTS.md', 'utf8');
const defined = new Set(requirements.match(/\b[FIN]-\d\d\b/g));
for (const file of ['docs/SPECIFICATION.md', 'docs/DECISIONS.md']) {
  for (const id of (await readFile(file, 'utf8')).match(/\b[FIN]-\d\d\b/g) ?? [])
    if (!defined.has(id)) errors.push(`${file}: undefined requirement ${id}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Local document links and requirement references checked (${files.length} Markdown files).`,
  );
