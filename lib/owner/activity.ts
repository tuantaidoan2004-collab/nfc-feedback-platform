import type { Pool, PoolClient } from 'pg';
import { fold } from '../text-fold';
export { fold };
import { authorize, requirePermission, transaction, OwnerError, type OwnerAccess, type OwnerCredential } from './auth';

/**
 * Lịch sử hoạt động (lát F3, Tài 2026-09-18): every change someone makes in a shop leaves one line — who, what, on
 * what, when — that nobody can edit (migration 015 refuses UPDATE and DELETE). Reading needs the `activity` switch.
 * Search is accent-blind: each line stores its words lowercased without Vietnamese marks, and so does the query.
 */
export const ACTIONS: Record<string, string> = {
  'note.save': 'Ghi chú góp ý',
  'design.save': 'Lưu nháp giao diện',
  'design.publish': 'Phát hành giao diện',
  'media.upload': 'Tải ảnh/video lên',
  'card.create': 'Nhân bản thẻ',
  'card.rename': 'Đổi tên thẻ',
  'card.state': 'Đổi trạng thái thẻ',
  'support.level': 'Đổi mức hỗ trợ',
  'member.invite': 'Mời thành viên',
  'member.link': 'Tạo lại link thiết lập',
  'member.role': 'Đổi vai thành viên',
  'member.feedback': 'Đổi quyền đọc góp ý',
  'member.remove': 'Gỡ thành viên',
  'role.create': 'Tạo vai',
  'role.update': 'Sửa vai',
  'role.delete': 'Xoá vai',
  'export.download': 'Tải dữ liệu',
  'comment.create': 'Viết phản hồi',
  'comment.edit': 'Sửa phản hồi',
  'comment.delete': 'Xoá phản hồi',
  'comment.pin': 'Ghim phản hồi',
};
export type ActivityRow = { id: string; actor_kind: 'member' | 'admin'; actor_id: string; actor_handle: string; action: string; target: string | null;
  detail: Record<string, unknown>; at: string };


/** Written inside the transaction that made the change, so a change never exists without its line. */
export async function recordActivity(db: PoolClient | Pool, access: OwnerAccess, action: keyof typeof ACTIONS, target: string | null, detail: Record<string, unknown> = {}) {
  const admin = access.actor.kind === 'admin';
  const handle = admin
    ? (access.actor as { adminHandle: string | null; adminUsername: string }).adminHandle ?? (access.actor as { adminUsername: string }).adminUsername
    : (await db.query('SELECT username FROM owner_identities_v2 WHERE id=$1', [access.userId])).rows[0].username as string;
  const actorId = admin ? (access.actor as { adminId: string }).adminId : access.userId;
  const words = [handle, ACTIONS[action], target ?? '', ...Object.values(detail).filter(v => typeof v === 'string' || typeof v === 'number').map(String)].join(' ');
  await db.query('INSERT INTO shop_activity(shop_id,actor_kind,actor_id,actor_handle,action,target,detail,search)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [access.shopId, admin ? 'admin' : 'member', actorId, handle, action, target?.slice(0, 200) ?? null, detail, fold(words).slice(0, 2000)]);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ActivityQuery = { q: string; actor: string | null; action: string | null; from: string | null; to: string | null; before: string | null };
export function parseActivityQuery(params: URLSearchParams): ActivityQuery {
  const get = (key: string) => params.get(key)?.trim() || null;
  const query = { q: (get('q') ?? '').slice(0, 100), actor: get('actor'), action: get('action'), from: get('from'), to: get('to'), before: get('before') };
  if ((query.actor && !UUID.test(query.actor)) || (query.action && !(query.action in ACTIONS)) || (query.from && !DAY.test(query.from))
    || (query.to && !DAY.test(query.to)) || (query.before && !/^[1-9][0-9]{0,18}$/.test(query.before))) throw new OwnerError(400, 'INVALID_QUERY');
  return query;
}

export class OwnerActivity {
  constructor(private pool: Pool) {}

  /** Fifty lines at a time, newest first; `before` is the id of the last line already shown. */
  async list(credential: OwnerCredential, slug: string, query: ActivityQuery) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'shell');
      // The team's own history is the shop's; support never reads it, at any switch position.
      if (access.actor.kind === 'admin') throw new OwnerError(403, 'PERMISSION_REQUIRED');
      requirePermission(access, 'activity');
      const values: unknown[] = [access.shopId], where = ['shop_id=$1'];
      const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
      for (const word of fold(query.q).split(' ').filter(Boolean).slice(0, 6)) add("search LIKE '%'||?||'%'", word.replace(/[\\%_]/g, '\\$&'));
      if (query.actor) add('actor_id=?', query.actor);
      if (query.action) add('action=?', query.action);
      if (query.from) add("at>=(?::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')", query.from);
      if (query.to) add("at<((?::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')", query.to);
      if (query.before) add('id<?', query.before);
      const rows = (await db.query(`SELECT id::text,actor_kind,actor_id,actor_handle,action,target,detail,to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') at
        FROM shop_activity WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 51`, values)).rows as ActivityRow[];
      // The people filter lists everyone who has done something here, including those who have since left.
      const people = (await db.query(`SELECT DISTINCT ON (actor_id) actor_id id,actor_handle handle,actor_kind kind FROM shop_activity
        WHERE shop_id=$1 ORDER BY actor_id,id DESC`, [access.shopId])).rows as { id: string; handle: string; kind: string }[];
      return { rows: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null, people, actions: ACTIONS };
    });
  }
}
