import type { Pool, PoolClient } from 'pg';
import { authorize, supportLevel, transaction, OwnerError, type OwnerAccess, type OwnerCredential } from './auth';
import { recordActivity } from './activity';
import { recordAdminAction } from '../admin/audit';
import { notifyMentions } from './notifications';

/**
 * Replies under a customer's feedback (lát F4, Tài 2026-09-18/19), like YouTube comments. Reading them needs the
 * feedback switch, as the customer's words do. Writing, liking and pinning need it too; support may join in only
 * at switch position 3 and in a feedback session — Tài's "Minecraft server owner" who drops in to fix things and
 * chat. Only the author edits a reply; the author or the shop's owner deletes it. The history gets a line for each
 * write but never the text, since the history is readable without the feedback switch.
 */
export type CommentAuthor = { kind: 'member' | 'admin'; id: string; handle: string; displayName: string | null; avatarUrl: string | null;
  owner: boolean; role: { name: string; icon: string | null; color: string } | null; title: string | null };
export type ThreadExperience = { session_id: string; first_rated_at: string; rating: number | null; topic: string | null; message: string | null;
  phone: string | null; source_label: string };
export type FeedbackComment = { id: string; body: string; createdAt: string; editedAt: string | null; pinned: boolean; likes: number; liked: boolean;
  mine: boolean; canDelete: boolean; author: CommentAuthor };

const NUL = String.fromCharCode(0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown) => { if (typeof value !== 'string' || !UUID.test(value)) throw new OwnerError(400, 'INVALID_COMMENT'); return value; };
const text = (value: unknown) => {
  if (typeof value !== 'string') throw new OwnerError(400, 'INVALID_COMMENT');
  const body = value.replace(/\r\n?/g, '\n').trim();
  if (!body || [...body].length > 2000 || body.includes(NUL)) throw new OwnerError(400, 'INVALID_COMMENT');
  return body;
};
const shape = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new OwnerError(400, 'INVALID_COMMENT');
  return value as Record<string, unknown>;
};
const reference = (sessionId: string) => `Phản hồi ${sessionId.slice(0, 8)}`;
const who = (access: OwnerAccess) => access.actor.kind === 'admin'
  ? { kind: 'admin' as const, id: access.actor.adminId, handle: access.actor.adminHandle ?? access.actor.adminUsername }
  : { kind: 'member' as const, id: access.userId, handle: '' };

export class OwnerComments {
  constructor(private pool: Pool) {}

  /** Read access is the feedback need; writing adds, for support, position 3 of the owner's switch. */
  private async access(db: PoolClient, credential: OwnerCredential, slug: string, write: boolean) {
    const access = await authorize(db, credential, slug, 'feedback');
    if (write && access.actor.kind === 'admin' && await supportLevel(db, access.shopId) !== 'full') throw new OwnerError(403, 'SUPPORT_NOT_GRANTED');
    return access;
  }
  private async author(db: PoolClient, access: OwnerAccess) {
    const me = who(access);
    if (me.kind === 'member') me.handle = (await db.query('SELECT username FROM owner_identities_v2 WHERE id=$1', [access.userId])).rows[0].username;
    return me;
  }
  private async comment(db: PoolClient, access: OwnerAccess, commentId: unknown) {
    const row = (await db.query('SELECT * FROM feedback_comments WHERE id=$1 AND shop_id=$2 AND deleted_at IS NULL FOR UPDATE', [id(commentId), access.shopId])).rows[0];
    if (!row) throw new OwnerError(404, 'COMMENT_NOT_FOUND');
    return row;
  }
  private async audit(db: PoolClient, access: OwnerAccess, action: string, sessionId: string) {
    if (access.actor.kind === 'admin') await recordAdminAction(db, access.actor.adminId, { action: `impersonation.${action}`, shopId: access.shopId,
      onBehalfOf: access.userId, detail: { session: access.actor.sessionId, feedback: sessionId } });
  }

  async list(credential: OwnerCredential, slug: string, sessionId: unknown) {
    return transaction(this.pool, async db => {
      const access = await this.access(db, credential, slug, false), me = who(access);
      const rows = (await db.query(`SELECT c.id,c.body,to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "createdAt",
          to_char(c.edited_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "editedAt",c.pinned_at IS NOT NULL pinned,
          (SELECT count(*)::int FROM feedback_comment_likes l WHERE l.comment_id=c.id) likes,
          EXISTS(SELECT 1 FROM feedback_comment_likes l WHERE l.comment_id=c.id AND l.liker_kind=$3 AND l.liker_id=$4) liked,
          (c.author_kind=$3 AND c.author_id=$4) mine,c.author_kind kind,c.author_id author_id,
          CASE WHEN c.author_kind='admin' THEN COALESCE(a.handle,a.username,c.author_handle) ELSE COALESCE(u.username,c.author_handle) END handle,
          u.display_name,u.avatar_url,COALESCE(m.role='owner',false) owner,a.title,
          CASE WHEN m.show_badge AND r.id IS NOT NULL THEN jsonb_build_object('name',r.name,'icon',r.icon,'color',r.color) END role
        FROM feedback_comments c
        LEFT JOIN owner_identities_v2 u ON c.author_kind='member' AND u.id=c.author_id
        LEFT JOIN owner_memberships_v2 m ON m.user_id=u.id AND m.shop_id=c.shop_id
        LEFT JOIN shop_roles r ON r.id=m.role_id
        LEFT JOIN platform_admins a ON c.author_kind='admin' AND a.id=c.author_id
        WHERE c.shop_id=$1 AND c.session_id=$2 AND c.deleted_at IS NULL
        ORDER BY c.pinned_at IS NULL,c.created_at,c.id`, [access.shopId, id(sessionId), me.kind, me.id])).rows;
      await this.audit(db, access, 'comments.read', String(sessionId));
      // The customer's own feedback, so a thread can open on its own — from a notification, outside the Data list.
      const experience = (await db.query(`SELECT e.session_id,to_char(e.first_interaction_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') first_rated_at,
          e.rating,e.feedback_topic topic,e.feedback_message message,e.feedback_phone phone,
          COALESCE((SELECT COALESCE(NULLIF(t.location_label,''),CASE WHEN v.entry_key='direct:shop' THEN 'Trực tiếp' WHEN p.tag_id IS NULL THEN 'Chưa rõ nguồn' ELSE 'Thẻ' END)
            FROM page_visits v LEFT JOIN published_visit_contexts p ON p.visit_id=v.id LEFT JOIN tags t ON t.id=p.tag_id
            WHERE v.session_id=e.session_id ORDER BY v.opened_at DESC LIMIT 1),'Chưa rõ nguồn') source_label
        FROM rating_experiences e WHERE e.shop_id=$1 AND e.session_id=$2 AND e.scope='live'`, [access.shopId, sessionId])).rows[0];
      if (!experience) throw new OwnerError(404, 'NOT_FOUND');
      // Same rule as the Data list: support never sees the call-back number.
      if (access.actor.kind === 'admin') (experience as ThreadExperience).phone = null;
      const owner = access.actor.kind === 'owner' && access.role === 'owner';
      return { experience: experience as ThreadExperience, comments: rows.map(r => ({ id: r.id, body: r.body, createdAt: r.createdAt, editedAt: r.editedAt, pinned: r.pinned, likes: r.likes, liked: r.liked,
        mine: r.mine, canDelete: r.mine || owner,
        author: { kind: r.kind, id: r.author_id, handle: r.handle, displayName: r.display_name, avatarUrl: r.avatar_url, owner: r.owner, role: r.role, title: r.title } })) as FeedbackComment[] };
    });
  }

  async create(credential: OwnerCredential, slug: string, body: unknown) {
    const data = shape(body, ['sessionId', 'body']), sessionId = id(data.sessionId), content = text(data.body);
    return transaction(this.pool, async db => {
      const access = await this.access(db, credential, slug, true);
      if (!(await db.query("SELECT 1 FROM rating_experiences WHERE session_id=$1 AND shop_id=$2 AND scope='live'", [sessionId, access.shopId])).rowCount)
        throw new OwnerError(404, 'NOT_FOUND');
      const me = await this.author(db, access);
      const row = (await db.query('INSERT INTO feedback_comments(shop_id,session_id,author_kind,author_id,author_handle,body)VALUES($1,$2,$3,$4,$5,$6)RETURNING id',
        [access.shopId, sessionId, me.kind, me.id, me.handle, content])).rows[0];
      await recordActivity(db, access, 'comment.create', reference(sessionId));
      await this.audit(db, access, 'comment.create', sessionId);
      const notified = await notifyMentions(db, { shopId: access.shopId, commentId: row.id, sessionId, body: content, author: me });
      return { id: row.id as string, notified: notified.length };
    });
  }

  /** One change to one reply: `edit` (author only; the old text is kept), `pin` (one per thread) or `like`. */
  async change(credential: OwnerCredential, slug: string, body: unknown) {
    const data = shape(body, ['id', 'op', 'value']);
    return transaction(this.pool, async db => {
      const access = await this.access(db, credential, slug, true), me = who(access);
      const current = await this.comment(db, access, data.id);
      if (data.op === 'edit') {
        const content = text(data.value);
        if (current.author_kind !== me.kind || current.author_id !== me.id) throw new OwnerError(403, 'NOT_YOUR_COMMENT');
        if (content === current.body) return { ok: true };
        await db.query('INSERT INTO feedback_comment_revisions(comment_id,body)VALUES($1,$2)', [current.id, current.body]);
        await db.query('UPDATE feedback_comments SET body=$2,edited_at=clock_timestamp() WHERE id=$1', [current.id, content]);
        // Only people the new text mentions for the first time hear about it.
        await notifyMentions(db, { shopId: access.shopId, commentId: current.id, sessionId: current.session_id, body: content, author: { ...me, handle: current.author_handle } });
        await recordActivity(db, access, 'comment.edit', reference(current.session_id));
      } else if (data.op === 'pin') {
        if (typeof data.value !== 'boolean') throw new OwnerError(400, 'INVALID_COMMENT');
        if (data.value) await db.query('UPDATE feedback_comments SET pinned_at=NULL WHERE session_id=$1 AND pinned_at IS NOT NULL', [current.session_id]);
        await db.query(`UPDATE feedback_comments SET pinned_at=${data.value ? 'clock_timestamp()' : 'NULL'} WHERE id=$1`, [current.id]);
        await recordActivity(db, access, 'comment.pin', reference(current.session_id), { value: data.value ? 'ghim' : 'bỏ ghim' });
      } else if (data.op === 'like') {
        if (typeof data.value !== 'boolean') throw new OwnerError(400, 'INVALID_COMMENT');
        if (data.value) await db.query('INSERT INTO feedback_comment_likes(comment_id,liker_kind,liker_id)VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [current.id, me.kind, me.id]);
        else await db.query('DELETE FROM feedback_comment_likes WHERE comment_id=$1 AND liker_kind=$2 AND liker_id=$3', [current.id, me.kind, me.id]);
      } else throw new OwnerError(400, 'INVALID_COMMENT');
      await this.audit(db, access, `comment.${data.op}`, current.session_id);
      return { ok: true };
    });
  }

  /** Hidden from the thread for everyone; the row stays, with who removed it. */
  async remove(credential: OwnerCredential, slug: string, body: unknown) {
    const data = shape(body, ['id']);
    return transaction(this.pool, async db => {
      const access = await this.access(db, credential, slug, true), me = who(access);
      const current = await this.comment(db, access, data.id);
      const mine = current.author_kind === me.kind && current.author_id === me.id;
      if (!mine && !(access.actor.kind === 'owner' && access.role === 'owner')) throw new OwnerError(403, 'NOT_YOUR_COMMENT');
      await db.query('UPDATE feedback_comments SET deleted_at=clock_timestamp(),deleted_by=$2,pinned_at=NULL WHERE id=$1', [current.id, me.id]);
      await recordActivity(db, access, 'comment.delete', reference(current.session_id), mine ? {} : { author: `@${current.author_handle}` });
      await this.audit(db, access, 'comment.delete', current.session_id);
      return { ok: true };
    });
  }
}
