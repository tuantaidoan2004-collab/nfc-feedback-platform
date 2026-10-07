import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeSession, makeTap, byId, startTestServer } from './helpers.js';
import { startClaim } from '../src/domain/claims.js';
import { requestCode, codeStatus } from '../src/domain/codes.js';
import { ingestMail, normalizeInbound } from '../src/domain/mail.js';
import { parseMime, decodeWords } from '../src/lib/mime.js';
import { hmac } from '../src/lib/crypto.js';
import { get } from '../src/db/index.js';
import { SEC } from '../src/lib/time.js';
import worker from '../extras/cloudflare-email-worker.js';

const b64 = (s) => Buffer.from(s).toString('base64');
const wrap76 = (s) => s.match(/.{1,76}/g).join('\r\n');

/** Tiêu đề tiếng Việt mã hoá base64, cắt đôi GIỮA 1 ký tự nhiều byte (như Gmail/Outlook vẫn làm). */
function splitSubject(s) {
  const bytes = Buffer.from(s);
  const cut = bytes.indexOf(Buffer.from('ă')) + 1;
  return `=?UTF-8?B?${bytes.subarray(0, cut).toString('base64')}?=\r\n =?UTF-8?B?${bytes.subarray(cut).toString('base64')}?=`;
}

/** Thư gốc giống thư mã của ChatGPT: multipart/alternative, text base64 + html quoted-printable. */
function rawCodeMail({ to = 'gpt1@kho.test', code = '482913', date = new Date(), id = 'abc' } = {}) {
  return [
    `Delivered-To: ${to}`,
    'Received: from mail.openai.com by mx.cloudflare.net; Mon, 5 Oct 2026 13:00:20 +0000',
    'From: =?UTF-8?B?T3BlbkFJ?= <noreply@tm.openai.com>',
    `To: ${to}`,
    `Subject: ${splitSubject('Mã đăng nhập ChatGPT')}`,
    `Message-ID: <${id}@tm.openai.com>`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative;',
    '\tboundary="==b1=="',
    '',
    'This is a multi-part message in MIME format.',
    '--==b1==',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(`Mã xác minh của bạn là: ${code}\nNếu không phải bạn, hãy bỏ qua thư này.`)),
    '--==b1==',
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    `<p style=3D"font-size:20px">M=C3=A3 c=E1=BB=A7a b=E1=BA=A1n: <b>${code.slice(0, 3)}=`,
    `${code.slice(3)}</b></p>`,
    '--==b1==--',
    '',
  ].join('\r\n');
}

test('parseMime: base64, quoted-printable, tiêu đề tiếng Việt bị cắt giữa ký tự', () => {
  const m = parseMime(Buffer.from(rawCodeMail()));
  assert.equal(m.subject, 'Mã đăng nhập ChatGPT');
  assert.equal(m.from, 'OpenAI <noreply@tm.openai.com>');
  assert.equal(m.messageId, '<abc@tm.openai.com>');
  assert.match(m.text, /Mã xác minh của bạn là: 482913/);
  assert.equal(m.html, '<p style="font-size:20px">Mã của bạn: <b>482913</b></p>');
  assert.deepEqual(m.headers['delivered-to'], ['gpt1@kho.test']);
  assert.equal(decodeWords('=?iso-8859-1?Q?Caf=E9_ouvert?= now'), 'Café ouvert now');
});

test('parseMime: bảng mã cũ, chỉ có HTML, bỏ qua tệp đính kèm và thư lồng', () => {
  const latin = parseMime([
    'Subject: hello', 'Content-Type: text/plain; charset=iso-8859-1', 'Content-Transfer-Encoding: quoted-printable', '',
    'Caf=E9 code 123456', '',
  ].join('\n'));
  assert.equal(latin.text.trim(), 'Café code 123456');

  const nested = parseMime([
    'Subject: x', 'Content-Type: multipart/mixed; boundary=outer', '',
    '--outer',
    'Content-Type: multipart/alternative; boundary=inner', '',
    '--inner', 'Content-Type: text/html', '', '<p>code <b>246810</b></p>', '--inner--',
    '--outer',
    'Content-Type: text/plain; name="note.txt"', 'Content-Disposition: attachment; filename="note.txt"', '', 'code 999999',
    '--outer',
    'Content-Type: message/rfc822', '', 'Subject: forwarded', '', 'code 111111',
    '--outer--', '',
  ].join('\r\n'));
  assert.equal(nested.text, null);
  assert.equal(nested.html, '<p>code <b>246810</b></p>');
  const n = normalizeInbound({ raw: ['To: gpt1@kho.test', 'Subject: x', 'Content-Type: text/html', '', '<p>code <b>246810</b></p>'].join('\r\n') });
  assert.equal(n.text, 'code 246810', 'chỉ có HTML → tự chuyển thành chữ');
});

/** Khách có slot ChatGPT đang chạy, đã bấm "Lấy mã". */
function setupWindow(env = {}) {
  const ctx = createTestCtx({ env });
  const data = seed(ctx);
  const customer = makeCustomer(ctx);
  const deviceId = 'device-aaaaaaaaaaaaaaaa';
  makeDevice(ctx, deviceId, customer.id);
  const { session } = makeSession(ctx, { customerId: customer.id, deviceId });
  makeTap(ctx, { card: data.card, deviceId });
  const claim = startClaim(ctx, { session, customer, deviceId, ip: '1.2.3.4', toolId: data.tools.chatgpt.id });
  assert.equal(claim.status, 'active', JSON.stringify(claim));
  const w = requestCode(ctx, { session, customer: byId(ctx, 'customers', customer.id), deviceId, ip: '1.2.3.4' });
  assert.equal(w.status, 'open', JSON.stringify(w));
  ctx.clock.advance(20 * SEC);
  const status = () => codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId });
  return { ctx, email: w.accountEmail, status };
}

test('thư gốc: người nhận lấy theo phong bì (X-Envelope-To), không tin tiêu đề To do người gửi tự ghi', () => {
  const { ctx, email, status } = setupWindow();
  const other = email === 'gpt1@kho.test' ? 'gpt2@kho.test' : 'gpt1@kho.test';
  const raw = `X-Envelope-To: ${email}\r\n${rawCodeMail({ to: other, date: new Date(ctx.now()) })}`;
  const r = ingestMail(ctx, { raw: Buffer.from(raw) });
  assert.equal(r.verdict, 'matched', JSON.stringify(r));
  assert.equal(status().code, '482913');
  assert.equal(get(ctx.db, 'SELECT to_addr FROM mails WHERE id = ?', r.mailId).to_addr, email);
});

test('Cloudflare Worker (extras/) → webhook: ký đúng thì giao mã; sai khoá thì chuyển hộp thư dự phòng', async () => {
  const { ctx, email, status } = setupWindow();
  const srv = await startTestServer(ctx);
  const message = (raw) => ({
    to: email.toUpperCase(),
    from: 'bounces@em.openai.com',
    raw: new Blob([raw]).stream(),
    forwarded: null,
    rejected: null,
    async forward(addr) { this.forwarded = addr; },
    setReject(reason) { this.rejected = reason; },
  });
  try {
    const env = { WEBHOOK_URL: `${srv.url}/hooks/mail`, WEBHOOK_SECRET: ctx.config.mail.webhookSecret };
    const ok = message(rawCodeMail({ to: email, date: new Date(ctx.now()) }));
    await worker.email(ok, env);
    assert.equal(ok.forwarded, null);
    assert.equal(status().code, '482913');

    const wrong = message(rawCodeMail({ to: email, id: 'other', date: new Date(ctx.now()) }));
    await worker.email(wrong, { ...env, WEBHOOK_SECRET: 'sai-khoa', BACKUP_EMAIL: 'chu@backup.test' });
    assert.equal(wrong.forwarded, 'chu@backup.test');
    await assert.rejects(worker.email(message(rawCodeMail({ to: email, id: 'x3' })), { ...env, WEBHOOK_SECRET: 'sai-khoa' }));

    const stranger = message('Subject: hi\r\n\r\nhello');
    stranger.to = 'la@kho.test';
    await worker.email(stranger, { ...env, ALLOWED: `${email}, admin@kho.test` });
    assert.equal(stranger.rejected, 'Address not found');
  } finally {
    await srv.close();
  }
});

test('chỉ nhận thư gốc (Cloudflare Worker) hoặc JSON có chữ ký X-Signature; form, ?key= không còn', async () => {
  const { ctx, email, status } = setupWindow();
  const srv = await startTestServer(ctx);
  const raw = rawCodeMail({ to: email, code: '864200', date: new Date(ctx.now()) });
  try {
    const form = new URLSearchParams({ to: email, subject: 'Your ChatGPT code is 864200' }).toString();
    const sigForm = `sha256=${hmac(ctx.config.mail.webhookSecret, form)}`;
    assert.equal((await fetch(`${srv.url}/hooks/mail`, { method: 'POST', body: form, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-signature': sigForm } })).status, 400);
    assert.equal((await fetch(`${srv.url}/hooks/mail?key=${ctx.config.mail.webhookSecret}`, { method: 'POST', body: raw, headers: { 'content-type': 'message/rfc822' } })).status, 401);
    assert.equal(status().status, 'waiting');
    const res = await fetch(`${srv.url}/hooks/mail`, { method: 'POST', body: raw, headers: { 'content-type': 'message/rfc822', 'x-signature': `sha256=${hmac(ctx.config.mail.webhookSecret, raw)}` } });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(status().code, '864200');
  } finally {
    await srv.close();
  }
});
