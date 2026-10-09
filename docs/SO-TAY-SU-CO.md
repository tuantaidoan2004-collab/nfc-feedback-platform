# Sổ tay sự cố — máy chủ TBQ (VPS)

Đọc lúc có chuyện. Mỗi mục: **dấu hiệu → kiểm → sửa**. Vào máy chủ: `ssh -i ~/.ssh/tbq_vps root@<IP máy chủ>` (IP ghi trong `chuyen-vps/*.sh` trên Mac).
App ở `/opt/tbq-trial` (người dùng `tbq`), dịch vụ: `tbq` (app, cổng 127.0.0.1:3700), `tbq-tunnel` (Cloudflare Tunnel),
`tbq-backup.timer` (sao lưu 05:30). Nhật ký: `journalctl -u tbq -n 100`.

Báo động tới bằng thư:
- **"[TBQ] Cần xử lý: …"**: app tự gửi (sự kiện đỏ, mục trang Máy chủ chuyển đỏ). Tối đa 1 thư / 15 phút.
- **"[TBQ] TRANG KHÁCH KHÔNG VÀO ĐƯỢC"**: bộ canh bên ngoài (Worker `tbq-canh-ngoai`) gửi khi `/colap/healthz` hỏng 3 lần liền.

## 1. Trang khách không vào được

1. `systemctl is-active tbq tbq-tunnel` →
   - `tbq` không active: `journalctl -u tbq -n 50` xem lỗi. Hay gặp nhất là lỗi cấu hình sau khi sửa `.env` (máy chủ in "Cấu hình chưa đúng").
     Sửa `.env` rồi `systemctl restart tbq`.
   - `tbq-tunnel` không active: `systemctl restart tbq-tunnel`; vẫn hỏng thì xem Cloudflare → Zero Trust → Networks → Tunnels.
2. Cả hai active mà khách vẫn không vào được: `curl -s 127.0.0.1:3700/colap/healthz` trên máy chủ.
   Ra `ok` → lỗi ở Cloudflare (DNS / tunnel), không phải app.
3. VPS không ssh được: vào trang quản lý VPS (thuevpsgiare.com) → khởi động lại. Quá 15 phút chưa được → **chạy tạm trên Mac**:
   `zsh ~/Downloads/"Cọ Láp"/chuyen-vps/quay-lai-mac.sh` (lấy database mới nhất từ VPS nếu còn vào được; không thì dùng bản Mac kéo về lúc 05:45).

## 2. Khôi phục database

Dừng app trước: `systemctl stop tbq`. Giữ lại bản hỏng: `cp data/tbq.sqlite data/hong-$(date +%s).sqlite`.

- **Từ bản trên máy chủ** (`data/backup/tbq-<ngày>.sqlite`, giữ 30 ngày):
  `cp data/backup/tbq-<ngày>.sqlite data/tbq.sqlite && rm -f data/tbq.sqlite-wal data/tbq.sqlite-shm && chown tbq:tbq data/tbq.sqlite`
- **Từ bản ngoài máy chủ** (VPS mất hẳn; cần `.env` có DATA_KEY + OFFSITE_URL + OFFSITE_TOKEN — bản cất trên Mac / trình quản lý mật khẩu):
  `npm run lay-sao-luu-ngoai` (liệt kê) → `npm run lay-sao-luu-ngoai -- tbq-<ngày>.sqlite data/tbq.sqlite`. Script tự kiểm toàn vẹn + đếm khách / slot.
- **Từ bản trên Mac**: `~/tbq-sao-luu-vps/tbq-<ngày>.sqlite` (Mac kéo về 05:45 mỗi ngày).

Rồi `systemctl start tbq` → Quản trị › Máy chủ: mục Database "nguyên vẹn". Mất các lượt nhận từ lúc sao lưu tới lúc hỏng:
xem trang Slot, nhắn Zalo khách bị ảnh hưởng.
**DATA_KEY phải đúng khoá cũ**: sai khoá thì mọi mật khẩu kho không giải mã được (khách thấy trống). Lệnh kiểm: `npm run kiem-tra`.

## 3. Lộ khoá / mật khẩu

| Lộ cái gì | Làm ngay |
|---|---|
| ADMIN_PASSWORD | Đổi trong `.env` (≥ 12 ký tự) → `systemctl restart tbq` (mọi phiên quản trị cũ vẫn sống tới 12 giờ — xoá hết: `runuser -u tbq -- node -e "new (require('node:sqlite').DatabaseSync)('data/tbq.sqlite').exec('DELETE FROM admin_sessions')"`). Bật 2FA: `npm run bat-2fa-quan-tri`. |
| Mất điện thoại có 2FA | Thêm lại từ khoá đã cất; không còn khoá: `npm run bat-2fa-quan-tri -- --tat` → restart → bật lại với điện thoại mới. |
| WORKER_TOKEN (bot Canva) | Tạo mới `openssl rand -base64 32` → `.env` máy chủ + `~/tbq-chay/.env` trên Mac (bot) → restart cả hai. |
| QS_TICKET_KEY | Đổi cùng lúc với Tài (bên QS: NFC_EVENT_TBQ_KEY), nếu không thì khách ở quán QS không vào được. |
| CF_EMAIL_TOKEN | Cloudflare → My Profile → API Tokens: thu hồi, tạo token gửi thư mới → `.env` → restart → `npm run otp-test -- <email>`. Đổi luôn bí mật EMAIL_TOKEN của Worker `tbq-canh-ngoai`. |
| DATA_KEY | Nghiêm trọng: ai có DATA_KEY + bản sao lưu là đọc được mật khẩu kho. Đổi mật khẩu mọi tài khoản trong kho bên hãng, rồi nhập lại kho. (App chưa có lệnh đổi DATA_KEY.) |
| Khoá ssh `~/.ssh/tbq_vps` | Tạo khoá mới, thêm vào `/root/.ssh/authorized_keys`, xoá dòng khoá cũ. |

## 4. Ổ đĩa / RAM

- Ổ đĩa ≥ 90% (trang Máy chủ đỏ): `du -sh /opt/tbq-trial/data/* /var/log/journal`; bớt sao lưu cũ (`find data/backup -name 'tbq-*.sqlite' -mtime +14 -delete`),
  `journalctl --vacuum-size=200M`, `apt-get clean`.
- RAM còn < 5%: `systemctl restart tbq`; lặp lại thì xem `journalctl -u tbq` có vòng lặp lỗi không, cân nhắc nâng gói VPS.

## 5. Nâng cấp hỏng → quay lại bản trước

Mỗi lần chạy `nang-cap-<bản>.sh` đều in lệnh quay lại ở dòng cuối (bản cũ ở `/opt/tbq-sao-luu-<giờ>`). Lệnh chung:
`rsync -a --delete --exclude .env --exclude data/ /opt/tbq-sao-luu-<giờ>/ /opt/tbq-trial/ && systemctl restart tbq`.
Database giữ nguyên (nâng cấp không đổi database — chỉ thêm cột khi cần, bản cũ vẫn chạy được).

## 6. Bot Canva (máy Mac) im lặng

Trang Máy chủ: "Bot Canva" đỏ. Mac đang ngủ / tắt / mất mạng, hoặc cửa sổ Chrome của bot bị đóng. Mở Mac, cắm sạc,
`launchctl kickstart -k gui/$(id -u)/vn.tiembanquyen.canva-bot`. Trong lúc chờ: Quản trị › Canva → mời / gỡ tay.

## 7. Hết hạn mức gửi thư (200 thư / ngày)

Trang Máy chủ: "Hạn mức gửi thư hôm nay" vàng / đỏ. Khách sẽ không nhận được mã đăng nhập tới khi hạn mức làm mới.
Tạm giảm suất / ngày của quán (Quản trị › Quán); xin nâng hạn mức Email Sending trên Cloudflare.
