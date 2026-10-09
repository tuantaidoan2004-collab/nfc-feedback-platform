# Chạy trang Tiệm trên Botkeep (botkeep.cloud)

Gói **Founder Free**: 5 slot, tổng 2 GB RAM, 1.5 vCore, 2 GB ổ, không hết hạn, chạy 24/7 (không có cam kết thời gian hoạt động — SLA).
Trang Tiệm chỉ cần **1 slot** (đang dùng khoảng 25–40 MB RAM, dữ liệu khoảng 7 MB).

## Gồm những gì

| Tệp | Việc |
|---|---|
| `deploy/botkeep/botkeep.js` | Khởi động trên Botkeep: lấy cổng từ `SERVER_PORT`, nghe `0.0.0.0`, sao lưu 05:30 hằng ngày (giữ 14 bản), in header IP khi `LOG_IP_HEADERS=1`, rồi chạy `src/server.js` như cũ. Không sửa mã app. |
| `deploy/botkeep/dong-goi-botkeep.sh` | Tạo ZIP từ 1 bản phát hành: `bash deploy/botkeep/dong-goi-botkeep.sh ../ban-phat-hanh/tbq-2.1.9.tar.gz` → `tbq-2.1.9-botkeep.zip` (không có `.env` / database / khoá). |
| `deploy/botkeep/botkeep-api.mjs` | Tạo server, gắn tên miền, đẩy biến môi trường, bật/tắt, xem log qua API Botkeep. |

## Bước 1 — Bản chạy thử (không đụng trang thật)

Database **mới, trống**, khoá **mới**, OTP **tắt** (`OTP_PROVIDER=none`): không ai nhận được mã, không gửi thư thật.

1. Trên Botkeep → **Developer → API keys**, tạo khoá có quyền:
   `workloads:create workloads:read workloads:update environment:read environment:write domains:read domains:write power:write logs:read files:read files:write deploy:write backups:read backups:create`
   Lưu khoá vào máy (không dán vào nơi công khai):
   `printf '%s' 'bk_live_…' > ~/.config/botkeep/api-key && chmod 600 ~/.config/botkeep/api-key`
2. Tạo server từ ZIP: `node deploy/botkeep/botkeep-api.mjs tao ../ban-phat-hanh/tbq-2.1.9-botkeep.zip tbq-thu`
3. Lấy id: `node deploy/botkeep/botkeep-api.mjs xem`
4. Tên miền Botkeep: `node deploy/botkeep/botkeep-api.mjs ten-mien <id> tbq-thu` → ghi lại địa chỉ https.
5. Khoá + cấu hình: `node deploy/botkeep/botkeep-api.mjs env <id> https://<địa-chỉ-bước-4>/colap`
   Tạo `~/.config/botkeep/<id>.env` (quyền 600; **mật khẩu quản trị nằm trong tệp này**).
6. Bật và xem log: `node deploy/botkeep/botkeep-api.mjs bat <id>` rồi `… log <id>`

**Kiểm tra bản chạy thử**
- Mở `https://<địa-chỉ>/colap/` trên điện thoại, mở `/colap/admin` và đăng nhập.
- Trong log có dòng `ip-headers …`: xem IP thật của điện thoại nằm ở header nào.
  - Nằm cuối `x-forwarded-for` → giữ `TRUST_PROXY=1`.
  - Có `x-real-ip` đúng IP điện thoại → đổi sang `CLIENT_IP_HEADER=x-real-ip`, bỏ `TRUST_PROXY`.
  - Sau đó xoá `LOG_IP_HEADERS` và khởi động lại.
- Hôm sau xem `data/backup/` có tệp `tbq-<ngày>.sqlite`.
- Muốn thử trọn luồng khách (nhận mã qua email): đổi `OTP_PROVIDER=email`, `LOGIN_BY=email`, thêm `CF_ACCOUNT_ID`, `CF_EMAIL_TOKEN`, `MAIL_FROM` — nghĩa là đặt khoá gửi thư Cloudflare lên Botkeep.

## Bước 2 — Chuyển hẳn (chỉ khi chủ đồng ý, làm giờ vắng, tránh 5–6h sáng)

1. Đóng gói lại từ **đúng bản đang chạy** (xem `~/tbq-chay/PHIEN-BAN.txt`).
2. Tắt trang trên Mac → `npm run backup` → tải `tbq.sqlite` lên `data/` của server (API `files/upload` hoặc bảng điều khiển).
3. Biến môi trường = `.env` của Mac (**cùng `DATA_KEY`**, mất nó là mất mọi mật khẩu trong kho), đổi `HOST`/`PORT` bỏ đi, `BASE_URL=https://thu.tiembanquyen.site/colap`, `CLIENT_IP_HEADER` theo kết quả bước 1.
4. Gắn tên miền riêng `thu.tiembanquyen.site` (Botkeep: domain custom → verify), đổi DNS trên Cloudflare từ đường hầm sang Botkeep.
   Lưu ý `/colap` hiện chung tên miền với phần khác qua đường hầm — kiểm tra lại cách định tuyến trước khi đổi.
5. Kiểm tra: trang khách, `/colap/admin`, thư mã đăng nhập, link QS của Tài, `npm run kiem-tra -- --mang`.
6. Giữ bản trên Mac (đã tắt) vài ngày để quay lại nếu cần: bật lại Mac + đường hầm là xong.

## Cần biết
- Quản trị viên Botkeep **đọc được** khoá trong Environment (theo trang bảo mật của họ). Dữ liệu khách nằm ở máy chủ nước ngoài.
- Botkeep chỉ giữ **2 bản sao lưu** mỗi server, 14 ngày. Thêm vào đó `botkeep.js` tự sao lưu 05:30 vào `data/backup/` — vẫn nên tải 1 bản về Mac mỗi tuần.
- Bot Canva vẫn chạy trên Mac (cần Chrome đã đăng nhập Canva).
- Dịch vụ mới (mở 10/2026), không có SLA.
