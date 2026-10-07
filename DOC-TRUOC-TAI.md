# Gửi Tài — Cọ Láp (TBQ "Công cụ làm việc miễn phí"), bản 1.3.1 ngày 07/10/2026

## Mới ở 1.3.1 — Long tắt máy Mac, Tài tự làm tiếp

**Máy Mac của Long tắt từ tối 07/10** → `https://thu.tiembanquyen.site/colap` (chạy trên Mac qua Cloudflare Tunnel) **ngừng**.
Tài cài lên máy chủ của mình theo `docs/HUONG-DAN-MO-BAN.md` mục "Cài trên máy chủ" (1 lệnh, HTTPS qua Caddy), rồi trỏ `thu` về đó.

- **Dữ liệu đang chạy** (quán Bamos `sakz8`, 8 tài khoản ChatGPT, nhật ký) nằm trong `data/tbq.sqlite` + `.env` trên Mac của Long.
  Mật khẩu kho mã hoá bằng `DATA_KEY` trong `.env` — **chép cả hai cùng nhau**, qua kênh riêng (Zalo / USB), **không bao giờ đưa lên git**.
  Không lấy dữ liệu cũ thì cài mới: `npm run seed && npm run pilot`, thêm quán Bamos bằng link QS, nhập kho lại.
- **Đã chạy thử thật 07/10 (máy Mac, bản 1.3.0):** mã xác nhận qua email (Cloudflare Email Sending) về iCloud đúng mã; nhận CapCut (tài khoản giả)
  → trang "Slot của tôi" đúng; Canva: bot mời vào nhóm ~40 giây, thu hồi → bot gỡ (lần đầu không thấy "Hủy thư mời", tự thử lại thì được).
  Dữ liệu thử đã dọn (thẻ THỬ 1–3 khoá, tài khoản thử "Ngừng dùng").
- **Long chốt cách đăng nhập (07/10)** — đã sửa `scripts/pilot.js`, `npm run pilot` sẽ cài đúng:
  | Công cụ | Đăng nhập | Dòng nhập kho | Cần quy tắc Cloudflare |
  |---|---|---|---|
  | ChatGPT | mã qua email (trước là mật khẩu + 2FA) | `email` @tiembanquyen.site | ✅ mỗi địa chỉ → Worker `tbq-mail` |
  | Claude | mã qua email | `email` @tiembanquyen.site | ✅ như trên |
  | CapCut, Adobe | email + mật khẩu, **không** nút Lấy mã | `email\|mật khẩu` (tên miền nào cũng được) | không |
  | Canva | bot mời vào nhóm | `email chủ nhóm\|số ghế` | không |
  Catch-all của tiembanquyen.site đang về hộp thư `ma.` của CapCut Tool → thiếu quy tắc riêng thì khách bấm Lấy mã mà không có mã
  (`npm run kiem-tra -- --mang` báo địa chỉ nào thiếu).
- **Kho ChatGPT trên máy Long:** 8 tài khoản nhập 16:38 còn tick "chờ tạo Project" → trạng thái "Chờ bot tạo Project", **chưa giao**.
  Tạo xong Project Slot 1–8 thì vào Kho tài khoản chuyển "Sẵn sàng".
- **Bot Canva** (`npm run canva-bot -- --nhom <email chủ nhóm>`) cần máy có Chrome luôn bật + `TBQ_URL`, `WORKER_TOKEN` trong `.env`
  (`.env` hiện chưa có `TBQ_URL`). Nhóm đang đăng nhập trong bot là **Canva Giáo dục** — chạy thật phải đổi sang nhóm thương mại.
- **Việc còn nợ trong code:** bài kiểm (`test/pilot.test.js`, `test/ma-phieu.test.js`, `scripts/e2e.js` P1–P6) vẫn dựng lại cấu hình cũ
  (ChatGPT mật khẩu + 2FA, Adobe Lấy mã) để kiểm các kiểu đó — nên thêm bài ChatGPT mã qua email theo cấu hình mới.
  Ô "Email tài khoản Canva" trên trang khách chưa tự điền email vừa xác nhận.

---

## Từ bản 1.3.0

Đây là code riêng của Tiệm Bản Quyền, chạy riêng (server, DB, giao diện riêng). Bên QS chỉ cần **một chỗ nối**: khối
"Công cụ làm việc" trên trang quán → nút mở `https://thu.tiembanquyen.site/colap/qs/<mã quán QS>?t=<vé có chữ ký>`.

Đọc theo thứ tự:
1. `docs/phoi-hop-voi-QS.md` — hợp đồng nối: link, vé ký HMAC (`NFC_EVENT_TBQ_KEY` bên QS = `QS_TICKET_KEY` bên TBQ), API thống kê, chính sách chữ Google.
   **Mới ở 1.3.0 — mục 10:** `POST /hooks/qs/quan` (open / close / status). Tài bấm Mở / Đóng cột Sự kiện trong `/gov` thì gọi API này một lần,
   quán tự có / tự dừng bên TBQ — Long không phải thêm tay. Cùng khoá, cùng cách ký với `/hooks/qs/phieu` (mục 9).
   Quán đầu tiên chạy thật: **Bamos Coffee — `sakz8`** (TBQ đã gắn sẵn; bên QS cần đưa khối lên trang + Mở sự kiện).
2. `docs/qs-patch/khuc-b-canvas.patch` — bản vá mẫu Long viết trên nhánh `78b8fbf` của QS. **Đã cũ** (QS đã đi tiếp nhiều commit) và
   `origin` trong patch vẫn là `.com` → chỉ dùng để tham khảo; Tài tự code theo cấu trúc hiện tại, origin đúng = `https://thu.tiembanquyen.site/colap`.
3. `README.md` — chạy thử TBQ trên máy: Node 22.13+, `npm run local` (khoá vé chạy thử: `dev-qs-ticket-key-change-me-0123456789`).

**Khoá vé thật KHÔNG có trong gói này** — Long gửi riêng qua Zalo. Không commit khoá vào repo QS; đặt ở biến môi trường Production.
Kiểm tra nối xong: mở trang quán bằng thẻ/QR → bấm nút → TBQ hiện danh sách công cụ (không báo "vé hết hạn").
