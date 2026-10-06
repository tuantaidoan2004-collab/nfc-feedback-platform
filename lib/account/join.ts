import type { PoolClient } from 'pg';
import { OwnerError } from '../owner/auth';

/**
 * Nhân viên tự xin vào quán (G3, Tài 06/10, kịch bản mục 1 bước 5). Người xin gõ thứ họ có trong tay: **@tài khoản của chủ
 * quán**, **link trang của quán** (hay link trên thẻ), hoặc **mã quán**. Không vào được ngay: chủ quán, hay người có quyền
 * Thành viên, duyệt và chọn vai (lib/owner/team.ts). Một người có tối đa 5 yêu cầu đang mở; một quán nhận tối đa 30 yêu cầu
 * đang mở, để không ai rải yêu cầu vào mọi quán.
 */
export const JOIN_LIMITS = { openPerPerson: 5, openPerShop: 30 } as const;
export type JoinShop = { id: string; slug: string; name: string };

/** The shop a person means, or an answer saying why none: not found, or an owner with several shops (ask for the link). */
export async function findShop(db: PoolClient, text: unknown): Promise<JoinShop> {
  if (typeof text !== 'string' || !text.trim() || text.length > 300) throw new OwnerError(400, 'SHOP_NOT_FOUND');
  let value = text.trim(), card: string | null = null;
  if (/[/.]/.test(value)) {
    let path = value;
    try { path = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).pathname; } catch { /* Not a link: treated as a name. */ }
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 't' && parts[1]) card = parts[1]; else value = parts[0] ?? '';
  }
  value = value.replace(/^@/, '').toLowerCase();
  const usable = "s.publishing_state='active' AND NOT s.is_template";
  const one = async (sql: string, key: string) => (await db.query(`SELECT s.id,s.slug,s.name FROM shops s ${sql} AND ${usable} LIMIT 2`, [key])).rows as JoinShop[];
  if (card) { const [shop] = await one('JOIN tags t ON t.shop_id=s.id WHERE t.public_code=$1', card.toLowerCase()); if (shop) return shop; throw new OwnerError(404, 'SHOP_NOT_FOUND'); }
  if (!/^[a-z0-9][a-z0-9_.-]{1,63}$/.test(value)) throw new OwnerError(404, 'SHOP_NOT_FOUND');
  for (const sql of ["JOIN pages p ON p.shop_id=s.id WHERE lower(p.slug)=$1 AND p.state<>'closed'", 'WHERE lower(s.slug)=$1']) {
    const [shop] = await one(sql, value); if (shop) return shop;
  }
  const owned = await one(`JOIN owner_memberships_v2 m ON m.shop_id=s.id AND m.role='owner' AND m.active JOIN owner_identities_v2 u ON u.id=m.user_id
    WHERE u.username=$1 AND u.active`, value);
  if (owned.length > 1) throw new OwnerError(409, 'SHOP_AMBIGUOUS');
  if (owned[0]) return owned[0];
  throw new OwnerError(404, 'SHOP_NOT_FOUND');
}

export const joinMessage = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200 || /[<>\u0000-\u001f\u007f]/.test(value)) throw new OwnerError(400, 'INVALID_MESSAGE');
  return value.trim();
};

/** Opens a request, or answers with the one already open. Someone already in the shop is told so. */
export async function openJoinRequest(db: PoolClient, userId: string, shop: JoinShop, message: string | null) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-join:'||$1,0))", [shop.id]);
  if ((await db.query('SELECT 1 FROM owner_memberships_v2 WHERE user_id=$1 AND shop_id=$2 AND active', [userId, shop.id])).rowCount) throw new OwnerError(409, 'ALREADY_MEMBER');
  const open = (await db.query('SELECT id FROM join_requests WHERE user_id=$1 AND shop_id=$2 AND decided_at IS NULL', [userId, shop.id])).rows[0];
  if (open) return { id: open.id as string, shop };
  const counts = (await db.query(`SELECT (SELECT count(*)::int FROM join_requests WHERE user_id=$1 AND decided_at IS NULL) mine,
    (SELECT count(*)::int FROM join_requests WHERE shop_id=$2 AND decided_at IS NULL) theirs`, [userId, shop.id])).rows[0];
  if (counts.mine >= JOIN_LIMITS.openPerPerson || counts.theirs >= JOIN_LIMITS.openPerShop) throw new OwnerError(429, 'TOO_MANY_REQUESTS');
  const id = (await db.query('INSERT INTO join_requests(shop_id,user_id,message)VALUES($1,$2,$3)RETURNING id', [shop.id, userId, message])).rows[0].id as string;
  return { id, shop };
}

/** What the person who asked sees while they wait: their requests, newest first, and the shops they are already in. */
export async function myRequests(db: PoolClient | import('pg').Pool, userId: string) {
  const requests = (await db.query(`SELECT j.id,j.created_at "createdAt",j.decided_at "decidedAt",j.outcome,s.name "shopName",s.slug "shopSlug"
    FROM join_requests j JOIN shops s ON s.id=j.shop_id WHERE j.user_id=$1 AND (j.decided_at IS NULL OR j.decided_at>clock_timestamp()-interval '30 days')
    ORDER BY j.created_at DESC LIMIT 20`, [userId])).rows as { id: string; createdAt: Date; decidedAt: Date | null; outcome: string | null; shopName: string; shopSlug: string }[];
  const shops = (await db.query(`SELECT s.slug,s.name FROM owner_memberships_v2 m JOIN shops s ON s.id=m.shop_id WHERE m.user_id=$1 AND m.active
    AND s.publishing_state='active' ORDER BY m.joined_at DESC`, [userId])).rows as { slug: string; name: string }[];
  return { requests, shops };
}
