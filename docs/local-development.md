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

Bật PostgreSQL riêng của máy (`~/.nfc-local/pg`, cổng **55460**, tách khỏi cluster test 55439), chạy mọi migration, gieo dữ
liệu mẫu **một lần** (quán `quan-mau` có trang đã phát hành, chủ quán, admin, ba lượt góp ý), rồi mở app ở
`http://127.0.0.1:3321` với mọi cờ bật. Đăng nhập in ra khi khởi động; mã 6 số của `/gov`: `node scripts/local.mjs code`.
`--reset` làm lại database từ đầu; `--no-app` chỉ dựng database. Mật khẩu trong `scripts/local.mjs` chỉ dùng cho máy này.

Chưa có: tải ảnh lên (cần kho S3 — `docs/tu-chay.md` có SeaweedFS), đăng nhập Google.

**Bảy bộ test** vẫn là cách biết mọi thứ còn đúng, chạy trước khi đẩy `main`: lệnh ở `docs/operations-gotchas.md`.

## Chạy như production trên một máy

`docs/tu-chay.md`: Docker Compose gồm app, PostgreSQL và SeaweedFS; đã chạy thật 27/09. Hợp làm máy thử; làm máy chủ thật thì
cần một máy luôn bật (`docs/audit-ui-ux-20260927.md` mục 1).
