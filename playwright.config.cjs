const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  workers: process.env.CI ? 2 : undefined,
  projects: [
    {name:'chromium',testIgnore:'**/mobile.spec.cjs',use:{...devices['Desktop Chrome']}},
    {name:'firefox',testIgnore:'**/mobile.spec.cjs',use:{...devices['Desktop Firefox']}},
    {name:'webkit',testIgnore:'**/mobile.spec.cjs',use:{...devices['Desktop Safari']}},
    {name:'mobile-chromium',testMatch:['**/mobile.spec.cjs','**/pwa.spec.cjs'],use:{...devices['Pixel 7']}},
    {name:'mobile-webkit',testMatch:'**/mobile.spec.cjs',use:{...devices['iPhone 13']}}
  ],
  use: { baseURL:'http://127.0.0.1:8765/gym-tracker/' },
  webServer:{command:'node tests/serve.cjs',url:'http://127.0.0.1:8765/gym-tracker/',reuseExistingServer:!process.env.CI,timeout:15000}
});
