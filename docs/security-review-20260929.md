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

### M1 · Trung bình · Ảnh đã duyệt vẫn thay được trong 5 phút sau khi tải lên — **đã vá**

**Bằng chứng:** link tải lên (`lib/owner/media.ts`) là một PUT có chữ ký, sống 5 phút, ghim loại và cỡ tệp nhưng **không
ghim nội dung**, và trong 5 phút đó gửi lại được bao nhiêu lần cũng được. `MediaReview.decide` duyệt ngay khi được hỏi. Vậy:
chủ quán tải ảnh sạch → Tài duyệt trong 5 phút → chủ quán gửi lại đúng link đó với một ảnh khác cùng cỡ (đệm byte là ra)
→ trang phát hành với ảnh không ai xem. Cửa duyệt (migration 023) là thứ giữ trang khách sạch theo chính sách Google;
lỗ này đi vòng qua nó. Test tái hiện đỏ trên `379e61c`: ảnh vừa tải lên được duyệt ngay (`state: approved`).

**Vá:** không quyết định nào — duyệt hay từ chối — trước khi link hết hạn: `UPLOAD_SETTLE_SECONDS` = 5 phút + 1 phút cho
đồng hồ của kho và của app lệch nhau, tính bằng đồng hồ cơ sở dữ liệu. Server trả `409 MEDIA_STILL_UPLOADING`; `/gov` ghi
"Link tải lên còn hiệu lực tới HH:MM", khoá hai nút, và tự mở khi tới giờ.

**Test:** `repository-tests/media-review.spec.ts` (từ chối cả hai quyết định, ranh giới 358 s / 360 s, không dòng audit nào
cho lần bị từ chối); `admin-http.spec.ts` ca "image gate" (đồng hồ giả của trình duyệt vượt giờ → nút mở, server chưa tới
giờ vẫn từ chối qua panel và qua gửi tay; hết hạn thật → duyệt được).

### M3 · Thấp–trung bình · Không giới hạn số tệp chờ duyệt của một quán — **đã vá**

**Bằng chứng:** mỗi lần xin link tải lên là một hàng `pending` trong hàng chờ của Tài, kể cả khi không tệp nào được gửi, và
không có trần: test tái hiện trên `f547bd3` xin 25 link cùng lúc, **cả 25 được ký**. Một thành viên có quyền sửa trang (hay
một tài khoản bị lấy mất) nhồi được hàng chờ tới mức ảnh thật chìm, và kho ảnh tới 50 MB mỗi link.

**Vá:** `PENDING_UPLOADS_MAX = 20` tệp chờ mỗi quán (một trang dùng tối đa năm ảnh). Đếm và ghi trong cùng một transaction,
dưới khoá advisory của quán, nên xin cùng lúc không lọt qua trần; quá trần thì `429 UPLOAD_QUEUE_FULL`. Có quyết định là
trống một chỗ. Hỗ trợ trong phiên thiết kế tính vào hàng chờ của chính quán đó.

**Test:** `repository-tests/impersonation.spec.ts` ca `PENDING_UPLOADS_MAX` (25 yêu cầu cùng lúc → đúng 20 được ký, 5 bị
từ chối; hỗ trợ cũng bị chặn; quán khác không ảnh hưởng; từ chối một tệp → xin được đúng một link nữa).

## 3. Đã rà, không thấy lỗ

| Chỗ | Đã xem | Kết luận |
|---|---|---|
| Thư viện | `pnpm audit` trên lockfile (72 gói chạy thật, 305 gói dev) | 0 lỗ đã biết. Chỉ `sharp`, `unrs-resolver` được chạy script cài đặt (`allowBuilds`); CI và Dockerfile cài `--frozen-lockfile` |
| Route ghi | 50 tệp `route.ts`: mọi `POST/PUT/PATCH/DELETE` | Đều qua `fromThisSite`, trừ `/api/csp-report` (trình duyệt tự gửi báo cáo, không mang quyền gì); quyền nằm ở lớp `lib` (`authorize` theo slug + vai), không ở giao diện |
| SQL | Mọi chỗ ghép chuỗi vào câu lệnh | Chỉ mảnh do code dựng (kiểu khoá, tên cột cố định, số thứ tự tham số); dữ liệu luôn là `$n` |
| HTML thô | `dangerouslySetInnerHTML`, `innerHTML`, `eval` | Một chỗ: ảnh QR của bản nháp, SVG do `lib/qr.ts` vẽ, nhãn cố định đã thoát ký tự, không chứa chữ người dùng |
| Xuất CSV | `csvCell` | Chặn công thức (`= + - @`, ký tự điều khiển đầu ô) |
| Google | `start`, `callback`, `lib/owner/google.ts` | state + PKCE + nonce, lượt đi gắn trình duyệt (cookie ký, Lax, 10 phút, xoá sau khi về), `hop` chỉ tới đường app dựng, không khớp tài khoản theo email |
| Đăng nhập | chủ quán, admin, link cài đặt | Tên lạ vẫn chạy trọn hàm băm; hạn mức theo tài khoản + toàn nền tảng; admin có 2FA chống dùng lại mã; link cài đặt 256 bit, chỉ lưu băm, dùng một lần; đổi mật khẩu đăng xuất phiên khác |
| IP khách | `server/guest-limits.ts`, `deploy/hosted/Caddyfile` | Chỉ tin một header, và Caddy ghi đè `X-Real-IP` ở mọi request |
| Tối ưu ảnh | `next.config.ts` | Không `remotePatterns`: `/_next/image` không làm proxy cho ảnh ngoài |

**Yếu có chủ ý, ghi để biết:** hạn mức đăng nhập toàn nền tảng (60 lượt/phút) giữ máy khỏi bị đốt bằng hàm băm, nhưng ai gửi
quá mức đó chặn được đăng nhập **bằng mật khẩu** của mọi người trong phút ấy; đăng nhập Google (D4c) không đi qua hạn mức này.
