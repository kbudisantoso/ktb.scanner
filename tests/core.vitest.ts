import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
test('framework-independent contract and lifecycle suite', () => {
  const files = readdirSync('tests/unit')
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => `tests/unit/${file}`);
  const output = execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--test', ...files],
    { encoding: 'utf8' },
  );
  expect(output).toContain('fail 0');
});
test('built core is safe to import without browser globals', async () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "await import('./packages/scanner/dist/index.js'); console.log('SSR safe')",
    ],
    { encoding: 'utf8' },
  );
  expect(output).toContain('SSR safe');
});

test('built React entry renders closed without browser globals', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
 import React from './packages/scanner/node_modules/react/index.js';
 import {renderToString} from './packages/scanner/node_modules/react-dom/server.node.js';
 const {Scanner}=await import('./packages/scanner/dist/react/index.js');
 console.log(renderToString(React.createElement(Scanner,{open:false,options:{assetBaseUrl:'/assets/'},onResult:()=>{}})));
 `,
    ],
    { encoding: 'utf8' },
  );
  expect(output).toContain('<div>');
});
