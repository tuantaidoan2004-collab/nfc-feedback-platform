import type { Pool, PoolClient } from 'pg';
import { AdminError } from './auth';

/**
 * Append-only record of administrative work. Write it inside the same transaction as the action it describes,
 * so an action can never succeed without leaving a trace.
 *
 * `onBehalfOf` marks work an administrator did while standing in for an owner. Recording that separately keeps
 * the owner's own history honest: without it, a support edit is indistinguishable from the owner's own edit.
 */
export type AdminAction = {
  action: string;
  shopId?: string | null;
  onBehalfOf?: string | null;
  detail?: Record<string, unknown>;
};

const ACTION = /^[a-z][a-z0-9_.]{2,63}$/;

export async function recordAdminAction(db: Pool | PoolClient, actorId: string, entry: AdminAction) {
  if (!ACTION.test(entry.action)) throw new AdminError(400, 'INVALID_AUDIT_ACTION');
  const detail = entry.detail ?? {};
  // The column caps this too; failing here names the problem instead of surfacing a constraint violation.
  if (Buffer.byteLength(JSON.stringify(detail)) > 4096) throw new AdminError(400, 'AUDIT_DETAIL_TOO_LARGE');
  await db.query('INSERT INTO admin_audit(actor_id,action,shop_id,on_behalf_of,detail)VALUES($1,$2,$3,$4,$5)',
    [actorId, entry.action, entry.shopId ?? null, entry.onBehalfOf ?? null, JSON.stringify(detail)]);
}
