import { defineConfig } from '@playwright/test';
import { realChrome } from './playwright.chrome';
// These run against a real Chrome, not the bundled Chromium: the client lifecycle depends on real browser behaviour.
export default defineConfig({ testDir: './client-tests', fullyParallel: false, workers: 1, reporter: 'list', use: realChrome() });
