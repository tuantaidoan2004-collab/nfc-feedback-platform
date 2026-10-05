// "Nhờ admin sửa" — the agent's side (Tài 05/10). Run through scripts/sua-trang.mjs, which sets the database and the store.
//   ds                 the pages waiting, oldest first, with what each shop wrote
//   lay <page>         the page's draft into rieng/sua/<page>.json, and what can be swapped in it (pictures, words, links)
//   dang <page>        that file back: local files named in it are shrunk and uploaded, the draft saved and published,
//                      the request closed. A shop whose first publish waited for Tài counts as seen: he asked for this edit.
// rieng/ is never committed (the repo is public): the shop's words, files and drafts stay on this machine.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { basename, extname, join, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PublishingAdmin } from '@/lib/publishing/repository';
import { validateConfig, type PageConfig } from '@/lib/publishing/config';
import { walk } from '@/lib/canvas/validate';
import { presignObject, storageSettings } from '@/lib/media/storage';
import { recordAdminAction } from '@/lib/admin/audit';
import type { PageDoc } from '@/lib/canvas/doc';

const [command, page] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const folder = resolve('rieng/sua');
const fail = (message: string): never => { console.error(message); process.exit(1); };

async function pageRow(slug: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(slug ?? '')) fail('Thiếu mã trang: node scripts/sua-trang.mjs lay <mã trang>');
  const row = (await pool.query(`SELECT p.id page_id,p.shop_id,p.slug,p.label,p.state,s.slug shop_slug,s.name shop_name,d.revision,d.config,
      e.id request_id,e.message FROM pages p JOIN shops s ON s.id=p.shop_id JOIN page_drafts d ON d.page_id=p.id
      LEFT JOIN edit_requests e ON e.page_id=p.id AND e.handled_at IS NULL WHERE lower(p.slug)=lower($1)`, [slug])).rows[0];
  return row ?? fail(`Không có trang /${slug}.`);
}

/** Every place a shop's own file can go, and every word on the page: what an edit usually changes, with the id to find it by. */
function slots(doc: PageDoc) {
  const lines: string[] = [];
  doc.sections.forEach((section, i) => { if (section.bg?.src) lines.push(`  ảnh nền khúc ${i + 1} (sections[${i}].bg.src): ${section.bg.src}`); });
  if (doc.backdrop?.src) lines.push(`  ảnh nền cả trang (backdrop.src): ${doc.backdrop.src}`);
  for (const el of walk(doc)) {
    if (el.t === 'image') lines.push(`  ảnh #${el.id}: ${el.src}`);
    if (el.t === 'text') lines.push(`  chữ #${el.id}: ${JSON.stringify(el.words.vi).slice(0, 80)}`);
    if (el.t === 'button') lines.push(`  nút #${el.id}: ${JSON.stringify(el.label.vi)} → ${el.link ?? (el.wifi ? 'wifi' : '—')}`);
  }
  return lines.join('\n');
}

async function list() {
  const rows = (await pool.query(`SELECT s.name shop,p.slug,p.label,p.state,e.message,e.created_at FROM edit_requests e JOIN pages p ON p.id=e.page_id
    JOIN shops s ON s.id=e.shop_id WHERE e.handled_at IS NULL ORDER BY e.created_at`)).rows;
  if (!rows.length) return console.log('Không có trang nào chờ sửa.');
  for (const row of rows) console.log(`/${row.slug} · ${row.shop} · ${row.label || 'Trang'} · ${row.state === 'active' ? 'đang chạy' : 'chưa phát hành'} · ${new Date(row.created_at).toLocaleString('vi-VN')}\n  “${row.message ?? '(không ghi gì)'}”`);
}

async function take(slug: string) {
  const row = await pageRow(slug), config = validateConfig(row.config);
  mkdirSync(join(folder, 'files'), { recursive: true });
  const file = join(folder, `${row.slug}.json`);
  writeFileSync(file, JSON.stringify({ shop: row.shop_slug, page: row.slug, revision: Number(row.revision), config }, null, 2) + '\n');
  console.log(`${row.shop_name} · /${row.slug} · bản nháp ${row.revision}${row.request_id ? '' : ' · (không có yêu cầu đang chờ)'}`);
  if (row.message) console.log(`Quán nhắn: “${row.message}”`);
  console.log(`Tệp: ${file}\nẢnh/video của quán: để trong ${join(folder, 'files')}, rồi ghi đường dẫn tệp vào src (vd "files/anh-bia.jpg").\n${slots(config.doc)}`);
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

async function publish(slug: string) {
  const file = join(folder, `${slug}.json`);
  if (!existsSync(file)) fail(`Chưa có ${file}. Chạy "lay ${slug}" trước.`);
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { page: string; revision: number; config: PageConfig };
  const row = await pageRow(saved.page);
  const admin = (await pool.query('SELECT id FROM platform_admins WHERE active ORDER BY created_at LIMIT 1')).rows[0]?.id as string ?? fail('Chưa có tài khoản admin.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Local files named in the page: uploaded once each, then the page points at the store.
    const local = (src: unknown) => typeof src === 'string' && !/^(https?:|art:|\/tpl\/)/.test(src);
    const sent = new Map<string, string>();
    const swap = async (src: string) => {
      const path = isAbsolute(src) ? src : resolve(folder, src);
      if (!existsSync(path) || !statSync(path).isFile()) fail(`Không thấy tệp ${src}.`);
      if (!sent.has(path)) sent.set(path, await upload(db, row.shop_id, admin, path));
      return sent.get(path)!;
    };
    const doc = saved.config.doc;
    for (const section of doc.sections) if (section.bg && local(section.bg.src)) section.bg.src = await swap(section.bg.src!);
    if (doc.backdrop && local(doc.backdrop.src)) doc.backdrop.src = await swap(doc.backdrop.src!);
    for (const el of walk(doc)) if (el.t === 'image' && local(el.src)) el.src = await swap(el.src);
    const config = validateConfig(saved.config);
    const core = new PublishingAdmin(db, async () => ({ actorId: `admin:${admin}` })), ref = { shopId: row.shop_id, pageId: row.page_id };
    const revision = Number(row.revision) === saved.revision ? await core.saveDraft(ref, saved.revision, config)
      : fail(`Quán đã đổi bản nháp (giờ là ${row.revision}, tệp lấy ở ${saved.revision}). Chạy lại "lay ${slug}".`);
    // Tài asked for this edit, so he has seen the shop: its first publish needs no second look.
    await db.query('UPDATE shops SET publish_approved_at=COALESCE(publish_approved_at,clock_timestamp()) WHERE id=$1 AND self_signup', [row.shop_id]);
    await db.query("UPDATE publish_reviews SET state='approved',decided_by=$2,decided_at=clock_timestamp() WHERE shop_id=$1 AND state='pending'", [row.shop_id, admin]);
    const published = await core.publish(ref, revision);
    await db.query("UPDATE edit_requests SET handled_at=clock_timestamp(),handled_by='agent' WHERE page_id=$1 AND handled_at IS NULL", [row.page_id]);
    await recordAdminAction(db, admin, { action: 'page.edit_request.publish', shopId: row.shop_id, detail: { page: row.page_id, revision, release: published.releaseId } });
    await db.query('COMMIT');
    writeFileSync(file, JSON.stringify({ ...saved, revision, config }, null, 2) + '\n');
    console.log(`Đã phát hành /${row.slug} (bản nháp ${revision}).${row.request_id ? ' Yêu cầu sửa đã đóng.' : ''}`);
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}

try {
  if (command === 'ds') await list();
  else if (command === 'lay') await take(page);
  else if (command === 'dang') await publish(page);
  else fail('node scripts/sua-trang.mjs ds | lay <mã trang> | dang <mã trang>');
} finally { await pool.end(); }
