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

### C3b-1 · Trung bình · Ảnh đã duyệt vẫn thay được trong 5 phút sau khi tải lên — **đã vá**

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

### C3b-2 · Thấp · Ảnh bị từ chối vẫn đọc được ở địa chỉ công khai, mãi mãi — **đã vá**

**Bằng chứng:** từ chối chỉ đổi trạng thái hàng trong `media_assets`; tệp vẫn nằm trên kho, đọc công khai ở đúng URL chủ quán
đã nhận. Từ chối là quyết định cuối (muốn đổi thì tải ảnh mới), nên tệp đó không bao giờ được dùng nữa, nhưng vẫn là nội
dung bị Tài từ chối, phục vụ dưới tên miền ảnh của nền tảng: ai có quyền sửa trang của một quán đã duyệt có thể dùng kho làm
chỗ chứa tệp, và ảnh có người trong đó nằm lại không vì lý do gì. Test tái hiện đỏ trên `7720803`: từ chối, không có gì bị xoá.

**Vá:** sau khi quyết định từ chối đã ghi, server xoá tệp bằng một `DELETE` có chữ ký (R2 nhận presigned DELETE). Chỉ xoá khoá
của **một tệp app này đã ký cho quán** (`shops/<uuid>/<uuid>.<jpg|png|webp|mp4>` dưới địa chỉ công khai hiện tại, `uploadKey`),
nên không URL nào trong request hay trong trang trỏ được việc xoá đi chỗ khác. Kho báo 404 cũng coi là đã xoá. Kho lỗi thì
quyết định vẫn đứng, trả `removed: false` và ghi một dòng `MEDIA_REMOVE_FAILED {"media":"<id>","cause":"…"}`. Nếu `cause` là `STORE_403`:
token R2 phải là **Object Read & Write** (`docs/r2-uploads.md`), quyền đó có xoá.

**Test:** `tests/contracts/media-removal.spec.ts` (khoá nào được xoá, khoá nào không: địa chỉ kho cũ, ảnh hồ sơ, `..`, query,
đuôi lạ, tên miền giả; một DELETE có chữ ký riêng, khác chữ ký GET; 204/404 là xong, 403/500 là lỗi);
`repository-tests/media-review.spec.ts` (từ chối → xoá đúng URL; duyệt → không đụng; kho lỗi → quyết định vẫn đứng, log một dòng).

### C3b-3 · Thấp–trung bình · Không giới hạn số tệp chờ duyệt của một quán — **đã vá**

**Bằng chứng:** mỗi lần xin link tải lên là một hàng `pending` trong hàng chờ của Tài, kể cả khi không tệp nào được gửi, và
không có trần: test tái hiện trên `f547bd3` xin 25 link cùng lúc, **cả 25 được ký**. Một thành viên có quyền sửa trang (hay
một tài khoản bị lấy mất) nhồi được hàng chờ tới mức ảnh thật chìm, và kho ảnh tới 50 MB mỗi link.

**Vá:** `PENDING_UPLOADS_MAX = 20` tệp chờ mỗi quán (một trang dùng tối đa năm ảnh). Đếm và ghi trong cùng một transaction,
dưới khoá advisory của quán, nên xin cùng lúc không lọt qua trần; quá trần thì `429 UPLOAD_QUEUE_FULL`. Có quyết định là
trống một chỗ. Hỗ trợ trong phiên thiết kế tính vào hàng chờ của chính quán đó.

**Test:** `repository-tests/impersonation.spec.ts` ca `PENDING_UPLOADS_MAX` (25 yêu cầu cùng lúc → đúng 20 được ký, 5 bị
từ chối; hỗ trợ cũng bị chặn; quán khác không ảnh hưởng; từ chối một tệp → xin được đúng một link nữa).

### L1 · Trung bình · Một máy lạ khoá được đăng nhập bằng mật khẩu của mọi người, kể cả `/gov` — **đã vá**

**Bằng chứng:** hạn mức đăng nhập đếm **toàn nền tảng trước** (chủ quán 60/phút, admin 20/phút), rồi **theo tài khoản trên
mọi địa chỉ** (chủ quán 8/15 phút, admin 5/15 phút); không có tầng theo địa chỉ. Vậy: một máy gửi 61 lượt/phút khoá đăng
nhập mật khẩu của mọi chủ quán; 21 lượt/phút khoá `/gov`; 9 lượt vào @handle của một quán khoá quán đó 15 phút; 6 lượt vào
tên đăng nhập admin — chủ quán nào từng được hỗ trợ đều thấy tên đó nếu admin chưa đặt handle — khoá Tài 15 phút, đúng lúc có
sự cố. Người bị khoá chỉ thấy "sai mật khẩu". Test tái hiện đỏ trên `3c34cef`: hạn mức toàn nền tảng đếm đủ 40 lượt (admin) và
25 lượt (chủ quán) của **một** địa chỉ; link cài đặt đếm 61.

**Vá:** đếm từ cụ thể tới chung, mỗi tầng chỉ đếm lượt mà các tầng trước đã cho qua (`countAttempt`, `lib/owner/auth.ts`):

| | Địa chỉ | Tài khoản, từ địa chỉ đó | Tài khoản, mọi địa chỉ | Toàn nền tảng |
|---|---|---|---|---|
| Chủ quán: đăng nhập, đổi mật khẩu | 10/phút | 8/15 phút | 30/15 phút | 60/phút |
| Admin | 5/phút | 5/15 phút | 20/15 phút | 60/phút (chỉ là ngân sách hàm băm trên khoá riêng của admin) |
| Link cài đặt | 10/phút | — | — | 60/phút |

Địa chỉ lấy từ đúng một header deployment tin (`server/guest-limits.ts`: Caddy ghi đè trên VPS, Vercel ghi đè trên Vercel),
chỉ lưu bản băm. Không có header đó thì không có tầng địa chỉ và luật cũ giữ nguyên. Đổi mật khẩu thành công, hay đặt lại tài
khoản template, xoá mọi bộ đếm của tài khoản đó (`<bucket>` và `<bucket>:%`).

**Còn lại, nói thẳng:** nhiều máy cùng lúc (botnet) vẫn tiêu được hạn mức toàn nền tảng. Đoán mật khẩu **một** tài khoản từ
nhiều địa chỉ giờ được 30 lượt/15 phút thay vì 8: đó là giá của việc một máy lạ không khoá được chủ tài khoản. Admin còn 2FA,
chủ quán còn đăng nhập Google (D4c) — hai đường này không đi qua hạn mức mật khẩu.

**Test:** `owner-dashboard.spec.ts` (một địa chỉ đoán tên bịa: dừng ở 10, toàn nền tảng chỉ thấy 10, quán khác vẫn vào; đoán
mật khẩu một quán: làn của địa chỉ đó đóng sau 8 kể cả khi đúng mật khẩu, chủ quán từ nhà vẫn vào; 30 địa chỉ → khoá tài
khoản; không header → luật cũ); `admin-auth.spec.ts` (cùng ba ý cho admin); `owner-setup.spec.ts` (một địa chỉ đoán 70 link →
toàn nền tảng chỉ đếm 10, quán khác vẫn đặt được mật khẩu).

### T1 · Thấp · `?khung=1` ẩn băng "Bản xem thử" ở bất cứ đâu — **đã vá**

**Bằng chứng:** bản nháp `/thu/<mã>` là trang ai cũng dựng được trên tên miền nền tảng, sống 7 ngày (tên quán ≤ 60 ký tự đã
lọc, một template). Băng "Bản xem thử" là thứ nói với người mở rằng đây chưa phải trang thật của quán nào; `?khung=1` — dành
cho khung trong `/bat-dau` — tắt băng ở mọi nơi, kể cả khi mở thẳng link.

**Vá:** chỉ khung nhúng mới mất băng, theo `Sec-Fetch-Dest: iframe` — header do trình duyệt tự đặt, trang không giả được — và
`frame-ancestors 'self'` chỉ cho trang của chính nền tảng nhúng. Trình duyệt quá cũ không gửi header đó thì thấy băng cả trong
khung: chỉ xấu, không hở.

**Test:** `public-v2.spec.ts` ca D4: khung trong trình dựng không có băng; mở thẳng kèm `?khung=1` vẫn có băng.

### G1 · Trung bình · Một phiên để ngỏ đủ để gắn Google của người khác, vĩnh viễn — **đã vá**

**Bằng chứng:** "Kết nối Google" trong Hồ sơ chỉ cần phiên đang đăng nhập. Ai cầm được phiên đó — nhân viên dùng chung máy
của chủ quán, một máy quên đăng xuất — bấm là nối được **Google của chính họ**, và từ đó vào bằng Google mãi mãi: sống qua
lúc phiên hết hạn và qua lần chủ quán **đổi mật khẩu** (đổi mật khẩu chỉ đăng xuất các phiên, không gỡ Google). Chủ quán còn
**không gỡ được**: chưa có nút ngắt kết nối. Trên `48c364f` điều đó đọc thẳng trong mã: `GoogleAccounts.signedIn` chỉ đọc phiên,
và không route nào đặt `google_sub` về rỗng. (Lỗ thiết kế, không phải một ca tấn công để chạy lại, nên test mới đỏ trên mã cũ
chỉ vì hàm chưa có — nói thẳng.)

**Vá:** một cửa chung `OwnerAuth.withPassword` — phiên chủ quán thật (không phải phiên hỗ trợ), mật khẩu hiện tại, cùng khe
băm và **cùng các hạn mức của đăng nhập** (L1), rồi mới làm việc được hỏi trong cùng transaction. Đổi mật khẩu, **nối Google**
(mật khẩu gõ ngay trên form "Kết nối Google", kiểm trước khi rời sang Google) và **ngắt kết nối Google** (mới) đều qua cửa đó.
Ngắt thì đăng xuất **mọi phiên khác** của tài khoản — phiên nào cũng có thể do Google đó mở. Tài khoản tạo bằng Google có khoá
ngẫu nhiên không mật khẩu nào khớp, nên không tự ngắt được đường vào duy nhất của nó.

**Test:** `google-sign-in.spec.ts` (sai mật khẩu, thiếu mật khẩu, phiên hỗ trợ đều bị từ chối; ngắt đăng xuất phiên Google đã
mở ở nơi khác, giữ phiên đang hỏi; ngắt lần hai báo không còn nối; tài khoản Google không tự ngắt được); `admin-http.spec.ts`
ca D4c (sai mật khẩu thì không sang Google; đúng thì nối; ngắt từ phiên mật khẩu → phiên Google bị đăng xuất, Google không mở
được nữa).

### Mặt trận 3 của C3 (media/R2): bốn điểm Astra nêu 20/09

| Điểm | Giờ |
|---|---|
| Quota tổng | Mỗi quán tối đa 20 tệp chờ (C3b-3), tệp bị từ chối bị xoá (C3b-2); mỗi tệp còn lại là một lần Tài duyệt |
| Không kiểm byte thật sau khi tải | Loại tệp nằm trong chữ ký, nên kho phục vụ đúng loại đã khai (`image/*`, `video/mp4`): trình duyệt không bao giờ đọc nó thành trang web, và kho ở tên miền khác app. Người duyệt xem chính tệp, và C3b-1 bảo đảm tệp đó là tệp sẽ ở lại |
| Hạn và phát lại link ký | 5 phút; gửi lại trong 5 phút không còn đi vòng được cửa duyệt (C3b-1) |
| Thu hồi quyền sau khi đã ký | Link còn sống tối đa 5 phút sau khi người đó mất quyền; tệp gửi lên vẫn vào hàng chờ và vẫn phải được duyệt, còn phát hành đòi quyền **lúc phát hành** |

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
| Cookie `Secure` trên VPS | Cờ `secure` đọc từ `new URL(request.url).protocol`; Caddy nói chuyện với app bằng http | Next dựng `request.url` theo `X-Forwarded-Proto` (`next/dist/server/next-server.js`, `initProtocol`), Caddy tự đặt header đó là `https` và ghi đè giá trị khách gửi — cookie vẫn `Secure` |
| Link của quán | `lib/publishing/config.ts` | Chỉ `https:` (không tên/mật khẩu trong URL) hoặc `tel:` toàn chữ số: không có `javascript:` hay `data:` nào lên trang khách |
| Đường ghi của khách (mặt trận 2 của C3) | `server/visit-v2-api.ts` | Cùng site, Bearer, render proof có chữ ký, khoá body đúng từng thao tác, 4 KB (16 KB góp ý), bộ đếm A1 trước khi ghi, log từ chối không mang IP/bí mật/nội dung. Còn: spam chậm từ nhiều địa chỉ — vốn có ở mọi góp ý ẩn danh, và góp ý là riêng tư nên không hại quán công khai |

**Yếu còn lại, ghi để biết:** hạn mức đăng nhập toàn nền tảng vẫn tiêu được bằng **nhiều** máy cùng lúc (L1 chỉ chặn một
máy); đăng nhập Google (D4c) không đi qua hạn mức này.
