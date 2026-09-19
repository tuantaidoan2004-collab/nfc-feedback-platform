# Mở production — 2026-09-19

Tài chốt: Production chạy ở **`https://quitesensational-review-bio.vercel.app`** (tên miền miễn phí của Vercel, đã gắn vào Production); `.com` mua ở Cloudflare sau. Production dùng **branch Neon production** (đã migrate 001–017) và deploy từ **`main`**.

Trước lát này production **đóng**: không có `NFC_ENV`, và `main` còn là mã cũ (`df0a485`). `main` là tổ tiên của `feat/local-app-foundation`, nên gộp là **fast-forward**, không có xung đột.

## Thứ tự

1. **Tài: biến môi trường Production trên Vercel** (mục dưới). Phải xong **trước** khi deploy: Vercel chụp biến lúc tạo deployment.
2. **Tài: thêm tên miền production vào CORS của bucket R2** (Cloudflare → R2 → `nfc-media` → Settings → CORS policy): `AllowedOrigins` thêm `https://quitesensational-review-bio.vercel.app`, giữ origin preview.
3. **Tài: tạo admin `tai` trên database production** (lệnh dưới).
4. **Agent: push `feat/local-app-foundation` lên `main`** (fast-forward) → Vercel deploy production. Agent kiểm bằng request không đăng nhập: `/gov/login` 200, `/owner/login?next=…` 200, `/api/owner/v2/x` 401.
5. **Tài: vào `/gov` trên production**, tạo shop khuôn, rồi tạo shop thật. Tài khoản test `yourshop / 1` **không** tạo được trên production (`TEST_ACCOUNT_FORBIDDEN`), đúng thiết kế.
6. Ghi thẻ NFC cho khách bằng link `https://quitesensational-review-bio.vercel.app/t/<mã>`.

## Biến Production

Giá trị không bí mật (dán cả khối vào ô Key của "Add Environment Variable", loại **Config**, chỉ chọn **Production**):

```
NFC_ENV=production
NFC_BUILD_TARGET=vercel
SERVER_DATA_ENABLED=true
NFC_VISITS_V2_ENABLED=true
NFC_OWNER_V2_ENABLED=true
NFC_PUBLISHING_ENABLED=true
NFC_ADMIN_ENABLED=true
APP_ORIGIN=https://quitesensational-review-bio.vercel.app
R2_BUCKET=nfc-media
```

Chép từ biến Preview (loại Config nên xem được): `R2_ACCOUNT_ID`, `MEDIA_PUBLIC_ORIGIN`.

Bí mật (loại **Secret/Sensitive**, chỉ Production):
- `NFC_RENDER_SIGNING_KEY`: khoá **mới**, khác preview, sinh và thêm thẳng bằng CLI để không hiện ra màn hình.
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: biến preview là Secret nên không đọc lại được. Nếu còn giữ khoá cũ thì dùng lại; không thì tạo token R2 mới (Cloudflare → R2 → Manage API tokens → Create: Object Read & Write, chỉ bucket `nfc-media`).

`DATABASE_URL`, `DATABASE_URL_UNPOOLED` do tích hợp Neon đặt sẵn cho Production. `NFC_SUPPORT_CONTACT` đã có cho Production.

## Admin trên database production

`scripts/bootstrap-admin.mjs` hỏi mật khẩu (ít nhất 16 ký tự, không hiện ra màn hình) và từ lát F6 nhận `--handle` và `--title`, vì migration 014 chỉ gắn huy hiệu cho admin `tai` **đã có** lúc chạy migration. Gõ mật khẩu bằng **bàn phím tiếng Anh** (bẫy bộ gõ tiếng Việt trong `operations-gotchas.md`). Nếu báo `duplicate key` thì admin đã có: chạy lại với `--reset` (đặt mật khẩu mới và gắn huy hiệu).

## Khi có `.com`

Gắn `.com` vào Vercel bằng DNS Cloudflare, đổi `APP_ORIGIN`, deploy lại, cho `quitesensational-review-bio.vercel.app` chuyển hướng 308 sang `.com`. Thẻ đã ghi vẫn chạy qua chuyển hướng; mọi người đăng nhập lại một lần. Có `.com` trên Cloudflare mới gắn được `media.<tên-miền>` cho R2 thay `r2.dev`.

## Đã làm (19/09)

- Tài đặt đủ 17 biến Production (kiểm bằng `vercel env ls production`). Lần kiểm đầu agent lọc sai cột bằng `awk` và tưởng thiếu biến; đọc bảng nguyên văn thì đủ.
- Tài tạo admin `tai` trên database production bằng `bootstrap-admin.mjs --handle=Quitesensational --title="Admin Tài"`. Script in cảnh báo SSL của `pg` vì chưa đổi `sslmode` như `migrate.mjs`; đã sửa trong script.

