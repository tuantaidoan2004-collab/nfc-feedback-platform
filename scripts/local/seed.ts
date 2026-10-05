// Data for the local app (scripts/local.mjs): the administrator's second factor, one owner and one empty shop -- no page,
// no invented visits or reviews (Tài 05/10: "bỏ cái quán mẫu đi, từ giờ chỉ sài tool trên dashboard thôi"). The shop's
// Google reviews come only from the Google Maps tool, after its link is pasted in Data. Idempotent. Local only -- the
// passwords below are throwaway values for 127.0.0.1 and are printed by `node scripts/local.mjs`.
import pg from 'pg';
import { OwnerAuth } from '@/lib/owner/auth';
import { seal, fromBase32 } from '@/lib/admin/totp';

export const LOCAL = { admin: 'tai', adminPassword: 'local-admin-password', owner: 'chuquan', ownerPassword: 'local-owner-password',
  totp: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', slug: 'chuquan' };

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (!(await db.query('SELECT 1 FROM owner_identities_v2 WHERE username=$1', [LOCAL.owner])).rowCount) {
    const owner = await new OwnerAuth(db).bootstrap(LOCAL.owner, LOCAL.ownerPassword, async () => {});
    const shop = (await db.query("INSERT INTO shops(slug,name,publishing_state)VALUES($1,$2,'active')RETURNING id", [LOCAL.slug, `Quán của @${LOCAL.owner}`])).rows[0].id;
    await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')", [owner, shop]);
    console.log('Seed: owner and an empty shop created.');
  }
  // The administrator goes in through scripts/bootstrap-admin.mjs (scripts/local.mjs runs it); here only the second
  // factor, with a fixed secret so `node scripts/local.mjs code` can print the current six digits.
  await db.query('UPDATE platform_admins SET totp_secret=$2,totp_enrolled_at=coalesce(totp_enrolled_at,clock_timestamp()) WHERE username=$1 AND totp_secret IS NULL',
    [LOCAL.admin, seal(fromBase32(LOCAL.totp))]);
} finally { await db.end(); }
