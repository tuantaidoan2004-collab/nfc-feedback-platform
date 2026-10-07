# Chạy thử thật với dữ liệu thật

Gói chạy thử: 4 công cụ, mỗi công cụ một cách giao khác nhau (phiên 15: bỏ Canva "mời vào nhóm" — khách cần Canva thì nhắn Zalo). Mọi số liệu sửa được trong trang quản trị, mục **Công cụ**.

| Công cụ | Khách nhận gì | Thời gian | Khách / tài khoản | Lượt / ngày | Hết lượt thì |
|---|---|---|---|---|---|
| CapCut Pro | email + mật khẩu | **7 ngày** | 2 | 20 | Bỏ tài khoản (dùng 1 lần), không cần đổi mật khẩu |
| ChatGPT Plus | email + mật khẩu + **mã 2FA 6 số** + "Slot 1…5" | 24 giờ | 5 | 15 | Người cuối hết hạn → việc tay: đăng xuất mọi thiết bị (đổi mật khẩu nếu muốn) |
| Gemini Pro | 1 link tham gia (hoặc 1 mã) | — | 1 link / 1 khách | 5 | Link đã giao thì xong |
| Adobe Creative Cloud | email + mật khẩu (+ nút lấy mã email khi Adobe hỏi) | 24 giờ | 2 | 4 | Người cuối hết hạn → việc tay: đổi mật khẩu + đăng xuất |
| Dịch vụ khác (Canva…) | dòng "Cần dịch vụ khác? Nhắn Zalo Tiệm" | | | | |

**Về khoá 2FA ChatGPT:** khoá chỉ nằm trên máy chủ, đã mã hoá. Khách chỉ thấy mã 6 số đang chạy, và chỉ trong 3 phút sau khi bấm "Lấy mã 2FA". Khách phải đang ở quán, đúng máy đã nhận. Lần lấy thứ 2 phải được bạn duyệt. Hết hạn thì khách không đăng nhập lại được, kể cả khi còn nhớ mật khẩu.

**Lưu ý:** mỗi khách chỉ giữ 1 công cụ một lúc ("Số slot đang dùng tối đa / khách" = 1). Người nhận CapCut 7 ngày sẽ chưa nhận được công cụ khác trong 7 ngày đó. Muốn cho nhận thêm thì vào **Cài đặt** tăng số này lên 2.

## Kết quả mô phỏng 9 ngày (`npm run sim`, báo cáo đầy đủ: `docs/bao-cao-mo-phong.md`)

Mô phỏng 3 quán, khoảng 80 lượt khách/ngày, chủ tiệm làm việc theo giờ thật (lúc đó gói còn Canva). Mỗi phương án chạy 3 lần,
**cả 9 lần đều không có vi phạm nào**: không giao trùng, không vượt giới hạn, không lộ mật khẩu hay khoá 2FA, khách cũ không vào lại được.

| Phương án kho | ChatGPT / ngày | Adobe / ngày | Khách nhận được |
|---|---|---|---|
| 3 ChatGPT + 2 Adobe, 20 suất / quán (như kế hoạch) | ~10,4 / 15 | ~2,8 / 4 | ~71% |
| **6 ChatGPT + 4 Adobe**, 20 suất / quán | **15 / 15** | **~3,9 / 4** | ~70% |
| 6 ChatGPT + 4 Adobe, **30 suất / quán** | 15 / 15 | ~4 / 4 | **~83%** |

Vì sao 3 tài khoản ChatGPT không đủ 15 lượt/ngày: tài khoản dùng chung phải chờ **người cuối cùng** hết 24 giờ mới đổi mật khẩu
được, nên hôm sau tài khoản bị "kẹt" tới chiều. Có 6 tài khoản thì 2 bộ thay phiên nhau, ngày nào cũng đủ 15.

Những điểm mô phỏng chỉ ra (cần bạn quyết):
1. **Người hết hạn trước vẫn dùng tiếp** (phiên cũ trên máy họ) tới khi bạn đổi mật khẩu + đăng xuất: trung bình khoảng 7 giờ.
   Không đăng nhập lại được (thiếu mã 2FA), nhưng phiên đang mở thì còn. Muốn ngắn hơn: làm việc "Đổi mật khẩu" ngay khi trang Theo dõi / Việc tay hiện việc,
   hoặc giới hạn mỗi tài khoản chỉ nhận khách trong vài giờ đầu (giờ hết hạn của 5 người sẽ sát nhau hơn).
2. ~~Canva ban đêm~~ — đã bỏ Canva khỏi gói (phiên 15).
3. **CapCut 7 ngày**: Pro dùng thử tính từ lúc tạo tài khoản, slot tính từ lúc khách nhận → khách hụt trung bình khoảng 9 giờ Pro cuối.
   Nạp tài khoản sát giờ đông khách sẽ giảm hụt; hoặc cho đồng hồ trên trang khách dừng đúng lúc Pro hết.
4. **Chia sẻ tài khoản**: 5/6 lần bị chặn vì phải đang ở quán mới lấy được mã 2FA; 1 lần lọt (bạn của khách xin mã khi khách còn ngồi ở quán).
5. **SIM thứ 2 + chế độ ẩn danh** vẫn nhận thêm được lượt: đây là giới hạn của mọi hệ thống dùng số điện thoại. Họ vẫn phải ở quán, vẫn tính vào suất của quán.
6. SMS OTP khoảng 70 tin/ngày (≈ 56.000đ/ngày nếu 800đ/tin).
7. **Thẻ NFC riêng** (phiên 11, 1 trong 3 quán mô phỏng dùng 8 thẻ, 2 chip không bật bộ đếm): link thẻ gửi về nhà, link cắt bỏ bộ đếm,
   link cũ đều bị chặn; khách thật không bị bảo "chạm lại" nhầm lần nào. Chip **không** bật bộ đếm thì ai có link là mở được
   (giống chụp QR về nhà) → nên bật bộ đếm cho mọi chip.



1. **Máy chủ + tên miền có HTTPS** (Node ≥ 22.13 + Caddy). Cách cài: `README.md` mục "Đưa lên VPS".
2. **Kênh OTP: SMS qua eSMS.vn.**
   - Đăng ký tài khoản ở esms.vn và nạp tiền. Lấy ApiKey và SecretKey.
   - Đăng ký **mẫu tin OTP** với eSMS. Mẫu mặc định: `{code} la ma xac nhan cua ban tai Tiem Ban Quyen. Ma co hieu luc trong 5 phut.`
   - Chọn loại tin: brandname CSKH (`ESMS_SMS_TYPE=2`, cần brandname) hoặc đầu số cố định giá rẻ (`ESMS_SMS_TYPE=8`, không cần brandname). Hỏi eSMS loại nào gửi được tới cả Viettel, Vina, Mobi.
   - Điền vào `.env`, đặt `ESMS_SANDBOX=1`, chạy `npm run otp-test -- 09xxxxxxxx`. Thấy "Đã gửi" là thông số đúng (chế độ Sandbox không gửi tin thật). Đổi về `ESMS_SANDBOX=0`, chạy lại để nhận 1 tin thật trên máy bạn.
3. Chạy:
   ```
   npm run seed
   npm run pilot
   ```
   `pilot` cài 4 công cụ, tắt công cụ ngoài gói. Kho cũ thiếu mật khẩu hoặc thiếu 2FA sẽ được liệt kê; những tài khoản đó **không được giao**.

## 2. Chuẩn bị tài khoản

- **ChatGPT:** mỗi tài khoản tạo sẵn 5 Project tên `Slot 1` … `Slot 5`. Bật 2FA bằng app Authenticator và lưu lại **khoá 2FA** (chuỗi chữ hiện khi quét QR, hoặc link `otpauth://`).
- **Adobe:** mỗi tài khoản tạo 2 thư mục `Slot 1`, `Slot 2`. Muốn khách tự lấy được mã email khi Adobe hỏi thì email tài khoản phải chuyển thư về TBQ (Cloudflare Email Routing → `extras/cloudflare-email-worker.js`).
- **CapCut:** tài khoản mới có Pro dùng thử 7 ngày, có thể tạo bằng CapCut Tooler.
- **Gemini:** mỗi ngày khoảng 5 link tham gia hoặc mã.

## 3. Nhập kho (Quản trị → Kho tài khoản)

Mỗi dòng 1 tài khoản, các ô cách nhau bằng `|`. Mật khẩu có dấu phẩy vẫn được.

```
ChatGPT:  gpt01@mail.com|MatKhau,1|JBSW Y3DP EHPK 3PXP
CapCut:   cc01@mail.com|MatKhau#1
Adobe:    ad01@mail.com|MatKhau#1
Gemini:   https://one.google.com/join/XXXX        (mỗi dòng 1 link hoặc 1 mã)
```

Số cuối dòng (nếu có) là số khách dùng chung. Bỏ trống thì theo cài đặt của công cụ. Dòng sai thì bị bỏ qua và báo lý do.

## 4. Mỗi ngày

- Nạp CapCut mới (10 tài khoản) và link Gemini mới. Trang **Công cụ** hiện "Hôm nay x/y" và số còn giao được.
- Trang **Việc tay**: ChatGPT/Adobe có việc "Đổi mật khẩu + đăng xuất" khi người cuối cùng của tài khoản hết hạn. Làm xong bấm "Đã xong" thì tài khoản giao lại được. Đổi khoá 2FA thì dán khoá mới vào trang tài khoản.
- Không có ca nào phải duyệt tay: ca vàng tự từ chối, lấy thêm mã tự cho qua khi khách đang ở quán và đúng máy.

## 5. Ngày chạy thử đầu tiên

1. Quán có QS: Tài đã bấm "Mở" sự kiện cho quán ở `/gov` của QS; bạn đã thêm quán trong `/admin` → Quán với đúng mã quán QS.
   Quán chưa có QS: thêm quán (để trống mã QS), tạo thẻ, ghi chip, chạm thử từng chip (`README.md` mục "Thẻ NFC riêng của Tiệm").
   Quán không phải làm gì.
2. Bạn ngồi ở quán, chạm thẻ / quét QR trên bàn → trang quán → **Nhận công cụ làm việc miễn phí**, thử mỗi công cụ (4G hay Wi-Fi đều được).
   Thử thêm: mở link trang quán thường (không qua thẻ) → phải thấy "Nhận tại quán nhé"; gửi link có vé cho máy khác → máy đó bị từ chối.
   Thẻ riêng: chạm thẻ → nhận được; chép link trên thanh địa chỉ gửi máy khác → máy đó thấy "Chạm lại thẻ trên bàn nhé".
3. Mở `/admin/live` (Theo dõi) trên điện thoại của bạn để thấy cảnh báo và việc tay.
4. Cuối ngày xem **Thống kê quán** và **Nhật ký**. Trang quán trong quản trị có dòng "Link bị từ chối" — nhiều "vé sai" là khoá vé hai bên không khớp.

Trước khi đưa lên máy chủ, chạy `npm test` và `npm run e2e` (khoảng 30 giây) để chắc mọi thứ vẫn đúng.
