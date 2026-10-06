import type { Pool } from 'pg';
import { authorize, OwnerError, transaction, type OwnerCredential } from '../owner/auth';
import { recordActivity } from '../owner/activity';
import { entitled } from '../billing/plans';
import { parsePlaceId, reviewLink } from '../google/place-id';
import { googleUrlProblem } from '../publishing/policy';
import { shopName } from '../admin/provisioning';
import { shortCode } from '../short-code';

/**
 * Nhiều địa chỉ quán (G3b, Tài 06/10, kịch bản mục 13). Chủ quán gói VIP thêm địa chỉ (tên, Place ID → link Google riêng) và
 * chuyển qua lại giữa các quán; mọi địa chỉ dùng chung gói VIP của quán chính, không giới hạn, một giá.
 *
 * Mỗi địa chỉ vẫn là một quán: link Google riêng, đội ngũ riêng, trang riêng. Thứ duy nhất nó không có là tiền: `main_shop_id`
 * trỏ về quán trả tiền, và trạng thái gói của địa chỉ là của quán đó (BILLING_COLUMNS). Thêm từ một địa chỉ thì địa chỉ mới
 * cũng thuộc quán chính, nên chỉ có một tầng. Quán chính còn địa chỉ thì không hạ xuống gói dưới VIP (lib/billing/payments.ts,
 * lib/admin/shop-plan.ts).
 */
const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
/** Không giới hạn theo gói; con số này chỉ chặn một vòng lặp lỗi hay một kẻ phá, và nhắn Admin Tài là mở thêm. */
export const BRANCH_LIMIT = 200;

export type AccountShop = { slug: string; name: string; role: 'owner' | 'manager'; mainSlug: string | null };

/** Every shop the signed-in person can open, the shop and its addresses together, the paying shop first. */
export async function accountShops(pool: Pool, userId: string): Promise<AccountShop[]> {
  return (await pool.query(`SELECT s.slug,s.name,m.role,main.slug main_slug FROM owner_memberships_v2 m JOIN shops s ON s.id=m.shop_id
    LEFT JOIN shops main ON main.id=s.main_shop_id
    WHERE m.user_id=$1 AND m.active AND s.publishing_state='active' AND NOT s.is_template
    ORDER BY COALESCE(main.created_at,s.created_at),COALESCE(main.id,s.id),s.main_shop_id IS NOT NULL,s.created_at,s.slug`, [userId])).rows
    .map(row => ({ slug: row.slug, name: row.name, role: row.role, mainSlug: row.main_slug ?? null }));
}

/** Adds an address under the shop that pays for `slug`; its owner becomes the address's owner. Owner only, VIP (or not yet billed). */
export async function addBranch(pool: Pool, credential: OwnerCredential, slug: string, body: unknown) {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const name = shopName(data.name);
  if (!name) throw new OwnerError(400, 'INVALID_NAME');
  const pasted = typeof data.placeId === 'string' && data.placeId.trim() ? data.placeId : null;
  const placeId = pasted === null ? null : parsePlaceId(pasted);
  if (pasted !== null && (!placeId || googleUrlProblem(reviewLink(placeId)))) throw new OwnerError(400, 'INVALID_PLACE_ID');
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'write');
    if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
    if (!entitled(access.billing, 'branches')) throw new OwnerError(402, 'VIP_REQUIRED');
    const here = (await db.query('SELECT COALESCE(main_shop_id,id) main,business_kind FROM shops WHERE id=$1', [access.shopId])).rows[0];
    // The paying shop is locked, so two addresses added at once count against the limit one after the other.
    const main = (await db.query(`SELECT s.id FROM shops s JOIN owner_memberships_v2 m ON m.shop_id=s.id AND m.user_id=$2 AND m.active AND m.role='owner'
      WHERE s.id=$1 FOR UPDATE OF s`, [here.main, access.userId])).rows[0];
    if (!main) throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
    if ((await db.query('SELECT count(*)::int n FROM shops WHERE main_shop_id=$1', [main.id])).rows[0].n >= BRANCH_LIMIT) throw new OwnerError(409, 'TOO_MANY_BRANCHES');
    let shop: { id: string; slug: string } | undefined;
    for (let attempt = 0; attempt < 5 && !shop; attempt++) {
      await db.query('SAVEPOINT branch');
      try {
        shop = (await db.query(`INSERT INTO shops(slug,name,publishing_state,business_kind,place_id,google_url,main_shop_id)VALUES($1,$2,'active',$3,$4,$5,$6)RETURNING id,slug`,
          [shortCode(6), name, here.business_kind, placeId, placeId ? reviewLink(placeId) : null, main.id])).rows[0];
        await db.query('RELEASE SAVEPOINT branch');
      } catch (error) { if (!duplicate(error)) throw error; await db.query('ROLLBACK TO SAVEPOINT branch'); }
    }
    if (!shop) throw new OwnerError(503, 'SERVICE_UNAVAILABLE');
    await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')", [access.userId, shop.id]);
    await recordActivity(db, access, 'shop.branch', name, { slug: shop.slug });
    return { slug: shop.slug, name };
  });
}
