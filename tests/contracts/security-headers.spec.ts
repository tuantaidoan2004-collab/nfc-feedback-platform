import { test, expect } from '@playwright/test';
import { BASELINE_HEADERS, contentSecurityPolicy, framedBySelf, newNonce, type PolicyInputs } from '../../lib/security/headers';

/** Lát H1: the policy every page carries. The integration suites check the real responses; this checks the rules. */
const inputs: PolicyInputs = { nonce: 'abc', appOrigin: 'https://quitesensational-review-bio.com', storageEndpoint: 'https://acc.r2.cloudflarestorage.com',
  mediaOrigin: 'https://media.quitesensational-review-bio.com', googleAuthOrigin: 'https://accounts.google.com/o/oauth2/v2/auth', development: false };
const directives = (policy: string) => Object.fromEntries(policy.split('; ').map(part => { const [name, ...sources] = part.split(' '); return [name, sources]; }));

test('scripts run only with this response\'s nonce; nothing inline, nothing evaluated, no plugin, no foreign base', () => {
  const d = directives(contentSecurityPolicy('/k4u27', inputs));
  expect(d['script-src']).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'data:']) expect(d['script-src'], bad).not.toContain(bad);
  expect(d['object-src']).toEqual(["'none'"]); expect(d['base-uri']).toEqual(["'self'"]); expect(d['default-src']).toEqual(["'self'"]);
  expect(d['upgrade-insecure-requests']).toEqual([]);
  // Only in development, where React needs it for its error overlay.
  expect(directives(contentSecurityPolicy('/', { ...inputs, development: true }))['script-src']).toContain("'unsafe-eval'");
});

test('framed only where this app frames its own pages; forms post here and to Google\'s sign-in only', () => {
  expect(directives(contentSecurityPolicy('/k4u27', inputs))['frame-ancestors']).toEqual(["'none'"]);
  expect(directives(contentSecurityPolicy('/ZZZ/k4u27', inputs))['frame-ancestors']).toEqual(["'none'"]);
  for (const path of ['/ZZZ/k4u27/thumb/k4u27', '/thu/v1.a.b']) { expect(framedBySelf(path)).toBe(true); expect(directives(contentSecurityPolicy(path, inputs))['frame-ancestors']).toEqual(["'self'"]); }
  expect(framedBySelf('/thu/v1.a.b/extra')).toBe(false); expect(framedBySelf('/ZZZ/x/thumb')).toBe(false);
  const d = directives(contentSecurityPolicy('/owner/login', inputs));
  expect(d['form-action']).toEqual(["'self'", 'https://accounts.google.com']);
  expect(directives(contentSecurityPolicy('/', { ...inputs, googleAuthOrigin: null }))['form-action']).toEqual(["'self'"]);
  // The browser uploads straight to the store; nothing else is reachable from a page's script.
  expect(d['connect-src']).toEqual(["'self'", 'https://acc.r2.cloudflarestorage.com']);
});

test('a local http deployment is not upgraded, and its local store may serve pictures', () => {
  const policy = contentSecurityPolicy('/', { ...inputs, appOrigin: 'http://127.0.0.1:3000', storageEndpoint: 'http://127.0.0.1:9000', mediaOrigin: 'http://127.0.0.1:9000/nfc-media' });
  expect(policy).not.toContain('upgrade-insecure-requests');
  expect(directives(policy)['img-src']).toContain('http://127.0.0.1:9000');
  expect(directives(policy)['connect-src']).toContain('http://127.0.0.1:9000');
});

test('nonces are fresh and long; the baseline headers say what the policy cannot', () => {
  const seen = new Set(Array.from({ length: 50 }, newNonce));
  expect(seen.size).toBe(50);
  for (const nonce of seen) expect(Buffer.from(nonce, 'base64')).toHaveLength(16);
  const baseline = Object.fromEntries(BASELINE_HEADERS.map(({ key, value }) => [key, value]));
  expect(baseline).toMatchObject({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  expect(baseline['Strict-Transport-Security']).toMatch(/^max-age=\d{8,}/);
  expect(baseline['Permissions-Policy']).toContain('camera=()');
});
