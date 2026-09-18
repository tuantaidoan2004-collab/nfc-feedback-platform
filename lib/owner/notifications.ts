import type { Pool, PoolClient } from 'pg';
import { MANAGER_DEFAULT, OwnerError, sessionHash, transaction, type OwnerCredential } from './auth';

/**
 * The dashboard's bell (lát F5, Tài 2026-09-19): someone wrote @your-handle in a reply. Only members who may read the
 * shop's feedback are notified, and a notification shows only while that is still true, because it leads into a
 * feedback thread and quotes the reply. Support has no inbox.
 */
/** @handles in a text, lowercased, without the full stop that ends a sentence. */
export function mentions(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(/(^|[^a-z0-9_.-])@([a-z0-9][a-z0-9_.-]{2,63})/gi)) found.add(match[2].toLowerCase().replace(/[.-]+$/, ''));
  return [...found].filter(handle => handle.length >= 3);
}
/** SQL for "this membership may read feedback now": the owner, a role with the switch, or the owner's per-person choice. */
export const READS_FEEDBACK = `(m.role='owner' OR COALESCE(m.feedback_override,'feedback'=ANY(COALESCE(r.permissions,$MANAGER::text[]))))`;
const reads = (index: number) => READS_FEEDBACK.replace('$MANAGER', `$${index}`);

/** Called inside the transaction that wrote the reply. Returns the handles that were notified. */
export async function notifyMentions(db: PoolClient, input: { shopId: string; commentId: string; sessionId: string; body: string;
  author: { kind: 'member' | 'admin'; id: string; handle: string } }) {
  const handles = mentions(input.body);
  if (!handles.length) return [];
  const rows = (await db.query(`INSERT INTO owner_notifications(user_id,shop_id,kind,comment_id,session_id,actor_kind,actor_handle)
    SELECT u.id,$1,'mention',$2,$3,$4,$5 FROM owner_identities_v2 u JOIN owner_memberships_v2 m ON m.user_id=u.id AND m.shop_id=$1
    LEFT JOIN shop_roles r ON r.id=m.role_id
    WHERE u.username=ANY($6) AND u.active AND m.active AND NOT ($4='member' AND u.id=$7::uuid) AND ${reads(8)}
    ON CONFLICT (user_id,comment_id) DO NOTHING RETURNING user_id`,
    [input.shopId, input.commentId, input.sessionId, input.author.kind, input.author.handle, handles, input.author.id, MANAGER_DEFAULT])).rows;
  return rows.map(r => r.user_id as string);
}

export type Notification = { id: string; shop: { slug: string; name: string }; sessionId: string; commentId: string; actorKind: 'member' | 'admin';
  actorHandle: string; excerpt: string | null; createdAt: string; read: boolean };

export class OwnerNotifications {
  constructor(private pool: Pool) {}
  private async user(db: PoolClient, credential: OwnerCredential) {
    if (typeof credential === 'object') throw new OwnerError(403, 'IMPERSONATION_READ_ONLY');
    if (typeof credential !== 'string' || !/^[a-f0-9]{64}$/.test(credential)) throw new OwnerError(401, 'LOGIN_REQUIRED');
    const row = (await db.query(`SELECT a.user_id FROM owner_auth_sessions_v2 a JOIN owner_identities_v2 u ON u.id=a.user_id
      WHERE a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND u.active`, [sessionHash(credential)])).rows[0];
    if (!row) throw new OwnerError(401, 'LOGIN_REQUIRED');
    return row.user_id as string;
  }

  /** The newest thirty, and how many are unread, across every shop the person may still read feedback in. */
  async list(credential: OwnerCredential) {
    return transaction(this.pool, async db => {
      const userId = await this.user(db, credential);
      const visible = `FROM owner_notifications n JOIN shops s ON s.id=n.shop_id AND s.publishing_state='active'
        JOIN owner_memberships_v2 m ON m.user_id=n.user_id AND m.shop_id=n.shop_id AND m.active LEFT JOIN shop_roles r ON r.id=m.role_id
        JOIN feedback_comments c ON c.id=n.comment_id
        WHERE n.user_id=$1 AND ${reads(2)}`;
      const items = (await db.query(`SELECT n.id,jsonb_build_object('slug',s.slug,'name',s.name) shop,n.session_id "sessionId",n.comment_id "commentId",
          n.actor_kind "actorKind",n.actor_handle "actorHandle",CASE WHEN c.deleted_at IS NULL THEN left(c.body,140) END excerpt,
          to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "createdAt",n.read_at IS NOT NULL read
        ${visible} ORDER BY n.created_at DESC,n.id LIMIT 30`, [userId, MANAGER_DEFAULT])).rows as Notification[];
      const unread = (await db.query(`SELECT count(*)::int n ${visible} AND n.read_at IS NULL`, [userId, MANAGER_DEFAULT])).rows[0].n as number;
      return { unread, items };
    });
  }

  /** Marks some (`ids`) or all (`all: true`) of the person's own notifications as read. */
  async read(credential: OwnerCredential, body: unknown) {
    const data = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
    const all = data && Object.keys(data).join() === 'all' && data.all === true;
    const ids = data && Object.keys(data).join() === 'ids' && Array.isArray(data.ids) && data.ids.length <= 100
      && data.ids.every(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) ? data.ids as string[] : null;
    if (!all && !ids) throw new OwnerError(400, 'INVALID_NOTIFICATION');
    return transaction(this.pool, async db => {
      const userId = await this.user(db, credential);
      const result = await db.query(`UPDATE owner_notifications SET read_at=clock_timestamp() WHERE user_id=$1 AND read_at IS NULL${all ? '' : ' AND id=ANY($2::uuid[])'}`,
        all ? [userId] : [userId, ids]);
      return { marked: result.rowCount ?? 0 };
    });
  }
}
