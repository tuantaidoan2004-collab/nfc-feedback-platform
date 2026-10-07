// Gửi OTP: email (thư qua Cloudflare Email Sending) | esms (SMS qua eSMS.vn) | none (chưa mở) | dev (chạy thử: in ra log, không gửi).

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
      const text = `Mã xác nhận của bạn tại Tiệm Bản Quyền: ${code}\n\nMã dùng được trong ${min} phút. Nếu bạn không yêu cầu mã này, cứ bỏ qua thư.`;
      const html = `<div style="font-family:Georgia,serif;font-size:16px;color:#2b2620;line-height:1.5">
<p>Mã xác nhận của bạn tại <b>Tiệm Bản Quyền</b>:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:16px 0">${code}</p>
<p>Mã dùng được trong ${min} phút. Nếu bạn không yêu cầu mã này, cứ bỏ qua thư.</p></div>`;
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
