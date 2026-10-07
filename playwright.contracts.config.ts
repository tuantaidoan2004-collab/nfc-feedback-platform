import { defineConfig } from '@playwright/test';
// The deleted templates, kept as test fixtures (lib/canvas/templates.ts).
process.env.NFC_TEMPLATE_DIR ??= `${process.cwd()}/tests/fixtures/templates`;
export default defineConfig({ testDir: './tests/contracts', fullyParallel: true, forbidOnly: !!process.env.CI, reporter: 'list' });
