// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 720 },
    channel: 'chrome',
  },
  projects: [
    {
      name: 'chrome',
      use: { channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
