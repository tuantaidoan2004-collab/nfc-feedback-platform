import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true, forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL } }],
  webServer: { command: 'node .next/standalone/server.js', env: { HOSTNAME: '127.0.0.1', PORT: '3000' }, url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
