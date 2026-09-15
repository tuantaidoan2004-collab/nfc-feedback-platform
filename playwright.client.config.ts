import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './client-tests', fullyParallel: false, workers: 1, reporter: 'list',
  use: { launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } },
});
