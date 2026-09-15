import { createHmac, timingSafeEqual } from 'node:crypto';
import { PublishingError } from './config';
export type RenderContext = { v: 1; shopId: string; releaseId: string | null; tagId: string | null; previewId: string | null; scope: 'live' | 'test'; entryKey: string };
export type ProofKeyring = { active: string; keys: Readonly<Record<string, string>> };
const uuid = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
export function canonical(c: RenderContext): RenderContext {
  if (!c || Object.keys(c).sort().join() !== ['v','shopId','releaseId','tagId','previewId','scope','entryKey'].sort().join() || c.v !== 1 || !uuid(c.shopId) ||
    ![c.releaseId, c.tagId, c.previewId].every(v => v === null || uuid(v)) ||
    !(c.scope === 'live' ? c.releaseId && c.previewId === null : c.scope === 'test' && c.previewId) ||
    c.entryKey !== (c.previewId ? `preview:${c.previewId}` : c.tagId ? `tag:${c.tagId}` : 'direct:shop')) throw new PublishingError('INVALID_RENDER_PROOF');
  return { v: 1, shopId: c.shopId, releaseId: c.releaseId, tagId: c.tagId, previewId: c.previewId, scope: c.scope, entryKey: c.entryKey };
}
function key(ring: ProofKeyring, id: string) {
  const value = ring.keys[id]; if (!/^[A-Za-z0-9_-]{1,24}$/.test(id) || !value || Buffer.byteLength(value) < 32) throw new PublishingError('RENDER_KEY_UNAVAILABLE');
  return value;
}
export function signContext(c: RenderContext, ring: ProofKeyring): string {
  const data = Buffer.from(JSON.stringify(canonical(c))).toString('base64url');
  const mac = createHmac('sha256', key(ring, ring.active)).update(`${ring.active}.${data}`).digest('base64url');
  return `${ring.active}.${data}.${mac}`;
}
export function verifyContext(proof: string, ring: ProofKeyring): RenderContext {
  try {
    if (typeof proof !== 'string' || proof.length > 1500) throw Error();
    const parts = proof.split('.'); if (parts.length !== 3) throw Error();
    const [id, data, mac] = parts; if (!id || !data || !/^[A-Za-z0-9_-]{43}$/.test(mac) || !/^[A-Za-z0-9_-]+$/.test(data)) throw Error();
    if (Buffer.from(data, 'base64url').toString('base64url') !== data || Buffer.from(mac, 'base64url').toString('base64url') !== mac) throw Error();
    const expected = createHmac('sha256', key(ring, id)).update(`${id}.${data}`).digest();
    const actual = Buffer.from(mac, 'base64url'); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
    return canonical(JSON.parse(Buffer.from(data, 'base64url').toString('utf8')));
  } catch { throw new PublishingError('INVALID_RENDER_PROOF'); }
}
