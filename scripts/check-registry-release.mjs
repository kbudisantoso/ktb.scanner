import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { releaseConfig, registryState } from './release-config.mjs';

const manifest = JSON.parse(await readFile('packages/scanner/package.json', 'utf8'));
const config = releaseConfig(manifest, process.env.RELEASE_TAG);
const archive = await readFile(`release/${config.archive}`);
const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
const url = `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${encodeURIComponent(config.version)}`;
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
const state = registryState(response.status, response.ok ? await response.json() : null, integrity);
if (process.env.REQUIRE_PUBLISHED === 'true' && state !== 'identical')
  throw new Error('The expected package is not available from npm yet');
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `publish=${state === 'missing'}\n`);
console.log(
  state === 'identical'
    ? 'npm already contains this exact archive; no duplicate publication needed.'
    : 'This version is not on npm; the checked archive can be published.',
);
