# Chạy trên máy

Viết lại 27/09 (lát S0). Bản cũ chỉ tới trang demo và dữ liệu trên trình duyệt — đã gỡ ở lát A3.

## Chuẩn bị

- **Node 24** (qua nvm) và thư viện đã cài: `pnpm install --frozen-lockfile`.
- **Không dùng `pnpm <script>`**: gọi thẳng `node node_modules/…` (xem `docs/operations-gotchas.md`).
- **PostgreSQL** cho các bộ test có database. Trên máy Tài: Postgres.app, binary ở
  `/Applications/Postgres.app/Contents/Versions/latest/bin` (không có trong `PATH`).

## Ba cách chạy, tuỳ việc

**1. Bảy bộ test** — cách chính để biết mọi thứ còn đúng. Lệnh đủ ở `docs/operations-gotchas.md` ("Có 7 bộ test").
Bốn bộ integration dựng sẵn app, database riêng và dữ liệu thử mỗi lần chạy (`integration-tests/run-local.mjs`).
Cluster test: cổng **55439**, `initdb … -E UTF8 --locale=en_US.UTF-8` — dựng cluster ở một đường dẫn ngắn (vd `/tmp/nfcpg`)
vì socket Unix không chịu đường dẫn dài.

**2. Xem giao diện có dữ liệu** (dashboard, `/gov`): viết một spec tạm trong `integration-tests/` dùng fixture sẵn có
(`repository-tests/owner-fixture.ts`), chạy bằng `node integration-tests/run-local.mjs --admin <tên spec>`, chụp ảnh, rồi
**xoá spec** — không commit. Tài khoản trong đó là tài khoản thử sinh ra cho lần chạy.

**3. Dev server trần** (`.claude/launch.json`, cổng 3321, `next dev --webpack`): đủ cho trang tĩnh và trang pháp lý.
Không có database thì trang khách, dashboard và `/gov` trả 404 — đúng thiết kế: route chỉ mở khi `NFC_ENV` và cờ tính năng
được khai (`.env.example`).

## Chạy như production trên một máy

`docs/tu-chay.md`: Docker Compose gồm app, PostgreSQL và SeaweedFS; đã chạy thật 27/09. Hợp làm máy thử; làm máy chủ thật thì
cần một máy luôn bật (`docs/audit-ui-ux-20260927.md` mục 1).
