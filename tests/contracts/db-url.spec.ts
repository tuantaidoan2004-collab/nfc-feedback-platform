import { test, expect } from '@playwright/test';
import { explicitSslMode } from '../../lib/db-url';

test('the modes pg already treats as verify-full are named verify-full, nothing else changes', () => {
  const base = 'postgresql://neondb_owner:p%40ss%2Fw0rd@ep-x.aws.neon.tech/neondb';
  for (const mode of ['prefer', 'require', 'verify-ca']) {
    const out = new URL(explicitSslMode(`${base}?sslmode=${mode}&channel_binding=require`));
    expect(out.searchParams.get('sslmode')).toBe('verify-full');
    expect(out.searchParams.get('channel_binding')).toBe('require');
    // Credentials survive byte for byte, still percent-encoded.
    expect(out.username).toBe('neondb_owner');
    expect(out.password).toBe('p%40ss%2Fw0rd');
    expect(`${out.host}${out.pathname}`).toBe('ep-x.aws.neon.tech/neondb');
  }
  for (const untouched of [base, `${base}?sslmode=verify-full`, `${base}?sslmode=disable`, 'postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test', 'not a url'])
    expect(explicitSslMode(untouched)).toBe(untouched);
  expect(explicitSslMode(undefined)).toBeUndefined();
});
