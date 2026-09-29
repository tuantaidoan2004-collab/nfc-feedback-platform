# Rà bảo mật từ đầu tới cuối — Claude, 29/09/2026

Tài 29/09: *"dưới góc nhìn của một kỹ sư trưởng … đánh giá thực sự hệ thống web này đang cần gì (kể cả vá bảo mật từ front
end – back end chống lộ, hack), xây dựng lần lượt từ từ cái cần nhất"*. Skill: `security-and-hardening` (bảng chọn skill của dự
án). **Điểm yếu đã biết, như C3:** người rà là người viết mã. Cách bù: mỗi phát hiện có test tái hiện đỏ trước khi vá; Tài được
đề nghị chạy `/code-review ultra` (review nhiều agent, độc lập) trên nhánh này.

## 1. Mô hình đe doạ

**Tài sản**, theo mức thiệt hại nếu mất: lời nhắn và số điện thoại khách (dữ liệu cá nhân) · phiên và mật khẩu chủ quán ·
**tài khoản admin** (toàn quyền, có 2FA) · **thông tin nhận tiền** trong `platform_settings` (ai đổi được là chuyển tiền của quán
sang tài khoản khác) · trang của quán trên tên miền của nền tảng (giả mạo, lừa đảo) · khoá ký `NFC_RENDER_SIGNING_KEY` · client
Google OAuth.

**Ranh giới tin cậy:**

| Ranh giới | Ai gửi | Cửa |
|---|---|---|
| Trình duyệt khách → `/api/v2/pages/visits/*` | Người lạ, bot | Bí mật trình duyệt (Bearer), render proof có chữ ký, cùng site, bộ đếm A1 |
| Người lạ → `/`, `/bat-dau`, `/thu/<mã>`, `/api/start/*` | Người lạ | Bản nháp có chữ ký, dây bẫy chữ, giới hạn đăng ký (D4b) |
| Chủ quán → `/api/owner/v2/*`, `/ZZZ/*` | Người có phiên | Cookie Strict + `authorize` theo slug + quyền theo vai |
| Admin → `/gov/*` | Tài | Mật khẩu + 2FA, cookie riêng đường `/gov` |
| Google → `/api/owner/v2/google/callback` | Google (qua trình duyệt) | Cookie lượt đi có chữ ký + state + PKCE + nonce |
| Trình duyệt → R2 (PUT có chữ ký) | Chủ quán | Chữ ký ghim loại, cỡ, khoá, hạn |
| Ứng dụng → Neon, R2, Google | Máy chủ | Biến môi trường |

## 2. Phát hiện và việc đã làm

### H1 · Cao · Trang khách, trang chính và luồng dựng trang không có header bảo vệ nào — **đã vá**

**Bằng chứng (29/09, production):** `curl -D - https://quitesensational-review-bio.com/urr6ud` chỉ có
`strict-transport-security` (do Vercel tự thêm). Không `Content-Security-Policy`, không `X-Frame-Options`, không `nosniff`. Header
chỉ được gắn cho dashboard, `/gov`, `/owner` và hai đường nhúng khung. Hệ quả:

- **Không có lớp chặn thứ hai cho XSS:** một lỗi để lọt HTML nào đó vào trang (hôm nay chưa thấy lỗi nào — React tự thoát chữ)
  là chạy được mã bất kỳ trên tên miền của nền tảng.
- **Nhúng khung (clickjacking):** trang khách nhúng được vào trang lạ, dụ khách bấm "Xoá dữ liệu của tôi" hay gửi góp ý.
- **Chuyển sang VPS là mất cả HSTS.**

**Vá:** `proxy.ts` (Next 16) cho **mọi trang** một CSP với nonce riêng mỗi response; `lib/security/headers.ts` là chính sách, hàm
thuần. `script-src 'self' 'nonce-…' 'strict-dynamic'` (không `unsafe-inline`, không `unsafe-eval` ngoài môi trường dev),
`frame-ancestors 'none'` (trừ hai trang tự nhúng: ảnh trang trong dashboard, bản nháp trong `/bat-dau`), `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'` + trang đăng nhập Google, `connect-src 'self'` + kho ảnh, `upgrade-insecure-requests` khi
chạy https. Mọi response (cả API) có `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS 2 năm, `Permissions-Policy` (tắt
camera, micro, vị trí, thanh toán…; giữ cảm biến nghiêng cho template 6), `Cross-Origin-Opener-Policy`. API trả JSON dưới
`default-src 'none'`. Trình duyệt báo vi phạm về `/api/csp-report`, mỗi vi phạm một dòng log `CSP_VIOLATION` (không mang
query hay chữ khách gõ, tối đa 60 dòng/phút).

**Có chủ ý, nói thẳng:** `style-src` giữ `'unsafe-inline'` vì trang khách tô màu của từng quán bằng thuộc tính `style`; chặn nó là
trang mất diện mạo trước khi script kịp chạy. `img-src`/`media-src` nhận mọi `https:` vì ảnh cũ nằm ở địa chỉ R2 cũ, và ảnh chỉ lên
trang sau khi được duyệt (023).

**Kéo theo, cũng đã sửa:** ba trang pháp lý, trang hướng dẫn và trang 404 từng được dựng sẵn lúc build — không có nonce thì script
của chính chúng bị chặn — giờ render mỗi lượt. `robots.txt` và `sitemap.xml` từng đọc `APP_ORIGIN` **lúc build**: bản Docker (không
có biến đó lúc build) sẽ ra sitemap rỗng; giờ đọc lúc chạy.

**Test:** `tests/contracts/security-headers.spec.ts` (luật); `public-v2.spec.ts` ca H1 (header thật trên 8 đường, mọi thẻ
`<script>` mang đúng nonce của response, nonce đổi mỗi lượt, API deny-all, báo cáo vi phạm, trình duyệt chạy trang khách + trang
chính + bước dựng có iframe + 404 **không bị chặn gì**, và **ca đối chứng**: mã cài qua `onclick` bị chặn, bộ theo dõi thấy);
ca "production gate" (bản build: không `unsafe-eval`, nonce trên mọi script); `owner-dashboard.spec.ts` ca H1 (mọi mục dashboard
+ ảnh trang trong iframe, không bị chặn gì); ca D4c (form sang Google qua được `form-action`).
