import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const license = await readFile('LICENSE', 'utf8');
const notice = await readFile('NOTICE', 'utf8');
const base = 'packages/scanner/dist/assets';
const pdfWorker = await readFile(`${base}/pdf.worker.js`, 'utf8');
assert(pdfWorker.includes('Copyright (c) 2008, Adobe Systems Incorporated'));
assert(pdfWorker.includes('Bundled license information'), 'Bundled legal comments missing');
const vendorFiles = [
  ...(await walk(`${base}/licenses`)).filter((path) => !path.endsWith('.json')),
  ...(await walk(`${base}/third-party`)),
];
for (const app of ['demo-next', 'demo-astro']) {
  const root = `apps/${app}/public`;
  const text = await readFile(`${root}/third-party-notices.txt`, 'utf8');
  assert(text.includes(license) && text.includes(notice), `${app}: project notices missing`);
  assert.equal(await readFile(`${root}/scanner-assets/ktb-scanner.LICENSE`, 'utf8'), license);
  assert.equal(await readFile(`${root}/scanner-assets/ktb-scanner.NOTICE`, 'utf8'), notice);
  for (const file of (await readdir(base)).filter((name) => name.endsWith('.NOTICE.txt')))
    assert(text.includes(await readFile(`${base}/${file}`, 'utf8')), `${app}: ${file} missing`);
  for (const path of vendorFiles) {
    const bytes = await readFile(path);
    assert(bytes.length > 0, `Empty notice: ${path}`);
    assert.deepEqual(
      await readFile(`${root}/scanner-assets/${path.slice(base.length + 1)}`),
      bytes,
    );
    assert(text.includes(bytes.toString('utf8')), `${app}: omitted notice ${path}`);
  }
  for (const component of ['react@', 'react-dom@', 'scheduler@'])
    assert(text.includes(component), `${app}: ${component} missing`);
  if (app === 'demo-next') {
    assert(text.includes('pdfjs-dist@') && text.includes('next@'));
    assert(text.includes('dist/compiled/react/LICENSE'), 'Next vendored notices missing');
  } else assert(text.includes('astro@'));
}
console.log('Both reference hosts preserve project, runtime, vendored and Rust/WASM notices.');
