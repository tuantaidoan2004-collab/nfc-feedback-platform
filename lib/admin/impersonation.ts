import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { impersonationHash, ownerShop, supportGranted, transaction, type ImpersonationScope } from '../owner/auth';
import { uuid } from '../owner/filters';
import { adminSessionHash, authorizeAdmin, AdminError } from './auth';
import { recordAdminAction } from './audit';

// Thirty minutes, never extended. A longer task opens a new session with its own reason.
const LIFETIME_MINUTES = 30;

/** Shown to the shop verbatim, so it is bounded and holds no control characters that could disguise it. */
export function impersonationReason(value: unknown) {
  if (typeof value !== 'string') return null;
  const reason = value.trim(), length = [...reason].length;
  if (length < 10 || length > 200) return null;
  if ([...reason].some(character => { const code = character.codePointAt(0) ?? 0; return code < 32 || (code >= 127 && code < 160); })) return null;
  return reason;
}

export type ImpersonationInput = { shopId?: unknown; ownerUserId?: unknown; scope?: unknown; reason?: unknown };
export type OpenedImpersonation = { sessionId: string; token: string; slug: string; scope: ImpersonationScope; expiresAt: Date };

type Closed = { id: string; shop_id: string; owner_user_id: string; end_reason: string; slug: string };

/** Closes whatever is still open for this administrator and records each closure against the shop it touched. */
async function closeOpen(db: PoolClient, adminId: string, filter: string, values: unknown[], reason: 'ended' | 'superseded') {
  const closed = (await db.query(`UPDATE admin_impersonation_sessions i SET ended_at=LEAST(clock_timestamp(),i.expires_at),
      end_reason=CASE WHEN i.expires_at<=clock_timestamp() THEN 'expired' ELSE $2 END
    FROM shops s WHERE s.id=i.shop_id AND i.admin_id=$1 AND i.ended_at IS NULL ${filter}
    RETURNING i.id,i.shop_id,i.owner_user_id,i.end_reason,s.slug`, [adminId, reason, ...values])).rows as Closed[];
  for (const row of closed)
    await recordAdminAction(db, adminId, { action: 'impersonation.end', shopId: row.shop_id, onBehalfOf: row.owner_user_id,
      detail: { session: row.id, endReason: row.end_reason } });
  return closed;
}

export class AdminImpersonation {
  constructor(private pool: Pool) {}

  async start(adminToken: string | undefined, input: ImpersonationInput): Promise<OpenedImpersonation> {
    const reason = impersonationReason(input.reason), scope = input.scope;
    if (typeof input.shopId !== 'string' || !uuid(input.shopId) || typeof input.ownerUserId !== 'string' || !uuid(input.ownerUserId)
      || (scope !== 'overview' && scope !== 'feedback') || !reason) throw new AdminError(400, 'INVALID_INPUT');
    const shopId = input.shopId, ownerUserId = input.ownerUserId;
    return transaction(this.pool, async db => {
      const principal = await authorizeAdmin(db, adminToken);
      // Serializes two starts by the same administrator. Without it the second would wait on the first's index
      // entry and fail with a constraint error instead of closing the first session.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-impersonation:'||$1,0))", [principal.adminId]);
      // Checked before anything is written, through the same gate the owner's own sign-in passes.
      const shop = await ownerShop(db, ownerUserId, { id: shopId });
      if (!shop) throw new AdminError(403, 'OWNER_NOT_AVAILABLE');
      // Reading feedback is the shop's to allow. The overview needs no permission and leaves the same trace.
      if (scope === 'feedback' && !await supportGranted(db, shop.id, 'feedback')) throw new AdminError(403, 'SUPPORT_NOT_GRANTED');
      await closeOpen(db, principal.adminId, '', [], 'superseded');
      const token = randomBytes(32).toString('hex');
      const row = (await db.query(`WITH t AS (SELECT clock_timestamp() now)
        INSERT INTO admin_impersonation_sessions(token_hash,admin_id,admin_session_hash,shop_id,owner_user_id,scope,reason,created_at,expires_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,t.now,LEAST(t.now+$8*interval '1 minute',s.expires_at)
        FROM t, admin_auth_sessions s WHERE s.token_hash=$3 RETURNING id,expires_at`,
        [impersonationHash(token), principal.adminId, adminSessionHash(adminToken!), shop.id, ownerUserId, scope, reason, LIFETIME_MINUTES])).rows[0];
      await recordAdminAction(db, principal.adminId, { action: 'impersonation.start', shopId: shop.id, onBehalfOf: ownerUserId,
        detail: { session: row.id, scope, reason, expiresAt: (row.expires_at as Date).toISOString() } });
      return { sessionId: row.id as string, token, slug: shop.slug, scope, expiresAt: row.expires_at as Date };
    });
  }

  /** From the dashboard banner. Ending is harmless, so it needs only the impersonation token, even if expired. */
  async endByToken(token: string | undefined) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return transaction(this.pool, async db => {
      const row = (await db.query('SELECT admin_id FROM admin_impersonation_sessions WHERE token_hash=$1 AND ended_at IS NULL', [impersonationHash(token)])).rows[0];
      if (!row) return null;
      return (await closeOpen(db, row.admin_id, 'AND i.token_hash=$3', [impersonationHash(token)], 'ended'))[0] ?? null;
    });
  }

  /** From /gov: ends whatever this administrator still has open. */
  async endForAdmin(adminToken: string | undefined) {
    return transaction(this.pool, async db => {
      const principal = await authorizeAdmin(db, adminToken);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-impersonation:'||$1,0))", [principal.adminId]);
      return (await closeOpen(db, principal.adminId, '', [], 'ended'))[0] ?? null;
    });
  }
}
