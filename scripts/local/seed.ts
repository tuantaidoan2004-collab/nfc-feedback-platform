// Sample data for the local app (scripts/local.mjs): one administrator, one owner, one shop with a published page and a
// few pieces of private feedback. Idempotent: a database that already has the sample shop is left alone. Local only --
// the passwords below are throwaway values for 127.0.0.1 and are printed by `node scripts/local.mjs`.
import pg from 'pg';
import { PublishingAdmin, templateVersionRow } from '@/lib/publishing/repository';
import { DEFAULT_TEMPLATE, pageFromTemplate } from '@/lib/canvas/templates';
import { pageLabel } from '@/lib/owner/page-names';
import { OwnerAuth } from '@/lib/owner/auth';
import { seal, fromBase32 } from '@/lib/admin/totp';
import { PublishingResolver } from '@/lib/publishing/repository';
import { VisitRatingRepository } from '@/lib/repositories/visit-ratings';
import { publishingVisitPolicy } from '@/lib/publishing/visit-policy';
import { GoogleBusiness } from '@/lib/google/business';
import { createHash, randomUUID } from 'node:crypto';

export const LOCAL = { admin: 'tai', adminPassword: 'local-admin-password', owner: 'chuquan', ownerPassword: 'local-owner-password',
  totp: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', slug: 'quan-mau' };

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if ((await db.query('SELECT 1 FROM shops WHERE slug=$1', [LOCAL.slug])).rowCount) { console.log('Seed: sample data already there.'); }
  else {
    const shop = (await db.query("INSERT INTO shops(slug,name,google_url)VALUES($1,'Quán Mẫu','https://maps.google.com/')RETURNING id", [LOCAL.slug])).rows[0].id;
    const admin = new PublishingAdmin(db, async () => ({ actorId: 'local-seed' }));
    // The sample shop's page is a copy of the default template, with the shop's name in it (lib/canvas/templates.ts).
    const page = await admin.createPage(shop, await templateVersionRow(db, DEFAULT_TEMPLATE), pageFromTemplate(DEFAULT_TEMPLATE, 'Quán Mẫu'), LOCAL.slug, pageLabel(0));
    await admin.publish(page, 1);
    const owner = await new OwnerAuth(db).bootstrap(LOCAL.owner, LOCAL.ownerPassword, async () => {});
    await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')", [owner, shop]);
    await experience(5, null);
    await experience(2, 'Cà phê hôm nay hơi nguội, nhân viên vẫn dễ thương.');
    await experience(null, 'Quán nên mở cửa sớm hơn vào cuối tuần.');
    console.log('Seed: shop, page, owner and three experiences created.');
  }
  await history();
  // The administrator goes in through scripts/bootstrap-admin.mjs (scripts/local.mjs runs it); here only the second
  // factor, with a fixed secret so `node scripts/local.mjs code` can print the current six digits.
  await db.query('UPDATE platform_admins SET totp_secret=$2,totp_enrolled_at=coalesce(totp_enrolled_at,clock_timestamp()) WHERE username=$1 AND totp_secret IS NULL',
    [LOCAL.admin, seal(fromBase32(LOCAL.totp))]);
} finally { await db.end(); }

/**
 * One guest's visit to the sample shop: stars, words, or both, through the same path a real card takes. Its own, not the test
 * fixture's: the app's production build type-checks this file, and a copy of the app holds no tests (integration-tests/run-local.mjs).
 */
async function experience(score: number | null, words: string | null) {
  const c = (await new PublishingResolver(db).live({ slug: LOCAL.slug })).context;
  const hash = createHash('sha256').update(randomUUID()).digest('hex'), repo = new VisitRatingRepository(db, undefined, publishingVisitPolicy(c));
  const v = await repo.registerVisit(c, randomUUID(), 'load', hash);
  if (score !== null) await repo.recordRating({ ...c, visitId: v.visit.visitId }, { intentId: randomUUID(), expectedRevision: 0, score }, hash);
  if (words) await repo.recordPrivateFeedback({ ...c, visitId: v.visit.visitId }, { intentId: randomUUID(), expectedRevision: score === null ? 0 : 1, topic: 'other', message: words }, hash);
}

/**
 * Forty days of a believable shop (05/10, for the Dashboard): a few opens a day, about four in ten tap Google, some leave
 * stars or a private line, and Google Business connected to its sample reviews. Same numbers every time (fixed seed);
 * added once, while the sample shop has fewer than twenty opens.
 */
async function history() {
  const shop = (await db.query('SELECT id FROM shops WHERE slug=$1', [LOCAL.slug])).rows[0].id as string;
  if ((await db.query("SELECT count(*)::int n FROM page_visits WHERE shop_id=$1 AND scope='live'", [shop])).rows[0].n >= 20) return;
  let seed = 20261005;
  const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2 ** 32; };
  const lines = ['Nước ngon, nhưng chờ hơi lâu vào buổi trưa.', 'Bạn thu ngân rất dễ thương!', 'Wifi yếu quá, mong quán nâng cấp.',
    'Ghế ngồi ngoài hiên hơi nóng.', 'Bánh hôm nay hơi khô.', 'Nhạc to quá, khó nói chuyện.'];
  const c = (await new PublishingResolver(db).live({ slug: LOCAL.slug })).context;
  const now = Date.now();
  for (let day = 40; day >= 0; day--) {
    const opens = 1 + Math.floor(rand() * (day < 28 ? 9 : 5));
    for (let i = 0; i < opens; i++) {
      const at = new Date(now - day * 86400000 - Math.floor(rand() * 12) * 3600000 - Math.floor(rand() * 3600000));
      if (at.getTime() > now) continue;
      const hash = createHash('sha256').update(randomUUID()).digest('hex');
      const repo = new VisitRatingRepository(db, () => at, publishingVisitPolicy(c));
      const v = await repo.registerVisit(c, randomUUID(), 'load', hash);
      const roll = rand();
      if (roll < 0.42) await db.query(`INSERT INTO page_events(shop_id,scope,entry_key,session_id,visit_id,name,at,since_open_ms)
        VALUES($1,'live',$2,$3,$4,'google_tapped',$5,$6)`, [shop, c.entryKey, v.visit.sessionId, v.visit.visitId, new Date(at.getTime() + 9000), 3000 + Math.floor(rand() * 14000)]);
      else if (roll < 0.62) {
        const score = rand() < 0.75 ? 5 : 1 + Math.floor(rand() * 4), words = rand() < 0.45 ? lines[Math.floor(rand() * lines.length)] : null;
        await repo.recordRating({ ...c, visitId: v.visit.visitId }, { intentId: randomUUID(), expectedRevision: 0, score }, hash);
        if (words) await repo.recordPrivateFeedback({ ...c, visitId: v.visit.visitId }, { intentId: randomUUID(), expectedRevision: 1, topic: 'other', message: words }, hash);
      }
    }
  }
  // The page went live before its first opens, as it would have. Releases are immutable (a trigger); this local-only
  // backdating steps around it for one transaction, as the database's owner.
  const client = await db.connect();
  try {
    await client.query('BEGIN'); await client.query('SET LOCAL session_replication_role=replica');
    await client.query("UPDATE page_releases SET created_at=clock_timestamp()-interval '41 days' WHERE shop_id=$1", [shop]);
    await client.query('COMMIT');
  } finally { client.release(); }
  const login = await new OwnerAuth(db).login(LOCAL.owner, LOCAL.ownerPassword);
  await new GoogleBusiness(db, process.env).connectSimulated(login.token, LOCAL.slug).catch(error => console.log('Seed: Google Business sample skipped:', error.code ?? error.message));
  console.log('Seed: forty days of opens, Google taps, feedback and sample Google reviews added.');
}
