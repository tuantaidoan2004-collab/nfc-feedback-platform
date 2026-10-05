# Chạy trên máy

Viết lại 27/09 (lát S0). Bản cũ chỉ tới trang demo và dữ liệu trên trình duyệt — đã gỡ ở lát A3.

## Chuẩn bị

- **Node 24** (qua nvm) và thư viện đã cài: `pnpm install --frozen-lockfile`.
- **Không dùng `pnpm <script>`**: gọi thẳng `node node_modules/…` (xem `docs/operations-gotchas.md`).
- **PostgreSQL** cho các bộ test có database. Trên máy Tài: Postgres.app, binary ở
  `/Applications/Postgres.app/Contents/Versions/latest/bin` (không có trong `PATH`).

## Một lệnh (05/10)

```bash
node scripts/local.mjs
```

Bật PostgreSQL riêng của máy (`~/.nfc-local/pg`, cổng **55460**, tách khỏi cluster test 55439), dựng database từ `db/schema.sql`
(làm lại từ đầu mỗi khi tệp đó đổi), tạo admin, chủ quán `chuquan` và **quán duy nhất là quán của tool Google Maps** (bên dưới;
Tài 05/10 bỏ quán mẫu và dữ liệu bịa), rồi mở app ở
`http://127.0.0.1:3321` với mọi cờ bật. Đăng nhập in ra khi khởi động; mã 6 số của `/gov`: `node scripts/local.mjs code`.
`--reset` làm lại database từ đầu; `--no-app` chỉ dựng database. Mật khẩu trong `scripts/local.mjs` chỉ dùng cho máy này.

Ảnh quán tải lên đi vào **kho ảnh local** `http://127.0.0.1:3322/nfc-media` (`scripts/local/store.ts`, tệp ở `~/.nfc-local/media`),
chạy cùng lệnh trên, kiểm chữ ký y như R2. Ảnh chờ duyệt ở `/gov` và chỉ duyệt được **6 phút sau khi tải lên** (link tải lên còn
hiệu lực tới lúc đó — rà bảo mật C3b-1). Với `--lan` không có kho ảnh: điện thoại không tới được 127.0.0.1. Harness owner/admin
dùng cùng kho trên cổng 3328.

**Đánh giá Google thật (05/10):** nếu máy có tool theo dõi đánh giá Google Maps của Tài (`~/MAps`, chạy bằng `./start.sh` ở
`http://127.0.0.1:8000`), `local.mjs` đọc khoá `api_key` trong `~/MAps/config.json` (chỉ đọc) và đưa cho máy chủ app; seed tạo
quán `quan-google-maps` (tên lấy từ tool, chủ là `chuquan`) và kéo đánh giá về. Tool không chạy thì quán đó được tạo ở lần
khởi động sau; không có `~/MAps` thì chủ quán chưa có quán và `/app` mở onboarding. Thư mục khác: `NFC_MAPS_DIR`. Production:
`production-launch.md` mục "Đánh giá Google từ tool Google Maps".

Chưa có: tải ảnh lên (cần kho S3 — `docs/tu-chay.md` có SeaweedFS), đăng nhập Google.

**Bảy bộ test** vẫn là cách biết mọi thứ còn đúng, chạy trước khi đẩy `main`: lệnh ở `docs/operations-gotchas.md`.

## Chạy như production trên một máy

`docs/tu-chay.md`: Docker Compose gồm app, PostgreSQL và SeaweedFS; đã chạy thật 27/09. Hợp làm máy thử; làm máy chủ thật thì
cần một máy luôn bật (`docs/audit-ui-ux-20260927.md` mục 1).
