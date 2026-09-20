import { defineConfig } from '@playwright/test';
import { realChrome } from './playwright.chrome';
export default defineConfig({
  testDir: './integration-tests', workers: 1, timeout: 60_000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3317', viewport: { width: 390, height: 844 }, ...realChrome() },
});
