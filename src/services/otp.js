// Gửi OTP: email (thư qua Cloudflare Email Sending) | esms (SMS qua eSMS.vn) | none (chưa mở) | dev (chạy thử: in ra log, không gửi).
import { asset } from '../views/asset.js';

async function postJson(url, body, timeoutMs = 8000, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: res.status, json, text };
}

/**
 * SMS qua eSMS.vn (API SendMultipleMessage_V4_post_json). Nội dung phải KHỚP mẫu đã đăng ký với eSMS
 * (brandname CSKH: SmsType 2; đầu số cố định: SmsType 8, khi đó không gửi Brandname). CodeResult "100" = eSMS đã nhận.
 * ESMS_SANDBOX=1: eSMS kiểm tra kết nối và thông số nhưng không gửi tin thật, không tính tiền.
 */
function esmsSender(ctx) {
  const e = ctx.config.otp.esms;
  return {
    name: 'esms',
    async send(phone, code) {
      const body = {
        ApiKey: e.apiKey, SecretKey: e.secretKey, Phone: phone, Content: e.template.replaceAll('{code}', code),
        SmsType: e.smsType, IsUnicode: '0', Sandbox: e.sandbox ? '1' : '0', RequestId: `tbq-${phone}-${ctx.now()}`.slice(0, 50),
      };
      if (e.smsType !== '8') body.Brandname = e.brandname;
      try {
        const r = await postJson(e.url, body);
        if (String(r.json?.CodeResult) === '100') return { ok: true };
        return { ok: false, error: `eSMS ${r.json?.CodeResult ?? r.status}: ${r.json?.ErrorMessage || r.text.slice(0, 120)}` };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    },
  };
}

/**
 * Thư mã xác nhận — dạng từng bước (giống trang khách v2): logo Tiệm → mã 6 số to trên nền đêm → 3 bước: chép mã → quay lại trang → nhập 6 ô.
 * Thư email chỉ hiểu bảng + style nội tuyến (Gmail / iCloud / Outlook) → nền sáng màu giấy của logo, không SVG, không font ngoài.
 * Không có nút mở lại trang: mở từ app Mail là trình duyệt khác, mất phiên đang giữ món. Tiêu đề bắt đầu bằng mã để iPhone gợi ý tự điền.
 */
export function otpEmail(code, min, logoUrl) {
  const steps = [
    ['Chép 6 số ở trên', 'iPhone thường tự gợi ý mã trên bàn phím, chạm là xong.'],
    ['Quay lại trang Tiệm Bản Quyền', 'Trang đang mở sẵn trên điện thoại của bạn.'],
    ['Nhập vào 6 ô', 'Đủ số là tự vào, món của bạn hiện ra liền.'],
  ];
  const text = [
    `Mã của bạn tới rồi nè: ${code}`, '',
    ...steps.map(([t, d], i) => `${i + 1}. ${t} — ${d}`), '',
    `Mã dùng được trong ${min} phút. Không phải bạn yêu cầu? Cứ bỏ qua thư này nha.`, '',
    'Tiệm Bản Quyền · Alo là có liền · tiembanquyen.com',
  ].join('\n');
  const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const step = ([t, d], i) => `<tr><td valign="top" width="40" style="padding:10px 0"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:#191914;color:#d4b06a;text-align:center;font:700 14px ${F}">${i + 1}</div></td>
<td style="padding:10px 0 10px 4px;font:600 16px/1.35 ${F};color:#1c1b17">${t}<div style="font:400 14px/1.45 ${F};color:#6b665c;margin-top:2px">${d}</div></td></tr>`;
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Mã xác nhận Tiệm Bản Quyền</title></head>
<body style="margin:0;padding:0;background:#f3f1eb">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Nhập ${code} vào trang Tiệm đang mở — mã dùng trong ${min} phút.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f1eb" style="background:#f3f1eb"><tr><td align="center" style="padding:24px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px">
<tr><td align="center" style="padding:4px 0 18px"><img src="${logoUrl}" width="200" height="61" alt="TBQ Space · Tiệm Bản Quyền" style="display:block;border:0;font:600 18px ${F};color:#1c1b17"></td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:22px;padding:28px 24px 22px;border:1px solid #e6e1d6">
<div style="font:700 26px/1.2 ${F};color:#1c1b17;letter-spacing:-0.5px;text-align:center">Mã của bạn tới rồi nè!</div>
<div style="font:400 15px/1.5 ${F};color:#6b665c;text-align:center;margin-top:6px">Còn 3 bước nhỏ xíu là có đồ Pro để cày.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 14px"><tr><td bgcolor="#191914" align="center" style="background:#191914;border-radius:18px;padding:20px 10px">
<div style="font:600 11px ${F};letter-spacing:3px;color:#a89f8c;text-transform:uppercase">Mã xác nhận</div>
<div style="font:700 40px/1.2 'SF Mono',Menlo,Consolas,monospace;letter-spacing:10px;color:#d4b06a;margin-top:6px;padding-left:10px">${code}</div>
<div style="font:400 13px ${F};color:#a89f8c;margin-top:6px">dùng được trong ${min} phút</div>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map(step).join('')}</table>
<div style="border-top:1px solid #eee9de;margin-top:14px;padding-top:14px;font:400 13px/1.5 ${F};color:#8a8475;text-align:center">Không phải bạn yêu cầu? Cứ bỏ qua thư này nha — không ai vào được nếu không có mã.</div>
</td></tr>
<tr><td align="center" style="padding:18px 0 4px;font:400 12px/1.6 ${F};color:#8a8475">Tiệm Bản Quyền · Alo là có liền<br><a href="https://tiembanquyen.com" style="color:#b38b45;text-decoration:none">tiembanquyen.com</a></td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

/**
 * Thư qua Cloudflare Email Sending (REST /accounts/:id/email/sending/send). Token cần quyền gửi thư;
 * MAIL_FROM phải thuộc tên miền đã bật Email Sending. Thành công = success:true và địa chỉ không nằm trong permanent_bounces.
 */
function emailSender(ctx) {
  const e = ctx.config.otp.email;
  const url = e.url || `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(e.accountId)}/email/sending/send`;
  return {
    name: 'email',
    async send(to, code) {
      const min = Math.max(1, Math.round(ctx.settings().otpTtlSec / 60));
      const { text, html } = otpEmail(code, min, ctx.config.baseUrl + asset('logo-email.png'));
      const body = { to, from: { address: e.from, name: e.fromName }, subject: `${code} là mã xác nhận Tiệm Bản Quyền`, text, html };
      try {
        const r = await postJson(url, body, 10000, { Authorization: `Bearer ${e.token}` });
        const res = r.json?.result;
        if (r.json?.success && !(res?.permanent_bounces || []).includes(to)) return { ok: true };
        if (r.json?.success) return { ok: false, error: 'Địa chỉ email không nhận thư (bounce)' };
        const err = r.json?.errors?.[0];
        return { ok: false, error: `Cloudflare ${err?.code ?? r.status}: ${err?.message || r.text.slice(0, 120)}` };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    },
  };
}

function devSender(ctx) {
  return {
    name: 'dev',
    async send(phone, code) {
      if (ctx.config.isProd) return { ok: false, error: 'OTP dev bị tắt ở production' };
      ctx.log('info', `OTP (dev) cho ${phone}: ${code}`);
      return { ok: true };
    },
  };
}

/** Tên kênh hiện cho khách: "Tiệm gửi mã 6 số qua <kênh>". Chạy thử trên máy cũng ghi SMS, cho giống bản thật. */
export function otpChannel(config) {
  return config.otp.channelLabel || (config.otp.loginBy === 'email' ? 'email' : 'SMS');
}

// Chưa có kênh gửi mã (OTP_PROVIDER=none): không gửi, khách được báo nhắn Zalo Tiệm.
function noneSender() {
  return { name: 'none', async send() { return { ok: false, error: 'Chưa có kênh gửi mã (OTP_PROVIDER=none)' }; } };
}

export function createOtpSender(ctx) {
  const p = ctx.config.otp.provider;
  return p === 'email' ? emailSender(ctx) : p === 'esms' ? esmsSender(ctx) : p === 'none' ? noneSender() : devSender(ctx);
}
