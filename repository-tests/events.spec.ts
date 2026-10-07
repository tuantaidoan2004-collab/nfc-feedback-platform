import { applySchema } from './schema';
import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ownerFixture } from './owner-fixture';
import { PublishingResolver } from '../lib/publishing/repository';
import { ShopEvents } from '../lib/events/shop-events';
import { throughCard } from '../lib/events/ticket';

/**
 * Khúc B (05/10): /gov opens an organizer's event for a shop (`shop_events`), and the block shows on every live page of
 * that shop at once. The shop's owner does nothing; no page's configuration or release changes.
 */
const uri = 'postgresql://nfc_test@127.0.0.1:55439/nfc_repo_test';
if (process.env.NFC_TEST_DATABASE_URL !== uri) throw Error('Local test fixture required');
const TBQ = 'tbq-cong-cu';
type Fixture = Awaited<ReturnType<typeof ownerFixture>> & { adminId: string; gov: ShopEvents; resolver: PublishingResolver };
const test = base.extend<{ f: Fixture }>({ f: async ({}, provide) => {
  const schema = `nfc_events_test_${randomUUID().replaceAll('-', '')}`, root = new Pool({ connectionString: uri });
  const db = new Pool({ connectionString: uri, options: `-c search_path=${schema}`, max: 8 });
  try {
    await root.query(`CREATE SCHEMA ${schema}`); await applySchema(db);
    const fixture = await ownerFixture(db);
    const adminId = (await db.query("INSERT INTO platform_admins(username,password_salt,password_key)VALUES('tai',$1,$2)RETURNING id", ['0'.repeat(32), '0'.repeat(64)])).rows[0].id;
    await provide({ ...fixture, adminId, gov: new ShopEvents(db), resolver: new PublishingResolver(db) });
  } finally { await db.end(); await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.end(); }
} });
const audit = async (f: Fixture) => (await f.db.query("SELECT action,shop_id,detail FROM admin_audit WHERE action LIKE 'event.%' ORDER BY id")).rows;
const releases = async (f: Fixture) => (await f.db.query('SELECT count(*)::int n FROM page_releases')).rows[0].n;

test('/gov opens an event and every live page of that shop shows it at once; closing takes it off; nothing is republished', async ({ f }) => {
  const before = await releases(f), config = (await f.resolver.live({ slug: 'one' })).config;
  expect((await f.resolver.live({ slug: 'one' })).events).toEqual([]);

  await f.gov.set(f.adminId, { shopId: f.shops[0], event: TBQ, open: true });
  // Opening twice changes nothing and records nothing more.
  await f.gov.set(f.adminId, { shopId: f.shops[0], event: TBQ, open: true });
  const live = await f.resolver.live({ slug: 'one' });
  expect(live.events).toEqual([TBQ]);
  expect(live.shopSlug).toBe('one');
  // The shop's own page is exactly what it was: the block is not part of it.
  expect(live.config).toEqual(config);
  expect((await f.resolver.live({ slug: 'two' })).events).toEqual([]);
  expect((await f.gov.byShop()).get(f.shops[0])).toEqual([TBQ]);
  expect((await f.gov.byShop()).get(f.shops[1])).toBeUndefined();

  await f.gov.set(f.adminId, { shopId: f.shops[0], event: TBQ, open: false });
  expect((await f.resolver.live({ slug: 'one' })).events).toEqual([]);
  await f.gov.set(f.adminId, { shopId: f.shops[0], event: TBQ, open: true });
  expect((await f.resolver.live({ slug: 'one' })).events).toEqual([TBQ]);
  expect(await releases(f)).toBe(before);
  // The owner was asked for nothing and did nothing: no activity of theirs, no draft touched.
  expect((await f.db.query("SELECT count(*)::int n FROM shop_activity WHERE action LIKE 'event.%'")).rows[0].n).toBe(0);

  expect((await audit(f)).map(row => [row.action, row.shop_id, row.detail])).toEqual([
    ['event.open', f.shops[0], { event: TBQ }], ['event.close', f.shops[0], { event: TBQ }], ['event.open', f.shops[0], { event: TBQ }]]);
});

test('a guest who came through the shop\'s card is told apart from one on the plain link; a preview shows the block too', async ({ f }) => {
  await f.gov.set(f.adminId, { shopId: f.shops[0], event: TBQ, open: true });
  const tag = await f.admin.createTag(f.pages[0], 'fixture-card');
  await f.admin.setTagState(f.pages[0], tag, 'active');
  const card = await f.resolver.live({ code: 'fixture-card' }), link = await f.resolver.live({ slug: 'one' });
  expect(card.events).toEqual([TBQ]);
  expect(throughCard(card.context)).toBe(true);
  expect(throughCard(link.context)).toBe(false);
  const preview = await f.admin.preview(f.pages[0], { kind: 'draft', revision: 2 }, 900);
  const seen = await f.resolver.preview(preview.token);
  expect(seen.events).toEqual([TBQ]);
  expect(throughCard(seen.context)).toBe(false);
});

test('/gov takes exactly a shop, a known event and a yes or no', async ({ f }) => {
  const shopId = f.shops[0];
  for (const input of [null, [], {}, { shopId, event: TBQ }, { shopId, event: TBQ, open: 'yes' }, { shopId, event: 'khong-co', open: true },
    { shopId: 'one', event: TBQ, open: true }, { shopId, event: TBQ, open: true, by: 'x' }, { shopId, event: '__proto__', open: true }])
    await expect(f.gov.set(f.adminId, input), JSON.stringify(input)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(f.gov.set(f.adminId, { shopId: randomUUID(), event: TBQ, open: true })).rejects.toMatchObject({ code: 'SHOP_NOT_FOUND' });
  expect(await audit(f)).toEqual([]);
  await expect(f.db.query("INSERT INTO shop_events(shop_id,event_key) VALUES($1,'Bad Key')", [shopId])).rejects.toThrow();
});

test('a database built before the table existed keeps every guest page working: no event, and /gov says the table is missing', async ({ f }) => {
  await f.db.query('DROP TABLE shop_events');
  const live = await f.resolver.live({ slug: 'one' });
  expect(live.events).toEqual([]);
  expect(live.config.doc.sections.length).toBeGreaterThan(0);
  expect((await f.gov.byShop()).size).toBe(0);
  await expect(f.gov.set(f.adminId, { shopId: f.shops[0], event: TBQ, open: true })).rejects.toMatchObject({ code: 'EVENTS_TABLE_MISSING' });
});
