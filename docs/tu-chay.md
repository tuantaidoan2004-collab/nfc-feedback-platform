# Tự chạy nền tảng — không cần Vercel, Neon hay Cloudflare (lát I1, 26/09/2026)

Tài 26/09: nền tảng phải chạy được mà không thuê một dịch vụ cụ thể nào. Hôm nay production chạy trên Vercel + Neon + R2;
đó là **một lựa chọn cấu hình**. Cùng mã nguồn chạy được trên **một máy Linux bất kỳ có Docker**: app, PostgreSQL và
**SeaweedFS** (kho tương thích S3, miễn phí, mã nguồn mở Apache 2.0) nằm trong `deploy/docker-compose.yml`.

**Đã chứng minh (27/09, Docker Desktop trên máy Tài):** `docker compose … up -d --build` dựng image app (425 MB), bật
PostgreSQL và SeaweedFS, chạy 28/28 migration rồi bật app (cả ba healthy); `scripts/selfhost-smoke.mjs` qua đủ bốn phần:
trang tĩnh trả 200 · lệnh ghi của khách không có proof bị từ chối · app chạm được database (đăng nhập sai ra 401; database
hỏng ra 503 — đã thử) · tải lên một tệp bằng đúng bộ ký của app rồi khách đọc lại được. Kho từ chối PUT không chữ ký và
PUT sai khoá (403), không cho khách liệt kê bucket (403). Job CI `self-host` chạy đúng các bước này trên GitHub.

## Cần gì

- Một máy Linux (VPS bất kỳ, hoặc máy tại chỗ) có Docker và Docker Compose; khoảng 2 GB RAM.
- Một tên miền, hai bản ghi DNS: `app.<tên miền>` (hoặc tên chính) → máy đó; `store.<tên miền>` → máy đó.
- Không tài khoản dịch vụ trả phí nào.

## Các bước

1. Lấy mã nguồn về máy, rồi tạo cấu hình:
   ```bash
   cp deploy/.env.example deploy/.env
   ```
   Điền mọi dòng. Hai khoá bí mật: `openssl rand -hex 32` mỗi khoá. Mật khẩu database và kho: `openssl rand -hex 16`.
   `deploy/.env` không bao giờ lên git (`.gitignore`).
2. Bật:
   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
   ```
   Thứ tự tự lo: database và kho sẵn sàng (kho tự tạo bucket `nfc-media`: khách chỉ đọc được, ghi phải có chữ ký, không ai
   liệt kê được; không gửi thống kê về đâu) → chạy mọi migration → app. Chạy lại lệnh này sau mỗi lần cập nhật mã: migration mới tự chạy trước app.
3. **HTTPS và proxy phía trước** (bắt buộc cho khách thật: ảnh trên trang khách phải là `https`). Ví dụ Caddy, tự lấy chứng
   chỉ TLS miễn phí:
   ```
   app.<tên miền> {
     reverse_proxy 127.0.0.1:3000 {
       header_up X-Real-IP {remote_host}
     }
   }
   store.<tên miền> {
     reverse_proxy 127.0.0.1:9000
   }
   ```
   Rồi trong `deploy/.env`: `APP_ORIGIN=https://app.<tên miền>` · `STORAGE_ENDPOINT=https://store.<tên miền>` ·
   `MEDIA_PUBLIC_ORIGIN=https://store.<tên miền>/nfc-media` · `NFC_CLIENT_IP_HEADER=x-real-ip`. Chạy lại bước 2.
   (nginx: `proxy_set_header X-Real-IP $remote_addr;` và giữ nguyên `Host` cho `store.` — chữ ký tải lên ký cả host.)
4. **Admin đầu tiên:**
   ```bash
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env run --rm -it app node scripts/bootstrap-admin.mjs --handle=Quitesensational --title="Admin Tài"
   ```
   Script hỏi mật khẩu (ít nhất 16 ký tự, không hiện ra). Rồi vào `https://app.<tên miền>/gov`, bật mã 6 số.
5. **Kiểm:** `APP_ORIGIN=… STORAGE_ENDPOINT=… MEDIA_PUBLIC_ORIGIN=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=nfc-media node scripts/selfhost-smoke.mjs`
   (cần Node 24 trên máy chạy lệnh). Phải in `Self-hosted platform: all checks passed.`

## Chuyển production từ Vercel sang VPS — giữ nguyên Neon và R2 (29/09)

Đường nhanh nhất ra khỏi Vercel: **chỉ app chuyển**, database vẫn ở Neon, ảnh vẫn ở R2, tên miền và link đăng nhập Google giữ
nguyên. Không chép dữ liệu nào, nên không mất gì. Bộ riêng cho việc này: `deploy/hosted/` (app + Caddy lấy HTTPS miễn phí).
**Đã chạy thử 29/09** trên Docker của máy Tài (database thử thay cho Neon, Caddy ở HTTP): 5 trang trả 200, đăng nhập sai ra 401
(app chạm được database), nút Google hiện, dòng `VERCEL=1` lỡ chép vào bị vô hiệu. **Chưa chạy trên VPS thật có HTTPS.**

1. **Mua VPS** (Tài): vùng **Singapore** (gần Neon `ap-southeast-1`), Ubuntu 24.04, **2 GB RAM** trở lên (dựng image cần bộ nhớ;
   1 GB thì thêm swap ở bước 2). Khoảng 5–6 USD/tháng.
2. **Trên VPS** (đăng nhập bằng SSH):
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/tuantaidoan2004-collab/nfc-feedback-platform.git /opt/nfc && cd /opt/nfc
   ```
   Máy 1 GB: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.
3. **Chép cấu hình từ Vercel** — trên máy Mac, trong thư mục dự án (tệp chứa bí mật, không bao giờ vào git):
   ```bash
   vercel env pull deploy/hosted/hosted.env --environment=production
   ```
   Mở tệp, **xoá mọi dòng bắt đầu bằng `VERCEL_`, `TURBO_` và dòng `NFC_BUILD_TARGET`**, rồi gửi lên VPS và xoá bản trên Mac:
   ```bash
   scp deploy/hosted/hosted.env root@<IP-VPS>:/opt/nfc/deploy/hosted/hosted.env && rm deploy/hosted/hosted.env
   ```
   Tệp mẫu liệt kê đúng những biến cần có: `deploy/hosted/hosted.env.example`.
4. **Bật** (trên VPS):
   ```bash
   cd /opt/nfc && docker compose -f deploy/hosted/docker-compose.yml up -d --build
   ```
   Caddy chờ tới khi tên miền trỏ về máy này mới lấy được chứng chỉ; app đã chạy phía sau nó.
5. **Đổi DNS ở Cloudflare** (Tài): bản ghi của `quitesensational-review-bio.com` (hôm nay là CNAME về Vercel) → **bản ghi A trỏ
   IP của VPS, "DNS only" (mây xám)**. **Không đụng** bản ghi `media` (R2, mây cam). Vài phút sau Caddy tự lấy HTTPS.
6. **Kiểm:** `curl -s https://quitesensational-review-bio.com/api/health` ra `{"status":"ok"}` (app và database Neon đều trả lời); `curl -sI https://quitesensational-review-bio.com | grep -i x-vercel` **không** còn dòng nào (đã rời Vercel); đăng
   nhập `/gov` (chạm database); mở trang khách `/urr6ud`; tải thử một ảnh trong dashboard (R2); "Đăng nhập bằng Google"
   (redirect URI không đổi vì tên miền không đổi).
7. **Quay lại Vercel nếu có chuyện:** đổi bản ghi DNS về CNAME cũ của Vercel — Vercel vẫn giữ bản deploy.
8. **Cập nhật về sau** (trên VPS): migration mới chạy **trước** (vẫn là Neon), rồi dựng lại:
   ```bash
   cd /opt/nfc && git pull && docker compose -f deploy/hosted/docker-compose.yml run --rm app node scripts/migrate.mjs && docker compose -f deploy/hosted/docker-compose.yml up -d --build
   ```
9. **Sau khi chạy ổn:** gỡ tên miền khỏi project Vercel (để không còn chạy thương mại trên Hobby). **Đừng gỡ tích hợp Neon**
   khỏi Vercel khi chưa chắc nó không xoá gì phía Neon — database là của Neon, chỉ biến môi trường do tích hợp đặt. Sao lưu
   (`sao-luu.md`, GitHub Actions) không phụ thuộc Vercel, chạy tiếp như cũ.

## Biến môi trường — cái nào nói gì

| Biến | Ý nghĩa |
|---|---|
| `STORAGE_ENDPOINT`, `STORAGE_REGION` | Kho tương thích S3 bất kỳ (`lib/media/storage-settings.ts`). Không đặt thì là Cloudflare R2 theo `R2_ACCOUNT_ID` — như production hôm nay |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Khoá và bucket **của kho đang dùng**, dù là R2, S3 hay SeaweedFS (giữ tên cũ để không deployment nào phải đổi) |
| `MEDIA_PUBLIC_ORIGIN` | Nơi khách đọc ảnh: một origin, hoặc origin + đường dẫn bucket (`…/nfc-media`) với kho kiểu path |
| `NFC_CLIENT_IP_HEADER` | Header duy nhất chứa IP khách mà proxy phía trước **tự ghi đè** (`server/guest-limits.ts`). Trên Vercel tự nhận ra. Để trống: không đếm theo địa chỉ, không bao giờ tin header khách tự gửi |
| `NFC_ENV`, các cờ `NFC_*_ENABLED` | Như production (`server/env.ts`); compose đặt sẵn |
| `NFC_GOOGLE_CLIENT_ID`, `NFC_GOOGLE_CLIENT_SECRET` | Đăng nhập bằng Google cho chủ quán (lát D4c). Để trống cả hai: nút Google không hiện |

## Giới hạn, nói thẳng

- **Chưa chạy trên một máy chủ thật có tên miền và HTTPS** — cả hai bộ mới chạy trên Docker Desktop của máy Tài (bộ đầy đủ 27/09,
  bộ "chỉ chuyển app" `deploy/hosted/` 29/09).
- **Tạo admin đầu tiên** (bước 4) cần một terminal thật (script đọc mật khẩu không hiện ra màn hình); chưa chạy thử trong
  container.
- **Trên `http://127.0.0.1` (chưa có HTTPS)** app, đăng nhập, trang khách chạy; nhưng ảnh/video tải lên **không phát hành
  được** vì trang khách chỉ nhận ảnh `https` (luật an toàn, giữ nguyên). Đặt proxy TLS ở bước 3 là đủ.
- **Sao lưu** (`scripts/backup.mjs`) đã nhận mọi kho S3 (`R2_BACKUP_ENDPOINT`) và mọi PostgreSQL, nhưng cần `pg_dump` bản
  18 trên máy chạy nó; chạy bằng cron trên máy chủ thay cho GitHub Actions là việc nhỏ còn lại.
- Một máy là một điểm hỏng. Chạy nhiều máy, database tách riêng, tự chuyển khi hỏng là chuyện của quy mô sau.
