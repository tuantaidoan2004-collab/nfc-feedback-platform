import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';
import { saveShopDetails, ShopDetailsError } from './shop-details';
import { PublishingAdmin, PublishingError, templateVersionRow } from '../publishing/repository';
import { validateConfig, type PageConfig } from '../publishing/config';
import { canvasTemplate, pageFromTemplate } from '../canvas/templates';
import { turnKnobs, type Choice } from '../canvas/knobs';
import { bindShop } from '../canvas/slots';
import { parseProfile, readProfile, type ShopProfile } from '../shop/profile';
import { parsePlaceId } from '../google/place-id';
import { presignObject, storageSettings, type StorageSettings } from '../media/storage';
import type { PageDoc, Words } from '../canvas/doc';

/**
 * Bàn dựng (Tài 06/10, kịch bản 9b): everything about one "Nhờ Admin Tài dựng" request on one screen of /gov, made to work from
 * Tài's phone while he talks to the shop on Zalo -- and written as a feature, because it later becomes the owner's own.
 *
 *   notes     what the shop wrote (pasted from Zalo), Tài's own notes, Claude's summaries: an append-only log
 *   files     pictures, logo and clips of the shop, dropped here by Tài, so already approved (he chose them)
 *   knobs     the template's knobs as turned (lib/canvas/knobs.ts), applied to the page's draft
 *   details   the shop's name, details and Place ID waiting to be saved: they show on every live page the moment they are
 *             saved, so they are saved together with the publish, after the same checks scripts/sua-trang.mjs makes
 *   preview   a link for the shop to see the draft on its phone (kept as a hash; 7 days; dead once the request is closed)
 *
 * Nothing here publishes on its own: Claude's proposals (desk-claude.ts) land in the draft, and only Tài's "Phát hành" goes live.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bad = (code = 'INVALID_INPUT'): never => { throw new AdminError(400, code); };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clean = (text: string) => text.replace(/[<>]/g, '').replace(/\r\n?/g, '\n').trim();
export const PREVIEW_DAYS = 7;
const previewHash = (token: string) => createHash('sha256').update(`nfc-desk-preview\0${token}`).digest('hex');

export type DeskFile = { mediaId: string; url: string; kind: 'image' | 'video'; role: 'logo' | 'anh' | 'video'; name: string };
export type DeskNote = { id: string; who: 'khach' | 'tai' | 'claude'; body: string; at: string };
export type DeskDetails = { name?: string; profile?: ShopProfile; placeId?: string };
export type Desk = {
  request: { id: string; contact: string; message: string | null; createdAt: string; contactedAt: string | null; templateKey: string | null };
  shop: { id: string; slug: string; name: string; profile: ShopProfile; placeId: string | null; hasGoogle: boolean };
  page: { id: string; slug: string; label: string | null; state: string };
  draft: { revision: number; config: PageConfig; templateKey: string };
  notes: DeskNote[]; files: DeskFile[];
  knobs: Choice; details: DeskDetails | null; claude: unknown; previewUntil: string | null;
};

/** The shop as the page will show it once the waiting details are saved: what the preview and Claude both work from. */
export function deskShop(desk: Pick<Desk, 'shop' | 'details'>) {
  return { name: desk.details?.name ?? desk.shop.name, profile: desk.details?.profile ?? desk.shop.profile };
}
/** The draft as the shop's guests would see it after "Phát hành": the waiting details in their places, empty ones hidden. */
export const deskDoc = (desk: Pick<Desk, 'shop' | 'details' | 'draft'>): PageDoc => bindShop(desk.draft.config.doc, deskShop(desk), 'live');

const TYPES = new Map<string, { kind: 'image' | 'video'; ext: string; max: number; magic: (b: Buffer) => boolean }>([
  ['image/jpeg', { kind: 'image', ext: 'jpg', max: 5 << 20, magic: b => b[0] === 0xff && b[1] === 0xd8 }],
  ['image/png', { kind: 'image', ext: 'png', max: 5 << 20, magic: b => b.subarray(1, 4).toString() === 'PNG' }],
  ['image/webp', { kind: 'image', ext: 'webp', max: 5 << 20, magic: b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' }],
  // A clip passes through this app (no signed link to the store from the browser), so it is held under Vercel's body limit.
  ['video/mp4', { kind: 'video', ext: 'mp4', max: 4 << 20, magic: b => b.subarray(4, 8).toString() === 'ftyp' }],
]);

export class EditDesk {
  constructor(private pool: Pool, private store: StorageSettings | null = storageSettings(), private fetcher: typeof fetch = fetch) {}

  async load(id: unknown, db: Pool | PoolClient = this.pool): Promise<Desk> {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(404, 'NOT_FOUND');
    const row = (await db.query(`SELECT e.id,e.contact,e.message,e.created_at,e.contacted_at,e.template_key,s.id shop_id,s.slug shop_slug,s.name shop_name,s.profile,
        s.place_id,s.google_url,p.id page_id,p.slug page_slug,p.label,p.state,d.revision,d.config,tv.template_key draft_template,
        k.knobs,k.details,k.claude,k.preview_expires_at
      FROM edit_requests e JOIN shops s ON s.id=e.shop_id JOIN pages p ON p.shop_id=e.shop_id AND p.id=e.page_id
      JOIN page_drafts d ON d.shop_id=e.shop_id AND d.page_id=e.page_id JOIN template_versions tv ON tv.id=d.template_version_id
      LEFT JOIN edit_desks k ON k.request_id=e.id WHERE e.id=$1 AND e.handled_at IS NULL`, [id])).rows[0];
    if (!row) throw new AdminError(404, 'NOT_FOUND');
    const notes = (await db.query('SELECT id,who,body,created_at FROM edit_request_notes WHERE request_id=$1 ORDER BY created_at,id', [id])).rows;
    const files = (await db.query(`SELECT m.id,m.url,m.kind,f.role,f.name FROM edit_request_files f JOIN media_assets m ON m.id=f.media_id
      WHERE f.request_id=$1 AND m.state='approved' ORDER BY f.created_at`, [id])).rows;
    return {
      request: { id: row.id, contact: row.contact, message: row.message, createdAt: new Date(row.created_at).toISOString(),
        contactedAt: row.contacted_at ? new Date(row.contacted_at).toISOString() : null, templateKey: row.template_key },
      shop: { id: row.shop_id, slug: row.shop_slug, name: row.shop_name, profile: readProfile(row.profile), placeId: row.place_id,
        hasGoogle: !!row.google_url && row.google_url !== 'https://maps.google.com/' },
      page: { id: row.page_id, slug: row.page_slug, label: row.label, state: row.state },
      draft: { revision: Number(row.revision), config: validateConfig(row.config), templateKey: row.draft_template },
      notes: notes.map(n => ({ id: n.id, who: n.who, body: n.body, at: new Date(n.created_at).toISOString() })),
      files: files.map(f => ({ mediaId: f.id, url: f.url, kind: f.kind, role: f.role, name: f.name })),
      knobs: row.knobs ?? {}, details: row.details ? readDetails(row.details) : null, claude: row.claude ?? null,
      previewUntil: row.preview_expires_at && new Date(row.preview_expires_at) > new Date() ? new Date(row.preview_expires_at).toISOString() : null,
    };
  }

  /** Every change from the screen. Each runs in one transaction with its audit line, and answers with the desk as it now is. */
  /** After "Phát hành" the request is closed and there is no desk left: `desk` is null. */
  async act(adminId: string, id: unknown, body: unknown): Promise<{ desk: Desk | null; preview?: string }> {
    if (!isObj(body) || typeof body.op !== 'string') bad();
    const input = body as Record<string, unknown>;
    let preview: string | null = null;
    await transaction(this.pool, async db => {
      const desk = await this.load(id, db);
      await db.query('INSERT INTO edit_desks(request_id) VALUES($1) ON CONFLICT DO NOTHING', [desk.request.id]);
      await db.query('SELECT 1 FROM edit_desks WHERE request_id=$1 FOR UPDATE', [desk.request.id]);
      const core = new PublishingAdmin(db, async () => ({ actorId: `admin:${adminId}` })), ref = { shopId: desk.shop.id, pageId: desk.page.id };
      const log = (action: string, detail: Record<string, unknown> = {}) =>
        recordAdminAction(db, adminId, { action: `page.desk.${action}`, shopId: desk.shop.id, detail: { request: desk.request.id, page: desk.page.id, ...detail } });
      const fail = (error: unknown): never => {
        if (error instanceof PublishingError) throw new AdminError(409, error.code);
        if (error instanceof ShopDetailsError) throw new AdminError(409, error.at ? `${error.code}:${error.at}` : error.code);
        throw error;
      };
      switch (input.op) {
        case 'note': {
          if (input.who !== 'khach' && input.who !== 'tai') bad();
          const text = typeof input.body === 'string' ? clean(input.body) : '';
          if (!text || text.length > 6000) bad();
          await db.query('INSERT INTO edit_request_notes(request_id,who,body) VALUES($1,$2,$3)', [desk.request.id, input.who, text]);
          if (input.who === 'khach') await db.query('UPDATE edit_requests SET contacted_at=COALESCE(contacted_at,clock_timestamp()) WHERE id=$1', [desk.request.id]);
          break;
        }
        case 'file': {
          if (typeof input.mediaId !== 'string' || !desk.files.some(f => f.mediaId === input.mediaId)) bad();
          if (input.remove === true) await db.query('DELETE FROM edit_request_files WHERE request_id=$1 AND media_id=$2', [desk.request.id, input.mediaId]);
          else {
            if (!['logo', 'anh', 'video'].includes(input.role as string)) bad();
            await db.query('UPDATE edit_request_files SET role=$3 WHERE request_id=$1 AND media_id=$2', [desk.request.id, input.mediaId, input.role]);
          }
          break;
        }
        case 'template': {
          const key = typeof input.key === 'string' && canvasTemplate(input.key) ? input.key : bad('INVALID_TEMPLATE');
          await core.restartDraft(ref, await templateVersionRow(db, key), pageFromTemplate(key, deskShop(desk).name)).catch(fail);
          await db.query("UPDATE edit_desks SET knobs='{}',updated_at=clock_timestamp() WHERE request_id=$1", [desk.request.id]);
          await log('template', { template: key });
          break;
        }
        case 'knobs': {
          const knobs = canvasTemplate(desk.draft.templateKey)?.knobs ?? bad('NO_KNOBS');
          const next = readChoice(input.knobs, desk, knobs.palettes.length);
          let doc: PageDoc;
          try { doc = turnKnobs(desk.draft.config.doc, knobs, desk.knobs, next); } catch { return bad(); }
          await core.saveDraft(ref, desk.draft.revision, { ...desk.draft.config, doc }).catch(fail);
          await db.query('UPDATE edit_desks SET knobs=$2,updated_at=clock_timestamp() WHERE request_id=$1', [desk.request.id, JSON.stringify(next)]);
          await log('knobs');
          break;
        }
        case 'details': {
          const details = readDetails(input.details, true);
          await db.query('UPDATE edit_desks SET details=$2,updated_at=clock_timestamp() WHERE request_id=$1', [desk.request.id, JSON.stringify(details)]);
          break;
        }
        case 'preview': {
          const token = randomBytes(24).toString('base64url');
          await db.query(`UPDATE edit_desks SET preview_hash=$2,preview_expires_at=clock_timestamp()+$3*interval '1 day',updated_at=clock_timestamp() WHERE request_id=$1`,
            [desk.request.id, previewHash(token), PREVIEW_DAYS]);
          await log('preview');
          preview = `/xem-thu/${token}`;
          break;
        }
        case 'publish': {
          // The shop's details first, refused if they would break a page already live; then the page, checked as its guests will see it.
          if (desk.details) await saveShopDetails(db, adminId, desk.shop.id, { name: desk.details.name, profile: desk.details.profile, placeId: desk.details.placeId }).catch(fail);
          const shop = (await db.query('SELECT name,profile,is_template,google_url FROM shops WHERE id=$1', [desk.shop.id])).rows[0];
          const hasGoogle = [...walkTop(desk.draft.config.doc)].some(t => t === 'google');
          if (hasGoogle && (!shop.google_url || shop.google_url === 'https://maps.google.com/')) throw new AdminError(409, 'NO_GOOGLE_LINK');
          const name = shop.name as string;
          let revision = desk.draft.revision;
          if (desk.draft.config.name !== name) revision = await core.saveDraft(ref, revision, { ...desk.draft.config, name }).catch(fail);
          const published = await core.publish(ref, revision).catch(fail);
          await db.query("UPDATE edit_requests SET handled_at=clock_timestamp(),handled_by=$2,outcome='published' WHERE id=$1", [desk.request.id, `admin:${adminId}`]);
          await db.query('UPDATE edit_desks SET details=NULL,preview_hash=NULL,preview_expires_at=NULL,updated_at=clock_timestamp() WHERE request_id=$1', [desk.request.id]);
          await recordAdminAction(db, adminId, { action: 'page.edit_request.publish', shopId: desk.shop.id,
            detail: { request: desk.request.id, page: desk.page.id, revision, release: published.releaseId, via: 'desk' } });
          break;
        }
        default: bad();
      }
    });
    if (input.op === 'publish') return { desk: null };
    return { desk: await this.load(id), ...(preview ? { preview } : {}) };
  }

  /** A file Tài dropped: checked by its first bytes, sent to the store under the shop's folder, recorded as the shop's, approved. */
  async addFile(adminId: string, id: unknown, file: { type: string; name: string; role: string; bytes: Buffer }) {
    const rule = TYPES.get(file.type) ?? bad('UNSUPPORTED_MEDIA');
    if (!file.bytes.length || file.bytes.length > rule.max) throw new AdminError(413, 'MEDIA_TOO_LARGE');
    if (!rule.magic(file.bytes)) bad('UNSUPPORTED_MEDIA');
    const role = rule.kind === 'video' ? 'video' : file.role === 'logo' ? 'logo' : 'anh';
    const name = clean(file.name).slice(0, 120) || `tep.${rule.ext}`;
    const desk = await this.load(id);
    const settings = this.store ?? (() => { throw new AdminError(503, 'UPLOADS_NOT_CONFIGURED'); })();
    const key = `shops/${desk.shop.id}/${randomUUID()}.${rule.ext}`, url = `${settings.publicOrigin}/${key}`;
    const signed = presignObject(settings, 'PUT', key, { date: new Date(), expiresSeconds: 120,
      headers: { 'content-type': file.type, 'content-length': String(file.bytes.length) } });
    const sent = await this.fetcher(signed, { method: 'PUT', headers: { 'Content-Type': file.type }, body: new Uint8Array(file.bytes) });
    if (!sent.ok) throw new AdminError(502, 'STORE_REFUSED');
    await transaction(this.pool, async db => {
      const media = (await db.query(`INSERT INTO media_assets(shop_id,url,kind,content_type,size_bytes,uploaded_by,state,reviewed_by,reviewed_at)
        VALUES($1,$2,$3,$4,$5,$6,'approved',$7,clock_timestamp()) RETURNING id`, [desk.shop.id, url, rule.kind, file.type, file.bytes.length, `admin:${adminId}`, adminId])).rows[0];
      await db.query('INSERT INTO edit_request_files(request_id,media_id,role,name) VALUES($1,$2,$3,$4)', [desk.request.id, media.id, role, name]);
      await recordAdminAction(db, adminId, { action: 'page.desk.file', shopId: desk.shop.id, detail: { request: desk.request.id, media: media.id, role } });
    });
    return { desk: await this.load(id) };
  }

  /**
   * A whole page from Claude (desk-claude.ts): its template, its document and the details it read in the shop's messages, into the
   * draft and the waiting details. Checked like any draft (validateConfig, the Google rules); never published from here.
   */
  async propose(adminId: string, id: string, proposal: { template: string; doc: PageDoc; details: DeskDetails | null; claude: unknown }) {
    await transaction(this.pool, async db => {
      const desk = await this.load(id, db);
      await db.query('INSERT INTO edit_desks(request_id) VALUES($1) ON CONFLICT DO NOTHING', [desk.request.id]);
      const core = new PublishingAdmin(db, async () => ({ actorId: `admin:${adminId}` })), ref = { shopId: desk.shop.id, pageId: desk.page.id };
      const config = validateConfig({ ...desk.draft.config, name: proposal.details?.name ?? desk.shop.name, doc: proposal.doc });
      if (proposal.template !== desk.draft.templateKey) await core.restartDraft(ref, await templateVersionRow(db, proposal.template), config);
      else await core.saveDraft(ref, desk.draft.revision, config);
      await db.query(`UPDATE edit_desks SET knobs='{}',details=COALESCE($2,details),claude=$3,updated_at=clock_timestamp() WHERE request_id=$1`,
        [desk.request.id, proposal.details ? JSON.stringify(proposal.details) : null, JSON.stringify(proposal.claude)]);
      await recordAdminAction(db, adminId, { action: 'page.desk.claude', shopId: desk.shop.id, detail: { request: desk.request.id, template: proposal.template } });
    });
  }
  async noteFromClaude(id: string, body: string) {
    const text = clean(body).slice(0, 6000);
    if (text) await this.pool.query('INSERT INTO edit_request_notes(request_id,who,body) VALUES($1,$2,$3)', [id, 'claude', text]);
  }

  /** The draft behind a link sent to the shop: only while the link is fresh and the request still open. */
  async byPreview(token: unknown) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
    const row = (await this.pool.query(`SELECT k.request_id FROM edit_desks k JOIN edit_requests e ON e.id=k.request_id
      WHERE k.preview_hash=$1 AND k.preview_expires_at>clock_timestamp() AND e.handled_at IS NULL`, [previewHash(token)])).rows[0];
    return row ? this.load(row.request_id) : null;
  }
}

function* walkTop(doc: PageDoc) {
  for (const section of doc.sections) for (const el of section.els) {
    yield el.t;
    if (el.t === 'stack') for (const kid of el.kids) yield kid.t;
  }
}

/** The waiting details as typed on the screen or read by Claude: each part checked as the shop's details are (profile.ts). */
export function readDetails(value: unknown, strict = false): DeskDetails {
  if (!isObj(value)) return strict ? bad() : {};
  const out: DeskDetails = {};
  try {
    if (typeof value.name === 'string' && value.name.trim()) {
      if (value.name.trim().length > 100 || /[\u0000-\u001f\u007f<>]/.test(value.name)) throw new Error();
      out.name = value.name.trim();
    }
    if (value.profile !== undefined && value.profile !== null) out.profile = parseProfile(value.profile);
    if (typeof value.placeId === 'string' && value.placeId.trim()) out.placeId = parsePlaceId(value.placeId) ?? (() => { throw new Error(); })();
  } catch (error) {
    if (!strict) return out;
    throw new AdminError(400, error && typeof error === 'object' && 'at' in error ? `INVALID_PROFILE:${String(error.at)}` : 'INVALID_INPUT');
  }
  return out;
}

/** The knobs as the screen sends them: a palette by number, a picture by one of this request's files, words per text knob. */
function readChoice(value: unknown, desk: Desk, palettes: number): Choice {
  if (!isObj(value)) bad();
  const v = value as Record<string, unknown>, out: Choice = {};
  if (v.palette !== undefined) {
    if (!Number.isInteger(v.palette) || (v.palette as number) < 0 || (v.palette as number) >= palettes) bad();
    out.palette = v.palette as number;
  } else if (desk.knobs.palette !== undefined) out.palette = desk.knobs.palette;
  if (v.photos !== undefined) {
    if (!isObj(v.photos)) bad();
    out.photos = {};
    for (const [el, pick] of Object.entries(v.photos as Record<string, unknown>)) {
      if (!isObj(pick) || typeof pick.mediaId !== 'string') bad();
      const file = desk.files.find(f => f.mediaId === (pick as { mediaId: string }).mediaId && f.kind === 'image') ?? bad();
      const focus = (pick as { focus?: unknown }).focus;
      out.photos[el] = { src: file.url, ...(Array.isArray(focus) && focus.length === 2 && focus.every(n => Number.isFinite(n) && n >= 0 && n <= 100)
        ? { focus: focus as [number, number] } : {}) };
    }
  } else if (desk.knobs.photos) out.photos = desk.knobs.photos;
  if (v.texts !== undefined) {
    if (!isObj(v.texts)) bad();
    out.texts = {};
    for (const [el, words] of Object.entries(v.texts as Record<string, unknown>)) {
      if (!isObj(words) || typeof words.vi !== 'string' || !clean(words.vi) || words.vi.length > 200) bad();
      const w = words as { vi: string; en?: unknown };
      out.texts[el] = { vi: clean(w.vi), ...(typeof w.en === 'string' && clean(w.en) ? { en: clean(w.en).slice(0, 200) } : {}) } as Words;
    }
  } else if (desk.knobs.texts) out.texts = desk.knobs.texts;
  return out;
}
