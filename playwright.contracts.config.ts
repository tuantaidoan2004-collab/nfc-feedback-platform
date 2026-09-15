import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/contracts', fullyParallel: true, forbidOnly: !!process.env.CI, reporter: 'list' });
