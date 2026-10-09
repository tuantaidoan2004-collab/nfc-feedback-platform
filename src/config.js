// Cấu hình đọc từ biến môi trường (.env). Xem .env.example để biết ý nghĩa từng biến.

const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

export function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const config = {
    isProd,
    port: int(env.PORT, 3000),
    // Chỉ nghe trên máy này (127.0.0.1) khi đứng sau proxy / Cloudflare Tunnel: máy khác trong mạng không gọi thẳng được (không giả header IP).
    host: String(env.HOST || '').trim() || undefined,
    baseUrl: (env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    dbPath: env.DB_PATH || './data/tbq.sqlite',
    // IP thật của khách khi chạy sau proxy: tên ĐÚNG MỘT header proxy luôn ghi đè (Caddy: x-real-ip; Cloudflare: cf-connecting-ip).
    clientIpHeader: String(env.CLIENT_IP_HEADER || '').trim().toLowerCase(),
    // Cách cũ: TRUST_PROXY=1 → địa chỉ cuối của X-Forwarded-For. Nên dùng CLIENT_IP_HEADER.
    trustProxy: env.TRUST_PROXY === '1',
    appSecret: env.APP_SECRET || (isProd ? '' : 'dev-app-secret-change-me'),
    // 32 byte base64 để mã hoá mật khẩu tài khoản trong kho. Tạo: openssl rand -base64 32
    dataKey: env.DATA_KEY || (isProd ? '' : 'ZGV2LWRhdGEta2V5LTMyLWJ5dGVzLWxvbmctLS0tLS0='),
    adminPassword: env.ADMIN_PASSWORD || (isProd ? '' : 'admin'),
    // Khoá 2FA đăng nhập quản trị (base32, app Authenticator). Có thì đăng nhập cần mật khẩu + mã 6 số. Bật: npm run bat-2fa-quan-tri.
    adminTotpRaw: String(env.ADMIN_TOTP || '').trim(),
    // Email / SĐT chủ tiệm dùng để thử (cách nhau dấu phẩy, chủ chọn 08/10/2026): luôn nhận được tài khoản mới — bỏ qua mọi hạn mức,
    // khoá, chấm rủi ro, "máy đang giữ slot người khác". Vẫn cần chạm thẻ ở quán (quán đang mở) và kho còn hàng. Trống = tắt.
    ownerIds: list(env.OWNER_IDS).map((s) => s.toLowerCase()),
    // Email nhận thư báo động (sự kiện đỏ, trang khách lỗi, sao lưu trễ, bot im…), cách nhau dấu phẩy. Gửi bằng kênh thư
    // Cloudflare của mã đăng nhập (CF_ACCOUNT_ID / CF_EMAIL_TOKEN / MAIL_FROM). Trống = không gửi, chỉ xem ở trang quản trị.
    // Địa chỉ sai thì bỏ qua (npm run kiem-tra nhắc) — sai 1 email báo động không được làm máy chủ không chạy.
    alertEmails: list(env.ALERT_EMAILS).map((s) => s.toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
    // Sao lưu ngoài máy chủ (src/domain/sao-luu-ngoai.js): URL /sao-luu của bộ canh Worker + khoá (= BACKUP_TOKEN của Worker). Trống = tắt.
    offsite: {
      url: String(env.OFFSITE_URL || '').trim(),
      token: String(env.OFFSITE_TOKEN || '').trim(),
    },
    mail: {
      webhookSecret: env.MAIL_WEBHOOK_SECRET || (isProd ? '' : 'dev-mail-secret'),
    },
    // Kiểm thư mã về nhầm hộp thư (src/domain/mail-route.js): hộp thư catch-all ma.tiembanquyen.site (CapCut Tool) cho hỏi
    // "địa chỉ kho nào có thư rơi vào đây" bằng khoá riêng (= watch_token trong config.json của hộp thư). Trống = tắt.
    hubWatch: {
      url: String(env.HUB_WATCH_URL || '').trim(),
      token: String(env.HUB_WATCH_TOKEN || '').trim(),
      domain: String(env.HUB_WATCH_DOMAIN ?? 'tiembanquyen.site').trim().toLowerCase(),
    },
    // Khoá ký vé dùng chung với trang quán QS (bên QS: NFC_EVENT_TBQ_KEY). Vé chứng minh khách vừa mở trang quán bằng thẻ / mã QR
    // trên bàn → đang ở quán. Thiếu khoá thì không ai nhận được công cụ. Tạo: openssl rand -hex 32
    // Trang quán QS (Tài): chủ chỉ dán link / mã quán, TBQ tự đọc tên quán từ trang này. Có thư mục cũng được.
    qsOrigin: String(env.QS_ORIGIN || 'https://quitesensational-review-bio.com').trim().replace(/\/+$/, ''),
    qsTicketKey: env.QS_TICKET_KEY || (isProd ? '' : 'dev-qs-ticket-key-change-me-0123456789'),
    // Khoá RIÊNG cho API kho (/hooks/qs/kho — QS thêm / sửa / xem tài khoản trong kho). Khác khoá vé: lộ hay cần cắt quyền kho
    // thì đổi khoá này, vé ở quán vẫn chạy. Trống = tắt API kho. Tạo: openssl rand -hex 32. Bên QS: NFC_EVENT_TBQ_KHO_KEY.
    qsKhoKey: String(env.QS_KHO_KEY || (isProd ? '' : 'dev-qs-kho-key-change-me-0123456789abcdef')).trim(),
    // Mã cho bot mời / gỡ thành viên Canva chạy trên máy của chủ tiệm (API /worker). Để trống = tắt API này.
    workerToken: env.WORKER_TOKEN || (isProd ? '' : 'dev-worker-token-change-me-0123'),
    otp: {
      provider: env.OTP_PROVIDER || (isProd ? 'esms' : 'dev'), // email | esms | none | dev (chỉ chạy thử)
      // Khách đăng nhập bằng gì: email (mã gửi vào hộp thư) hoặc phone (mã qua SMS). Mặc định theo kênh gửi.
      loginBy: env.LOGIN_BY === 'phone' || env.LOGIN_BY === 'email' ? env.LOGIN_BY
        : env.OTP_PROVIDER === 'email' ? 'email' : 'phone',
      // Gửi mã qua email bằng Cloudflare Email Sending (REST). Tên miền gửi phải đã bật Email Sending trên Cloudflare.
      email: {
        url: env.CF_EMAIL_URL || '',
        accountId: String(env.CF_ACCOUNT_ID || '').trim(),
        token: String(env.CF_EMAIL_TOKEN || '').trim(),
        from: String(env.MAIL_FROM || '').trim(),
        fromName: env.MAIL_FROM_NAME || 'Tiệm Bản Quyền',
      },
      // Chỉ dùng khi phát triển: hiện mã OTP ngay trên màn hình. Cấm bật ở production.
      devShow: env.OTP_DEV_SHOW === '1',
      esms: {
        url: env.ESMS_URL || 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/',
        apiKey: env.ESMS_API_KEY || '',
        secretKey: env.ESMS_SECRET_KEY || '',
        brandname: env.ESMS_BRANDNAME || '',
        smsType: String(env.ESMS_SMS_TYPE || '2'),
        // Phải trùng mẫu đã đăng ký với eSMS; {code} được thay bằng mã 6 số. Không dấu.
        template: env.ESMS_TEMPLATE || '{code} la ma xac nhan cua ban tai Tiem Ban Quyen. Ma co hieu luc trong 5 phut.',
        sandbox: env.ESMS_SANDBOX === '1',
      },
      // Tên kênh hiện cho khách ("Tiệm gửi mã qua ..."). Để trống = theo nhà cung cấp.
      channelLabel: env.OTP_CHANNEL_LABEL || '',
    },
    /** Tiền tố đường dẫn khi TBQ chạy dưới 1 thư mục con, lấy từ BASE_URL (vd. https://thu.tiembanquyen.com/colap → "/colap"). Gốc tên miền → "". */
    get basePath() { return basePathOf(this.baseUrl); },
  };
  return config;
}

export function basePathOf(baseUrl) {
  try { return new URL(baseUrl).pathname.replace(/\/+$/, ''); } catch { return ''; }
}

/** Trả về danh sách lỗi cấu hình. Ở production phải rỗng mới được chạy. */
export function validateConfig(c) {
  const errors = [];
  if (c.isProd) {
    if (!c.appSecret || c.appSecret.length < 24) errors.push('APP_SECRET phải dài ít nhất 24 ký tự');
    if (!c.dataKey || Buffer.from(c.dataKey, 'base64').length !== 32) errors.push('DATA_KEY phải là 32 byte base64 (openssl rand -base64 32)');
    if (!c.adminPassword || c.adminPassword.length < 12) errors.push('ADMIN_PASSWORD phải dài ít nhất 12 ký tự');
    // Khoá 2FA sai mà vẫn chạy = tắt 2FA trong im lặng → không cho chạy (bật bằng script nên không gõ tay).
    if (c.adminTotpRaw && !/^[A-Z2-7]{26,64}$/.test(c.adminTotpRaw)) errors.push('ADMIN_TOTP phải là khoá base32 (chữ A-Z, số 2-7) do npm run bat-2fa-quan-tri tạo, hoặc để trống');
    if (!c.mail.webhookSecret || c.mail.webhookSecret.length < 24) errors.push('MAIL_WEBHOOK_SECRET phải dài ít nhất 24 ký tự');
    // none = chưa có kênh gửi mã (chưa đăng ký eSMS): máy chủ chạy để chủ nhập kho / cài đặt, khách chưa nhận được mã.
    if (!['email', 'esms', 'none'].includes(c.otp.provider)) errors.push('OTP_PROVIDER phải là email hoặc esms ở production (none = chưa mở nhận khách; dev chỉ để chạy thử)');
    if (c.otp.provider === 'email') {
      if (!c.otp.email.accountId || !c.otp.email.token) errors.push('Cần CF_ACCOUNT_ID và CF_EMAIL_TOKEN khi OTP_PROVIDER=email');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.otp.email.from)) errors.push('Cần MAIL_FROM (vd. xacnhan@tiembanquyen.site) khi OTP_PROVIDER=email');
      if (c.otp.loginBy !== 'email') errors.push('OTP_PROVIDER=email thì LOGIN_BY phải là email');
    }
    if (c.otp.provider === 'esms' && c.otp.loginBy !== 'phone') errors.push('OTP_PROVIDER=esms thì LOGIN_BY phải là phone');
    if (c.otp.devShow) errors.push('OTP_DEV_SHOW không được bật ở production');
    if (c.otp.provider === 'esms') {
      if (!c.otp.esms.apiKey || !c.otp.esms.secretKey) errors.push('Cần ESMS_API_KEY và ESMS_SECRET_KEY khi OTP_PROVIDER=esms');
      if (c.otp.esms.smsType !== '8' && !c.otp.esms.brandname) errors.push('Cần ESMS_BRANDNAME (hoặc ESMS_SMS_TYPE=8 cho đầu số cố định)');
      if (!c.otp.esms.template.includes('{code}')) errors.push('ESMS_TEMPLATE phải có {code}');
      if (c.otp.esms.sandbox) errors.push('ESMS_SANDBOX=1 chỉ để thử kết nối, tắt đi khi chạy thật (khách sẽ không nhận được tin)');
    }
    if (!c.baseUrl.startsWith('https://')) errors.push('BASE_URL phải là https:// ở production');
    if (c.clientIpHeader && !/^[a-z0-9-]+$/.test(c.clientIpHeader)) errors.push('CLIENT_IP_HEADER phải là tên 1 header, ví dụ x-real-ip');
    // HTTPS ở production nghĩa là có proxy phía trước. Không chỉ ra header IP thì mọi request mang IP của proxy
    // → mọi giới hạn theo IP (OTP / IP / giờ) gộp tất cả khách làm một.
    if (!c.clientIpHeader && !c.trustProxy) errors.push('Cần CLIENT_IP_HEADER (vd. x-real-ip — xem README mục "Đưa lên VPS") để đọc đúng IP khách sau proxy');
    if (c.hubWatch.url && !c.hubWatch.url.startsWith('https://')) errors.push('HUB_WATCH_URL phải là https://');
    if (c.hubWatch.url && c.hubWatch.token.length < 24) errors.push('HUB_WATCH_TOKEN phải dài ít nhất 24 ký tự (= watch_token của hộp thư)');
    if (c.workerToken && c.workerToken.length < 24) errors.push('WORKER_TOKEN phải dài ít nhất 24 ký tự (openssl rand -base64 32)');
    if (c.qsKhoKey && c.qsKhoKey.length < 32) errors.push('QS_KHO_KEY phải dài ít nhất 32 ký tự (openssl rand -hex 32), hoặc để trống để tắt API kho');
    if (c.qsKhoKey && c.qsKhoKey === c.qsTicketKey) errors.push('QS_KHO_KEY phải khác QS_TICKET_KEY (để cắt quyền kho mà không hỏng vé ở quán)');
    if (!c.qsTicketKey || c.qsTicketKey.length < 32) errors.push('QS_TICKET_KEY phải dài ít nhất 32 ký tự và giống NFC_EVENT_TBQ_KEY bên QS (openssl rand -hex 32)');
  }
  let u = null;
  try { u = new URL(c.baseUrl); } catch { /* báo lỗi bên dưới */ }
  if (!u || u.search || u.hash || !/^(\/[A-Za-z0-9_-]+)*\/?$/.test(u.pathname)) {
    errors.push('BASE_URL phải dạng https://tên-miền hoặc https://tên-miền/thư-mục (vd. https://thu.tiembanquyen.com/colap), không có ? hay #');
  }
  return errors;
}
