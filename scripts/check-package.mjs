import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const destination = await mkdtemp(join(tmpdir(), 'scanner-package-'));
try {
  execFileSync(
    'pnpm',
    ['--filter', '@ktb-tools/scanner', 'pack', '--pack-destination', destination],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const archives = (await readdir(destination)).filter((name) => name.endsWith('.tgz'));
  if (archives.length !== 1) throw new Error('Expected exactly one package archive');
  execFileSync('python3', ['scripts/check-package.py', join(destination, archives[0])], {
    stdio: 'inherit',
  });
} finally {
  await rm(destination, { recursive: true, force: true });
}
