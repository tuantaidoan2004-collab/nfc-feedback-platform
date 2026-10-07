import { createHmac, randomBytes } from 'node:crypto';
import { EVENTS, type EventDef, type EventKey } from './catalog';

/**
 * A ticket for the organizer (khúc B): proof that the guest opened this shop's page through the shop's own card or QR
 * code, a moment ago. The organizer asks nothing of the shop -- no screen at the counter, no code, no Wi-Fi -- so this is
 * how it tells a guest sitting in the shop from someone who found the page's link online (a page's plain link is a bio
 * link and travels; the card's link is on the table).
 *
 * Only for a live page opened through a card (`entryKey` `tag:…`); never for the page's plain link, a preview, or the
 * owner's picture of the page. It says nothing about Google: every guest who came through the card gets one, whatever
 * they did on the page.
 *
 *   1.<issued, unix seconds>.<nonce, 16 base64url>.<HMAC-SHA256(key, "tbq-ticket|1|<shop>|<issued>|<nonce>"), base64url, 32>
 *
 * The organizer checks the signature with the same key, refuses a ticket older than its own window, and binds each nonce
 * to the first device that uses it. The key is shared with the organizer only; without one, no ticket is issued.
 */
export const TICKET_VERSION = '1';
const MIN_KEY = 32;

export function ticketKey(key: EventKey, env: Record<string, string | undefined> = process.env): string | null {
  const event: EventDef = EVENTS[key], value = env[event.ticketKeyEnv];
  return value && value.length >= MIN_KEY ? value : null;
}

export const ticketSignature = (secret: string, shop: string, issued: number, nonce: string) =>
  createHmac('sha256', secret).update(`tbq-ticket|${TICKET_VERSION}|${shop.toLowerCase()}|${issued}|${nonce}`).digest('base64url').slice(0, 32);

export function issueTicket(key: EventKey, shop: string, now = Date.now(), env: Record<string, string | undefined> = process.env, nonce = randomBytes(12).toString('base64url')): string | null {
  const secret = ticketKey(key, env);
  if (!secret) return null;
  const issued = Math.floor(now / 1000);
  return [TICKET_VERSION, issued, nonce, ticketSignature(secret, shop, issued, nonce)].join('.');
}

/** Whether the guest came through a card: the only way a page view earns a ticket. */
export const throughCard = (context: { scope: string; entryKey: string | null }) => context.scope === 'live' && !!context.entryKey?.startsWith('tag:');
