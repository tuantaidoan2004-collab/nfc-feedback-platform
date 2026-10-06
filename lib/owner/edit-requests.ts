import type { Pool } from 'pg';
import { authorize, requirePermission, transaction, OwnerError, type OwnerCredential } from './auth';
import { recordActivity } from './activity';
import { newPageFromTemplate, pageOf, restartFromTemplate } from './pages';
import { canvasTemplate } from '../canvas/templates';
import { vnPhone } from '../shop/profile';

/**
 * "Nhờ Admin Tài dựng" (Tài 06/10): a template shows how a page can look, but only the shop knows its Zalo, its links, the words
 * on its buttons, so a page goes live only once Tài has matched it to the shop. The owner picks a template and leaves the Zalo
 * number Tài will message; Tài gathers the rest there and hands it to the agent, who fills the shop's details, edits the page
 * and publishes it (scripts/sua-trang.mjs) -- and that closes the request.
 *
 *   { template, contact, message? }         a new page from the template
 *   { page, template, contact, message? }   the page starts again from the template; guests keep the old one until then
 *   { page, contact, message? }             changes to a page as it is
 *
 * One open request per page: asking again keeps the newest template and number, and adds the new words to the old.
 */
const parse = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OwnerError(400, 'INVALID_REQUEST');
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some(key => !['page', 'template', 'contact', 'message'].includes(key))) throw new OwnerError(400, 'INVALID_REQUEST');
  const { page, template, message } = data;
  if ((page !== undefined && typeof page !== 'string') || (template !== undefined && typeof template !== 'string') || (page === undefined && template === undefined)
    || (message !== undefined && message !== null && typeof message !== 'string')) throw new OwnerError(400, 'INVALID_REQUEST');
  if (template !== undefined && !canvasTemplate(template)) throw new OwnerError(400, 'INVALID_TEMPLATE');
  const contact = vnPhone(data.contact);
  if (!contact) throw new OwnerError(400, 'INVALID_CONTACT');
  const text = typeof message === 'string' ? message.trim().replace(/[<>]/g, '').slice(0, 1000) : '';
  return { page: page as string | undefined, template: template as string | undefined, contact, message: text || null };
};

export async function requestEdit(pool: Pool, credential: OwnerCredential, slug: string, body: unknown) {
  const data = parse(body);
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'design');
    if (access.actor.kind !== 'owner') throw new OwnerError(403, 'IMPERSONATION_READ_ONLY');
    let page;
    if (data.page === undefined) page = await newPageFromTemplate(db, access, data.template!);
    else {
      page = await pageOf(db, access.shopId, data.page);
      if (page.state === 'closed') throw new OwnerError(409, 'PAGE_CLOSED');
      // The same template again keeps the page as Tài left it (its pictures, its words): only another look starts it afresh.
      const current = (await db.query('SELECT tv.template_key FROM page_drafts d JOIN template_versions tv ON tv.id=d.template_version_id WHERE d.page_id=$1',
        [page.pageId])).rows[0]?.template_key;
      if (data.template && data.template !== current) await restartFromTemplate(db, access, page, data.template);
    }
    const open = (await db.query('SELECT id,message,template_key FROM edit_requests WHERE page_id=$1 AND handled_at IS NULL FOR UPDATE', [page.pageId])).rows[0];
    if (open) {
      // Asked again: the newer words join the older ones, so nothing the shop said is lost.
      const joined = [open.message, data.message].filter(Boolean).join('\n—\n').slice(-2000) || null;
      await db.query('UPDATE edit_requests SET message=$2,contact=$3,template_key=$4 WHERE id=$1', [open.id, joined, data.contact, data.template ?? open.template_key]);
    } else {
      await db.query('INSERT INTO edit_requests(shop_id,page_id,requested_by,template_key,contact,message) VALUES($1,$2,$3,$4,$5,$6)',
        [page.shopId, page.pageId, access.userId, data.template ?? null, data.contact, data.message]);
    }
    await recordActivity(db, access, 'edit.request', `${page.slug}${data.template ? ` · ${canvasTemplate(data.template)!.name}` : ''}`);
    return { page: page.slug, waiting: true as const };
  });
}
