import { defineConfig, devices } from '@playwright/test';
// Full host-language value tables and HTTP response bodies do not vary by browser engine.
const chromiumContracts = /@host-locale-matrix|@http-contract/;
export default defineConfig({
  testDir: './tests/browser',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['json', { outputFile: 'artifacts/local/browser-results.json' }]],
  // Existing integration flows deliberately exercise German; locale coverage overrides this.
  use: {
    baseURL: 'http://127.0.0.1:3177',
    locale: 'de-DE',
    trace: 'retain-on-failure',
    actionTimeout: 20_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      grepInvert: chromiumContracts,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      grepInvert: chromiumContracts,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-webkit',
      grepInvert: [chromiumContracts, /@worker-only/],
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @ktb/demo-next exec next start --hostname 127.0.0.1 --port 3177',
      url: 'http://127.0.0.1:3177',
      reuseExistingServer: false,
    },
    {
      command:
        'pnpm --filter @ktb/demo-astro exec astro preview --host 127.0.0.1 --port 4377 --ignore-lock',
      url: 'http://127.0.0.1:4377',
      reuseExistingServer: false,
    },
  ],
});
