import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { releaseConfig, registryState } from './release-config.mjs';
import { checkRegistry } from './registry-check.mjs';

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

function registryFixture(t, responses) {
  let elapsed = 0;
  const calls = [],
    delays = [],
    timeouts = [];
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    timeouts.push(milliseconds);
    return new AbortController().signal;
  });
  return {
    calls,
    delays,
    timeouts,
    get elapsed() {
      return elapsed;
    },
    options: {
      now: () => elapsed,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
        elapsed += milliseconds;
      },
      fetch: async (url, { signal }) => {
        calls.push({ url, signal });
        const response = responses[Math.min(calls.length - 1, responses.length - 1)];
        if (response instanceof Error) throw response;
        elapsed += response.elapsed ?? 0;
        return new Response(
          response.body ?? JSON.stringify({ dist: { integrity: 'sha512-expected' } }),
          { status: response.status },
        );
      },
    },
  };
}

test('post-publication 404s wait 5/10 seconds then accept only identical registry bytes', async (t) => {
  const fixture = registryFixture(t, [{ status: 404 }, { status: 404 }, { status: 200 }]);
  assert.equal(
    await checkRegistry('https://registry.example.invalid/package/1.0.0', 'sha512-expected', {
      ...fixture.options,
      requirePublished: true,
    }),
    'identical',
  );
  assert.deepEqual(fixture.delays, [5_000, 10_000]);
  assert.equal(fixture.calls.length, 3);
  assert.deepEqual(fixture.timeouts, [30_000, 30_000, 30_000]);
  assert.equal(fixture.elapsed, 15_000);
});

test('post-publication 404 polling stops at the overall five-minute deadline', async (t) => {
  const fixture = registryFixture(t, [{ status: 404 }]);
  await assert.rejects(
    checkRegistry('https://registry.example.invalid/package/1.0.0', 'sha512-expected', {
      ...fixture.options,
      requirePublished: true,
    }),
    /within 5 minutes/,
  );
  assert.equal(fixture.elapsed, 300_000);
  assert.equal(fixture.calls.length, 21);
  assert.equal(fixture.delays.length, 21);
  assert.deepEqual(fixture.delays.slice(0, 3), [5_000, 10_000, 15_000]);
  assert(fixture.delays.slice(2).every((delay) => delay === 15_000));
  assert(fixture.timeouts.every((timeout) => timeout > 0 && timeout <= 30_000));
  assert.equal(fixture.timeouts.at(-1), 15_000);
});

test('fetch and final wait budgets shrink with elapsed request time and never accept late bytes', async (t) => {
  for (const lastResponse of [
    { status: 404, elapsed: 3_000 },
    { status: 200, elapsed: 7_001 },
  ]) {
    const fixture = registryFixture(t, [
      ...Array.from({ length: 7 }, () => ({ status: 404, elapsed: 29_000 })),
      lastResponse,
    ]);
    await assert.rejects(
      checkRegistry('https://registry.example.invalid/package/1.0.0', 'sha512-expected', {
        ...fixture.options,
        requirePublished: true,
      }),
      /within 5 minutes/,
    );
    assert.deepEqual(fixture.delays, [
      5_000,
      10_000,
      15_000,
      15_000,
      15_000,
      15_000,
      15_000,
      ...(lastResponse.status === 404 ? [4_000] : []),
    ]);
    assert.deepEqual(
      fixture.timeouts,
      [30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 7_000],
    );
    assert.equal(fixture.calls.length, 8);
    assert.equal(fixture.elapsed, lastResponse.status === 404 ? 300_000 : 300_001);
  }
});

test('pre-publication 404 stays immediately missing without polling', async (t) => {
  const fixture = registryFixture(t, [{ status: 404 }]);
  assert.equal(
    await checkRegistry(
      'https://registry.example.invalid/package/1.0.0',
      'sha512-expected',
      fixture.options,
    ),
    'missing',
  );
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.elapsed, 0);
  assert.deepEqual(fixture.delays, []);
  assert.deepEqual(fixture.timeouts, [30_000]);
});

test('registry mismatches, authorization, malformed JSON and network failures never retry', async (t) => {
  for (const response of [
    { status: 200, body: JSON.stringify({ dist: { integrity: 'sha512-different' } }) },
    { status: 200, body: '{}' },
    { status: 200, body: 'invalid JSON' },
    { status: 401 },
    { status: 403 },
    { status: 429 },
    { status: 500 },
    new TypeError('Network failure'),
    new DOMException('Request timed out', 'TimeoutError'),
  ]) {
    for (const preceding404 of [false, true]) {
      const fixture = registryFixture(t, preceding404 ? [{ status: 404 }, response] : [response]);
      await assert.rejects(
        checkRegistry('https://registry.example.invalid/package/1.0.0', 'sha512-expected', {
          ...fixture.options,
          requirePublished: true,
        }),
      );
      assert.equal(fixture.calls.length, preceding404 ? 2 : 1);
      assert.deepEqual(fixture.delays, preceding404 ? [5_000] : []);
    }
  }
});
