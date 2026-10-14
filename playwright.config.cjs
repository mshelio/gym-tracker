const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:8765/gym-tracker/' },
  webServer: { command: 'node tests/serve.cjs', url: 'http://127.0.0.1:8765/gym-tracker/', reuseExistingServer: !process.env.CI, timeout: 15000 },
});
