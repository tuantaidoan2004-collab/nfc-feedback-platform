import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { PublishingError, TEMPLATE_V1, validateConfig } from './config';
import { assertPublishable } from './policy';
import { PROFILE_COLUMNS, profileFrom, withProfile } from './profile';
import type { RenderContext } from './proof';
export const previewHash = (token: string) => createHash('sha256').update(`nfc-preview-v1\0${token}`).digest('hex');
export type AuthorizePublishing = (request: { action: string; shopId?: string }) => Promise<{ actorId: string }>;
const error = (code: string): never => { throw new PublishingError(code); };
const revision = (n: number) => { if (!Number.isSafeInteger(n) || n < 1 || n >= Number.MAX_SAFE_INTEGER) error('INVALID_REVISION'); };
/**
 * A pool opens its own transaction; a client means the caller already has one and wants this work inside it, so the
 * caller decides what commits together. That is how a page change and the record of who made it become one unit
 * (F-011). The two are told apart by `release`, which only a checked-out client has -- a client has `connect` too,
 * inherited from the plain Client it is, and calling it says "already connected".
 */
export type PublishingDb = Pool | PoolClient;
const borrowed = (db: PublishingDb): db is PoolClient => typeof (db as PoolClient).release === 'function';
async function tx<T>(pool: PublishingDb, run: (db: PoolClient) => Promise<T>): Promise<T> {
  if (borrowed(pool)) return run(pool);
  const db = await pool.connect(); try { await db.query('BEGIN'); const result = await run(db); await db.query('COMMIT'); return result; }
  catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
/** INTERNAL boundary. Caller must supply real authorization later. No administrative HTTP routes in this slice. */
export class PublishingAdmin {
  constructor(private pool: PublishingDb, private authorize: AuthorizePublishing) {}
  private async actor(action: string, shopId?: string) {
    const principal = await this.authorize({ action, shopId });
    if (!principal?.actorId?.trim()) error('PUBLISH_FORBIDDEN'); return principal.actorId;
  }
  async createTemplate(templateKey: string, version: number) {
    await this.actor('template:create'); if (!/^[a-z][a-z0-9-]{0,63}$/.test(templateKey) || !Number.isSafeInteger(version) || version < 1) error('INVALID_TEMPLATE');
    return (await this.pool.query(`INSERT INTO template_versions(template_key,version,schema_version,renderer_version,capabilities) VALUES($1,$2,1,'1',$3) RETURNING id`,
      [templateKey, version, JSON.stringify(TEMPLATE_V1.capabilities)])).rows[0].id as string;
  }
  async createDraft(shopId: string, templateId: string, input: unknown) {
    await this.actor('draft:create', shopId); const config = validateConfig(input); assertPublishable(config);
    await this.pool.query('INSERT INTO page_drafts(shop_id,template_version_id,config) VALUES($1,$2,$3)', [shopId, templateId, config]); return 1;
  }
  async saveDraft(shopId: string, expected: number, input: unknown) {
    // The product's Google rules are checked where a shop writes, never where a page is read: a rule added today
    // must not take a page published yesterday off the air (lát F-013).
    await this.actor('draft:save', shopId); revision(expected); const config = validateConfig(input); assertPublishable(config);
    const result = await this.pool.query('UPDATE page_drafts SET config=$3,revision=revision+1 WHERE shop_id=$1 AND revision=$2 RETURNING revision', [shopId, expected, config]);
    if (!result.rowCount) error('DRAFT_CONFLICT'); return Number(result.rows[0].revision);
  }
  async publish(shopId: string, expected: number) {
    const actor = await this.actor('release:publish', shopId); revision(expected);
    return tx(this.pool, async db => {
      const shop = (await db.query('SELECT publishing_state FROM shops WHERE id=$1 FOR UPDATE', [shopId])).rows[0];
      if (!shop) error('SHOP_NOT_FOUND'); if (shop.publishing_state === 'suspended') error('SHOP_SUSPENDED');
      const draft = (await db.query('SELECT * FROM page_drafts WHERE shop_id=$1 FOR UPDATE', [shopId])).rows[0];
      if (!draft || Number(draft.revision) !== expected) error('DRAFT_CONFLICT');
      // Checked again on the way out: a draft written before this rule existed cannot be published under it.
      const config = validateConfig(draft.config); assertPublishable(config);
      const release = (await db.query(`INSERT INTO page_releases(shop_id,template_version_id,config_snapshot,draft_revision,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`, [shopId, draft.template_version_id, config, expected, actor])).rows[0].id;
      // Nửa còn lại của migration 022: phát hành cũng ghi phần nội dung xuống hồ sơ TÀI KHOẢN.
      // Thiếu bước này thì trình chỉnh trang đứt mạch — chủ quán sửa tên, bấm phát hành, và trang khách vẫn
      // hiện tên cũ, vì trình chỉnh ghi vào bản chụp còn trang khách đọc từ hồ sơ. Ghi ở đây, trong cùng
      // transaction với bản phát hành, nên hai bên không bao giờ lệch nhau.
      await db.query(`INSERT INTO shop_profile(shop_id,name,google_url,question_vi,question_en,links,logo,poster)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(shop_id) DO UPDATE SET name=EXCLUDED.name,google_url=EXCLUDED.google_url,
          question_vi=EXCLUDED.question_vi,question_en=EXCLUDED.question_en,links=EXCLUDED.links,
          logo=EXCLUDED.logo,poster=EXCLUDED.poster,updated_at=clock_timestamp()`,
        [shopId, config.name, config.googleUrl, config.text.question.vi, config.text.question.en,
         JSON.stringify(config.links), config.logo ? JSON.stringify(config.logo) : null,
         config.poster ? JSON.stringify(config.poster) : null]);
      await db.query("UPDATE shops SET active_release_id=$2,publishing_state='active' WHERE id=$1", [shopId, release]);
      await db.query('UPDATE page_drafts SET revision=revision+1 WHERE shop_id=$1', [shopId]);
      return { releaseId: release as string, draftRevision: expected + 1 };
    });
  }
  async rollback(shopId: string, releaseId: string, expectedActive: string) {
    await this.actor('release:rollback', shopId);
    const result = await this.pool.query('UPDATE shops SET active_release_id=$2 WHERE id=$1 AND active_release_id=$3 RETURNING id', [shopId, releaseId, expectedActive]);
    if (!result.rowCount) error('RELEASE_CONFLICT');
  }
  async setShopState(shopId: string, state: 'active' | 'suspended') {
    await this.actor('shop:state', shopId); if (!['active','suspended'].includes(state)) error('INVALID_STATE');
    if (!(await this.pool.query('UPDATE shops SET publishing_state=$2 WHERE id=$1', [shopId, state])).rowCount) error('SHOP_NOT_FOUND');
  }
  async createTag(shopId: string, publicCode: string) {
    await this.actor('tag:create', shopId);
    return (await this.pool.query('INSERT INTO tags(shop_id,public_code) VALUES($1,$2) RETURNING id', [shopId, publicCode])).rows[0].id as string;
  }
  async setTagState(shopId: string, tagId: string, state: 'tested' | 'active' | 'disabled', previewId?: string) {
    await this.actor('tag:state', shopId); if (!['tested','active','disabled'].includes(state)) error('INVALID_STATE');
    await tx(this.pool, async db => {
      const shop = (await db.query('SELECT * FROM shops WHERE id=$1 FOR SHARE', [shopId])).rows[0];
      if (!shop) error('SHOP_NOT_FOUND');
      if (state === 'active' && (shop.publishing_state !== 'active' || !shop.active_release_id)) error('SHOP_UNAVAILABLE');
      if (state === 'tested' && !(await db.query(`SELECT 1 FROM published_visit_contexts c JOIN rating_intent_receipts r ON r.visit_id=c.visit_id
        WHERE c.shop_id=$1 AND c.tag_id=$2 AND c.preview_id=$3 AND c.scope='test' LIMIT 1`, [shopId, tagId, previewId])).rowCount) error('TAG_TEST_REQUIRED');
      if (!(await db.query('UPDATE tags SET state=$3 WHERE shop_id=$1 AND id=$2', [shopId, tagId, state])).rowCount) error('TAG_NOT_FOUND');
    });
  }
  async preview(shopId: string, source: { kind: 'draft'; revision: number } | { kind: 'release'; id: string }, ttlSeconds = 900, tagId: string | null = null) {
    await this.actor('preview:create', shopId);
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) error('INVALID_EXPIRY');
    return tx(this.pool, async db => {
      const row = source.kind === 'draft'
        ? (await db.query('SELECT template_version_id,config AS config_snapshot,revision FROM page_drafts WHERE shop_id=$1 AND revision=$2 FOR SHARE', [shopId, source.revision])).rows[0]
        : (await db.query('SELECT template_version_id,config_snapshot FROM page_releases WHERE shop_id=$1 AND id=$2', [shopId, source.id])).rows[0];
      if (!row) error('PREVIEW_SOURCE_CONFLICT'); const config = validateConfig(row.config_snapshot);
      const token = randomBytes(32).toString('hex');
      const created = (await db.query(`INSERT INTO preview_sessions(shop_id,template_version_id,config_snapshot,source_release_id,source_draft_revision,tag_id,token_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+$8*interval '1 second') RETURNING id,expires_at`,
        [shopId, row.template_version_id, config, source.kind === 'release' ? source.id : null, source.kind === 'draft' ? source.revision : null, tagId, previewHash(token), ttlSeconds])).rows[0];
      // Returned ONLY to internal authorized caller for out-of-band delivery. Never log/URL/API JSON this token.
      return { id: created.id as string, token, expiresAt: created.expires_at as Date };
    });
  }
}
export class PublishingResolver {
  constructor(private pool: Pool) {}
  async live(target: { slug: string } | { code: string }) {
    // Hồ sơ tài khoản đi kèm trong cùng một truy vấn: nội dung là của tài khoản, diện mạo là của bản chụp
    // (migration 022). LEFT JOIN vì một shop có thể chưa có hàng hồ sơ — lúc đó bản chụp tự lo lấy.
    const row = 'slug' in target
      ? (await this.pool.query(`SELECT s.id,s.slug,s.publishing_state,s.active_release_id,r.config_snapshot,tv.template_key,NULL::uuid tag_id,${PROFILE_COLUMNS} FROM shops s
        JOIN page_releases r ON r.shop_id=s.id AND r.id=s.active_release_id JOIN template_versions tv ON tv.id=r.template_version_id
        LEFT JOIN shop_profile pr ON pr.shop_id=s.id WHERE lower(s.slug)=lower($1)`, [target.slug])).rows[0]
      : (await this.pool.query(`SELECT s.id,s.slug,s.publishing_state,s.active_release_id,r.config_snapshot,tv.template_key,t.id tag_id,t.state tag_state,${PROFILE_COLUMNS} FROM tags t
        JOIN shops s ON s.id=t.shop_id JOIN page_releases r ON r.shop_id=s.id AND r.id=s.active_release_id JOIN template_versions tv ON tv.id=r.template_version_id
        LEFT JOIN shop_profile pr ON pr.shop_id=s.id WHERE t.public_code=$1`, [target.code])).rows[0];
    if (!row || row.publishing_state !== 'active' || ('code' in target && row.tag_state !== 'active')) error('PAGE_UNAVAILABLE');
    const context: RenderContext = { v: 1, shopId: row.id, releaseId: row.active_release_id, tagId: row.tag_id, previewId: null, scope: 'live', entryKey: row.tag_id ? `tag:${row.tag_id}` : 'direct:shop' };
    // The template key travels with the page so the skin can dress each skeleton; it never changes the DOM.
    return { slug: row.slug as string, template: row.template_key as string, config: withProfile(validateConfig(row.config_snapshot), profileFrom(row)), context };
  }
  async preview(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) error('PREVIEW_UNAVAILABLE');
    const row = (await this.pool.query(`SELECT p.*,s.slug,s.publishing_state,t.state tag_state,tv.template_key FROM preview_sessions p JOIN shops s ON s.id=p.shop_id
      JOIN template_versions tv ON tv.id=p.template_version_id LEFT JOIN tags t ON t.shop_id=p.shop_id AND t.id=p.tag_id WHERE p.token_hash=$1 AND p.expires_at>clock_timestamp()`, [previewHash(token)])).rows[0];
    if (!row || row.publishing_state === 'suspended' || row.tag_state === 'disabled') error('PREVIEW_UNAVAILABLE');
    const context: RenderContext = { v: 1, shopId: row.shop_id, releaseId: row.source_release_id, tagId: row.tag_id, previewId: row.id, scope: 'test', entryKey: `preview:${row.id}` };
    // Xem trước KHÔNG ghép hồ sơ tài khoản, có chủ ý: nó tồn tại để chủ quán thấy **đúng bản nháp sắp phát
    // hành**. Ghép hồ sơ vào đây thì sửa tên xong xem trước vẫn ra tên cũ, và cái nút xem trước mất nghĩa.
    // Hồ sơ chỉ ghép ở `live()`; và `publish()` ghi nội dung xuống hồ sơ, nên hai đường gặp nhau lúc phát hành.
    return { slug: row.slug as string, template: row.template_key as string, config: validateConfig(row.config_snapshot), context, expiresAt: row.expires_at as Date };
  }
}
