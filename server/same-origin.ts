/**
 * Did this write come from a page of this site? The one rule for every write route (guest, owner, admin, preview).
 *
 * `Sec-Fetch-Site` is set by the browser itself and a page cannot forge it, so when it is present it decides alone:
 * only `same-origin` passes. Chrome on iPhone sends `Sec-Fetch-Site: same-origin` together with an `Origin` that is not
 * this site's (27/09, read from GUEST_REFUSED in the production log), and requiring both refused every guest there.
 * A browser without Fetch Metadata falls back to the old test: `Origin` must be exactly APP_ORIGIN.
 *
 * Neither header is proof against a script outside a browser -- it can send both. What stops one is the rest of each
 * route: the guest's bearer secret and signed render proof, the owner's and admin's session cookie.
 */
export function fromThisSite(request: Request, expected: string | undefined): boolean {
  if (!expected || new URL(expected).origin !== expected) return false;
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) {
    const origin = request.headers.get('origin');
    // Accepted, but say so once per request: what Chrome on iPhone actually puts in Origin is still unknown.
    if (site === 'same-origin' && origin !== expected) console.info('ORIGIN_DIFFERS_SAME_SITE', JSON.stringify({ origin: origin === null ? 'absent' : origin.slice(0, 80).replace(/[^A-Za-z0-9:/._-]/g, '?') }));
    return site === 'same-origin';
  }
  return request.headers.get('origin') === expected;
}
