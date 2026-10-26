import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { releaseConfig } from './release-config.mjs';

const tag = process.env.RELEASE_TAG;
const manifest = JSON.parse(await readFile('packages/scanner/package.json', 'utf8'));
const event = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
  : {};
const config = releaseConfig(manifest, tag, event.release?.prerelease);
if (event.release?.draft) throw new Error('Draft releases must not publish');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = git('rev-parse', 'HEAD');
if (sha !== git('rev-parse', `refs/tags/${tag}^{commit}`))
  throw new Error('Checkout must be the exact release tag');
git('merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main');
const values = { ...config, sha, tag };
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
console.log(`Validated ${manifest.name}@${config.version} at ${sha} (${config.npmTag})`);
