import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('built core is safe to import without browser globals', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "await import('./packages/scanner/dist/index.js'); console.log('SSR safe')",
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  assert.match(output, /SSR safe/);
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
    { encoding: 'utf8', timeout: 15_000 },
  );
  assert.match(output, /<div>/);
});
