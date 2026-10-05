import type { Pool } from 'pg';
import { authorize, OwnerError, transaction, type OwnerCredential } from '../owner/auth';
import { recordActivity } from '../owner/activity';

/**
 * Tiến trình bắt đầu (kịch bản mục 4): tài khoản (20%) → Template (làm hoặc bỏ qua) → Dashboard (kết nối Google) → xong.
 * Only the shop's owner moves it, and only forward. Finishing needs the Dashboard step: a shop without a review link has
 * nothing to put behind the Google button.
 */
export type Step = { step: 'template'; value: 'done' | 'skipped' } | { step: 'dashboard' } | { step: 'finish' };
export function parseStep(body: unknown): Step {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (data.step === 'template' && (data.value === 'done' || data.value === 'skipped')) return { step: 'template', value: data.value };
  if (data.step === 'dashboard' || data.step === 'finish') return { step: data.step };
  throw new OwnerError(400, 'INVALID_STEP');
}

export async function advance(pool: Pool, credential: OwnerCredential, slug: string, body: unknown) {
  const step = parseStep(body);
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'write');
    if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
    const shop = (await db.query('SELECT google_url,onboarding_dashboard_at FROM shops WHERE id=$1 FOR UPDATE', [access.shopId])).rows[0];
    if (step.step === 'template') await db.query("UPDATE shops SET onboarding_template=CASE WHEN onboarding_template='done' THEN 'done' ELSE $2 END WHERE id=$1", [access.shopId, step.value]);
    if (step.step === 'dashboard') {
      if (!shop.google_url || shop.google_url === 'https://maps.google.com/') throw new OwnerError(409, 'GOOGLE_LINK_REQUIRED');
      await db.query('UPDATE shops SET onboarding_dashboard_at=COALESCE(onboarding_dashboard_at,clock_timestamp()) WHERE id=$1', [access.shopId]);
    }
    if (step.step === 'finish') {
      if (!shop.onboarding_dashboard_at) throw new OwnerError(409, 'DASHBOARD_STEP_REQUIRED');
      await db.query("UPDATE shops SET onboarded_at=COALESCE(onboarded_at,clock_timestamp()),onboarding_template=COALESCE(onboarding_template,'skipped') WHERE id=$1", [access.shopId]);
    }
    await recordActivity(db, access, 'onboarding.step', step.step);
    return { ok: true };
  });
}

/** Library → More → "Nhờ admin tạo giúp": one open request per shop; asking again says it is already on its way. */
export async function requestHelp(pool: Pool, credential: OwnerCredential, slug: string, body: unknown) {
  const raw = (body && typeof body === 'object' ? (body as Record<string, unknown>).message : null);
  const message = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 1000).replace(/[<>]/g, '') : null;
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'write');
    if (access.actor.kind !== 'owner') throw new OwnerError(403, 'IMPERSONATION_READ_ONLY');
    const made = await db.query(`INSERT INTO help_requests(shop_id,requested_by,kind,message)VALUES($1,$2,'build_page',$3)
      ON CONFLICT (shop_id,kind) WHERE handled_at IS NULL DO NOTHING RETURNING id`, [access.shopId, access.userId, message]);
    if (made.rowCount) await recordActivity(db, access, 'help.request', null);
    return { requested: true, already: !made.rowCount };
  });
}
