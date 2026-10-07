import { createHmac, randomBytes } from 'node:crypto';
import { EVENTS, eventOrigin, type EventDef, type EventKey } from './catalog';
import { ticketKey } from './ticket';

/**
 * Telling the organizer (TBQ 1.3, phoi-hop-voi-QS.md mục 10): when /gov opens or closes an event for a shop, the server
 * calls the organizer once, so the shop is created or paused on its side too and nobody adds it by hand. Same key as the
 * tickets, body signed as a whole: `X-TBQ-Signature: sha256=<hex HMAC-SHA256(key, body)>`, with a fresh nonce each call.
 *
 * It never decides anything on QS: the switch in `shop_events` is already saved. A network failure, a missing key or a
 * refusal comes back as `null` or `{ ok: false }`, and Tài presses the button again later. Only the shop's code, name and
 * nothing about any guest leaves QS.
 */
export type OrganizerReply = { ok: true; status: 'active' | 'paused'; pausedBy: null | 'qs' | 'admin'; created: boolean } | { ok: false; code: string };

export async function tellOrganizer(key: EventKey, action: 'open' | 'close', shop: { slug: string; name: string },
  env: Record<string, string | undefined> = process.env, send: typeof fetch = fetch): Promise<OrganizerReply | null> {
  const event: EventDef = EVENTS[key], secret = ticketKey(key, env);
  if (!event.hook || !secret) return null;
  const body = JSON.stringify({ action, shop: shop.slug.toLowerCase(), name: shop.name, ts: Math.floor(Date.now() / 1000), nonce: randomBytes(12).toString('base64url') });
  try {
    const response = await send(eventOrigin(key, env) + event.hook, { method: 'POST', body, signal: AbortSignal.timeout(5000), redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-tbq-signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` } });
    const reply = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || reply.ok !== true) return { ok: false, code: typeof reply.code === 'string' ? reply.code : String(response.status) };
    return { ok: true, status: reply.status === 'paused' ? 'paused' : 'active', pausedBy: reply.pausedBy === 'qs' || reply.pausedBy === 'admin' ? reply.pausedBy : null, created: reply.created === true };
  } catch { return null; }
}
