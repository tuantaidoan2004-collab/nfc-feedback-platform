import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './repository-tests', fullyParallel: true, workers: 2,
  forbidOnly: !!process.env.CI, reporter: 'list',
});
