import { defineConfig } from '@playwright/test';

// One worker, not two. Cases isolate with a schema, but owner and administrator login each take an advisory
// lock scoped to the whole database so that only one KDF runs at a time. Two cases logging in at once — in one
// file or in two — leave one unable to take it, which surfaces as LOGIN_FAILED and reads like an auth bug.
// Raising this again means giving each file its own database, not its own schema.
export default defineConfig({
  testDir: './repository-tests', fullyParallel: false, workers: 1,
  forbidOnly: !!process.env.CI, reporter: 'list',
});
