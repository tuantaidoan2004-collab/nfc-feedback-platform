import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { authorize, requirePermission, transaction, username, OwnerError, PERMISSIONS, MANAGER_DEFAULT, type OwnerAccess, type OwnerCredential, type Permission } from './auth';
import { OwnerSetupLinks, ownerEmail } from './setup-link';
import { recordActivity } from './activity';
import { PERMISSION_LABELS } from './permission-labels';

/**
 * The shop's team (lát F3, Tài 2026-09-18). Roles work like Discord's: the owner names a role, gives it an icon and a
 * colour, and switches its permissions on or off. Someone with the `members` switch invites people and changes their
 * role, but only to roles that can do no more than they can, and never touches the owner or themselves — otherwise a
 * manager could hand themselves the export button. Only the owner edits roles and opens feedback to one person.
 * An invitation is a single-use link: the new person chooses their own password, so nobody else ever knows it.
 */
export type Role = { id: string; name: string; icon: string | null; color: string; permissions: Permission[]; position: number; members: number };
export type Member = { userId: string; handle: string; displayName: string | null; avatarUrl: string | null; owner: boolean; roleId: string | null;
  feedbackOverride: boolean | null; showBadge: boolean; pending: boolean; permissions: Permission[] };

const DEFAULT_ROLES = [
  { name: 'Quản lý', icon: '👑', color: '#d69a2d', permissions: MANAGER_DEFAULT, position: 1 },
  { name: 'Nhân viên', icon: null, color: '#5a6d62', permissions: [] as Permission[], position: 2 },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shape = (value: unknown, keys: string[], optional: string[] = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OwnerError(400, 'INVALID_TEAM');
  const given = Object.keys(value);
  if (!keys.every(k => given.includes(k)) || !given.every(k => keys.includes(k) || optional.includes(k))) throw new OwnerError(400, 'INVALID_TEAM');
  return value as Record<string, unknown>;
};
const id = (value: unknown) => { if (typeof value !== 'string' || !UUID.test(value)) throw new OwnerError(400, 'INVALID_TEAM'); return value; };
const subset = (inner: Permission[], outer: Permission[]) => inner.every(p => outer.includes(p));

function roleInput(data: Record<string, unknown>) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || [...name].length > 30 || /[\u0000-\u001f\u007f<>]/.test(name)) throw new OwnerError(400, 'INVALID_ROLE');
  const icon = data.icon === null || data.icon === '' ? null : typeof data.icon === 'string' ? data.icon.trim() : undefined;
  if (icon === undefined || (icon !== null && ([...icon].length > 8 || !icon || /[\s<>\u0000-\u001f]/.test(icon)))) throw new OwnerError(400, 'INVALID_ROLE');
  if (typeof data.color !== 'string' || !/^#[0-9a-f]{6}$/.test(data.color)) throw new OwnerError(400, 'INVALID_ROLE');
  if (!Array.isArray(data.permissions) || !data.permissions.every(p => PERMISSIONS.includes(p as Permission))) throw new OwnerError(400, 'INVALID_ROLE');
  return { name, icon, color: data.color, permissions: [...new Set(data.permissions as Permission[])] };
}

/** Shops made after migration 015 get the two default roles the first time their team is opened. */
export async function ensureRoles(db: PoolClient, shopId: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-shop-roles:'||$1,0))", [shopId]);
  if ((await db.query('SELECT 1 FROM shop_roles WHERE shop_id=$1 LIMIT 1', [shopId])).rowCount) return;
  for (const role of DEFAULT_ROLES) await db.query('INSERT INTO shop_roles(shop_id,name,icon,color,permissions,position)VALUES($1,$2,$3,$4,$5,$6)',
    [shopId, role.name, role.icon, role.color, role.permissions, role.position]);
}

export class OwnerTeam {
  constructor(private pool: Pool) {}

  /** The team belongs to the shop's own people; support never sees or changes it. */
  private async member(db: PoolClient, credential: OwnerCredential, slug: string) {
    const access = await authorize(db, credential, slug, 'shell');
    if (access.actor.kind === 'admin') throw new OwnerError(403, 'PERMISSION_REQUIRED');
    await ensureRoles(db, access.shopId);
    return access;
  }
  private async role(db: PoolClient, shopId: string, roleId: unknown) {
    const row = (await db.query('SELECT id,name,permissions FROM shop_roles WHERE shop_id=$1 AND id=$2', [shopId, id(roleId)])).rows[0];
    if (!row) throw new OwnerError(404, 'ROLE_NOT_FOUND');
    return row as { id: string; name: string; permissions: Permission[] };
  }
  /** Someone else in this shop, whose current permissions bound what the actor may do to them. */
  private async target(db: PoolClient, access: OwnerAccess, userId: unknown) {
    const row = (await db.query(`SELECT m.user_id,m.role,u.username,COALESCE(r.permissions,$3::text[]) permissions FROM owner_memberships_v2 m
      JOIN owner_identities_v2 u ON u.id=m.user_id LEFT JOIN shop_roles r ON r.id=m.role_id
      WHERE m.shop_id=$1 AND m.user_id=$2 AND m.active FOR UPDATE OF m`, [access.shopId, id(userId), MANAGER_DEFAULT])).rows[0];
    if (!row) throw new OwnerError(404, 'MEMBER_NOT_FOUND');
    if (row.role === 'owner') throw new OwnerError(403, 'OWNER_UNTOUCHABLE');
    if (row.user_id === access.userId) throw new OwnerError(403, 'NOT_ON_YOURSELF');
    return row as { user_id: string; username: string; permissions: Permission[] };
  }
  private guard(access: OwnerAccess, permissions: Permission[]) {
    requirePermission(access, 'members');
    if (access.role !== 'owner' && !subset(permissions, access.permissions)) throw new OwnerError(403, 'ROLE_ABOVE_YOU');
  }

  async list(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, async db => {
      const access = await this.member(db, credential, slug);
      const roles = (await db.query(`SELECT r.id,r.name,r.icon,r.color,r.permissions,r.position,
        (SELECT count(*)::int FROM owner_memberships_v2 m WHERE m.role_id=r.id AND m.active) members
        FROM shop_roles r WHERE r.shop_id=$1 ORDER BY r.position,r.name`, [access.shopId])).rows as Role[];
      const members = (await db.query(`SELECT u.id "userId",u.username handle,u.display_name "displayName",u.avatar_url "avatarUrl",m.role='owner' owner,
        m.role_id "roleId",m.feedback_override "feedbackOverride",m.show_badge "showBadge",COALESCE(r.permissions,$2::text[]) permissions,
        (EXISTS(SELECT 1 FROM owner_setup_tokens t WHERE t.user_id=u.id AND t.purpose='setup' AND t.used_at IS NULL AND t.superseded_at IS NULL)
          AND NOT EXISTS(SELECT 1 FROM owner_setup_tokens t WHERE t.user_id=u.id AND t.used_at IS NOT NULL)
          AND NOT EXISTS(SELECT 1 FROM owner_auth_sessions_v2 a WHERE a.user_id=u.id)) pending
        FROM owner_memberships_v2 m JOIN owner_identities_v2 u ON u.id=m.user_id LEFT JOIN shop_roles r ON r.id=m.role_id
        WHERE m.shop_id=$1 AND m.active AND u.active ORDER BY m.role='owner' DESC,r.position NULLS FIRST,u.username`, [access.shopId, MANAGER_DEFAULT])).rows as Member[];
      for (const m of members) if (m.owner) m.permissions = [...PERMISSIONS];
      return { roles, members, me: { userId: access.userId, owner: access.role === 'owner', permissions: access.permissions } };
    });
  }

  /** Creates the person's account and a single-use link to set their password. */
  async invite(credential: OwnerCredential, slug: string, body: unknown) {
    const data = shape(body, ['handle', 'roleId'], ['email']);
    const handle = typeof data.handle === 'string' ? username(data.handle.trim().replace(/^@/, '')) : null;
    if (!handle) throw new OwnerError(400, 'INVALID_HANDLE');
    const email = data.email === undefined || data.email === '' || data.email === null ? null : ownerEmail(data.email);
    if (email === null && data.email) throw new OwnerError(400, 'INVALID_EMAIL');
    return transaction(this.pool, async db => {
      const access = await this.member(db, credential, slug);
      const role = await this.role(db, access.shopId, data.roleId);
      this.guard(access, role.permissions);
      if ((await db.query('SELECT 1 FROM owner_identities_v2 WHERE username=$1', [handle])).rowCount) throw new OwnerError(409, 'HANDLE_TAKEN');
      if (email && (await db.query('SELECT 1 FROM owner_identities_v2 WHERE email=$1', [email])).rowCount) throw new OwnerError(409, 'EMAIL_TAKEN');
      // A random key no password can match: the account stays closed until the person opens the link.
      const userId = (await db.query('INSERT INTO owner_identities_v2(username,password_salt,password_key,email)VALUES($1,$2,$3,$4)RETURNING id',
        [handle, randomBytes(16).toString('hex'), randomBytes(32).toString('hex'), email])).rows[0].id as string;
      await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role,role_id,invited_by)VALUES($1,$2,'manager',$3,$4)", [userId, access.shopId, role.id, access.userId]);
      const link = await new OwnerSetupLinks(this.pool).write(db, userId, 'setup');
      await recordActivity(db, access, 'member.invite', `@${handle}`, { role: role.name });
      return { userId, handle, token: link.token, expiresAt: link.expiresAt };
    });
  }

  /**
   * One change to one person: `role` (members switch, within your own reach), `feedback` (owner only: true, false,
   * or null to follow the role), `remove` (members switch), `link` (a fresh setup link), or `badge` (yourself only:
   * show or hide your role's icon beside your name).
   */
  async change(credential: OwnerCredential, slug: string, body: unknown) {
    const op = (body as Record<string, unknown> | null)?.op;
    const data = op === 'badge' ? shape(body, ['op', 'value']) : op === 'link' || op === 'remove' ? shape(body, ['op', 'userId']) : shape(body, ['op', 'userId', 'value']);
    return transaction(this.pool, async db => {
      const access = await this.member(db, credential, slug);
      if (op === 'badge') {
        if (typeof data.value !== 'boolean') throw new OwnerError(400, 'INVALID_TEAM');
        await db.query('UPDATE owner_memberships_v2 SET show_badge=$3 WHERE user_id=$1 AND shop_id=$2', [access.userId, access.shopId, data.value]);
        return { ok: true };
      }
      const person = await this.target(db, access, data.userId);
      if (op === 'role') {
        const role = await this.role(db, access.shopId, data.value);
        this.guard(access, person.permissions); this.guard(access, role.permissions);
        await db.query('UPDATE owner_memberships_v2 SET role_id=$3 WHERE user_id=$1 AND shop_id=$2', [person.user_id, access.shopId, role.id]);
        await recordActivity(db, access, 'member.role', `@${person.username}`, { role: role.name });
      } else if (op === 'feedback') {
        if (access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
        if (data.value !== null && typeof data.value !== 'boolean') throw new OwnerError(400, 'INVALID_TEAM');
        await db.query('UPDATE owner_memberships_v2 SET feedback_override=$3 WHERE user_id=$1 AND shop_id=$2', [person.user_id, access.shopId, data.value]);
        await recordActivity(db, access, 'member.feedback', `@${person.username}`, { value: data.value === null ? 'theo vai' : data.value ? 'cho đọc' : 'không cho đọc' });
      } else if (op === 'remove') {
        this.guard(access, person.permissions);
        await db.query('UPDATE owner_memberships_v2 SET active=false WHERE user_id=$1 AND shop_id=$2', [person.user_id, access.shopId]);
        await recordActivity(db, access, 'member.remove', `@${person.username}`);
      } else if (op === 'link') {
        this.guard(access, person.permissions);
        const link = await new OwnerSetupLinks(this.pool).write(db, person.user_id, 'setup');
        await recordActivity(db, access, 'member.link', `@${person.username}`);
        return { token: link.token, expiresAt: link.expiresAt };
      } else throw new OwnerError(400, 'INVALID_TEAM');
      return { ok: true };
    });
  }

  /** Roles: create, edit or delete. Owner only; a role still held by someone cannot be deleted. */
  async roles(credential: OwnerCredential, slug: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown) {
    return transaction(this.pool, async db => {
      const access = await this.member(db, credential, slug);
      if (access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
      const duplicate = (error: unknown) => { if ((error as { code?: string }).code === '23505') throw new OwnerError(409, 'ROLE_NAME_TAKEN'); throw error; };
      if (method === 'DELETE') {
        const role = await this.role(db, access.shopId, shape(body, ['id']).id);
        if ((await db.query('SELECT 1 FROM owner_memberships_v2 WHERE role_id=$1', [role.id])).rowCount) throw new OwnerError(409, 'ROLE_IN_USE');
        await db.query('DELETE FROM shop_roles WHERE id=$1', [role.id]);
        await recordActivity(db, access, 'role.delete', role.name);
        return { ok: true };
      }
      const data = method === 'POST' ? shape(body, ['name', 'icon', 'color', 'permissions']) : shape(body, ['id', 'name', 'icon', 'color', 'permissions']);
      const role = roleInput(data);
      if (method === 'POST') {
        const position = (await db.query('SELECT COALESCE(max(position),0)+1 n FROM shop_roles WHERE shop_id=$1', [access.shopId])).rows[0].n;
        const created = await db.query('INSERT INTO shop_roles(shop_id,name,icon,color,permissions,position)VALUES($1,$2,$3,$4,$5,$6)RETURNING id',
          [access.shopId, role.name, role.icon, role.color, role.permissions, Math.min(position, 1000)]).catch(duplicate);
        await recordActivity(db, access, 'role.create', role.name, { permissions: role.permissions.map(p => PERMISSION_LABELS[p]).join(', ') || 'chỉ xem số liệu' });
        return { id: created.rows[0].id as string };
      }
      const current = await this.role(db, access.shopId, data.id);
      await db.query('UPDATE shop_roles SET name=$2,icon=$3,color=$4,permissions=$5 WHERE id=$1', [current.id, role.name, role.icon, role.color, role.permissions]).catch(duplicate);
      await recordActivity(db, access, 'role.update', role.name, { permissions: role.permissions.map(p => PERMISSION_LABELS[p]).join(', ') || 'chỉ xem số liệu' });
      return { id: current.id };
    });
  }
}
