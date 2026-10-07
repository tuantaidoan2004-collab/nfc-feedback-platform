# Gửi Tài — Cọ Láp (TBQ "Công cụ làm việc miễn phí"), bản 1.3.0 ngày 07/10/2026

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
