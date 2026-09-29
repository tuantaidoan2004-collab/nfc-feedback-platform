/**
 * What every page tells the browser it may and may not do (lát H1, 29/09). Before this, the guest pages, the front page
 * and the builder carried no protective header at all but the HSTS Vercel added on its own -- which a move to a VPS would
 * have lost too. One pure function, so the policy is read and tested in one place; proxy.ts applies it to every page,
 * next.config.ts the static part to everything else.
 *
 * The line that matters is `script-src`: only scripts carrying this response's nonce run, and what they load
 * ('strict-dynamic'). An injected <script>, an inline handler, a `javascript:` link: none runs, even if some bug let it into
 * the HTML. `style-src` keeps 'unsafe-inline' on purpose: a guest page paints each shop's colours through inline style
 * attributes (the template tokens), and blocking them would blank every page's look before a script could fix it.
 */
export type PolicyInputs = {
  nonce: string;
  /** The deployment's own address (APP_ORIGIN): https means upgrade-insecure-requests. */
  appOrigin: string | undefined;
  /** Where the owner's browser uploads to (the S3-compatible store), and where pictures are read from. */
  storageEndpoint: string | null;
  mediaOrigin: string | null;
  /** Google's sign-in page, when the deployment has a Google client: a form here posts, then redirects there. */
  googleAuthOrigin: string | null;
  development: boolean;
};

/** Pages framed by this app's own pages: the dashboard's page pictures and the builder's draft links. */
export const FRAMED_BY_SELF = [/^\/ZZZ\/[^/]+\/thumb\/[^/]+\/?$/, /^\/thu\/[^/]+\/?$/];
export const framedBySelf = (pathname: string) => FRAMED_BY_SELF.some(pattern => pattern.test(pathname));

const originOf = (value: string | null | undefined) => { try { return value ? new URL(value).origin : null; } catch { return null; } };

export function contentSecurityPolicy(pathname: string, inputs: PolicyInputs) {
  const media = originOf(inputs.mediaOrigin), store = originOf(inputs.storageEndpoint), google = originOf(inputs.googleAuthOrigin);
  // Pictures and videos: this app's own, the shop's store, and any https address -- a page's media must pass the image
  // review (migration 023) before it is published, and older uploads live on an older R2 address.
  const pictures = ["'self'", 'data:', 'blob:', 'https:', ...(media && media.startsWith('http:') ? [media] : [])];
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${inputs.nonce}'`, "'strict-dynamic'", ...(inputs.development ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', pictures],
    ['media-src', pictures.filter(source => source !== 'data:')],
    ['font-src', ["'self'", 'data:']],
    // The page's own API, and the store the owner's browser uploads straight into (a signed PUT).
    ['connect-src', ["'self'", ...(store ? [store] : [])]],
    ['frame-src', ["'self'"]],
    ['frame-ancestors', [framedBySelf(pathname) ? "'self'" : "'none'"]],
    // A form may post only here; Google's page is where the sign-in form's answer redirects (lát D4c), and browsers hold
    // that redirect to this list too.
    ['form-action', ["'self'", ...(google ? [google] : [])]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['manifest-src', ["'self'"]],
    ['report-uri', ['/api/csp-report']],
    ['report-to', ['csp']],
  ];
  const policy = directives.map(([name, sources]) => `${name} ${sources.join(' ')}`);
  if (inputs.appOrigin?.startsWith('https://')) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

/** A fresh nonce per response: 128 random bits, base64. */
export function newNonce() {
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Headers every response carries, pages and API alike (next.config.ts). Set at build time, so nothing here depends on
 * where the deployment runs; HSTS is ignored by browsers over plain http, so sending it always is harmless.
 */
export const BASELINE_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Popups keep working: the thank-you card opens Google in a new tab (lát M2), the editor opens a preview.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  // No page here needs a camera, a microphone, a location or a payment sheet. Motion stays for template 6's tilt light.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), browsing-topics=(), accelerometer=(self), gyroscope=(self)' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Reporting-Endpoints', value: 'csp="/api/csp-report"' },
];
