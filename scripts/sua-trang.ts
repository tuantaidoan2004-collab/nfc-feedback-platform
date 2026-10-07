// "Nhờ Admin Tài dựng" — the agent's side (Tài 06/10). Run through scripts/sua-trang.mjs, which sets the database and the store.
//   ds                     the pages waiting, oldest first: the shop, the template it picked, its Zalo, what it wrote
//   lay <trang> [mẫu]      the page, its shop's details and what Bàn dựng holds (messages, files) into rieng/sua/<trang>.json, with a checklist of the shop's places
//                          (slots) and of every other word and link on the page; [mẫu] starts the page from another template.
//                          Marks the request "Admin Tài đang chỉnh" for the owner.
//   kiem <trang>           every check `dang` makes, nothing written (local files count as pictures)
//   chep <trang> <quán>    a page built here (local database and store) copied as a new page of another shop, published, with
//                          the words and links of the shop it was built for kept on it (Tài 07/10: the designs as a shop's assets).
//                          Its pictures, fonts and sounds go to the target's store. With --env, the target is production.
//   dang <trang>           the file back: local files shrunk and uploaded, the shop's name, details and Place ID saved (refused if
//                          a page already live would break), the page saved and published, the request closed.
// rieng/ is never committed (the repo is public): the shop's details, files and drafts stay on this machine.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { basename, extname, join, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PublishingAdmin, PublishingError, shownConfig, templateVersionRow } from '@/lib/publishing/repository';
import { validateConfig, type PageConfig } from '@/lib/publishing/config';
import { assertPublishable } from '@/lib/publishing/policy';
import { CanvasError, validateDoc, walk } from '@/lib/canvas/validate';
import { bindShop, placeholderLinks, slotReport } from '@/lib/canvas/slots';
import { canvasTemplate, pageFromTemplate } from '@/lib/canvas/templates';
import { presignObject, storageSettings } from '@/lib/media/storage';
import { recordAdminAction } from '@/lib/admin/audit';
import { saveShopDetails, ShopDetailsError } from '@/lib/admin/shop-details';
import { readProfile } from '@/lib/shop/profile';
import type { PageDoc } from '@/lib/canvas/doc';
import { withShortCode } from '@/lib/short-code';

const [command, page, extra] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const folder = resolve('rieng/sua');
const fail = (message: string): never => { console.error(message); process.exit(1); };
type Saved = { quan: string; trang: string; banNhap: number; mau: string; ten: string; placeId: string | null; thongTin: unknown; config: PageConfig;
  /** From Bàn dựng, to read: the log of the request and the files dropped there (their URLs go straight into "src"). */
  loiKhach?: string[]; tep?: { role: string; name: string; url: string }[] };

/** What each refusal of the publishing core asks the agent to fix. */
const WHY: Record<string, string> = {
  PAGE_NOT_SYNCED: 'Trang còn link mẫu (trang chủ của Zalo/Facebook/TikTok… hoặc link về Quite Sensational) ở phần tử không có chỗ của quán.',
  POLICY_GOOGLE_NOT_FIRST_SCREEN: 'Nút Google bị đẩy khỏi màn hình đầu (khúc đầu, trên vạch 560).', POLICY_GOOGLE_TWICE: 'Có hai nút Google.',
  POLICY_GOOGLE_EXCHANGE: 'Có chữ đổi quà lấy đánh giá hoặc gợi ý nội dung đánh giá (luật Google).', POLICY_GOOGLE_LINK: 'Có link viết đánh giá Google ngoài nút Google.',
  INVALID_CONFIG: 'Tài liệu trang sai dạng.', MEDIA_PENDING: 'Có ảnh đang chờ duyệt.', MEDIA_REJECTED: 'Có ảnh đã bị từ chối.', MEDIA_UNKNOWN: 'Có ảnh không phải của quán.',
  DRAFT_CONFLICT: 'Bản nháp đã đổi từ lúc lấy ra. Chạy lại "lay".', PAGE_CLOSED: 'Trang đã đóng.', SHOP_SUSPENDED: 'Quán đang bị khoá.',
  INVALID_PROFILE: 'Thông tin quán sai dạng', INVALID_NAME: 'Tên quán sai dạng.', INVALID_PLACE_ID: 'Place ID không đúng.',
};
const explain = (error: unknown): never => {
  if (error instanceof ShopDetailsError) fail(`${WHY[error.code] ?? error.code}${error.at ? ` — ${error.at}` : ''}`);
  if (error instanceof PublishingError) fail(WHY[error.code] ?? error.code);
  throw error;
};

async function pageRow(slug: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(slug ?? '')) fail('Thiếu mã trang: node scripts/sua-trang.mjs lay <mã trang>');
  const row = (await pool.query(`SELECT p.id page_id,p.shop_id,p.slug,p.label,p.state,s.slug shop_slug,s.name shop_name,s.profile,s.place_id,s.google_url,s.is_template,
      d.revision,d.config,tv.template_key,e.id request_id,e.template_key request_template,e.contact,e.message,e.contacted_at
    FROM pages p JOIN shops s ON s.id=p.shop_id JOIN page_drafts d ON d.page_id=p.id JOIN template_versions tv ON tv.id=d.template_version_id
    LEFT JOIN edit_requests e ON e.page_id=p.id AND e.handled_at IS NULL WHERE lower(p.slug)=lower($1)`, [slug])).rows[0];
  return row ?? fail(`Không có trang /${slug}.`);
}
const admin = async () => (await pool.query('SELECT id FROM platform_admins WHERE active ORDER BY created_at LIMIT 1')).rows[0]?.id as string ?? fail('Chưa có tài khoản admin.');

async function list() {
  const rows = (await pool.query(`SELECT s.name shop,p.slug,p.label,p.state,e.template_key,e.contact,e.message,e.created_at,e.contacted_at FROM edit_requests e
    JOIN pages p ON p.id=e.page_id JOIN shops s ON s.id=e.shop_id WHERE e.handled_at IS NULL ORDER BY e.created_at`)).rows;
  if (!rows.length) return console.log('Không có trang nào chờ dựng.');
  for (const row of rows) console.log(`/${row.slug} · ${row.shop} · ${row.label || 'Trang'} · ${row.template_key ? `mẫu ${canvasTemplate(row.template_key)?.name ?? row.template_key}` : 'chỉnh trang đang có'}`
    + ` · Zalo ${row.contact} · ${row.state === 'active' ? 'trang cũ đang chạy' : 'chưa phát hành'} · gửi ${new Date(row.created_at).toLocaleString('vi-VN')}`
    + `${row.contacted_at ? ' · đã nhắn' : ''}\n  “${row.message ?? '(không ghi gì)'}”`);
}

/** The checklist: every place of the shop on the page and whether its data is there, then every other word, link and picture. */
function checklist(doc: PageDoc, shop: { name: string; profile: unknown }) {
  const lines: string[] = [], report = slotReport(doc, { name: shop.name, profile: readProfile(shop.profile) });
  lines.push('Chỗ của quán (điền ở "thongTin"; thiếu thì phần tử tự ẩn):');
  for (const item of report) lines.push(`  ${item.filled ? '✓' : '—'} ${item.slot.padEnd(9)} #${item.id}${item.filled ? '' : '  (quán chưa có → đang ẩn)'}`);
  lines.push('Chữ, nút, ảnh còn lại (sửa thẳng trong "config" nếu quán muốn khác):');
  doc.sections.forEach((section, i) => { if (section.bg?.src) lines.push(`  ảnh nền khúc ${i + 1}: ${section.bg.src}`); });
  for (const el of walk(doc)) {
    if ('slot' in el && el.slot) continue;
    if (el.t === 'text') lines.push(`  chữ #${el.id}: ${JSON.stringify(el.words.vi).slice(0, 70)}${el.link ? ` → ${el.link}` : ''}`);
    if (el.t === 'button') lines.push(`  nút #${el.id}: ${JSON.stringify(el.label.vi)} → ${el.link ?? 'wifi'}`);
    if (el.t === 'image') lines.push(`  ảnh #${el.id}: ${el.src}`);
  }
  return lines.join('\n');
}

async function take(slug: string, template?: string) {
  const row = await pageRow(slug);
  let config = validateConfig(row.config), key = row.template_key as string;
  const wanted = template ?? (row.request_template && row.request_template !== key ? row.request_template : undefined);
  if (wanted) { if (!canvasTemplate(wanted)) fail(`Không có mẫu "${wanted}".`); config = pageFromTemplate(wanted, row.shop_name); key = wanted; }
  mkdirSync(join(folder, 'files'), { recursive: true });
  // What Bàn dựng holds for this request (kịch bản 9b): the shop's messages and Tài's notes, the files he dropped (approved, usable as
  // "src" as they are), and the details waiting to be saved -- these win over the saved ones, as they will on "Phát hành".
  const desk = row.request_id ? (await pool.query('SELECT details FROM edit_desks WHERE request_id=$1', [row.request_id])).rows[0]?.details ?? null : null;
  const notes = row.request_id ? (await pool.query('SELECT who,body,created_at FROM edit_request_notes WHERE request_id=$1 ORDER BY created_at', [row.request_id])).rows : [];
  const files = row.request_id ? (await pool.query(`SELECT f.role,f.name,m.url FROM edit_request_files f JOIN media_assets m ON m.id=f.media_id
    WHERE f.request_id=$1 AND m.state='approved' ORDER BY f.created_at`, [row.request_id])).rows : [];
  const file = join(folder, `${row.slug}.json`), saved: Saved = { quan: row.shop_slug, trang: row.slug, banNhap: Number(row.revision), mau: key,
    ten: desk?.name ?? row.shop_name, placeId: desk?.placeId ?? row.place_id, thongTin: desk?.profile ?? readProfile(row.profile),
    loiKhach: notes.map(n => `[${n.who} · ${new Date(n.created_at).toLocaleString('vi-VN')}] ${n.body}`), tep: files, config };
  writeFileSync(file, JSON.stringify(saved, null, 2) + '\n');
  // The shop now has someone on it: the owner reads "Admin Tài đang chỉnh".
  if (row.request_id) await pool.query('UPDATE edit_requests SET contacted_at=COALESCE(contacted_at,clock_timestamp()) WHERE id=$1', [row.request_id]);
  console.log(`${row.shop_name} · /${row.slug} · mẫu ${canvasTemplate(key)?.name ?? key} · bản nháp ${row.revision}${row.request_id ? ` · Zalo ${row.contact}` : ' · (không có yêu cầu đang chờ)'}`);
  if (row.message) console.log(`Quán nhắn: “${row.message}”`);
  if (notes.length) console.log(`Bàn dựng: ${notes.length} mục lời khách/ghi chú, ${files.length} tệp${desk ? ', thông tin quán chờ lưu' : ''} — trong tệp, "loiKhach" và "tep".`);
  console.log(`Link Google: ${row.google_url && row.google_url !== 'https://maps.google.com/' ? 'có' : 'CHƯA CÓ — ghi "placeId" (chủ quán chưa làm bước Dashboard)'}`);
  console.log(`Tệp: ${file}\nẢnh/video của quán: để trong ${join(folder, 'files')}, ghi đường dẫn vào src (vd "files/anh-bia.jpg").\n${checklist(config.doc, { name: row.shop_name, profile: row.profile })}`);
}

/** A file the shop sent, made fit for a page: pictures at most 1600 px as JPEG (PNG kept, for a logo's transparency), clips 720p MP4. */
function prepare(path: string) {
  const ext = extname(path).toLowerCase(), work = mkdtempSync(join(tmpdir(), 'sua-trang-'));
  if (['.mp4', '.mov', '.m4v'].includes(ext)) {
    const out = join(work, `${basename(path, ext)}.mp4`);
    const made = spawnSync('avconvert', ['--preset', 'Preset1280x720', '--source', path, '--output', out, '--replace'], { stdio: 'inherit' });
    if (made.status !== 0) fail(`Không đổi được video ${path}.`);
    return { file: out, type: 'video/mp4', kind: 'video' as const, ext: 'mp4' };
  }
  const png = ext === '.png', out = join(work, `${basename(path, ext)}.${png ? 'png' : 'jpg'}`);
  const made = spawnSync('sips', ['-Z', png ? '1200' : '1600', ...(png ? [] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82']), path, '--out', out], { stdio: 'ignore' });
  if (made.status !== 0) fail(`Không đọc được ảnh ${path}.`);
  return { file: out, type: png ? 'image/png' : 'image/jpeg', kind: 'image' as const, ext: png ? 'png' : 'jpg' };
}
/** Sends one file to the store as the shop's, already approved: Tài chose it. */
async function upload(db: pg.PoolClient, shopId: string, adminId: string, path: string) {
  const settings = storageSettings() ?? fail('Chưa có kho ảnh (R2/kho local). Chạy node scripts/local.mjs trước.');
  const ready = prepare(path), body = readFileSync(ready.file);
  if (body.length > (ready.kind === 'video' ? 50 : 5) * 1024 * 1024) fail(`${basename(path)} vẫn quá lớn sau khi thu nhỏ.`);
  const key = `shops/${shopId}/${randomUUID()}.${ready.ext}`, url = `${settings.publicOrigin}/${key}`;
  const signed = presignObject(settings, 'PUT', key, { date: new Date(), expiresSeconds: 300, headers: { 'content-type': ready.type, 'content-length': String(body.length) } });
  const sent = await fetch(signed, { method: 'PUT', headers: { 'Content-Type': ready.type }, body });
  if (!sent.ok) fail(`Kho ảnh từ chối ${basename(path)} (${sent.status}).`);
  await db.query(`INSERT INTO media_assets(shop_id,url,kind,content_type,size_bytes,uploaded_by,state,reviewed_by,reviewed_at)
    VALUES($1,$2,$3,$4,$5,$6,'approved',$7,clock_timestamp())`, [shopId, url, ready.kind, ready.type, body.length, `admin:${adminId}`, adminId]);
  console.log(`  ↑ ${basename(path)} → ${url}`);
  return url;
}

/** `dang`, or with `dry` everything `dang` checks, rolled back at the end and with no file sent anywhere. */
async function publish(slug: string, dry: boolean) {
  const file = join(folder, `${slug}.json`);
  if (!existsSync(file)) fail(`Chưa có ${file}. Chạy "lay ${slug}" trước.`);
  const saved = JSON.parse(readFileSync(file, 'utf8')) as Saved;
  const row = await pageRow(saved.trang), adminId = await admin();
  if (Number(row.revision) !== saved.banNhap) fail(`Bản nháp đã đổi (giờ là ${row.revision}, tệp lấy ở ${saved.banNhap}). Chạy lại "lay ${slug}".`);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Local files named in the page: uploaded once each, then the page points at the store.
    const local = (src: unknown) => typeof src === 'string' && !/^(https?:|art:|\/tpl\/)/.test(src);
    const sent = new Map<string, string>();
    const swap = async (src: string) => {
      const path = isAbsolute(src) ? src : resolve(folder, src);
      if (!existsSync(path) || !statSync(path).isFile()) fail(`Không thấy tệp ${src}.`);
      if (dry) return 'art:photo';
      if (!sent.has(path)) sent.set(path, await upload(db, row.shop_id, adminId, path));
      return sent.get(path)!;
    };
    const doc = saved.config.doc;
    for (const section of doc.sections) if (section.bg && local(section.bg.src)) section.bg.src = await swap(section.bg.src!);
    if (doc.backdrop && local(doc.backdrop.src)) doc.backdrop.src = await swap(doc.backdrop.src!);
    for (const el of walk(doc)) if (el.t === 'image') {
      if (local(el.src)) el.src = await swap(el.src);
      if (el.flip) for (const [i, src] of el.flip.entries()) if (local(src)) el.flip[i] = await swap(src);
    }
    try { validateDoc(doc); } catch (error) { if (error instanceof CanvasError) fail(`Tài liệu trang sai ở ${error.at}.`); throw error; }
    // The page's tab title follows the shop's name, as its name slots do.
    const config = validateConfig({ ...saved.config, name: typeof saved.ten === 'string' && saved.ten.trim() ? saved.ten.trim() : saved.config.name });
    // The shop's name, details and Place ID first: the page is checked with them in its places.
    const details = await saveShopDetails(db, adminId, row.shop_id, { name: saved.ten, profile: saved.thongTin, placeId: saved.placeId }).catch(explain);
    const shop = (await db.query('SELECT name,profile,is_template,google_url FROM shops WHERE id=$1', [row.shop_id])).rows[0];
    const shown = shownConfig(config, shop);
    try { assertPublishable(shown); } catch (error) { explain(error); }
    const leftovers = placeholderLinks(shown.doc);
    if (leftovers.length) fail(`${WHY.PAGE_NOT_SYNCED} Phần tử: ${leftovers.map(id => `#${id}`).join(', ')}.`);
    if ([...walk(doc)].some(el => el.t === 'google') && (!shop.google_url || shop.google_url === 'https://maps.google.com/'))
      fail('Quán chưa có link Google: ghi "placeId" trong tệp (Place ID của quán).');
    const core = new PublishingAdmin(db, async () => ({ actorId: `admin:${adminId}` })), ref = { shopId: row.shop_id, pageId: row.page_id };
    let revision = saved.banNhap;
    if (saved.mau !== row.template_key) {
      if (!canvasTemplate(saved.mau)) fail(`Không có mẫu "${saved.mau}".`);
      revision = await core.restartDraft(ref, await templateVersionRow(db, saved.mau), config).catch(explain);
    } else if (JSON.stringify(validateConfig(row.config)) !== JSON.stringify(config)) revision = await core.saveDraft(ref, revision, config).catch(explain);
    const report = slotReport(config.doc, { name: shop.name, profile: readProfile(shop.profile) });
    if (dry) {
      await db.query('ROLLBACK');
      console.log(`Kiểm xong /${row.slug}: phát hành được.${details.changed.length ? ` Thông tin quán đổi: ${details.changed.join(', ')}.` : ''}`);
      console.log(report.map(item => `  ${item.filled ? '✓' : '—'} ${item.slot} #${item.id}`).join('\n'));
      return;
    }
    const published = await core.publish(ref, revision).catch(explain);
    await db.query("UPDATE edit_requests SET handled_at=clock_timestamp(),handled_by='agent',outcome='published' WHERE page_id=$1 AND handled_at IS NULL", [row.page_id]);
    await recordAdminAction(db, adminId, { action: 'page.edit_request.publish', shopId: row.shop_id, detail: { page: row.page_id, revision, release: published.releaseId } });
    await db.query('COMMIT');
    writeFileSync(file, JSON.stringify({ ...saved, banNhap: published.draftRevision, config }, null, 2) + '\n');
    console.log(`Đã phát hành /${row.slug}.${row.request_id ? ' Yêu cầu đã đóng.' : ''}${details.changed.length ? ` Thông tin quán đổi: ${details.changed.join(', ')}.` : ''}`);
    console.log(report.filter(item => !item.filled).map(item => `  — ${item.slot} #${item.id} đang ẩn (quán chưa có)`).join('\n'));
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; } finally { db.release(); }
}

/** The local database and store `chep` copies from: the ones scripts/local.mjs runs, whatever --env points at. */
const LOCAL_DB = 'postgresql://nfc@127.0.0.1:55460/nfc_local', LOCAL_STORE = 'http://127.0.0.1:3322/nfc-media/';
/** The shop's data put into the page for good: no slot left, a `links` group keeping its buttons. Item `slot`s are link kinds, kept. */
function frozen(doc: PageDoc, shop: { name: string; profile: unknown }) {
  const out = bindShop(doc, { name: shop.name, profile: readProfile(shop.profile) });
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    delete o.slot; if (o.t === 'links') o.own = true;
    for (const [k, child] of Object.entries(o)) if (k !== 'items') visit(child);
  };
  visit(out.sections);
  return out;
}
async function copy(slug: string, target: string, dry: boolean) {
  if (!/^[a-z0-9-]{1,63}$/i.test(target ?? '')) fail('node scripts/sua-trang.mjs chep <mã trang> <mã quán> [--thu]');
  const source = new pg.Pool({ connectionString: LOCAL_DB, max: 1 });
  const row = (await source.query(`SELECT p.slug,s.name,s.profile,d.config,tv.template_key FROM pages p JOIN shops s ON s.id=p.shop_id
    JOIN page_drafts d ON d.page_id=p.id JOIN template_versions tv ON tv.id=d.template_version_id WHERE lower(p.slug)=lower($1)`, [slug])).rows[0] ?? fail(`Máy này không có trang /${slug}.`);
  const files = new Map((await source.query(`SELECT url,kind,content_type FROM media_assets WHERE url LIKE $1`, [`${LOCAL_STORE}%`])).rows.map(r => [r.url as string, r]));
  await source.end();
  const shop = (await pool.query('SELECT id,name,google_url FROM shops WHERE lower(slug)=lower($1)', [target])).rows[0] ?? fail(`Không có quán ${target}.`);
  if (!shop.google_url || shop.google_url === 'https://maps.google.com/') fail(`Quán ${shop.name} chưa có link Google.`);
  const adminId = await admin(), settings = dry ? null : storageSettings() ?? fail('Chưa có kho ảnh.');
  let text = JSON.stringify({ ...validateConfig(row.config), name: row.name, doc: frozen(validateConfig(row.config).doc, row) });
  // Every file of the local store the page names: fetched here, sent to the target's store as the target shop's, approved.
  const used = [...new Set(text.match(/http:\/\/127\.0\.0\.1:3322\/nfc-media\/[^"\\]+/g) ?? [])];
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const url of used) {
      const meta = files.get(url) ?? fail(`Tệp không có trong kho local: ${url}`);
      const got = await fetch(url); if (!got.ok) fail(`Kho local không trả ${url} (${got.status}). Chạy node scripts/local.mjs.`);
      const body = Buffer.from(await got.arrayBuffer()), ext = extname(new URL(url).pathname);
      let to = url;
      if (settings) {
        const key = `shops/${shop.id}/${randomUUID()}${ext}`; to = `${settings.publicOrigin}/${key}`;
        const signed = presignObject(settings, 'PUT', key, { date: new Date(), expiresSeconds: 300, headers: { 'content-type': meta.content_type, 'content-length': String(body.length) } });
        const sent = await fetch(signed, { method: 'PUT', headers: { 'Content-Type': meta.content_type }, body });
        if (!sent.ok) fail(`Kho từ chối ${basename(url)} (${sent.status}).`);
        await db.query(`INSERT INTO media_assets(shop_id,url,kind,content_type,size_bytes,uploaded_by,state,reviewed_by,reviewed_at)
          VALUES($1,$2,$3,$4,$5,$6,'approved',$7,clock_timestamp())`, [shop.id, to, meta.kind, meta.content_type, body.length, `admin:${adminId}`, adminId]);
      }
      text = text.split(url).join(to);
      console.log(`  ${dry ? '·' : '↑'} ${meta.kind} ${Math.round(body.length / 1024)} KB${dry ? '' : ` → ${to}`}`);
    }
    const config = validateConfig(JSON.parse(text));
    try { validateDoc(config.doc); } catch (error) { if (error instanceof CanvasError) fail(`Tài liệu trang sai ở ${error.at}.`); throw error; }
    try { assertPublishable(config); } catch (error) { explain(error); }
    const leftovers = placeholderLinks(config.doc);
    if (leftovers.length) fail(`${WHY.PAGE_NOT_SYNCED} Phần tử: ${leftovers.map(id => `#${id}`).join(', ')}.`);
    if (dry) { await db.query('ROLLBACK'); console.log(`Kiểm xong /${row.slug} (${row.name}) → quán ${shop.name}: chép được, ${used.length} tệp.`); return; }
    const core = new PublishingAdmin(db, async () => ({ actorId: `admin:${adminId}` })), templateId = await templateVersionRow(db, row.template_key);
    const page = await withShortCode(async code => {
      await db.query('SAVEPOINT new_page');
      try { const made = await core.createPage(shop.id, templateId, config, code, String(row.name).slice(0, 60)); await db.query('RELEASE SAVEPOINT new_page'); return { ...made, slug: code }; }
      catch (error) { await db.query('ROLLBACK TO SAVEPOINT new_page'); throw error; }
    }).catch(explain);
    const published = await core.publish(page, 1).catch(explain);
    await recordAdminAction(db, adminId, { action: 'page.copy', shopId: shop.id, detail: { page: page.pageId, from: row.slug, release: published.releaseId } });
    await db.query('COMMIT');
    console.log(`Đã chép /${row.slug} (${row.name}) → quán ${shop.name}: trang mới /${page.slug}, đã phát hành.`);
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; } finally { db.release(); }
}

try {
  if (command === 'ds') await list();
  else if (command === 'lay') await take(page, extra);
  else if (command === 'kiem') await publish(page, true);
  else if (command === 'dang') await publish(page, false);
  else if (command === 'chep') await copy(page, extra, process.argv.includes('--thu'));
  else fail('node scripts/sua-trang.mjs ds | lay <mã trang> [mẫu] | kiem <mã trang> | dang <mã trang> | chep <mã trang> <mã quán> [--thu]');
} finally { await pool.end(); }
