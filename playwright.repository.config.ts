import { defineConfig } from '@playwright/test';

// Tests isolate with a schema per case, but owner login takes a database-wide advisory lock so that only one
// KDF runs at a time. Two cases logging in at once therefore make one of them fail to acquire it and read as
// LOGIN_FAILED. Cases within a file run in order for that reason; files still run across both workers.
export default defineConfig({
  testDir: './repository-tests', fullyParallel: false, workers: 2,
  forbidOnly: !!process.env.CI, reporter: 'list',
});
