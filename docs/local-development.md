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

**Dựng trang khi quán chọn mẫu và để lại Zalo (Tài 06/10):** Tài nhắn quán qua Zalo, lấy thông tin quán (link, @tên, giờ mở
cửa, wifi, Place ID nếu quán chưa làm bước Dashboard), ảnh/video và điều quán muốn sửa, rồi đưa agent. Agent:

```bash
node scripts/sua-trang.mjs ds
node scripts/sua-trang.mjs lay <mã trang>
node scripts/sua-trang.mjs kiem <mã trang>
node scripts/sua-trang.mjs dang <mã trang>
```

`ds` liệt kê trang chờ dựng (mẫu, số Zalo, ghi chú) · `lay <mã> [mẫu]` ghi `rieng/sua/<mã>.json` — `ten`, `placeId`, `thongTin`
(thông tin quán, `lib/shop/profile.ts`), `config` (trang) — và in danh sách **chỗ của quán** ✓/— cùng mọi chữ, nút, ảnh còn lại;
khách thấy trạng thái chuyển "Admin đang chỉnh" · agent điền `thongTin` (link viết tắt được: `"zalo": "0912345678"`,
`"instagram": "@ten"`, `"website": "ten.vn"`), sửa `config` nếu quán muốn khác, chép file vào `rieng/sua/files/` và ghi đường dẫn vào
`src` (vd `"files/anh-bia.jpg"`) · `kiem` chạy mọi bước kiểm mà không ghi · `dang` thu nhỏ ảnh (`sips`, HEIC/JPG/PNG, tối đa
1600 px), đổi video sang MP4 720p (`avconvert`), tải lên kho (duyệt sẵn), lưu thông tin quán (từ chối nếu làm hỏng một trang đang
chạy của quán), phát hành, đóng yêu cầu. Thông tin quán gắn vào trang lúc trang hiện ra: đổi số Zalo về sau chỉ cần `lay` + `dang`
lại (hoặc sửa `thongTin` của bất kỳ trang nào của quán), mọi trang của quán đúng ngay.
`chep <mã trang> <mã quán>` (Tài 07/10: các mẫu đã dựng thành tài sản của một quán): lấy trang dựng ở máy này (database và kho
local), đóng băng chữ và link của quán nó được dựng cho (bỏ mọi `slot`, nhóm `links` giữ nút bằng `own`), tải ảnh/font/âm thanh sang
kho của nơi đích, tạo trang mới ở quán đích và phát hành; `--thu` chỉ kiểm. Nút Google vẫn là của quán đích.
Mặc định là database và kho ảnh local; production dùng `--env <tệp>` (DATABASE_URL và các biến R2 do Tài tự ghi, ngày Tài cần).

**Bảy bộ test** vẫn là cách biết mọi thứ còn đúng, chạy trước khi đẩy `main`: lệnh ở `docs/operations-gotchas.md`.

## Chạy như production trên một máy

`docs/tu-chay.md`: Docker Compose gồm app, PostgreSQL và SeaweedFS; đã chạy thật 27/09. Hợp làm máy thử; làm máy chủ thật thì
cần một máy luôn bật (`docs/audit-ui-ux-20260927.md` mục 1).
