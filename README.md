# TBQ — "Công cụ làm việc miễn phí" tại quán cà phê

Tính năng của Tiệm Bản Quyền: khách đang ngồi ở quán nhận **1 công cụ A.I bản quyền** (ChatGPT, CapCut, Gemini, Adobe…)
dùng miễn phí → xác nhận SĐT qua SMS → chọn công cụ → làm theo hướng dẫn đăng nhập.
Hệ thống lo chống lạm dụng: mỗi người 1 lượt/ngày, phải vừa chạm thẻ / quét QR trên bàn của quán, mã đăng nhập chỉ hiện cho đúng người trên đúng máy,
báo động khi khách cũ tự đăng nhập từ nhà, tự tạo việc đổi mật khẩu khi hết hạn.

Node.js ≥ 22.13, **không cần cài thư viện nào** (dùng SQLite có sẵn trong Node). Không dùng Docker.

## Bản thương mại 1.0.4

- **Hướng dẫn mở bán (cho chủ tiệm):** `docs/HUONG-DAN-MO-BAN.md` — việc phải làm trước khi mở, cài máy chủ, ngày đầu, hằng ngày, rủi ro.
- `npm run dong-goi` → `../ban-phat-hanh/tbq-<phiên bản>.tar.gz` (+ `.sha256`): chỉ mã chạy + lệnh vận hành + `deploy/` + hướng dẫn, tự thử bản gói
  (giải nén → tạo .env → seed + pilot → máy chủ production trả `/colap/healthz` → kiem-tra).
- `npm run tao-env` → `.env` với khoá bí mật tự sinh (không ghi đè `.env` có sẵn, quyền 600).
- `npm run kiem-tra` → ✓ / ⚠ / ✘ trước khi mở bán: cấu hình, `DATA_KEY` mở được kho, gói công cụ, kho còn giao được, quán có lối vào,
  bot Canva còn liên lạc, thư mã đã về, sao lưu. `-- --mang`: thêm HTTPS `/healthz` và số dư eSMS (chỉ đọc).
- `deploy/`: `Caddyfile`, `tbq.service` (systemd, khoá quyền ghi trừ `data/`), `tbq-backup.service` + `.timer` (sao lưu 05:30, giữ 30 ngày).

## Hai tính năng, hai đồng nghiệp

- **Quite Sensational (QS)** là tính năng của Tài: thẻ NFC/QR → trang của quán, lời mời đánh giá Google, dashboard chủ quán.
  **TBQ** là tính năng riêng của Tiệm Bản Quyền: mã nguồn, máy chủ, database, giao diện đều riêng.
- **Nối nhau ở đúng một điểm** (quán có dùng QS): trang của quán (QS) có khối "Công cụ làm việc"; khách bấm "Nhận công cụ làm việc miễn phí" → mở
  `BASE_URL/qs/<mã quán QS>?t=<vé>` của TBQ. Hai bên không chia sẻ dữ liệu khách.
  Nội dung khối và việc mỗi bên: `docs/phoi-hop-voi-QS.md` (gửi Tài).
- **Chủ quán không phải làm gì, Tiệm không xin quán quyền gì** (không màn hình quầy, không mã quầy, không Wi-Fi).
  Kho, máy chủ, code, hỗ trợ khách đều do Tiệm lo. Quán chỉ là 1 dòng dữ liệu nội bộ: tên + mã quán trên QS (nếu có) + số suất/ngày.
- **Hai lối vào** (khách chứng minh đang ngồi ở quán):
  1. **Quán có QS** → qua trang quán QS (vé có chữ ký, bên dưới).
  2. **Quán chưa có QS** → **thẻ NFC riêng của Tiệm** đặt trên bàn (chip NTAG213/215/216 thường), mở thẳng `BASE_URL/c/<mã thẻ>`.
     Bật "UID + bộ đếm chạm" khi ghi chip: link chép lại mang bộ đếm cũ → bị chặn, khách phải chạm lại thẻ (`presence.processTap`).
     Thêm: tối đa 6 suất / thẻ / ngày, báo động khi quá nhiều máy mở 1 thẻ / giờ rồi tự khoá thẻ. Cách ghi chip: mục "Thẻ NFC riêng" bên dưới.
- **Khách đang ở quán = có vé** (lối vào 1). Khách chạm thẻ / quét QR trên bàn → trang quán QS gắn vào nút một **vé có chữ ký** (khoá chung
  `QS_TICKET_KEY` = `NFC_EVENT_TBQ_KEY` bên QS). Vé đúng quán, phát chưa quá 30 phút, mỗi vé chỉ 1 máy (`src/domain/ticket.js`).
  Link trang quán lan trên mạng không có vé → không nhận được; link có vé gửi cho bạn → máy bạn bị từ chối.
  Lấy mã đăng nhập (mã email / 2FA) cũng cần lượt vào còn hạn (vé hoặc chạm thẻ, 30 phút) → về nhà muốn lấy mã thì không được.
  Kẽ hở còn lại: chụp mã QR mang về nhà quét → chặn tiếp bằng OTP / SĐT, 1 công cụ / ngày, 1 SĐT / máy, suất / quán / ngày.
  Mã QS chưa gắn quán nào mà khách đã bấm → nhật ký báo vàng "Mã quán QS chưa gắn quán".
- **Luật Google:** khối TBQ nằm trên trang quán có lời mời đánh giá, nên chữ TBQ không bao giờ nối quà với đánh giá. Chữ admin sửa được
  (tên chương trình, tên + hướng dẫn công cụ) chạy cùng "dây bẫy" chữ với QS (`src/lib/policy.js`).
- **Giao diện thiết kế riêng** theo nhận diện Tiệm Bản Quyền (tiembanquyen.com): giấy ấm, mực, vàng đồng, chữ có chân, góc bo 4px —
  trang khách và trang quản trị.

## Gói công cụ (`npm run pilot`)

ChatGPT (8 khách / tài khoản, tới 6h sáng), Claude (3, tới 6h sáng, mã về hộp thư Tiệm), CapCut + Adobe (2, 7 ngày, dùng 1 lần),
Canva (mời vào nhóm bằng bot trên Mac, 7 ngày), Gemini (link 1 lần). Bảng đầy đủ: `docs/HUONG-DAN-MO-BAN.md`. Dịch vụ khác: khách bấm "Liên hệ Tiệm".
Buổi sáng: ChatGPT / Claude nghỉ nhận 5h–6h (Cài đặt `endHourCloseMin`); Claude giữ 1 tài khoản dự phòng (`tools.reserve_account`,
`quota.reserveAccountId`) — trong ngày không giao, chỉ giao khi có tài khoản đang chờ "Đăng xuất mọi thiết bị".
Kho chuẩn (`PILOT_STOCK` trong `scripts/pilot.js`): ChatGPT 3 tài khoản (24 khách/ngày), Claude 3 (6 + 3 sáng sớm; thay mỗi tuần).

## Chạy thử trên máy (1 lệnh)

```bash
npm run local               # dựng dữ liệu mẫu lần đầu, mở http://localhost:3919/colap, in sẵn mọi link để thử
npm run local -- --reset    # xoá dữ liệu thử, làm lại từ đầu
```

Không cần `.env`. Dữ liệu thử ở `~/.tbq-local` (không đụng database thật). Lệnh in ra: link quản trị (mật khẩu `admin`), kho,
link có vé như nút trên trang quán QS (quán demo mang mã QS `chuquan` — quán mẫu của `node scripts/local.mjs` bên QS; đổi bằng `--qs <mã>`),
và link 3 thẻ NFC riêng. `--root` chạy ở gốc (không `/colap`).

1. Mở link "Không cần QS" (giả làm khách vừa chạm thẻ trên bàn rồi bấm nút trên trang quán). Link dùng được 30 phút, 1 máy;
   hết hạn thì `npm run ve -- chuquan` (cần `BASE_URL=http://localhost:3919/colap` phía trước để link đúng chỗ).
   Thử quán chưa dùng QS: mở link thẻ `/c/...?m=…` (mỗi lần "chạm" tăng 6 số cuối lên 1).
2. Nhập SĐT bất kỳ dạng 09xx…; mã OTP hiện ngay trên màn hình.
3. Chọn ChatGPT → vào trang "Slot của tôi" → bấm **Lấy mã**.
4. Giả lập ChatGPT gửi thư mã: `BASE_URL=http://localhost:3919/colap npm run fake-mail -- gpt-demo1@kho.local 482913` → mã hiện trên trang khách.
   Thêm `--raw` để đẩy nguyên thư gốc qua đúng code Cloudflare Worker trong `extras/`.
5. Quản trị: `http://localhost:3919/colap/admin`. Trang **Theo dõi** `/colap/admin/live`.
6. Nối với QS thật trên máy: bật QS (`node scripts/local.mjs` trong repo QS) với `NFC_EVENT_TBQ_ORIGIN=http://localhost:3919/colap`
   và `NFC_EVENT_TBQ_KEY=dev-qs-ticket-key-change-me-0123456789` (Claude desktop: cấu hình `qs-local-colap`).

Thử luồng đỏ: `BASE_URL=http://localhost:3919/colap npm run fake-mail -- gpt-demo1@kho.local 0 "Your password was changed"` → tài khoản bị cách ly, slot bị thu hồi, có việc đổi mật khẩu.

Chạy test: `npm test`.

## Xem mô phỏng khách thật trực tiếp

```bash
npm run theo-doi
```

- **Bảng theo dõi:** `http://localhost:3921` — đồng hồ mô phỏng, lượt giao theo công cụ, tình trạng quán, dòng sự kiện, vi phạm.
  Nút tốc độ: Chậm (1 phút = 1 giây), Vừa (1 ngày ≈ 12 phút), Nhanh, Rất nhanh, Tối đa; Tạm dừng.
- **Trang quản trị TBQ thật** bên trong mô phỏng: `http://localhost:3920/admin` (mật khẩu: `xem-mo-phong`). Phiên đăng nhập được giữ dù giờ mô phỏng trôi nhanh.
- Chuyển sang tab khác thì trình duyệt có thể ngừng cập nhật bảng; quay lại tab là bảng tự cập nhật ngay. Mô phỏng vẫn chạy trong lúc đó.
- Muốn có báo cáo nhanh (không xem trực tiếp): `npm run sim` (~7 giây cho 9 ngày), báo cáo ở `docs/bao-cao-mo-phong.md`.

## Diễn tập vận hành (kho giả, vận hành thật)

```bash
npm run van-hanh
```

Mở `http://localhost:3930/dien-tap`. TBQ chạy **đúng chế độ production** (khoá thật, `/colap`, OTP đi đường eSMS, thư mã qua code Cloudflare Worker)
sau "Caddy giả"; bạn tự bấm như ngày thật: tạo quán, dán kho giả (bảng điều khiển sinh sẵn), đóng vai khách trên `may1.localhost:3930` … `may4`
(mỗi máy cookie riêng), đăng nhập vào **hãng giả** (ChatGPT / Adobe / CapCut / Gemini) bằng đúng thông tin Tiệm giao, đổi mật khẩu ở hãng giả
rồi làm Việc tay. Nút **tua giờ** để thử hết hạn 24 giờ / 7 ngày. Tự ghi vi phạm nếu lộ khoá 2FA / mật khẩu hoặc ai vào hãng mà không giữ slot.
Kết quả lần diễn tập đầu và các lỗi đã sửa: `docs/dien-tap-van-hanh.md`. Làm lại từ đầu: `npm run van-hanh -- --reset`.
Kịch bản sâu tự động (19 tình huống, ~1 phút, không đụng dữ liệu diễn tập): `npm run van-hanh-sau` → `docs/bao-cao-van-hanh-sau.md`.
Bảng điều khiển còn có: giả eSMS lỗi / treo, giả "người ngoài đổi mật khẩu" tài khoản kho (thử cách ly).

## Vận hành độc lập thử (bạn làm chủ, khách tự đến)

```bash
npm run doc-lap
```

Bảng theo dõi `http://localhost:3921` (bấm ▶ để mở cửa), quản trị `http://localhost:3920/admin` (mật khẩu `xem-mo-phong`),
**Trang của chủ** `http://localhost:3921/chu` (tài khoản của bạn ở các hãng + chợ mua tài khoản). Kho trống, không có chủ tự động:
bạn tự mua hàng, nhập kho, canh Theo dõi, làm việc tay, nâng lượt / suất. 1 ngày ≈ 24 phút thật. Kết quả lần đầu: `docs/van-hanh-doc-lap.md`.

## Đưa lên VPS

TBQ là một ứng dụng độc lập, chạy thẳng bằng Node + Caddy (Caddy tự lo HTTPS), không dùng Docker. Đặt trên máy chủ riêng hay chung máy
với QS là việc của hai bên quyết; dù chung máy thì vẫn là 2 ứng dụng riêng (cổng, database, `.env` riêng).

1. Cài Node 22.13+ và Caddy. Chép thư mục này lên, ví dụ `/opt/tbq-trial`. Trỏ DNS tên miền TBQ (`thu.tiembanquyen.com`) về máy chủ.
   TBQ chạy dưới thư mục **`/colap`**: `BASE_URL=https://thu.tiembanquyen.com/colap`. App tự thêm `/colap` vào mọi link, chuyển trang, cookie
   và tự cắt đi khi nhận request — proxy chuyển **nguyên** đường dẫn, không cắt. Muốn chạy ở gốc tên miền thì bỏ `/colap` khỏi `BASE_URL`.
2. Tạo `.env` từ `.env.example`, điền đủ. Tạo bí mật: `openssl rand -base64 32` (cho `APP_SECRET`, `DATA_KEY`, `MAIL_WEBHOOK_SECRET`).
   **Sao lưu `DATA_KEY` ở nơi khác** — mất khoá này là mất toàn bộ mật khẩu tài khoản đã lưu.
3. `npm run seed` (không có `--demo`) rồi `npm run pilot` để có gói công cụ. (`npm run tao-env` sinh sẵn `.env` ở bước 2; tệp Caddy / systemd có sẵn trong `deploy/`.)
4. Caddy (`/etc/caddy/Caddyfile`):
   ```
   thu.tiembanquyen.com {
     redir / /colap/ 302
     handle /colap* {
       request_body {
         max_size 3MB
       }
       reverse_proxy 127.0.0.1:3000 {
         header_up X-Real-IP {remote_host}
       }
     }
     handle {
       respond "Không tìm thấy" 404
     }
   }
   ```
   Dùng `handle` (giữ `/colap`), **không** dùng `handle_path` (cắt `/colap` → app báo 404).
   và trong `.env`: `CLIENT_IP_HEADER=x-real-ip`.
5. Chạy nền bằng systemd (`/etc/systemd/system/tbq.service`):
   ```
   [Unit]
   Description=TBQ Trial
   After=network.target
   [Service]
   WorkingDirectory=/opt/tbq-trial
   ExecStart=/usr/bin/npm start
   Restart=always
   User=tbq
   [Install]
   WantedBy=multi-user.target
   ```
   `systemctl enable --now tbq`. Giám sát (uptime): `GET /healthz` trả `ok`.
6. Sao lưu database mỗi ngày (cron): `npm run backup -- /backup/tbq-$(date +%F).sqlite` (chạy được cả khi app đang ghi).
   Không để bản sao lưu chung chỗ với `DATA_KEY`.

**Quan trọng — IP khách (dùng cho giới hạn chống spam OTP / IP / giờ):** app chỉ tin **một** header do proxy ghi đè (`CLIENT_IP_HEADER=x-real-ip`
cùng dòng `header_up X-Real-IP {remote_host}` ở trên). Đừng để app đọc `CF-Connecting-IP`/`X-Real-IP` mà proxy không ghi đè:
khách tự đổi IP trong header là lách được giới hạn. Ở production thiếu `CLIENT_IP_HEADER` hoặc `QS_TICKET_KEY` thì server từ chối chạy.

## Cấu hình từng phần

**OTP qua SMS (eSMS.vn)** — kênh duy nhất. Đăng ký eSMS + mẫu tin OTP, điền `ESMS_*` trong `.env` (xem `.env.example`),
thử bằng `npm run otp-test -- 09xxxxxxxx` (đặt `ESMS_SANDBOX=1` để thử không tốn tiền).

**Dịch vụ mail → webhook.** Mỗi tài khoản trong kho dùng 1 địa chỉ email riêng (cũng là hộp thư nhận mã). Dịch vụ mail đẩy mỗi thư tới
`POST {BASE_URL}/hooks/mail` qua **Cloudflare Email Worker** (file có sẵn `extras/cloudflare-email-worker.js`): nguyên thư gốc
(`Content-Type: message/rfc822`), header `X-Signature: sha256=<HMAC-SHA256(MAIL_WEBHOOK_SECRET, nguyên body)>`. Thiếu / sai chữ ký → 401.
(JSON có chữ ký cũng nhận — dùng cho `npm run fake-mail` khi chạy thử.) Không nhận form Mailgun / SendGrid, không nhận `?key=`.

Hệ thống tự đọc thư gốc: base64, quoted-printable, tiêu đề tiếng Việt mã hoá, bảng mã cũ, bỏ qua tệp đính kèm. Người nhận lấy theo
**phong bì thật** (X-Envelope-To do Worker ghi) trước tiêu đề `To:` (người gửi tự ghi được).

*Cài Cloudflare (Cách A trong `docs/design-mail-filter.md`, miễn phí):* Workers & Pages → Create → Worker → dán `extras/cloudflare-email-worker.js` → Deploy.
Worker → Settings → Variables: `WEBHOOK_URL` = `{BASE_URL}/hooks/mail`, `WEBHOOK_SECRET` = đúng `MAIL_WEBHOOK_SECRET` (kiểu Secret),
`BACKUP_EMAIL` (tuỳ chọn, hộp thư dự phòng khi hệ thống không nhận được thư). Email Routing → Routing rules → Catch-all → "Send to a Worker".
Thử: gửi 1 thư từ Gmail tới 1 địa chỉ kho → trang quản trị → **Thư** phải thấy thư đó.

Trước khi dùng tempmail: làm **bài kiểm tra cửa sau** trong `docs/design-mail-filter.md` mục 2. Nếu hộp tempmail cho người lạ đọc được chỉ bằng địa chỉ,
bộ lọc chỉ báo động được chứ không chặn được → nên chuyển sang tên miền riêng.

**Báo động, việc tay** — không có bot hay kênh gửi đi: mở sẵn trang **Theo dõi** (`/admin/live`) trên điện thoại (tự làm mới 10 giây,
có âm báo khi có cảnh báo đỏ).

**Nối với trang quán (QS)** — quán có dùng QS. Chip / QR trên bàn chứa link trang quán của QS (phần của Tài), TBQ không ghi chip của QS.
Trong trang quản trị → Quán → **Thêm quán** với **Mã quán trên QS** (phần cuối link trang quán, vd. `k3x9q`). Bên QS: Tài bấm
"Mở" sự kiện cho quán ở `/gov` — khối tự hiện trên mọi trang của quán, chủ quán không phải làm gì.
**Khoá vé** `QS_TICKET_KEY` (TBQ) phải giống hệt `NFC_EVENT_TBQ_KEY` (QS). Tạo 1 lần: `openssl rand -hex 32`, gửi Tài qua kênh riêng.
Trang quán trong quản trị đếm "link bị từ chối" (vé sai / vé cũ / mở trên máy khác): nhiều "vé sai" = khoá hai bên không khớp.

**Thẻ NFC riêng của Tiệm** — quán chưa dùng QS (để trống "Mã quán trên QS"). Chủ quán vẫn không phải làm gì; Tiệm tự mang thẻ đến đặt trên bàn.
1. Quản trị → Quán → mở quán → **Tạo thẻ hàng loạt** (vd. 10 thẻ "Bàn 1…10") → **Tải CSV tất cả link**.
2. Mua chip **NTAG213** (đủ cho link ~70 ký tự kể cả `/colap` và phần mirror; 215/216 cũng được). Ghi từng link vào 1 chip bằng app **NXP TagWriter** (Android/iPhone)
   hoặc **NFC Tools**, kiểu bản ghi **URL**. Nên **bật "UID mirror" + "Counter mirror"** (TagWriter: khi soạn URL có mục thêm UID / bộ đếm chạm),
   đặt phần mirror ngay sau `?m=` ở cuối link, vd. `https://thu.tiembanquyen.com/colap/c/AbC123xyz?m=` → chip tự gửi
   `...?m=04A1B2C3D4E5F6x00001A` (UID chip + số lần chạm). TBQ cũng đọc dạng TagWriter ghi sẵn `?UID=…x…` hoặc `?uid=…&ctr=…`.
   Tên mục trong app có thể khác theo phiên bản — cứ ghi xong rồi chạm thử là biết (bước 3).
3. Ghi xong **chạm thử từng chip 1 lần** bằng điện thoại của Tiệm: TBQ nhớ UID chip; cột "Bộ đếm" trong trang quán đổi thành **Đã bật**.
   Vẫn "Chưa thấy" → chip chưa bật bộ đếm: ai có link là mở được, chỉ còn giới hạn 6 suất / thẻ / ngày (Cài đặt: `cardDailyClaims`).
4. Đặt **mật khẩu ghi** cho chip (TagWriter / NFC Tools đều có) để người lạ không ghi đè link khác vào chip. Đừng khoá vĩnh viễn nếu muốn đổi link sau này.
5. Link thẻ bị phát tán (báo động "Thẻ bị chạm bất thường", hoặc tự khoá khi quá nhiều máy / giờ): bấm **Đổi link** rồi ghi lại chip đó.
   Khoá / mở thẻ ngay trong trang quán.
Kẽ hở còn lại: bộ đếm của chip thường không có chữ ký — người rành có thể sửa số cuối link (tăng lên vài đơn vị) để dùng lại link ở nhà.
Tăng quá 500 thì bị chấm "nhảy vọt" (điểm rủi ro cao hơn, không đẩy bộ đếm lên). Dù vậy vẫn dính OTP / 1 công cụ / ngày / 6 suất thẻ / suất quán,
và thẻ bị tự khoá khi quá nhiều máy mở. Muốn chặn hẳn phải dùng chip NTAG 424 DNA (link có chữ ký, đắt hơn, chưa làm).

## Vận hành hằng ngày

- **Không có ca nào phải duyệt tay.** Ca vàng (điểm rủi ro trung bình) khi nhận slot: tự từ chối (Cài đặt `yellowAction` = `reject`; đổi `approve` để cho qua).
  Lấy thêm mã (tối đa 4 lần / slot) tự cho qua nếu khách đang ở quán và đúng máy đã nhận slot; máy khác luôn bị từ chối.
- **Việc tay**: hết hạn slot → đổi mật khẩu + "đăng xuất mọi thiết bị" ở trang của hãng → **dán mật khẩu mới** vào ô → bấm **Đã xong**.
  Không dán thì không cho xong (tránh khách sau nhận mật khẩu cũ). ChatGPT (có 2FA) được tick "Giữ mật khẩu cũ — chỉ đăng xuất mọi thiết bị".
  Tài khoản chỉ được giao lại khi đã xong.
- **Trang Theo dõi** (mở trên điện thoại, bật âm báo): ô **Kho hôm nay** (đỏ = không giao được nữa), việc tay, cảnh báo kèm dòng "Nên làm".
  Hết kho → báo đỏ; hết lượt / ngày hoặc quán hết suất → báo vàng. Nâng nhanh lượt / ngày ở trang Công cụ, suất / ngày ở trang Quán (ngay trên danh sách).
- **CapCut**: nạp tài khoản mới mỗi ngày. Tài khoản nhập kho quá 7 ngày (hết Pro dùng thử) tự không giao; người dùng cuối hết hạn thì tài khoản tự "Ngừng dùng".
- **Báo động đỏ** thường gặp: *Mã mồ côi* (có người biết email kho đang tự đăng nhập), *Cách ly tài khoản* (thư đổi mật khẩu/2FA),
  *Nhiều link giả vào quán* (hơn 30 vé sai chữ ký / giờ — có người dò, hoặc khoá vé hai bên không khớp),
  *Thẻ bị chạm bất thường / Đã tự khoá thẻ* (link thẻ NFC riêng bị phát tán — đổi link thẻ và ghi lại chip).
- Khách yêu cầu xoá dữ liệu: trang Khách → **Xoá dữ liệu cá nhân** (hạn mức cũ vẫn được giữ, nên không thành cách nhận lại lượt thử).
- **Thống kê quán** (nội bộ của Tiệm): Quán → **Thống kê** (7 ngày, 30 ngày, tháng này, tháng trước; tải CSV). Có lượt vào, lượt dùng thử,
  khách quay lại, giờ đông khách, ngày hết suất, số lần bấm "Mua qua Zalo", và bảng "Theo lối vào" (trang quán QS / từng thẻ NFC). Chỉ có số đếm, không có SĐT — để biết quán nào kéo được khách.

## Lưu ý quan trọng

- Chia sẻ tài khoản cá nhân cho người lạ vi phạm điều khoản của hầu hết các hãng; tài khoản có thể bị khoá.
- Luật Bảo vệ dữ liệu cá nhân: hệ thống xin đồng ý trước khi lưu SĐT/mã máy/IP, tự xoá IP sau 30 ngày, nhật ký sau 180 ngày (chỉnh trong Cài đặt). Trang `/privacy` là chính sách hiển thị cho khách.
- Không yêu cầu khách đánh giá Google để đổi quà (Google cấm đánh giá có thưởng) — phần đánh giá là của đồng nghiệp, tách riêng.

## Cấu trúc

```
src/server.js          điểm khởi động, ghép route
src/domain/            nghiệp vụ: ticket (vé từ trang quán QS), presence (lượt vào), auth (OTP, phiên), claims (nhận slot), quota (hạn mức),
                       risk (điểm rủi ro, khoá), codes (lượt lấy mã), mail (bộ lọc thư), stats
src/services/          otp (SMS eSMS)
src/routes/            public (khách), hooks (thư mã), admin
src/views/, public/    giao diện (không inline script, CSP chặt)
src/lib/mime.js        đọc thư gốc (MIME) cho webhook thư
src/lib/policy.js      luật Google ("dây bẫy" chữ, giống QS) cho chữ TBQ hiện cho khách
src/qs-event.js        nội dung khối "Công cụ làm việc" trên trang quán của QS — một nguồn cho code, test và docs/phoi-hop-voi-QS.md
src/public/style.css   thiết kế riêng của Tiệm Bản Quyền (giấy ấm, mực, vàng đồng)
scripts/backup.js      sao lưu database (npm run backup)
src/jobs.js            việc định kỳ 30 giây/lần: hết hạn, mở khoá, dọn dữ liệu
extras/                Cloudflare Email Worker (đẩy thư từ tên miền kho về hệ thống)
docs/CONTRACT.md       đặc tả chi tiết từng module
```
