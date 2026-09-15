export const BROWSER_KEY = 'nfc:browser-secret:v1';
export type BrowserIdentity = Readonly<{ secret: string; persistence: 'shared' | 'memory' }>;
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export type IdentityPorts = {
  storage: () => StoragePort;
  crypto: Pick<Crypto, 'getRandomValues'>;
  exclusive?: (work: () => BrowserIdentity) => Promise<BrowserIdentity>;
};
const valid = (value: string | null): value is string => value !== null && /^[a-f0-9]{64}$/.test(value);
function generate(crypto: IdentityPorts['crypto']) {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** One pinned result per document/provider. Never rotate an in-flight action's credential. */
export function createBrowserIdentity(ports: IdentityPorts): () => Promise<BrowserIdentity> {
  let pending: Promise<BrowserIdentity> | undefined;
  const memory = (): BrowserIdentity => Object.freeze({ secret: generate(ports.crypto), persistence: 'memory' });
  const read = () => {
    try { const secret = ports.storage().getItem(BROWSER_KEY); return valid(secret) ? secret : null; }
    catch { return null; }
  };
  return () => pending ??= (async () => {
    if (!ports.exclusive) {
      const secret = read();
      // No unsafe read/modify/write election. A missing shared token falls back to memory.
      return secret ? Object.freeze({ secret, persistence: 'shared' as const }) : memory();
    }
    try {
      return await ports.exclusive(() => {
        const existing = read();
        if (existing) return Object.freeze({ secret: existing, persistence: 'shared' as const });
        const secret = generate(ports.crypto);
        try {
          ports.storage().setItem(BROWSER_KEY, secret);
          if (read() === secret) return Object.freeze({ secret, persistence: 'shared' as const });
        } catch { /* Storage may be disabled or full; never claim persistence. */ }
        return Object.freeze({ secret, persistence: 'memory' as const });
      });
    } catch { return memory(); }
  })();
}
const identities = new WeakMap<Window, () => Promise<BrowserIdentity>>();
export function browserIdentity(win: Window = window): Promise<BrowserIdentity> {
  let provider = identities.get(win);
  if (!provider) {
    provider = createBrowserIdentity({ storage: () => win.localStorage, crypto: win.crypto,
      exclusive: win.navigator.locks ? work => {
        const controller = new AbortController();
        const timer = win.setTimeout(() => controller.abort(), 1500);
        return win.navigator.locks.request(BROWSER_KEY, { signal: controller.signal }, work)
          .finally(() => win.clearTimeout(timer));
      } : undefined,
    });
    identities.set(win, provider);
  }
  return provider();
}
