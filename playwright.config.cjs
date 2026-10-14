const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  projects: [
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'firefox',use:{...devices['Desktop Firefox']}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'mobile-chromium',testMatch:'**/mobile.spec.cjs',use:{...devices['Pixel 7']}},
    {name:'mobile-webkit',testMatch:'**/mobile.spec.cjs',use:{...devices['iPhone 13']}}
  ],
  use: { baseURL:'http://127.0.0.1:8765/gym-tracker/' },
  webServer:{command:'node tests/serve.cjs',url:'http://127.0.0.1:8765/gym-tracker/',reuseExistingServer:!process.env.CI,timeout:15000}
});
