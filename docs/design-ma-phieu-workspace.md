# Thiết kế: Mã phiếu · Workspace theo thứ tự · Gia hạn (phiên 24, 06/10/2026)

Áp dụng cho công cụ **dùng chung** ChatGPT Plus (mật khẩu + 2FA) và Claude Pro (mã qua email). "Workspace" = **Project** trong
ChatGPT / Claude (mỗi khách 1 Project tên "Slot N"). Kiểm tra theo hướng dẫn chính thức OpenAI (help.openai.com, 06/10/2026):
tạo Project = "New project" ở thanh bên; xoá = menu ••• → "Delete project"; Project không giới hạn số lượng;
đăng xuất = Settings → Security → Active sessions → "Log out all" → "Log out of all devices" (đăng xuất CẢ phiên đang dùng, có thể
mất tới 30 phút); "Delete all chats" (Settings → Data controls) xoá CẢ chat trong Project.

## 1. Mã phiếu (mã để lấy mã đăng nhập)

Vấn đề: khách nào cũng thấy email tài khoản dùng chung. Muốn lấy mã đăng nhập (mã 2FA ChatGPT, mã email Claude) phải có **mã phiếu**.
Có email mà không có mã phiếu → không lấy được mã.

| Loại | Dùng được | Gắn với | Dùng cho |
|---|---|---|---|
| `once` — Mã 1 lần | 1 lần lấy mã | — | phát cho khách ở quán (in phiếu, nhân viên đưa) |
| `forever` — Mã vĩnh viễn | không giới hạn số lần (vẫn theo giới hạn lấy mã / slot) | SĐT đầu tiên dùng nó (chủ gỡ gắn được) | nhân viên quán, khách quen |
| `extend` — Mã gia hạn N ngày | 1 lần | — | khách mua thêm ngày qua Zalo (mục 4) |

- Mã: 8 ký tự `XXXX-XXXX` lấy từ 31 ký tự dễ đọc (bỏ 0/O/1/I/L). Khách gõ thường/hoa, có/không gạch đều được.
- Tuỳ chọn khi tạo lô: công cụ dùng được (bỏ trống = mọi công cụ cần mã phiếu), quán (bỏ trống = mọi quán), hạn dùng (ngày), ghi chú.
- **Trừ lượt chỉ khi thật sự mở được mã** (mã 2FA hiện ra / lượt chờ mã email mở). Bận, sai máy, hết lượt → không trừ.
- Đang trong lượt xem mã 2FA trên đúng máy → xem tiếp, không cần mã phiếu mới.
- Mã phiếu thay cho việc "đang ở quán" khi lấy mã (phiếu chỉ phát ở quán). Cài đặt `voucherNeedsCafe` = 1 nếu muốn vừa phiếu vừa phải đang ở quán.
- Đoán mã: sai 5 lần / máy / 10 phút → khoá 10 phút + cảnh báo vàng.
- Khách có mã vĩnh viễn đã gắn SĐT: không cần gõ lại, hệ thống tự dùng.
- Slot đã gia hạn (mục 4): lấy mã không cần phiếu, không cần ở quán (khách đã trả tiền, có thể ở nhà), vẫn đúng 1 máy.
- Công cụ bật/tắt bằng ô "Cần mã phiếu khi lấy mã" (`tools.voucher_code`). Gói chạy thử: bật cho ChatGPT, Claude.
- Trang quản trị **Mã phiếu**: tạo lô → trang in (cắt phiếu) + CSV; danh sách, tìm, bỏ mã, gỡ gắn SĐT; lịch sử dùng.

## 2. Workspace theo thứ tự

- Tài khoản dùng chung có `max_holders` chỗ (ChatGPT tối đa **8**). Chỗ n ↔ Project tên `<tiền tố> n` (cài đặt `workspacePrefix`, mặc định "Slot").
- Khách nhận slot → được **chỗ trống nhỏ nhất** (1, 2, 3 …). Chỗ của khách đã gia hạn giữ nguyên.
- Bảng `workspaces(account_id, seat, name, url, state, updated_at)`: bot ghi link Project sau khi tạo. Trang khách hiện
  "Workspace của bạn: **Slot 3**" + nút **Mở Slot 3** (link thẳng vào Project). Chưa có link (Claude / chủ tạo tay) → chỉ hiện tên.

## 3. Làm mới mỗi ngày (6h)

Việc `rotate` (trang **Việc tay**) được tạo khi khách cuối cùng KHÔNG gia hạn hết giờ, kể cả khi còn khách đã gia hạn; nhập tài khoản
mới có tick → việc `setup` (tạo Project trước khi giao). Việc ghi rõ Project nào phải **giữ** (khách gia hạn). Thứ tự chủ làm:
xoá Project + chat trước (trừ Project giữ lại; có giữ thì KHÔNG dùng "Delete all chats" vì nó xoá cả chat trong Project), rồi
Settings → Security → Active sessions → "Log out all", tạo lại "Slot 1…N" (chọn Project-only memory), bấm "Đã xong" (tick giữ mật khẩu).

Không làm bot tự đăng nhập / tự đăng xuất ChatGPT: phần đó Claude không xây (phiên 24). Tắt **Memory** của tài khoản (Settings → Personalization),
nếu không ChatGPT nhớ chuyện của khách này rồi nói cho khách khác.

## 4. Gia hạn ("dùng thêm")

- Trang khách (slot đang chạy): ô **Dùng thêm** → nhập mã gia hạn, hoặc bấm "Xin gia hạn" (ghi yêu cầu, chủ thấy ở trang Gia hạn, khách nhắn Zalo trả tiền).
- `extendSlot(slot, days)`: `expires_at` += N ngày (tới đúng giờ hết `end_hour` của ngày đó), không vượt hạn tài khoản (`account_days`),
  tối đa `maxExtendDays` (mặc định 7) ngày tính từ bây giờ. Slot ghi `extended_days`, `code_free = 1`.
- 6h sáng: khách thường hết giờ; khách gia hạn vẫn chạy → vẫn làm mới tài khoản nhưng **giữ Project** của khách gia hạn,
  tài khoản mở lại cho khách mới ở các chỗ còn lại. Khách gia hạn bị đăng xuất → đăng nhập lại, lấy mã 2FA không cần phiếu.
- Trang quản trị **Gia hạn**: yêu cầu đang chờ (Gia hạn 1 / 3 / 7 ngày · Bỏ qua), slot đang chạy có thể gia hạn tay.

## 5. Dữ liệu mới

`vouchers`, `voucher_uses`, `workspaces`, `extend_requests`; cột `tools.voucher_code`, `tools.workspace_bot`, `slots.extended_days`,
`slots.code_free`. Cài đặt: `voucherNeedsCafe`, `workspacePrefix`, `maxExtendDays`, `voucherFailsPer10Min`.
