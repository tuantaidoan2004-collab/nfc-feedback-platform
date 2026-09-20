import { defineConfig } from '@playwright/test';

// One worker, not two. Cases isolate with a schema, but owner and administrator login each take an advisory
// lock scoped to the whole database so that only one KDF runs at a time. Two cases logging in at once — in one
// file or in two — leave one unable to take it, which surfaces as LOGIN_FAILED and reads like an auth bug.
// Raising this again means giving each file its own database, not its own schema.
// A fixture key for sealing administrator second-factor secrets, so a run needs nothing typed by hand. The
// application refuses to store a secret without one (lát A2), and leaving it to whoever starts the run means it
// works on the machine where it was written and fails on CI -- which is exactly what happened. Set it here and it
// is set everywhere the suite runs. That the missing-key path still refuses is proven directly in admin-auth.spec.
process.env.NFC_TOTP_KEY ??= 'a2f1'.repeat(16);

export default defineConfig({
  testDir: './repository-tests', fullyParallel: false, workers: 1,
  forbidOnly: !!process.env.CI, reporter: 'list',
});
