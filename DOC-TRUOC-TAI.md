# Gửi Tài — Cọ Láp (TBQ "Công cụ làm việc miễn phí"), bản 2.0.3 ngày 08/10/2026

## Mới ở 2.0.2–2.0.3 — chỉ đổi phía khách, API giữ nguyên

- Trang quán: khối **Collab** đầu trang (logo quán ✕ thẻ treo TBQ Space, chữ COLLAB, "Miễn phí tại quán") thay dòng "☕ tên quán · Miễn phí".
  Logo + màu dấu X theo mã quán QS trong `CAFE_BRAND` (`src/views/public.js`); Bamos `8ugdc` → `src/public/quan-8ugdc.png`. Quán chưa có logo → vòng chữ cái đầu.
- Món không nhận được: mỗi món 1 dòng mờ (logo xám, tên, nhãn lý do), 2 nhóm "Hôm nay cháy hàng" / "Chưa nhận được lúc này"; hết sạch → tiêu đề "Hôm nay cháy hàng rồi".
  Phần tử vẫn có `data-off="<tên món>"` nếu bên QS có đọc.
- Trang vé `/me`: gọn trong 1 màn điện thoại (vé + bước + nút), vé nằm thẳng, màn "Xong" có ✓ + nút "Mở <món> ↗"; email trong ô chép xuống dòng trước @.

## Mới ở 2.0.1 — Thư mã chia bước + trang vé mỗi bước một màn (chỉ đổi phía khách, API giữ nguyên)

- Thư mã xác nhận (`src/services/otp.js` → `otpEmail()`): logo PNG `src/public/logo-email.png`, mã 6 số to, 3 bước (chép mã → quay lại trang → nhập 6 ô).
  Tiêu đề thư bắt đầu bằng mã để iPhone gợi ý tự điền. Ảnh logo lấy theo `BASE_URL` → máy chủ phải mở `/static/` ra ngoài (đã có sẵn).
- Trang `/me`: các bước đăng nhập thành từng màn (thanh tiến độ, "‹ Quay lại" / "Tiếp ›", tự qua bước sau khi chép, vuốt ngang, màn "Xong").
  Không JS thì vẫn hiện danh sách như cũ. Đã chạy thật trên máy của Tiệm từ 23:08 07/10.

## Mới ở 2.0.0 — Giao diện khách mới "Vé vào ca" (chỉ đổi phía khách, API giữ nguyên)

- Phong cách Bamos × TBQ × Apple, chỉ cho điện thoại: nền đêm giống trang quán, nút viên thuốc màu kem giống nút khối "Công cụ làm việc",
  vàng đồng TBQ làm điểm nhấn, logo thẻ treo TBQ. Thiết kế + lý do: `docs/thiet-ke-v2.md`.
- Luồng: chọn món TRƯỚC (hàng danh sách) → bảng trượt email + mã 6 số → tự nhận món đã chọn → vé + checklist đăng nhập → trang "Hết ca rồi!".
- **Không đổi gì cho QS:** đường dẫn `/qs/<mã quán>?t=<vé>`, `/c/<thẻ>`, `/hooks/qs/*`, chữ ký vé, API kho, `/api/*` — y như 1.4.
- Kỹ thuật: CSS khách mới `src/public/ui.css` (trang Quản trị vẫn `style.css`), favicon `src/public/logo.svg`.
  Trang quán hiện món ngay cả khi khách chưa đăng nhập (`toolAvailability(ctx, null)` vẫn báo món đang nghỉ nhận).
  Món hết suất là chip `<span data-off="Tên">` (không còn radio disabled).


## Mới ở 1.4.0 — API kho cho QS

Kho dùng chung mọi quán ở TBQ, giao diện từng quán là khối của QS. Tài quản lý kho qua API, khỏi vào trang quản trị TBQ.
- `POST /hooks/qs/kho` — `summary` / `list` / `get` / `add` / `update`. Ký giống `/hooks/qs/quan` nhưng bằng **khoá riêng `QS_KHO_KEY`**
  (Long gửi riêng, không gửi qua chat công khai). Mật khẩu / 2FA chỉ gửi vào, không bao giờ trả ra. Hợp đồng: `docs/phoi-hop-voi-QS.md` mục 11.
- `status` của `/hooks/qs/quan` có thêm `tools:[{slug, name, available, reason}]` → khối trên trang quán hiện "Tạm hết" đúng lúc (mục 10, "Mới ở 1.4").
- Code: `src/domain/stock.js` (trang quản trị và API dùng chung), `src/routes/hooks.js` (`registerKhoApi`), bài kiểm `test/api-kho-qs.test.js`.


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
