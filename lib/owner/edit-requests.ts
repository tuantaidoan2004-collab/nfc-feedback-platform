import type { Pool } from 'pg';
import { authorize, requirePermission, transaction, OwnerError, type OwnerCredential } from './auth';
import { recordActivity } from './activity';
import { pageOf } from './pages';

/**
 * "Nhờ admin sửa" (Tài 05/10, thay trình sửa canvas): the shop picks a template, then either publishes it as it is or asks
 * for changes. Asking leaves the page waiting in /gov; Tài hands the agent the shop's words and its files (sent over Zalo),
 * the agent edits and publishes (scripts/sua-trang.mjs), and the request closes with that publish. One open request per
 * page: asking again adds the new words to it instead of queueing a second one.
 */
const words = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OwnerError(400, 'INVALID_REQUEST');
  const { page, message } = body as Record<string, unknown>;
  if (typeof page !== 'string' || (message !== undefined && message !== null && typeof message !== 'string')) throw new OwnerError(400, 'INVALID_REQUEST');
  const text = typeof message === 'string' ? message.trim().replace(/[<>]/g, '').slice(0, 1000) : '';
  return { page, message: text || null };
};

export async function requestEdit(pool: Pool, credential: OwnerCredential, slug: string, body: unknown) {
  const data = words(body);
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'design');
    if (access.actor.kind !== 'owner') throw new OwnerError(403, 'IMPERSONATION_READ_ONLY');
    const page = await pageOf(db, access.shopId, data.page);
    if (page.state === 'closed') throw new OwnerError(409, 'PAGE_CLOSED');
    const open = (await db.query('SELECT id,message FROM edit_requests WHERE page_id=$1 AND handled_at IS NULL FOR UPDATE', [page.pageId])).rows[0];
    if (open) {
      // Asked again: the newer words join the older ones, so nothing the shop said is lost.
      const joined = [open.message, data.message].filter(Boolean).join('\n—\n').slice(-2000) || null;
      await db.query('UPDATE edit_requests SET message=$2 WHERE id=$1', [open.id, joined]);
    } else {
      await db.query('INSERT INTO edit_requests(shop_id,page_id,requested_by,message) VALUES($1,$2,$3,$4)', [page.shopId, page.pageId, access.userId, data.message]);
    }
    await recordActivity(db, access, 'edit.request', page.slug);
    return { page: page.slug, waiting: true };
  });
}
