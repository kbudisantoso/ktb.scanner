import { rm } from 'node:fs/promises';

// Only the generated output of this package is owned by the build.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
