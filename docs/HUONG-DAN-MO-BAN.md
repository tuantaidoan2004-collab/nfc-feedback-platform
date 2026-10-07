# Hướng dẫn mở bán — Công cụ làm việc miễn phí (TBQ) bản 1.0.4

Khách ngồi quán → chạm thẻ / quét QR → nhận 1 công cụ bản quyền → dùng xong muốn mua thì nhắn Zalo Tiệm.
Địa chỉ: **https://thu.tiembanquyen.com/colap**

## Bản này đã được kiểm thế nào

| Bài kiểm | Kết quả |
|---|---|
| Kiểm từng phần (`npm test`) | 89/89 |
| Chạy như khách thật từ đầu tới cuối (`npm run e2e`, cả ở gốc và `/colap`) | 134/134 |
| Mô phỏng 9 ngày, ~590 khách, 3 quán (`npm run sim`) | 0 vi phạm |
| Diễn tập vận hành sâu: bản production, eSMS / hộp thư / hãng / bot Canva giả, tua giờ qua 6h sáng và 7 ngày (`npm run van-hanh-sau`) | 105/105 |
| Chạy tay trên trình duyệt (iPhone): ChatGPT (lúc đó mật khẩu + 2FA; từ 07/10 đổi sang mã qua email), Claude (mã về hộp thư Tiệm), Canva (bot mời, trang tự cập nhật) | đạt, 0 vi phạm |

"Vi phạm" = lộ khoá 2FA, mật khẩu hiện cho máy không giữ slot, ai đó vào được hãng mà không giữ slot, còn trong nhóm Canva khi đã hết slot, lỗi máy chủ.

## Gói công cụ

| Công cụ | Khách / tài khoản | Dùng tới | Hết lượt thì |
|---|---|---|---|
| ChatGPT Plus | 8 | 6h sáng hôm sau | 6h: chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) |
| Claude Pro | 3 | 6h sáng hôm sau | như ChatGPT; tài khoản quá 7 ngày tự không giao; luôn giữ 1 tài khoản dự phòng |
| CapCut Pro | 2 | 7 ngày | bỏ tài khoản |
| Adobe | 2 | 7 ngày | bỏ tài khoản |
| Canva Pro | theo ghế nhóm | 7 ngày (tính từ lúc bot mời xong) | bot gỡ khỏi nhóm |
| Gemini | 1 link | 24 giờ | — |

### Kho chuẩn mỗi ngày (anh/chị chọn 06/10)

| Công cụ | Tài khoản | Khách / ngày |
|---|---|---|
| ChatGPT Plus | 3 (× 8 khách) | 24 |
| Claude Pro | 3 (× 3 khách) | 6 trong ngày + 3 suất sáng sớm (1 tài khoản dự phòng) |

Tài khoản ChatGPT / Claude dùng lại mỗi ngày (6h đăng xuất mọi thiết bị, giữ mật khẩu). **Claude tự hết sau 7 ngày → mỗi tuần thay đủ 3 tài khoản**;
ô kho trên trang Theo dõi báo trước 24 giờ ("1 tài khoản hết hạn trong 24 giờ"). `npm run kiem-tra` báo khi kho ít hơn kho chuẩn.

## Việc anh/chị phải làm trước khi mở bán

Đánh dấu từng dòng khi xong.

- [ ] **Máy chủ:** thuê VPS Ubuntu (1 CPU / 1 GB RAM là đủ). Ở NS1 tạo bản ghi `A` tên `thu` trỏ về IP máy chủ.
      Lúc thuê, dán khoá công khai `~/.ssh/tbq_vps.pub` (đã tạo sẵn trên máy Mac) vào ô "SSH key". Gửi Claude IP máy chủ
      (không gửi mật khẩu qua chat) — Claude cài bằng 1 lệnh ở mục "Cài trên máy chủ" bên dưới.
- [ ] **eSMS.vn:** mở tài khoản, đăng ký brandname (hoặc đầu số cố định) + mẫu tin OTP, nạp tiền. Lấy ApiKey / SecretKey.
- [ ] **Hộp thư của Tiệm trên Cloudflare** (mã đăng nhập Claude và mã Adobe đi đường này): tên miền email đặt ở Cloudflare,
      Email Routing → "Catch-all" → gửi tới Worker `extras/cloudflare-email-worker.js` (README mục "Dịch vụ mail → webhook").
- [ ] **Kho thật:**
  - ChatGPT (đổi 07/10): 3 tài khoản, **mỗi dòng chỉ email** thuộc hộp thư của Tiệm (`@tiembanquyen.site`), không 2FA — khách đăng nhập
    bằng mã ChatGPT gửi về email, TBQ hiện mã. Tạo sẵn 8 Project tên "Slot 1" … "Slot 8", rồi **bỏ tick "chờ tạo Project"** khi nhập.
  - ChatGPT + Claude: **mỗi địa chỉ kho cần 1 quy tắc riêng** Cloudflare Email Routing "địa chỉ → Worker tbq-mail"
    (catch-all của tiembanquyen.site đang về hộp thư ma. của CapCut Tool). `npm run kiem-tra -- --mang` báo địa chỉ nào thiếu.
  - Claude: email thuộc hộp thư của Tiệm. Tạo sẵn Project "Slot 1" … "Slot 3". Nhập kho ngay ngày tạo (quá 7 ngày là bỏ).
    3 tài khoản: hệ thống giữ 1 cái làm dự phòng (không giao trong ngày).
  - CapCut, Adobe: email | mật khẩu (email tên miền nào cũng được, không nút Lấy mã — hãng hỏi mã thì khách Báo Tiệm), nhập ngay ngày tạo. Adobe tạo sẵn thư mục "Slot 1", "Slot 2".
  - Gemini: mỗi dòng 1 link.
  - Canva: email chủ nhóm | số ghế — **nhóm Canva thương mại, không dùng nhóm Canva Giáo dục** (trái điều khoản).
- [ ] **Bot Canva trên máy Mac:** đăng nhập lại Canva thương mại (`npm run canva-bot -- --login`), kiểm menu (`--xem-menu <email>`),
      rồi chạy thật với `TBQ_URL` + `WORKER_TOKEN` của máy chủ. Mac tắt quá 10 phút thì trang Theo dõi báo đỏ, khách Canva phải chờ.
- [ ] **Quán có QS:** gửi Tài khoá vé (`QS_TICKET_KEY`) qua kênh riêng + bản vá khúc B (`docs/qs-patch/`, `docs/phoi-hop-voi-QS.md`).
      Tài mở sự kiện cho từng quán ở `/gov`.
- [ ] **Quán chưa có QS:** mua chip NTAG213, ghi link thẻ (README mục "Thẻ NFC riêng của Tiệm"), chạm thử từng chip.

## Cài trên máy chủ (Claude hoặc người kỹ thuật làm — 1 lệnh)

Trên máy Mac của Tiệm (thư mục `tbq-trial`), khi đã có IP máy chủ:

```
bash deploy/day-len.sh root@<IP máy chủ>
```

Lệnh này đăng nhập bằng khoá `~/.ssh/tbq_vps` (dán `~/.ssh/tbq_vps.pub` vào ô "SSH key" lúc thuê máy chủ), chép gói mới nhất trong
`ban-phat-hanh/` lên, rồi chạy `deploy/cai-may-chu.sh` trên máy chủ: cài Node 22 + Caddy, người dùng `tbq`, giải nén vào `/opt/tbq-trial`,
tạo `.env` với khoá bí mật tự sinh (lần đầu), database + gói công cụ (lần đầu), HTTPS qua Caddy, chạy nền, sao lưu 05:30,
tường lửa chỉ mở SSH / 80 / 443, cuối cùng chạy `kiem-tra --mang`.

- **Lần đầu:** mật khẩu quản trị và các khoá in ra màn hình, đồng thời cất ở `/root/tbq-lan-dau.txt` (chỉ root đọc).
  **Sao chép `DATA_KEY` cất chỗ khác** — mất là mất mọi mật khẩu trong kho.
- **Nâng cấp bản mới:** chạy lại đúng lệnh trên. `.env` và `data/` giữ nguyên, chỉ thay mã nguồn.
- Máy chủ dùng chung với QS: lệnh tự **ghép** `/etc/caddy/tbq.caddy` vào Caddyfile đang có, không chép đè.
- Sau đó điền `ESMS_*` vào `/opt/tbq-trial/.env` → `sudo systemctl restart tbq`. Log: `journalctl -u tbq -f`.

## Ngày đầu mở bán

1. `npm run kiem-tra -- --mang` → "Sẵn sàng mở bán". Mục ✘ nào cũng phải sửa trước.
2. Trang quản trị → Quán → thêm quán. Kho tài khoản → dán kho.
3. Tự ra quán, dùng điện thoại của mình: chạm thẻ → nhận 1 công cụ → đăng nhập được ở hãng. Xem trang **Theo dõi** không có báo đỏ.
4. Mở trang **Theo dõi** (`/colap/admin/live`) trên điện thoại, bật âm báo.

## Hằng ngày

- **6h sáng:** khách ChatGPT / Claude hết lượt. Trang Việc tay có "Đăng xuất mọi thiết bị" cho từng tài khoản →
  vào hãng bấm đăng xuất mọi thiết bị (giữ mật khẩu) → tick "Giữ mật khẩu cũ" → **Đã xong**. Chưa xong thì tài khoản đó chưa giao lại được.
- Nạp CapCut mới (tài khoản quá 7 ngày tự không giao). Nhìn ô "Kho hôm nay" trên Theo dõi: đỏ = hết, phải nạp.
- Mac chạy bot Canva luôn bật.
- Báo đỏ thường gặp và cách xử lý: README mục "Vận hành hằng ngày".
- Sao lưu tự chạy 05:30, giữ 30 ngày ở `data/backup`. Nên chép bản sao ra ngoài máy chủ mỗi tuần.

## Rủi ro anh/chị cần biết

- **Điều khoản các hãng:** chia sẻ 1 tài khoản cho nhiều người lạ trái điều khoản của OpenAI, Anthropic, Adobe, CapCut. Tài khoản có thể bị khoá
  bất cứ lúc nào — hệ thống chỉ giảm thiệt hại (cách ly, thu hồi, khách nhận lại ngay), không ngăn được hãng khoá.
- **Canva Giáo dục** dùng cho thương mại là trái điều khoản — chỉ dùng nhóm thương mại.
- **Dữ liệu cá nhân (Luật BVDLCN):** trang `/colap/privacy` là chính sách cho khách; khách đồng ý trước khi lưu SĐT. Không nhắn quảng cáo
  cho khách trừ khi khách nhắn trước.
- **Google:** không bao giờ đổi công cụ lấy đánh giá Google.

## Buổi sáng của ChatGPT / Claude (anh/chị chọn 06/10)

- **Nghỉ nhận 5h–6h sáng.** Lượt nào cũng hết lúc 6h, nên từ 5h trang chọn công cụ hiện ChatGPT / Claude mờ, ghi "Mở lại lúc 6h"
  (khách không nhận rồi chỉ dùng được vài phút mà vẫn mất lượt). Đổi số phút ở Cài đặt › `endHourCloseMin` (0 = không nghỉ).
- **Claude giữ 1 tài khoản dự phòng.** Trong ngày tài khoản này không giao. 6h, các tài khoản có người dùng hôm qua chờ anh/chị
  "Đăng xuất mọi thiết bị" → tài khoản dự phòng mở ra, khách tới sớm vẫn nhận được Claude. Anh/chị làm xong việc tay thì 1 tài khoản rảnh
  tự thành dự phòng cho sáng hôm sau. Trang Công cụ / Theo dõi ghi "+3 dự phòng". ChatGPT muốn giống vậy: Công cụ › ChatGPT › tick
  "Giữ 1 tài khoản dự phòng".

- **ChatGPT không có dự phòng** (anh/chị chọn 3 tài khoản × 8). Ngày nào quá 16 khách ChatGPT thì cả 3 tài khoản đều có người → từ 6h tới lúc
  anh/chị bấm xong "Đăng xuất mọi thiết bị", ChatGPT hiện "Tạm hết". Làm việc tay ngay 6h là đủ (mỗi tài khoản khoảng 1 phút).
