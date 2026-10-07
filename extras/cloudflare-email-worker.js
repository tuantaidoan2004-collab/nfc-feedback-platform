// Cloudflare Email Worker cho tên miền kho: nhận thư → ký HMAC → đẩy NGUYÊN THƯ GỐC về hệ thống (POST /hooks/mail).
// Hệ thống tự đọc thư (src/lib/mime.js), Worker chỉ làm việc nhẹ để không vượt giới hạn 10 ms của gói miễn phí.
//
// Cài đặt (làm trên trang Cloudflare, không cần cài gì trên máy) — xem README mục "Dịch vụ mail → webhook":
//   1. Workers & Pages → Create → Worker → dán toàn bộ file này → Deploy.
//   2. Worker → Settings → Variables and Secrets:
//        WEBHOOK_URL    = https://<tên-miền-hệ-thống>/hooks/mail
//        WEBHOOK_SECRET = đúng chuỗi MAIL_WEBHOOK_SECRET trong .env (chọn kiểu "Secret")
//        BACKUP_EMAIL   = (tuỳ chọn) hộp thư dự phòng chỉ chủ đọc được; phải là "Destination address" đã xác minh trong Email Routing
//        ALLOWED        = (tuỳ chọn) danh sách địa chỉ nhận hợp lệ, phân cách dấu phẩy; để trống = nhận mọi địa chỉ của tên miền
//   3. Email → Email Routing → Routing rules → Catch-all (hoặc từng địa chỉ) → Action "Send to a Worker" → chọn Worker này.

const enc = new TextEncoder();

async function hmacHex(secret, bytes) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function push(env, body) {
  const signature = `sha256=${await hmacHex(env.WEBHOOK_SECRET, body)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'message/rfc822', 'X-Signature': signature },
        body,
      });
      if (res.ok) return true;
      if (res.status < 500) return false; // sai chữ ký/cấu hình: thử lại cũng vô ích
    } catch { /* mạng lỗi → thử lại 1 lần */ }
  }
  return false;
}

export default {
  async email(message, env) {
    const to = String(message.to || '').toLowerCase();
    const allowed = String(env.ALLOWED || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(to) && !allowed.includes(to.replace(/\+[^@]*@/, '@'))) {
      message.setReject('Address not found');
      return;
    }
    // Ghi người nhận/người gửi THẬT (phong bì SMTP) lên đầu thư. Nằm trong phần được ký nên không ai sửa được.
    const head = enc.encode(`X-Envelope-To: ${to}\r\nX-Envelope-From: ${String(message.from || '').toLowerCase()}\r\n`);
    const original = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const body = new Uint8Array(head.length + original.length);
    body.set(head);
    body.set(original, head.length);

    if (await push(env, body)) return;
    // Hệ thống không nhận được: chuyển bản sao sang hộp thư dự phòng để chủ đọc tay.
    if (env.BACKUP_EMAIL) {
      await message.forward(env.BACKUP_EMAIL);
      return;
    }
    throw new Error('Webhook /hooks/mail không nhận thư và chưa đặt BACKUP_EMAIL');
  },
};
