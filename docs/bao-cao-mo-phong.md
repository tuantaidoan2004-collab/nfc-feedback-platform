# Báo cáo mô phỏng khách thật — 9 ngày, 3 quán

Chạy lúc 00:53:22 7/10/2026 · hạt giống 2026 · 28 lượt/quán/ngày (trung bình) · 4 giây máy, 6.374 lượt gọi API.
Máy chủ chạy đúng code thật, cấu hình production; tài khoản đều là **giả định** (bản giả của từng hãng trong `scripts/sim.js`).

## Kết luận: ✅ không có vi phạm nào

Trong suốt 9 ngày: không giao trùng tài khoản / Slot / mã Gemini, không vượt giới hạn lượt (quán, công cụ, khách),
không lộ mật khẩu cho máy khác, khoá 2FA không xuất hiện ở bất kỳ trang nào, không có lỗi 500, khách cũ không vào lại được sau khi hết hạn.

## 1. Khách

- 590 khách khác nhau, 760 lượt ghé (có khách quay lại ngày khác).
- **443 lượt nhận được công cụ (58%)**, 307 lượt phải chọn công cụ thứ 2 vì công cụ thích nhất đã hết.
- SMS OTP đã gửi: **677** tin ≈ 541.600đ (giả định 800đ/tin).
- Bấm "Mua gói qua Zalo" sau khi hết hạn: 49 · hỏi "dịch vụ khác" qua Zalo: 0.

| Kết quả mỗi lượt ghé | Số lượt |
|---|---|
| Nhận ChatGPT | 218 |
| Nhận CapCut | 176 |
| Công cụ hết lượt trong ngày | 92 |
| Hết tài khoản lúc bấm | 85 |
| Quán hết suất trong ngày | 60 |
| Nhận Gemini | 45 |
| Đang giữ slot (quay lại xem) | 42 |
| Ở nhà, không có vé — bị chặn | 15 |
| Spam OTP | 11 |
| Mới thử công cụ này gần đây | 8 |
| Nhận Adobe | 4 |
| Đã thử đủ số lần | 2 |
| Máy đang giữ slot SĐT khác | 1 |
| Máy đã dùng cho SĐT khác | 1 |

## 2. Lượt giao mỗi ngày (so với giới hạn)

| Công cụ | Giới hạn/ngày | N1 | N2 | N3 | N4 | N5 | N6 | N7 | N8 | N9 |
|---|---|---|---|---|---|---|---|---|---|---|
| capcut | 20 | 20 | 20 | 20 | 16 | 20 | 20 | 20 | 20 | 20 |
| chatgpt | — | 26 | 24 | 24 | 24 | 24 | 24 | 24 | 24 | 24 |
| gemini | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| adobe | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Kho: CapCut +10 tài khoản/ngày (2 khách), Gemini +5 link/ngày, ChatGPT **3 tài khoản** (5 khách, đổi mật khẩu rồi giao lại), Adobe **2 tài khoản** (2 khách). Canva: khách nhắn Zalo. Mỗi quán **20 suất/ngày**.
Trung bình mỗi ngày: capcut 19.6 · chatgpt 24.2 · gemini 5.0 · adobe 0.4.
Bấm công cụ đang hiện "còn chỗ" rồi mới bị báo hết (người khác vừa nhận mất): 494 lần.

## 3. Khách đăng nhập được thật không (bản giả của hãng)

| Công cụ | Lần thử | Vào được | Không vào được |
|---|---|---|---|
| chatgpt | 218 | 218 (100%) | — |
| adobe | 4 | 4 (100%) | — |
| capcut | 176 | 176 (100%) | — |
| gemini | 45 | 45 (100%) | — |

- CapCut: Pro dùng thử tính từ lúc tạo tài khoản, slot khách tính từ lúc nhận → số giờ Pro khách bị hụt cuối slot: 176 lần · TB 0.0 · 90% dưới 0.0 · lâu nhất 0.0 giờ.

## 4. Gian lận và lách luật

| Kiểu | Số lần | Kết quả |
|---|---|---|
| Ở nhà, không có vé / không chạm thẻ (link lan trên mạng / link bạn gửi / link cũ / cắt bỏ bộ đếm của chip) + giả IP quán | 15 | bi_chan:link_lan_tren_mang:need_entry: 6, bi_chan:the_ban_gui:need_entry: 3, bi_chan:ve_ban_gui:need_entry: 2, bi_chan:the_cat_tham_so:need_entry: 2, bi_chan:the_link_cu:need_entry: 1, bi_chan:ve_cu:need_entry: 1 |
| Chụp mã QR trên bàn về nhà quét; ở quán thẻ riêng: link của chip KHÔNG bật bộ đếm (kẽ hở đã biết) | 13 khách, 14 lượt | LOT: 8, khong_nhan:tool_daily_cap: 3, khong_nhan:no_account: 2, khong_nhan:cafe_quota: 1 — vẫn dính giới hạn / khách / máy / quán |
| 1 máy, SIM thứ 2 | 11 | bi_chan:device_busy: 11 |
| Xoá cookie, quay lại | 4 | (máy được nhận lại → giới hạn vẫn áp dụng) |
| Ẩn danh + SIM thứ 2 (máy "mới") | 2 | **lọt được** nếu có SIM thật khác — vẫn phải có vé mới từ trang quán, vẫn tính suất quán |
| Spam OTP (12 số / 1 máy) | 11 | gửi được 11 lần · TB 5.0 · 90% dưới 5.0 · lâu nhất 5.0 tin |
| Chia sẻ ChatGPT cho bạn | 11 | bi_chan:need_voucher: 11 |
| Khách cũ tự vào lại sau hết hạn | 50 | chatgpt:bad_password: 34, capcut:vao_duoc_nhung_het_pro: 10, chatgpt:can_2fa_tbq_tu_choi: 5 |

- Người đã hết hạn còn dùng tiếp được (phiên cũ chưa bị đăng xuất) tới khi chủ đổi mật khẩu:
  ChatGPT 218 lần · TB 30.0 · 90% dưới 30.0 · lâu nhất 30.0 phút; Adobe không có.
- Thư mã về hộp thư kho: matched: 3, orphan_wait: 1.

- Quán dùng thẻ NFC riêng (Cộng Đêm Bình Thạnh: 8 thẻ, 2 chip không bật bộ đếm):
  lượt chạm theo kết quả ok 530, replay 6;
  thẻ bị tự khoá: 0; lượt bị "thẻ hết suất": 0.
  Khách thật bị bảo "chạm lại thẻ": không có.

## 5. Việc của chủ tiệm

- Không có ca nào phải duyệt tay: ca vàng khi nhận slot tự từ chối (cài đặt yellowAction = reject) — 0 lượt; lấy thêm mã tự cho qua nếu đang ở quán và đúng máy.
- Đổi mật khẩu + đăng xuất: ChatGPT 28 lần, Adobe 0 lần.
- Việc tay chờ chủ làm: 28 việc (28 xong, 0 còn treo) · TB 30 phút · lâu nhất 30 phút.
- Cảnh báo ghi ở trang Theo dõi (đỏ / vàng): worker_task_stuck: 28, tool_daily_cap: 18, tool_sold_out: 9, cafe_full: 7, tap_replay: 6.

## Giả định của mô phỏng (không phải số đo thật)

- Kiểu khách: wifi 45%, 4g 19%, laptop 11%, vonvoi 5%, chiase 5%, nhieusim 4%, onha 3%, qrnha 2%, spamotp 2%, xoacookie 4%. Công cụ khách thích: chatgpt 45%, capcut 30%, gemini 12%, adobe 13%.
- 25% lượt ghé là khách cũ quay lại; 20% khách thử tự vào lại sau khi hết hạn; 15% bấm "Mua gói qua Zalo" (chỉ để thử đường đi, không phải tỉ lệ thật).
- Chủ tiệm: nạp hàng 6:30, mở trang Việc tay 12:30 / 17:30 / 21:30. Giá SMS 800đ/tin.
- Chạy lại đúng kết quả này: `npm run sim -- --seed=2026 --days=9 --rate=28 --gpt=3 --adobe=2 --quota=20`.
