# Vận hành độc lập thử (05/10/2026)

Chạy: `npm run doc-lap` → bảng theo dõi http://localhost:3921 (bấm ▶ để mở cửa), trang quản trị http://localhost:3920/admin
(mật khẩu `xem-mo-phong`), **Trang của chủ** http://localhost:3921/chu.

- Khách tự đến như ngày thật (3 quán, ~80 lượt/ngày, có kẻ gian: chia sẻ tài khoản, chụp QR về nhà, SIM thứ 2, khách cũ thử vào lại…).
  Đồng hồ tua nhanh: 1 ngày ≈ 24 phút thật (`--speed=60`).
- **Chủ tiệm tự động bị tắt** (`--chu-that`): không ai tự nạp hàng, không ai tự đổi mật khẩu. Người làm chủ chỉ dùng:
  trang quản trị TBQ (Theo dõi, Việc tay, Kho, Công cụ, Quán) + **Trang của chủ** (tài khoản của mình ở các hãng: đổi mật khẩu /
  chỉ đăng xuất mọi thiết bị; chợ mua tài khoản để dán vào Kho).
- Kho bắt đầu trống, đồng hồ đứng ở 06:00 ngày 1 tới khi chủ nhập hàng xong và bấm ▶.
- Cuối buổi, báo cáo ghi: khách nhận được bao nhiêu, mất lượt vì sao, việc tay chờ bao lâu, khách hết hạn còn dùng tiếp ở hãng bao lâu,
  nhật ký thao tác của chủ.

## Lần chạy đầu: Claude làm chủ 2 ngày (159 khách)

Chủ chỉ đọc trang Theo dõi (như cầm điện thoại), làm theo `chay-thu-that.md` và README "Vận hành hằng ngày".

| | Chủ tự động của mô phỏng (xem Việc tay 3 lần/ngày) | **Chủ người thật (vận hành độc lập)** |
|---|---|---|
| Việc tay chờ trung bình | 429 phút | **25–45 phút** (6 việc) |
| Khách hết hạn còn dùng tiếp ở hãng (trung bình) | ~490 phút | **~98 phút** |
| Vi phạm (lộ mật khẩu / 2FA, giao trùng, vào hãng không giữ slot) | 0 | **0** |
| Khách nhận được công cụ | ~71% | 73% (127 / 175 lượt) |

Nhật ký chủ: 06:00 N1 mua 6 ChatGPT + 4 Adobe + 10 CapCut + 5 Gemini, nhập kho, mở cửa → 15:55 mọi công cụ hết lượt/ngày → 16:37 mua thêm,
nâng lượt (CapCut 40, ChatGPT 25, Gemini 10, Adobe 8) → 19:20 nạp hàng cho ngày mai → 23:00 phát hiện 3 quán hết 20 suất, nâng lên 30 →
N2: 6 việc tay (ChatGPT "chỉ đăng xuất", Adobe đổi mật khẩu + dán) trong 25–45 phút mỗi việc → 14:10 báo đỏ "Mã mồ côi" (khách cũ thử đăng nhập
Adobe trước khi chủ kịp đổi mật khẩu — bị chặn đúng).

Khách mất lượt: **24 lượt "quán hết suất"** và **8 lượt "mọi công cụ đều tạm hết"** — đều vì chủ không được báo kịp.

## Phát hiện và đã sửa

| # | Phát hiện khi vận hành | Sửa |
|---|---|---|
| 1 | **Không có báo động hết kho / hết lượt hôm nay** — chủ chỉ biết khi tự mở trang Công cụ (mất ~2 giờ, ~11 khách về tay trắng) | Trang Theo dõi có ô **Kho hôm nay** (đỏ = không giao được nữa, vàng = còn ≤ 3). Hết kho → báo **đỏ** (có âm báo); hết lượt / ngày → báo vàng; mỗi loại 1 lần / ngày |
| 2 | **Không có báo động quán hết suất** — 3 giờ liền 23 lượt khách không nhận được dù kho còn | Quán vừa dùng hết suất → báo vàng "Quán hết suất hôm nay" |
| 3 | Báo động không nói **chủ nên làm gì** (vd. "Mã mồ côi") | Mỗi báo động quan trọng có dòng "→ Nên làm: …" (mồ côi → đổi mật khẩu ngay; cách ly → lấy lại tài khoản rồi làm việc tay; hết kho → mua thêm…) |
| 4 | Nâng lượt / ngày phải mở từng trang công cụ (4 lần), nâng suất phải mở từng trang quán (3 lần) | Sửa nhanh ngay trên danh sách Công cụ ("hôm nay / lượt mỗi ngày") và danh sách Quán ("hôm nay / suất mỗi ngày") |
| 5 | Nhiều cảnh báo hiện mã máy (`tap_replay`, `admin_login_failed`, `card_locked`…) | Đủ nhãn tiếng Việt cho mọi loại sự kiện |
| 6 | (Khi sửa) ô số dùng `style=""` bị chính sách bảo mật trang (CSP) chặn → ô rộng, vỡ hàng | Dùng class CSS |

Test: 79/79 (thêm test cho báo hết kho / hết lượt / quán hết suất, ô Kho hôm nay, sửa nhanh lượt và suất), e2e 134/134 (cả `/colap`),
mô phỏng 0 vi phạm, kịch bản sâu 68/68.

## Bài học cho ngày chạy thật (cần bạn quyết)

- **Gói chạy thử hiện tại nhỏ hơn nhu cầu** (~80 lượt/ngày ở 3 quán): 20 suất/quán và lượt/ngày theo `chay-thu-that.md` hết trước 16:00.
  Muốn phục vụ cả buổi tối: 30 suất/quán, CapCut ~20–25 tài khoản/ngày (2 khách/tài khoản), Gemini ~10 link/ngày. Đây là tiền thật — bạn quyết.
- **Làm việc tay trong 30–45 phút** là đủ để khách hết hạn chỉ dùng tiếp ~1,5 giờ (so với ~8 giờ nếu chỉ xem 3 lần/ngày) và giảm "mã mồ côi".
  Mở trang Theo dõi trên điện thoại, bật âm báo.
- ChatGPT: "Chỉ đăng xuất mọi thiết bị" + tick "Giữ mật khẩu cũ" là nhanh nhất (khách cũ không có mã 2FA). Adobe: bắt buộc đổi mật khẩu + dán.
- Nạp hàng buổi tối cho hôm sau (CapCut nhập kho quá 7 ngày sẽ không giao, nên đừng mua trước quá nhiều).
