import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
// Collect every resolved production dependency; retain lockfile alongside this inventory.
const inventory = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
  encoding: 'utf8',
});
JSON.parse(inventory);
await mkdir('artifacts/local', { recursive: true });
await writeFile('artifacts/local/licenses.json', inventory);
console.log('Wrote artifacts/local/licenses.json');
