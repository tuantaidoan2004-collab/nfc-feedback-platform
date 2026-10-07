# Tiến độ — hệ thống trải nghiệm 1 ngày (cập nhật 06/10/2026)

## Trạng thái: **bản thương mại 1.0.2** — 89/89 test (`npm test`), 134/134 e2e (cả `/colap`), mô phỏng 9 ngày 0 vi phạm, diễn tập vận hành sâu 105/105 — hướng dẫn mở bán: `docs/HUONG-DAN-MO-BAN.md`, bàn giao: `../BAN-GIAO-TIEP.md`

**Phiên 26 (07/10): mã xác nhận qua email** (`OTP_PROVIDER=email`, Cloudflare Email Sending) thay cho SMS khi chưa có eSMS. 113/113, e2e 145/145.
Chờ chủ mua Workers Paid + bật Email Sending cho tiembanquyen.site — xem đầu `../BAN-GIAO-TIEP.md`.

**Phiên 25 (06/10 tối): bịt chỗ hở thư về nhầm hộp thư** — `src/domain/mail-route.js` (mỗi 10 phút hỏi hộp thư catch-all ma.tiembanquyen.site,
báo đỏ `mail_wrong_route`), `kiem-tra` có mục mới. 106/106, e2e 135/135. **Tạm dừng theo lời chủ ("Cọ Láp từ từ")**: chưa đóng gói, máy thật vẫn 1.0.4 —
xem đầu `../BAN-GIAO-TIEP.md`.

**Phiên 22 (06/10): kho chuẩn chủ chọn** — ChatGPT 3 tài khoản × 8 (24/ngày), Claude 3 × 3 (6 trong ngày + 3 sáng sớm nhờ dự phòng). `PILOT_STOCK`
(`scripts/pilot.js`) → `kiem-tra` báo khi kho thiếu; `toolAvailability().expiring` = tài khoản tự hết hạn trong 24 giờ (Claude 7 ngày) → ô kho Theo dõi
và `kiem-tra` nhắc thay. Diễn tập dùng đúng kho chuẩn. Bản 1.0.2.

**Phiên 21 (06/10): buổi sáng ChatGPT / Claude (chủ chọn).** Nghỉ nhận 5h–6h (`quota.toolClosing`, Cài đặt `endHourCloseMin` = 60; trang chọn
"Mở lại lúc 6h"); Claude giữ 1 tài khoản dự phòng (`tools.reserve_account`, `quota.reserveAccountId`: trong ngày không giao, có tài khoản chờ
"Đăng xuất mọi thiết bị" / cách ly thì giao; cần ≥ 2 tài khoản). Test mới `test/sang-som.test.js`; diễn tập Claude 3 tài khoản, 6h05 vẫn nhận được Claude.
Bản 1.0.1.

**Phiên 20 (06/10): deep test vận hành thật + đóng gói thương mại.** Sửa 4 kỳ vọng e2e cũ; sửa 2 lỗi cơ chế (bạn mượn máy chỉ đăng nhập làm chủ
máy bị +30 điểm → vàng → từ chối mãi; chạm lại thẻ QS khi lượt vào còn hạn không tính lại 30 phút); trang khách ghi "Dùng tới HH:MM DD/MM".
Bộ diễn tập thêm hãng giả Claude (mã về hộp thư Tiệm), nhóm Canva giả + bot giả gọi đúng API `/worker`; `van-hanh-sau` 23 phần
(Claude, Canva, 6h sáng "Đăng xuất mọi thiết bị", hết 7 ngày Canva / Adobe / Claude, 2 lỗi vừa sửa) → 101/101. Chạy tay trên trình duyệt
(iPhone) ChatGPT / Claude / Canva: 0 vi phạm. Thêm `npm run kiem-tra`, `tao-env`, `dong-goi`, thư mục `deploy/`, `docs/HUONG-DAN-MO-BAN.md`.

**Phiên 18 (05/10): vận hành độc lập thử** (`npm run doc-lap`, `docs/van-hanh-doc-lap.md`): Claude làm chủ 2 ngày, 159 khách, chỉ dùng
trang quản trị + Trang của chủ. Việc tay chờ 25–45 phút (chủ tự động: 429), khách hết hạn còn dùng ~98 phút (tự động: ~490), 0 vi phạm.
Sửa: báo hết kho (đỏ) / hết lượt / quán hết suất (vàng) + ô "Kho hôm nay" trên Theo dõi; dòng "Nên làm" cho báo động; sửa nhanh lượt / suất trên
danh sách; nhãn tiếng Việt cho mọi sự kiện. 79/79 · e2e 134/134 · sim 0 · van-hanh-sau 68/68.

**Phiên 17 (05/10): kịch bản vận hành sâu tự động** (`npm run van-hanh-sau`, 19 tình huống, 68/68). Sửa: Adobe dùng chung — mã của người 2
bị gán cho người 1 và mã người ngoài bị nuốt (mất báo động mồ côi); tài khoản bị cách ly vẫn cho "giữ mật khẩu cũ" (+ ô khoá 2FA mới ở Việc tay);
ô Việc tay trên điện thoại. 78/78 · e2e 134/134 · sim 0 vi phạm (3 hạt giống).

**Phiên 16 (05/10): diễn tập vận hành — kho giả, vận hành thật** (`npm run van-hanh`, báo cáo `docs/dien-tap-van-hanh.md`).
TBQ production sau Caddy giả, người thật bấm trên trình duyệt, hãng giả kiểm đăng nhập thật, tua giờ. Tìm và sửa 11 lỗi, nặng nhất:
mã 2FA đứng khi khách chuyển sang app ChatGPT; Việc tay cho "Đã xong" khi quên dán mật khẩu mới; trang Theo dõi xoá chữ đang gõ;
CapCut đã hết Pro vẫn được giao.

**Phiên 15 (05/10): cắt gọn, giữ lõi chống spam + kho.** Bỏ Telegram / báo động gửi đi (xem trang Theo dõi), OTP chỉ eSMS, thư mã chỉ qua Cloudflare,
bỏ Canva "mời vào nhóm" + API `/worker`, bỏ duyệt tay (ca vàng tự từ chối theo cài đặt; lấy thêm mã tự cho qua khi đang ở quán + đúng máy).
Chạy thử 1 lệnh: `npm run local`. Chi tiết: `docs/CONTRACT.md` khối phiên 15.

**Phiên 13 (05/10): địa chỉ `https://thu.tiembanquyen.com/colap`.** TBQ chạy được dưới thư mục con: `BASE_URL=https://thu.tiembanquyen.com/colap`,
app tự thêm / cắt `/colap` (link, chuyển trang, cookie, JS). Caddy dùng `handle /colap*` (README "Đưa lên VPS"). Bản vá QS: nút trỏ `…/colap/qs/<mã quán>`.
Chi tiết: `docs/CONTRACT.md` khối phiên 13.

**Phiên 11 (05/10): thẻ NFC riêng của Tiệm quay lại — 2 lối vào.** Chủ tiệm có đặt thẻ ở quán. Quán có QS → vé từ trang quán (giữ nguyên);
quán chưa có QS → thẻ NFC riêng trên bàn (`/c/<mã thẻ>`, chip NTAG213/215/216 bật UID + bộ đếm chạm). Vẫn không màn hình quầy / mã quầy / Wi-Fi,
chủ quán không làm gì. Chi tiết: `docs/CONTRACT.md` khối phiên 11, `README.md` mục "Thẻ NFC riêng của Tiệm".
Mô phỏng: 1 trong 3 quán dùng 8 thẻ riêng (2 chip không bật bộ đếm) — link thẻ chép về nhà / cắt bộ đếm / link cũ đều bị chặn, khách thật không bị chặn nhầm.

**Phiên 10 (05/10): thiết kế lại — Tiệm không xin quán quyền gì.** Bỏ màn hình quầy, mã quầy, Wi-Fi, thẻ NFC riêng (thẻ riêng quay lại ở phiên 11).
Khách chứng minh đang ở quán bằng **vé có chữ ký** do trang quán QS gắn vào nút khi khách chạm thẻ / quét QR (`src/domain/ticket.js`).
Đã chạy thật trên máy cả hai bên: chạm thẻ trang quán QS → nút có vé → TBQ → OTP → nhận ChatGPT → lấy mã 2FA.
Các mục "Đã xong" bên dưới viết trước phiên 10: chỗ nào nói màn hình quầy / Wi-Fi / mã quầy / thẻ NFC riêng là đã bỏ.
Hướng dẫn chạy thử và triển khai: `README.md`.

## Quyết định đã chốt
- **TBQ và Quite Sensational (QS) là 2 tính năng riêng của 2 đồng nghiệp** (QS của Tài: thẻ NFC/QR → trang quán, đánh giá Google).
  Mã nguồn, máy chủ, database, giao diện riêng. Nối nhau ở đúng một điểm: khối "Trải nghiệm A.I Pro 1 ngày" trên trang quán → `/qs` của TBQ.
  Chữ TBQ không nối quà với đánh giá (cùng "dây bẫy" chữ với QS) để quán không bị Google phạt.
- **Giao diện thiết kế riêng** theo nhận diện Tiệm Bản Quyền (tiembanquyen.com). **Không dùng Docker.**
- **Chủ quán không phải làm gì, Tiệm không xin quán quyền gì** (phiên 10). Kho, máy chủ, code, hỗ trợ khách: Tiệm lo hết.
- **2 lối vào** (phiên 11): quán có QS → vé từ trang quán QS; quán chưa có QS → thẻ NFC riêng của Tiệm (UID + bộ đếm chạm, 6 suất / thẻ / ngày).
- Chứng minh ở quán (quán có QS): **vé từ trang quán QS** (khách chạm thẻ / quét QR → nút có vé, 30 phút, mỗi vé 1 máy). Lấy mã đăng nhập cũng cần vé còn hạn.
  Kẽ hở đã biết: chụp QR mang về nhà → chặn bằng OTP / SĐT, 1 công cụ / ngày, 1 SĐT / máy, suất / quán / ngày (mô phỏng: đo được, không phải vi phạm).
- Node.js ≥ 22.13 + SQLite có sẵn, không thư viện ngoài. Chạy trên VPS sau Caddy.
- Tempmail đẩy thư về `POST /hooks/mail` (ký HMAC). Chỉ hiện con số mã cho đúng người + đúng máy đang mở lượt "Lấy mã".
- Duyệt ca vàng: Telegram + trang `/admin/live` (dự phòng khi Telegram bị chặn).

## Đã xong
- Domain: presence, auth (OTP, phiên, xoá dữ liệu), risk, quota, claims, approvals, codes, mail, stats
- Services: OTP (Zalo ZNS tự làm mới token / webhook / dev), Telegram (nút duyệt, lệnh /pending /tasks /stats), webhook báo động phụ
- `jobs.js`: hết hạn slot/lượt mã/ca duyệt, nâng mã chờ thành mồ côi, mở khoá hết hạn, dọn dữ liệu theo thời hạn lưu, tóm tắt 8h sáng
- Giao diện khách (mobile), màn hình quầy, trang quản trị đầy đủ (tổng quan, trực duyệt, việc tay, quán & thẻ + CSV, công cụ, kho tài khoản
  nhập hàng loạt, khách, slot, thư + gửi mã thủ công, nhật ký, cài đặt)
- `scripts/seed.js` (`--demo`), `scripts/fake-mail.js`, `.env.example`, `README.md`
- Các điều chỉnh so với đặc tả ban đầu: `docs/CONTRACT.md` mục 4
- **Phiên 2 (05/10/2026):**
  - Webhook thư nhận thêm **nguyên thư gốc** (MIME) và form **multipart** (Mailgun có chữ ký, SendGrid) — trước đây chỉ nhận JSON,
    trong khi tài liệu thiết kế khuyên dùng Cloudflare Worker đẩy thư gốc. Có sẵn `extras/cloudflare-email-worker.js` để dán vào Cloudflare.
  - **Báo cáo theo quán** (`/admin/cafes/:id/report`, có CSV, in được): chạm thẻ, lượt dùng thử, khách quay lại, giờ đông, bàn, ngày hết suất.
  - Đếm lượt bấm **"Mua gói qua Zalo"** theo quán (không ghi khách/máy/IP) — đo quán nào kéo được khách mua.
  - Đã thử thật trong trình duyệt: thư gốc qua Worker → mã hiện cho khách; hết hạn → bấm Zalo → báo cáo hiện đúng.

- **Phiên 3 (05/10/2026) — nối với Quite Sensational (QS) của Tài** (đọc repo `nfc-feedback-platform`, nhánh `feat/local-app-foundation`):
  - Lối vào `/qs` cho khách bấm khối "Trải nghiệm A.I Pro 1 ngày" trên trang quán của QS.
    Quán nhận ra bằng Wi-Fi → mã quán QS trên link → khách tự chọn. Lối vào QS không dính hạn mức 6 slot/thẻ, không bị tự khoá vì đông máy.
  - **Sửa lỗ hổng IP:** trước đây sau Caddy, khách ở nhà gửi kèm `CF-Connecting-IP: <IP quán>` là qua bước "đang ở quán".
    Giờ chỉ tin 1 header proxy ghi đè (giống QS); thiếu cấu hình ở production thì không chạy.
  - Khách quét QR bằng **Zalo** trước đây bị coi là bot (không vào được) — đã sửa.
  - Cùng **"dây bẫy" chữ Google với QS**; chữ admin sửa được phải qua luật này.
  - **Tài liệu phối hợp gửi Tài:** `docs/phoi-hop-voi-QS.md` (+ 3 phát hiện cho QS, có 1 lỗi nhỏ ở hàng rào chữ của QS).
  - `npm run backup`, `/healthz`.
- **Phiên 4 (05/10/2026) — sửa theo góp ý của chủ:** TBQ và QS là 2 tính năng riêng (không phải "đối tác" phụ thuộc QS);
  **giao diện thiết kế riêng** theo nhận diện Tiệm Bản Quyền (giấy ấm, mực, vàng đồng, chữ có chân) cho trang khách, màn hình quầy, quản trị
  — thay cho giao diện chép theo QS ở phiên 3; **bỏ Docker** (dự án đã loại Docker).
- **Phiên 5 (05/10/2026) — test thực tế backend** (`npm run e2e`, ~30 giây): chạy TBQ ở chế độ production trong tiến trình riêng
  (như trên VPS sau Caddy, OTP qua webhook, báo động qua webhook), đóng vai chủ tiệm + ~50 khách với máy/IP/mạng khác nhau. 81 bước:
  dựng quán qua trang quản trị, màn hình quầy, khách Wi-Fi / 4G + mã quầy, lấy mã + duyệt, hết kho, Canva mời nhóm, CapCut mật khẩu,
  8 người tranh 1 tài khoản cùng lúc, hết 24 giờ, mã mồ côi, thư đổi mật khẩu → cách ly, khởi động lại máy chủ, tạm dừng quán, và các kiểu
  gian lận (giả IP quán, 1 máy nhiều SĐT, chép cookie, CSRF, dò OTP, thư giả webhook).
  - **Sửa 1 lỗi:** slot vừa hết hạn/bị thu hồi mà lượt "Lấy mã" cuối chưa quá giờ (~4 phút) → mã mới của tài khoản vẫn hiện cho khách cũ
    và chủ không được báo "mã mồ côi". Giờ slot kết thúc là đóng luôn lượt lấy mã; mã về sau đó tính là mồ côi. Có test riêng.
  - Ghi nhận: cùng 1 Wi-Fi quán, người thứ 31 trong 1 giờ không nhận được OTP (cài đặt "OTP / IP / giờ" = 30) — đủ với 20 suất/ngày.
- **Phiên 6 (05/10/2026) — gói chạy thử thật** (hướng dẫn: `docs/chay-thu-that.md`, cài bằng `npm run pilot`):
  - Kiểu đăng nhập mới: **mật khẩu + mã 2FA** (ChatGPT; khoá 2FA chỉ trên máy chủ, khách thấy mã 6 số trong 3 phút, qua đủ lớp chống
    lạm dụng như mã email) và **mã / link nhận quà dùng 1 lần** (Gemini). Mật khẩu + nút lấy mã email (Adobe).
  - Tài khoản dùng chung: mỗi khách 1 **Slot** (ChatGPT 1…5); lấp đầy tài khoản trước; việc đổi mật khẩu chỉ tạo khi người cuối hết hạn.
  - Tài khoản **dùng 1 lần** (CapCut Pro 7 ngày, 2 khách): đủ lượt + hết hạn → tự "Ngừng dùng", không cần đổi mật khẩu.
  - **Giới hạn lượt / ngày** cho từng công cụ (CapCut 20, ChatGPT 15, Gemini 5, Adobe 4). Dòng "Cần dịch vụ khác? Nhắn Zalo Tiệm".
  - **API `/worker`** cho tool trên Mac (Canva tự mời / gỡ): lấy việc, báo xong / lỗi; tool lỗi 3 lần hoặc quá 10 phút → báo chủ làm tay.
  - **OTP qua SMS (eSMS.vn)** + `npm run otp-test` thử kết nối (Sandbox). Chữ trên trang đổi theo kênh (SMS / Zalo).
  - Nhập kho theo kiểu: `email|mật khẩu|khoá 2FA|số khách`; mật khẩu có dấu phẩy vẫn đúng; kho cũ thiếu mật khẩu / 2FA không bao giờ được giao.
  - Thử trên điện thoại (bản demo): mã 2FA trên trang khớp app Authenticator và tự đổi đúng giây thứ 30.
- **Phiên 7 (05/10/2026) — mô phỏng sâu khách thật** (`npm run sim`, báo cáo `docs/bao-cao-mo-phong.md`, ~7 giây cho 9 ngày):
  code máy chủ thật (cấu hình production, HTTP thật, việc định kỳ), đồng hồ tua nhanh; 3 quán, ~600 khách với 10 kiểu hành vi
  (Wi-Fi, 4G, laptop, vội vàng, chia sẻ, nhiều SIM, giả IP, spam OTP, xoá cookie, không chấp nhận lời mời); chủ tiệm nạp hàng / duyệt /
  đổi mật khẩu theo giờ; tool Canva trên Mac 8:00–23:00; bản giả của từng hãng kiểm khách đăng nhập được thật và người không quyền không vào được.
  Kiểm mỗi giờ: không giao trùng, không vượt giới hạn, không lộ mật khẩu / khoá 2FA, khách cũ không vào lại. Đã thử cài 3 lỗi cố ý → mô phỏng bắt cả 3.
  - Sửa: trang chọn công cụ hiện "Đã thử · lại từ …" / "Đã thử đủ lần" (trước đây khách bấm rồi mới bị báo — 50 lượt/9 ngày);
    công cụ đã hết lượt vĩnh viễn không còn báo nhầm "nhận lại từ ngày …".
  - So phương án kho + các điểm cần chủ quyết: `docs/chay-thu-that.md` mục "Kết quả mô phỏng".
  - **Xem trực tiếp:** `npm run theo-doi` → bảng theo dõi `http://localhost:3921` + trang quản trị thật `http://localhost:3920/admin`
    (mật khẩu `xem-mo-phong`), chỉnh tốc độ / tạm dừng. Lần thấy "đứng ở 07:46" là do trình duyệt ngừng cập nhật tab nền; máy chủ mô phỏng
    vẫn chạy đều. Đã sửa: quay lại tab là bảng cập nhật ngay.

- **Phiên 8 (05/10/2026) — khúc B trên trang quán QS + "Về chúng tôi" + test thật giao diện:** xem `../BAN-GIAO-TIEP.md` (đọc trước).
  Khối "Công cụ làm việc" (2 nút: Nhận công cụ làm việc miễn phí / Về chúng tôi) cho mọi khách, không nối với đánh giá Google;
  bản vá QS ở `docs/qs-patch/`; trang `/ve-chung-toi`; sửa 5 lỗi giao diện. 72/72 · e2e 117/117 · sim 0 vi phạm.
- **Phiên 9 (05/10/2026) — test QS cho khúc B + tên miền:** chạy đủ 7 bộ test QS trên nhánh và bản gốc (khúc B không làm đỏ thêm ca nào);
  thêm 10 ca test khúc B, sửa 1 lỗi (Add lần 2 phát hành lại trang); xem khối trên 6 template + tiếng Anh ở 375px.
  Tên miền TBQ giữ `thu.tiembanquyen.com` (web chính: tiembanquyen.com). Chi tiết: `../BAN-GIAO-TIEP.md`.

## Việc tiếp theo (cần anh/chị)
0. **Chạy thử thật:** làm theo `docs/chay-thu-that.md` — đăng ký eSMS + mẫu tin OTP, đặt `WORKER_TOKEN`, `npm run pilot`, nhập kho.
   Tool Canva trên Mac (tự mời / gỡ) là bước tiếp theo — cần bạn tự đăng nhập Canva trong tool để chỉnh cho khớp trang thật.
1. **Gửi Tài `docs/phoi-hop-voi-QS.md`** + chuẩn bị **logo** (PNG nền trong 512×512) và **banner** (4:5 hoặc 1:1, ≥1080 px, < 2 MB).
   Tạo khoá vé `openssl rand -hex 32` → đặt `QS_TICKET_KEY` bên TBQ và gửi Tài (kênh riêng) làm `NFC_EVENT_TBQ_KEY` bên QS.
2. Làm **bài kiểm tra cửa sau** của tempmail (`docs/design-mail-filter.md` mục 2) — quyết định giữ tempmail hay chuyển tên miền riêng.
3. Xin mẫu **ZNS OTP** trên Zalo OA (cần OA đã xác thực), lấy App ID / Secret / Template ID / Refresh token.
4. Máy chủ có HTTPS cho TBQ (Node + Caddy, không Docker) ở `thu.tiembanquyen.com` — thêm bản ghi DNS `thu` (DNS của tiembanquyen.com đang ở NS1).
5. Quán đầu tiên: Tài mở sự kiện ở `/gov` (quán không phải làm gì); bên TBQ thêm quán với mã quán QS; chạy thử 1 tuần với 2–3 tài khoản.
6. Quán chưa có QS: mua chip **NTAG213**, tạo thẻ trong quản trị, ghi link + bật UID / bộ đếm chạm, chạm thử từng chip
   (README mục "Thẻ NFC riêng của Tiệm"). Thử trước 2–3 chip với app của mình để chắc chắn cột "Bộ đếm" hiện **Đã bật**.

## Có thể làm thêm sau
- **Danh sách khách nhận ưu đãi**: CHƯA làm vì cần chủ quyết định. Trang `/privacy` đang cam kết "chỉ nhắn quảng cáo khi bạn chủ động nhắn Zalo".
  Muốn làm phải: thêm ô đồng ý riêng (không tick sẵn, không bắt buộc), sửa `/privacy` + tăng `consentVersion`, cho khách rút lại.
- Phông Lora + Cormorant Garamond như tiembanquyen.com (cần tải tệp phông về máy chủ TBQ) — hiện dùng Georgia / Times New Roman có sẵn trên máy khách.
- Khi Tài gộp khúc B: thử thật từ thẻ trên bàn (máy thật), kiểm `/admin/cafes/<id>` không có "vé sai".
- Xác minh chữ ký DKIM/SPF của thư (chống thư giả mạo "đổi mật khẩu" để cố ý làm cách ly tài khoản) — cần xem Cloudflare đưa header gì vào thư.
