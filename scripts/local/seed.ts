// Data for the local app (scripts/local.mjs): the administrator's second factor, one owner, and the one real shop -- the
// shop the Google Maps review tool on this machine follows, with its real reviews. No sample shop and no invented visits
// or feedback any more (Tài 05/10: "bỏ cái quán mẫu đi, từ giờ chỉ sài tool trên dashboard thôi"). Idempotent. Local
// only -- the passwords below are throwaway values for 127.0.0.1 and are printed by `node scripts/local.mjs`.
import pg from 'pg';
import { OwnerAuth } from '@/lib/owner/auth';
import { seal, fromBase32 } from '@/lib/admin/totp';
import { fetchMaps, GoogleBusiness, mapsSettings } from '@/lib/google/business';

export const LOCAL = { admin: 'tai', adminPassword: 'local-admin-password', owner: 'chuquan', ownerPassword: 'local-owner-password',
  totp: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' };

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (!(await db.query('SELECT 1 FROM owner_identities_v2 WHERE username=$1', [LOCAL.owner])).rowCount) {
    await new OwnerAuth(db).bootstrap(LOCAL.owner, LOCAL.ownerPassword, async () => {});
    console.log('Seed: owner created.');
  }
  await mapsShop();
  // The administrator goes in through scripts/bootstrap-admin.mjs (scripts/local.mjs runs it); here only the second
  // factor, with a fixed secret so `node scripts/local.mjs code` can print the current six digits.
  await db.query('UPDATE platform_admins SET totp_secret=$2,totp_enrolled_at=coalesce(totp_enrolled_at,clock_timestamp()) WHERE username=$1 AND totp_secret IS NULL',
    [LOCAL.admin, seal(fromBase32(LOCAL.totp))]);
} finally { await db.end(); }

/**
 * The shop the Google Maps review tool follows (scripts/local.mjs sets NFC_MAPS_* when ~/MAps is there): named as the tool
 * names it, owned by the local owner, connected to the tool's real reviews. None of it is in this repository: the name
 * comes from the tool, the reviews stay in the local database. Without the tool the owner has no shop and /app opens the
 * onboarding, as for anyone who signs up.
 */
async function mapsShop() {
  const tool = mapsSettings(process.env);
  if (!tool?.url) { console.log('Seed: no Google Maps tool (~/MAps) on this machine, so no shop.'); return; }
  const asked = { url: tool.url, key: tool.key };
  if (!(await db.query('SELECT 1 FROM shops WHERE slug=$1', [tool.shop])).rowCount) {
    const pulled = await fetchMaps(asked).catch(() => null);
    if (!pulled) { console.log('Seed: Google Maps tool not answering on', tool.url, '-- its shop is made on the next start.'); return; }
    const shop = (await db.query("INSERT INTO shops(slug,name,publishing_state)VALUES($1,$2,'active')RETURNING id", [tool.shop, pulled.title ?? 'Quán trên Google Maps'])).rows[0].id;
    const owner = (await db.query('SELECT id FROM owner_identities_v2 WHERE username=$1', [LOCAL.owner])).rows[0].id;
    await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')", [owner, shop]);
  }
  if ((await db.query('SELECT 1 FROM google_business_connections c JOIN shops s ON s.id=c.shop_id WHERE s.slug=$1', [tool.shop])).rowCount) return;
  const login = await new OwnerAuth(db).login(LOCAL.owner, LOCAL.ownerPassword);
  await new GoogleBusiness(db, process.env).connectMaps(login.token, tool.shop)
    .then(result => console.log(`Seed: ${result.synced} Google reviews from the Google Maps tool.`))
    .catch(error => console.log('Seed: Google Maps tool skipped:', error.code ?? error.message));
}
