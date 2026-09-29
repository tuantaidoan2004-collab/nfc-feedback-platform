import { test, expect } from '@playwright/test';
import { healthProbe } from '../../lib/health';

// What /api/health answers (roadmap B3): something outside watches it and warns Tài when the platform is down.
test('asks the database at most once a window, and answers down when it fails, hangs or is not configured', async () => {
  let now = 0, asked = 0, answer: () => Promise<unknown> = async () => undefined;
  const probe = healthProbe(() => { asked++; return answer(); }, { freshMs: 5000, timeoutMs: 50, clock: () => now });
  expect(await probe()).toBe(true);
  now = 4999; expect(await probe()).toBe(true); expect(asked).toBe(1);
  now = 5000; answer = async () => { throw new Error('connection refused'); };
  expect(await probe()).toBe(false); expect(asked).toBe(2);
  // A database that never answers is down after the timeout, not a request left hanging.
  now = 10000; answer = () => new Promise(() => undefined);
  const started = Date.now();
  expect(await probe()).toBe(false); expect(Date.now() - started).toBeLessThan(1000);
  // Many callers at once share one question.
  now = 20000; answer = async () => undefined; asked = 0;
  expect(await Promise.all([probe(), probe(), probe()])).toEqual([true, true, true]); expect(asked).toBe(1);
  // No database configured: `database()` throws before any promise exists. That is down too, not a crash.
  expect(await healthProbe(() => { throw new Error('DATABASE_NOT_CONFIGURED'); })()).toBe(false);
});
