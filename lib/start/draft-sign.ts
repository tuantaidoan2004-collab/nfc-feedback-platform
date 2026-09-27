import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProofKeyring } from '../publishing/proof';
import { DRAFT_DAYS, DraftError, draftFromPayload, draftPayload, type Draft } from './draft';

/**
 * A draft link's signature (lát D4). The render key signs it, through a key of its own derived for drafts only, so a
 * draft's signature can never pass for a guest page's render proof or the other way round. The token is
 * `<key id>.<payload>.<mac>`, like a render proof, so rotating the render key rotates this too.
 */
const draftKey = (secret: string) => createHmac('sha256', secret).update('nfc-draft-link-v1').digest();
function secretOf(ring: ProofKeyring, id: string) {
  const value = ring.keys[id];
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(id) || !value || Buffer.byteLength(value) < 32) throw new Error('RENDER_KEY_UNAVAILABLE');
  return value;
}
const mac = (secret: string, id: string, payload: string) => createHmac('sha256', draftKey(secret)).update(`${id}.${payload}`).digest();

export function signDraft(draft: Draft, ring: ProofKeyring, now = new Date()) {
  const expiresAt = new Date(now.getTime() + DRAFT_DAYS * 86_400_000), payload = draftPayload(draft, expiresAt);
  return { token: `${ring.active}.${payload}.${mac(secretOf(ring, ring.active), ring.active, payload).toString('base64url')}`, expiresAt };
}

/** The draft a token carries, when its signature holds and it has not expired. */
export function verifyDraft(token: string, ring: ProofKeyring, now = new Date()) {
  const parts = typeof token === 'string' && token.length <= 1200 ? token.split('.') : [];
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) throw new DraftError('INVALID_DRAFT');
  const [id, payload, signature] = parts;
  let expected: Buffer;
  try { expected = mac(secretOf(ring, id), id, payload); } catch { throw new DraftError('INVALID_DRAFT'); }
  const actual = Buffer.from(signature, 'base64url');
  if (actual.toString('base64url') !== signature || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new DraftError('INVALID_DRAFT');
  const draft = draftFromPayload(payload);
  if (draft.expiresAt.getTime() <= now.getTime()) throw new DraftError('DRAFT_EXPIRED');
  return draft;
}
