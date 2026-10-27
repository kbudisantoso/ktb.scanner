import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { releaseConfig, registryState } from './release-config.mjs';

const manifest = {
  name: '@ktb-tools/scanner',
  version: '0.1.0',
  private: false,
  publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
};

test('stable and prerelease versions select separate npm channels', () => {
  assert.deepEqual(releaseConfig(manifest, 'v0.1.0', false), {
    version: '0.1.0',
    npmTag: 'latest',
    archive: 'ktb-tools-scanner-0.1.0.tgz',
  });
  assert.equal(
    releaseConfig({ ...manifest, version: '0.2.0-beta.1' }, 'v0.2.0-beta.1', true).npmTag,
    'next',
  );
});

test('incorrect versions, tags, channels and package destinations cannot publish', () => {
  for (const version of ['01.0.0', '0.1.0-beta.01', '0.1.0+local', '0.1', '0.1.0;echo bad'])
    assert.throws(() => releaseConfig({ ...manifest, version }, `v${version}`));
  assert.throws(() => releaseConfig(manifest, 'v0.2.0'));
  assert.throws(() => releaseConfig(manifest, undefined));
  assert.throws(() => releaseConfig(manifest, '0.1.0'));
  assert.throws(() => releaseConfig(manifest, 'v0.1.0', true));
  assert.throws(() =>
    releaseConfig({ ...manifest, version: '0.2.0-beta.1' }, 'v0.2.0-beta.1', false),
  );
  assert.throws(() => releaseConfig({ ...manifest, private: true }, 'v0.1.0'));
  assert.throws(() => releaseConfig({ ...manifest, name: '@ktb/scanner' }, 'v0.1.0'));
  assert.throws(() =>
    releaseConfig({ ...manifest, publishConfig: { access: 'restricted' } }, 'v0.1.0'),
  );
});

test('a retry accepts only identical published bytes and fails closed on registry errors', () => {
  assert.equal(registryState(404, null, 'sha512-expected'), 'missing');
  assert.equal(
    registryState(200, { dist: { integrity: 'sha512-expected' } }, 'sha512-expected'),
    'identical',
  );
  assert.throws(() =>
    registryState(200, { dist: { integrity: 'sha512-different' } }, 'sha512-expected'),
  );
  assert.throws(() => registryState(200, {}, 'sha512-expected'));
  for (const status of [401, 403, 429, 500, 503])
    assert.throws(() => registryState(status, null, 'sha512-expected'));
});

test('the release entrypoint requires the exact tag and an ancestor of main', () => {
  const directory = mkdtempSync(join(tmpdir(), 'scanner-release-test-'));
  const script = fileURLToPath(new URL('./check-release.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  const commit = () => {
    git('add', 'packages/scanner/package.json');
    git(
      '-c',
      'user.name=Release Test',
      '-c',
      'user.email=release@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'test: prepare fixture',
    );
  };
  try {
    git('init', '--quiet', '--initial-branch=main');
    mkdirSync(join(directory, 'packages/scanner'), { recursive: true });
    writeFileSync(join(directory, 'packages/scanner/package.json'), JSON.stringify(manifest));
    commit();
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('tag', 'v0.1.0');
    writeFileSync(
      join(directory, 'event.json'),
      JSON.stringify({ release: { prerelease: false } }),
    );
    const env = {
      ...process.env,
      RELEASE_TAG: 'v0.1.0',
      GITHUB_EVENT_PATH: join(directory, 'event.json'),
      GITHUB_OUTPUT: join(directory, 'output'),
    };
    const run = () =>
      execFileSync(process.execPath, [script], { cwd: directory, env, stdio: 'pipe' });
    run();
    assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), /npmTag=latest\n/);
    assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), /sha=[a-f0-9]{40}\n/);
    writeFileSync(
      join(directory, 'packages/scanner/package.json'),
      JSON.stringify({ ...manifest, description: 'new commit' }),
    );
    commit();
    assert.throws(run); // The checkout moved away from the release tag.
    git('tag', '--force', 'v0.1.0');
    assert.throws(run); // The tagged commit is not yet on origin/main.
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    run();
    writeFileSync(
      env.GITHUB_EVENT_PATH,
      JSON.stringify({ release: { draft: true, prerelease: false } }),
    );
    assert.throws(run);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the workflow publish argument resolves a local archive in the real offline npm CLI', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/publish.yml', import.meta.url),
    'utf8',
  );
  const argument = workflow.match(/^\s+run: npm publish ("[^"\n]+") --access public /m)?.[1];
  assert.ok(argument, 'Read the actual npm publish argument from the workflow.');
  const directory = mkdtempSync(join(tmpdir(), 'scanner-release-archive-test-'));
  try {
    mkdirSync(join(directory, 'package'));
    mkdirSync(join(directory, 'release'));
    writeFileSync(
      join(directory, 'package/package.json'),
      JSON.stringify({
        name: '@ktb-tools/scanner-release-path-test',
        version: '0.0.0',
      }),
    );
    writeFileSync(join(directory, 'package/README.md'), 'Synthetic release path fixture.\n');
    const archive = 'ktb-tools-scanner-release-path-test-0.0.0.tgz';
    execFileSync('tar', ['-czf', join('release', archive), 'package'], {
      cwd: directory,
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    const attempts = join(directory, 'git-attempts');
    const git = join(directory, 'reject-git');
    writeFileSync(git, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$GIT_ATTEMPT_LOG"\nexit 91\n`, {
      mode: 0o755,
    });
    const userconfig = join(directory, 'npm-user-config');
    const globalconfig = join(directory, 'npm-global-config');
    writeFileSync(userconfig, '');
    writeFileSync(globalconfig, '');
    const run = (publishArgument) =>
      spawnSync(
        'sh',
        [
          '-c',
          `exec npm publish ${publishArgument} "$@"`,
          'release-path-test',
          '--dry-run',
          '--json',
          '--offline',
          '--ignore-scripts',
          '--update-notifier=false',
          '--registry=http://127.0.0.1:9/',
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          timeout: 30_000,
          env: {
            PATH: process.env.PATH,
            RELEASE_ARCHIVE: archive,
            GIT_ATTEMPT_LOG: attempts,
            npm_config_git: git,
            npm_config_cache: join(directory, 'cache'),
            npm_config_userconfig: userconfig,
            npm_config_globalconfig: globalconfig,
          },
        },
      );
    const local = run(argument);
    assert.equal(local.status, 0, local.stderr || local.error?.message);
    const report = JSON.parse(local.stdout);
    const packed = report.id ? report : report['@ktb-tools/scanner-release-path-test'];
    assert.equal(packed.id, '@ktb-tools/scanner-release-path-test@0.0.0');
    assert.equal(existsSync(attempts), false, 'A local tarball must not invoke Git.');
    // Exercise the old spelling too: the Git shim rejects it before any SSH/network access.
    const shortcut = run(argument.replace('./release/', 'release/'));
    assert.notEqual(shortcut.status, 0);
    assert.match(readFileSync(attempts, 'utf8'), /ls-remote.*github\.com\/release\//);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
