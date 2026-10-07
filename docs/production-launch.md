# Production — đường vào và cách mở

Phần đầu tệp là **bản đồ dùng hằng ngày**: vào đâu, đăng nhập bằng gì, cái nào đã có cái nào chưa. Phần sau là hồ sơ lát mở production 19/09, giữ lại để tra khi cần. **Đổi trạng thái thì sửa bảng ở đây**, đừng để người sau phải ghép từ checklist cũ.

## Đường vào

Production: **`https://quitesensational-review-bio.com`** (đổi 21/09/2026; Cloudflare đăng ký tên miền, DNS trỏ Vercel bằng CNAME **DNS only**). `https://quitesensational-review-bio.vercel.app` **308 về đây** — link cũ vẫn chạy nhưng **đừng ghi nó vào thẻ**. Deploy từ **`main`**, database là **branch Neon production**, đã migrate **001–031** (032 của D4c chờ Tài chạy) (số mới nhất luôn ở khối "TIẾP TỤC TỪ ĐÂY" của `decisions.md`).

**Hàm chạy ở `sin1` (Singapore)**, cùng vùng với Neon. Trước 21/09 nó chạy ở `iad1` (Washington DC) nên mỗi truy vấn là một vòng Thái Bình Dương ~250ms; xem `decisions.md` mục 8. Kiểm bằng `curl -s -D - -o /dev/null <url> | grep x-vercel-id` → phải thấy `::sin1::`.

**Đừng bật proxy Cloudflare (đám mây cam)** cho các bản ghi DNS này: nó thay IP khách bằng IP Cloudflare và làm tầng chặn bot của lát A1 đếm mọi khách của mọi quán như một địa chỉ.

Preview: **`https://nfc-feedback-platform-git-feat-local-app-foundation-mount-pro.vercel.app`**, deploy từ nhánh `feat/local-app-foundation`, database là branch Neon preview (cùng số migration với production). Alias này chỉ di chuyển theo **deployment do Git kích hoạt**; `vercel deploy` từ CLI không di chuyển nó (bẫy ở `platform-admin.md`).

| Đường | Là gì | Đăng nhập bằng | Trạng thái trên production (21/09) |
|---|---|---|---|
| `/gov` | Quản trị nền tảng: tạo shop, cấp link đặt mật khẩu | admin **`tai`** + **mã 6 số** từ ứng dụng xác thực (đã đăng ký 21/09; 10 mã dự phòng Tài giữ) | **Dùng được** |
| `/ZZZ/<slug>` | Dashboard chủ shop | `@handle` của chủ shop | **Có**: shop template `urr6ud` (`@yourshop`) và các shop Tài tạo (xem `/gov`). `caphe-demo` (shop giả, nháp) bị xoá ở migration 028 |
| `/<slug>` | Trang khách | không cần | **Có**: `/urr6ud`. Cảnh báo "Nguy hiểm" của Chrome trên tên miền cũ **đã hết** sau khi chuyển `.com` |
| `/t/<mã>` | Link ghi vào thẻ NFC | không cần | **Chưa ghi thẻ nào.** Lô thẻ đầu **phải** mang `.com`; mã thẻ chứa cả tên miền và không sửa được sau khi ghi |
| `/` | Trang chính của nền tảng (D4a), được lập chỉ mục | không cần | Lên production cùng lần đẩy D4 lên `main`; trước đó là trang tĩnh ngắn |
| `/bat-dau` | Chủ quán dựng trang không cần tài khoản, quét QR xem trên điện thoại, 3 câu hỏi, "Lưu trang của tôi" (D4a–D4b) | không cần; lưu thì tạo tài khoản | Cùng lần đẩy D4 |
| `/thu/<mã>` | Bản xem thử của một trang đang dựng: link có chữ ký, sống 7 ngày, không ghi lượt ghé | không cần | Cùng lần đẩy D4 |
| `/owner/login` | Trang đăng nhập chủ shop | `@handle` hoặc email | Có `?next=` thì về đó; không có (từ trang chính, D4b) thì về dashboard của tài khoản, hoặc `/owner/cho-duyet` nếu trang còn chờ duyệt |
| `/api/health` | App và database có sống không: `200 ok` / `503 unavailable`, không nói gì thêm; hỏi database tối đa 5 giây một lần | không cần | Lần đẩy kế tiếp lên `main` (B3, 29/09) |
| `/owner/cho-duyet` | Tài khoản tự tạo mà trang chưa được duyệt | `@handle` vừa tạo | Cùng lần đẩy D4. Duyệt ở `/gov` → khung "Trang chờ duyệt" |

Gõ mật khẩu bằng **bàn phím tiếng Anh**: bộ gõ tiếng Việt đổi `r` thành dấu hỏi, `s` thành dấu sắc, nên mật khẩu đúng vẫn báo sai (bẫy ở `operations-gotchas.md`).

**Muốn biết database production có sống không:** mở **`/api/health`** — `200 {"status":"ok"}` là app và database đều trả lời, `503 {"status":"unavailable"}` là database không trả lời trong 3 giây (lát B3 phần đầu, 29/09; có trên production sau lần đẩy kế tiếp lên `main`). Đây là cách kiểm sau mỗi lần xoay credential, chạy migration hay chuyển máy, và là địa chỉ để một dịch vụ giám sát gọi. `/gov/login` và `/owner/login` trả 200 **không** chứng minh gì vì chúng không đọc database.

## Đổi khung trên production (05/10/2026)

Khung mới (đợt ①②) thay bản cũ. Database production làm lại từ `db/schema.sql`: dữ liệu cũ (shop template `urr6ud`, các shop
thử, admin và 2FA) **xoá khỏi database đang chạy**, nhưng còn nguyên trong một branch Neon chụp trước khi xoá. Thứ tự (database
trước, code sau: code mới không chạy trên lược đồ cũ):

1. **Đã làm 05/10:** branch Neon `truoc-doi-khung-0510` (`br-withered-meadow-aza784z2`, không compute) chụp branch `production`
   của project `purple-waterfall-11672045` trước khi xoá — dữ liệu cũ nằm đó.
2. **Tài, Terminal:** xoá lược đồ cũ, dựng lược đồ mới, tạo admin. Connection string *direct* lấy bằng Neon CLI (đã đăng nhập
   trên máy Tài, `npx neon@latest`), không in ra màn hình. Chế độ tự động của Claude Code chặn agent đọc/sửa database
   production, nên bước này Tài chạy. Lệnh ở mục dưới.
3. **Đã làm 05/10:** Tài chạy bước 2; agent đẩy `main` = `c220d79`, Vercel deploy production. Kiểm: `/`, `/bat-dau`, `/pricing`,
   `/templates`, `/gov/login`, `/owner/login` 200; `/api/health` `ok`; `/app` chưa đăng nhập 307 sang đăng nhập; API chủ quán 401.
4. **Tài:** vào `/gov`, đăng ký lại mã 6 số (database mới: quét QR mới, xoá mục cũ trong ứng dụng xác thực, giữ 10 mã dự
   phòng mới), tạo lại shop template và các quán.

```bash
cd ~/Desktop/QuiteSensational
export DATABASE_URL="$(npx -y neon@latest connection-string production --project-id purple-waterfall-11672045 --database-name neondb --role-name neondb_owner | tail -1)"
/Applications/Postgres.app/Contents/Versions/latest/bin/psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
node scripts/apply-schema.mjs
node scripts/bootstrap-admin.mjs tai --handle=Quitesensational --title="Admin Tài"
unset DATABASE_URL
```

`apply-schema.mjs` in `Database: built from db/schema.sql (<hash>)`. Biến Vercel không cần thêm biến mới; Google Business
chưa bật (`NFC_GOOGLE_BUSINESS_ENABLED` để trống) thì bước Google của quán ghi "Đang chờ Google cấp quyền API". Branch Neon
**preview** vẫn là lược đồ cũ: bản preview của nhánh chỉ chạy lại sau khi làm bước 2 trên branch đó.

## Đánh giá Google từ tool Google Maps (05/10)

**Mỗi quán tự dán link Google Maps của mình** ở tab Data (hoặc bước Google của onboarding); ô kiểm link ngay khi dán, lấy
đúng link ra khỏi chữ chia sẻ ("Tên quán\nhttps://maps.app.goo.gl/…"). Tool theo dõi đánh giá của Tài (`~/MAps`) chạy trên
máy Tài; production không gọi vào máy đó được, nên **tool là bên hỏi** (`lib/google/business.ts`):

- `GET https://quitesensational-review-bio.com/api/google-maps` mỗi 5 phút (`mapsJobs`), ký
  `X-Timestamp` + `X-Signature: sha256=HMAC-SHA256("GET /api/google-maps <timestamp>", key)`, lệch quá 5 phút là 401. Trả các
  quán cần đọc: link mới dán, chủ quán bấm "Cập nhật ngay", hoặc đã quá 20 giờ từ lần giao trước.
- `POST` cùng địa chỉ (`receiveMaps`) cho từng quán, ký `HMAC-SHA256(body, key)`: cả danh sách đánh giá còn trên Google.
  Bản cũ hơn bản quán đang có thì bỏ qua; quán đã nối API Google thật thì bỏ qua.

Biến Vercel (Production): chỉ **`NFC_MAPS_KEY`** = `api_key` trong `~/MAps/config.json` (Sensitive; Tài đã thêm 05/10).
`NFC_MAPS_SHOP` không còn dùng, xoá được. Không có `NFC_MAPS_KEY` thì địa chỉ trả 404.

Lược đồ: production từ `312c757a73cace9e` hoặc `607d263bd56bc02c` lên `6ac19fbf412a9a5d` (thêm `maps_url`, `requested_at`, `handed_at`;
`help_requests` thành `edit_requests` của "Nhờ admin sửa") bằng lệnh dưới. Đã chạy thử 05/10 trên database dựng từ cả hai lược đồ cũ:
`pg_dump -s` trùng bản dựng mới. (Lần đầu chỉ nhận `607d263b`, nhưng lệnh của mục cũ chưa từng chạy trên production: lệnh dừng
đúng như thiết kế, không đổi gì.) Kết nối `maps` kiểu cũ (một quán qua `NFC_MAPS_SHOP`, chưa có link) bị xoá; quán dán link lại.
Chạy **trước** khi đẩy code (code mới không chạy trên lược đồ cũ). **Đã chạy 05/10 tối** (Tài, ra `COMMIT`):

```bash
cd ~/Desktop/QuiteSensational
export DATABASE_URL="$(npx -y neon@latest connection-string production --project-id purple-waterfall-11672045 --database-name neondb --role-name neondb_owner | tail -1)"
/Applications/Postgres.app/Contents/Versions/latest/bin/psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
-- Từ 312c757a73cace9e (đổi khung 05/10) hoặc 607d263bd56bc02c (nguồn maps); lược đồ khác thì dừng, không đổi gì, và in nó ra.
DO $$ DECLARE h text := (SELECT hash FROM applied_schema ORDER BY applied_at DESC LIMIT 1); BEGIN
  IF h IS NULL OR h NOT IN ('312c757a73cace9e','607d263bd56bc02c') THEN RAISE EXCEPTION 'production đang ở lược đồ %', h; END IF; END $$;
-- Bản giả lập thành nguồn maps (bước của 312c757a; trên 607d263b không đổi gì).
DELETE FROM google_reviews WHERE shop_id IN (SELECT shop_id FROM google_business_connections WHERE mode NOT IN ('google','maps'));
DELETE FROM google_business_connections WHERE mode NOT IN ('google','maps');
ALTER TABLE google_business_connections DROP CONSTRAINT google_business_connections_mode_check,
  ADD CONSTRAINT google_business_connections_mode_check CHECK (mode = ANY (ARRAY['google'::text, 'maps'::text]));
-- Quán nối tool Google Maps theo cách cũ (một quán qua NFC_MAPS_SHOP) chưa có link: bỏ, chủ quán dán link lại ở tab Data.
DELETE FROM google_reviews WHERE shop_id IN (SELECT shop_id FROM google_business_connections WHERE mode = 'maps');
DELETE FROM google_business_connections WHERE mode = 'maps';
ALTER TABLE google_business_connections ADD COLUMN maps_url text, ADD COLUMN requested_at timestamp with time zone,
  ADD COLUMN handed_at timestamp with time zone,
  ADD CONSTRAINT google_business_connections_maps_url_check CHECK (maps_url IS NULL OR (maps_url ~ '^https://[^[:space:]]+$'::text AND char_length(maps_url) <= 2000)),
  ADD CONSTRAINT google_business_connections_maps_mode_check CHECK ((mode = 'maps'::text) = (maps_url IS NOT NULL));
-- "Nhờ admin tạo giúp" (help_requests) thành "Nhờ admin sửa" một trang (edit_requests); yêu cầu cũ không gắn trang nào.
DROP TABLE help_requests;
CREATE TABLE edit_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    page_id uuid NOT NULL,
    requested_by uuid NOT NULL REFERENCES owner_identities_v2(id),
    message text CHECK (message IS NULL OR (char_length(message) <= 2000 AND message !~ '[<>]'::text)),
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    handled_at timestamp with time zone,
    handled_by text CHECK (handled_by IS NULL OR handled_by ~ '^(admin:[0-9a-f-]{36}|agent)$'::text),
    FOREIGN KEY (shop_id, page_id) REFERENCES pages(shop_id, id) ON DELETE CASCADE,
    CHECK ((handled_at IS NULL) = (handled_by IS NULL))
);
CREATE UNIQUE INDEX edit_requests_one_open ON edit_requests (page_id) WHERE handled_at IS NULL;
INSERT INTO applied_schema(hash) VALUES ('6ac19fbf412a9a5d');
COMMIT;
SQL
unset DATABASE_URL
```

**Trạng thái, ghi chú, đã bị xoá (05/10 tối, Data và Dashboard lấy giao diện tool):** `google_reviews` thêm `first_seen_at`,
`removed_at`, `status`, `note`; lược đồ `6ac19fbf412a9a5d` lên `262a0c65daf33d7d`. Đánh giá đang có thành "Đã xem" (điểm bắt
đầu, như tool). Đã chạy thử trên database dựng từ `6ac19fbf`: `pg_dump -s` trùng bản dựng mới; chạy lần hai thì dừng. Chạy
**trước** khi đẩy code:

```bash
cd ~/Desktop/QuiteSensational && export DATABASE_URL="$(npx -y neon@latest connection-string production --project-id purple-waterfall-11672045 --database-name neondb --role-name neondb_owner | tail -1)" && awk '/^\*\*Trạng thái, ghi chú, đã bị xoá/{f=1} f&&/<<.SQL.$/{p=1;next} p&&/^SQL$/{exit} p' docs/production-launch.md | /Applications/Postgres.app/Contents/Versions/latest/bin/psql "$DATABASE_URL" -v ON_ERROR_STOP=1; unset DATABASE_URL
```

```sql
-- <<'SQL'
BEGIN;
-- Production phải đang ở lược đồ 6ac19fbf412a9a5d (sau lệnh tối 05/10); khác thì dừng, không đổi gì, và in nó ra.
DO $$ DECLARE h text := (SELECT hash FROM applied_schema ORDER BY applied_at DESC LIMIT 1); BEGIN
  IF h IS DISTINCT FROM '6ac19fbf412a9a5d' THEN RAISE EXCEPTION 'production đang ở lược đồ %', h; END IF; END $$;
ALTER TABLE google_reviews ADD COLUMN first_seen_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  ADD COLUMN removed_at timestamp with time zone,
  ADD COLUMN status text DEFAULT 'new'::text NOT NULL CHECK (status = ANY (ARRAY['new'::text, 'seen'::text, 'handled'::text])),
  ADD COLUMN note text CHECK (note IS NULL OR char_length(note) <= 2000);
-- Đánh giá đang có là điểm bắt đầu: "Đã xem", thấy lần đầu lúc được đồng bộ.
UPDATE google_reviews SET status='seen', first_seen_at=synced_at;
INSERT INTO applied_schema(hash) VALUES ('262a0c65daf33d7d');
COMMIT;
SQL
```

Phía tool: `backend/app/qs_sync.py` (05/10) hỏi và gửi; `qs.json` = `{"qs_url": "https://quitesensational-review-bio.com",
"enabled": true}`; hẹn giờ 5 phút trong `scheduler.py` khi có `qs.json`; chạy tay `python review_tracker.py qs-sync [--qs URL]`.
Bản gốc các tệp đã sửa ở `~/MAps/backup-code-20261005/`. Sau khi sửa tool phải khởi động lại `review_tracker.py serve`.
`scraper.py` sửa 05/10 tối: link quán dán (chia sẻ `maps.app.goo.gl`, link không có `!9m1!1b1`) mở tab "Tổng quan", tab này
cũng có vài đánh giá xem trước mang `data-review-id`, nên tool tưởng đang ở tab đánh giá, không bấm sang, rồi lỗi vì không thấy
"170 bài đánh giá". Giờ tool bấm tab "Bài đánh giá" khi tab đó chưa được chọn, và chỉ đếm, cuộn, đọc đánh giá đang hiện.
Máy Tài tắt hay phiên Google của tool hết hạn thì production giữ bản cuối, ghi giờ Google Maps đọc lần cuối; lượt đọc lỗi
hiện `MAPS_RUN_FAILED` trên kết nối.

**Mô hình kinh doanh và chọn mẫu (06/10: chọn mẫu → Admin Tài dựng, G1 gói, G2 kích hoạt và thanh toán, G3 nhân viên xin vào quán,
G3b địa chỉ quán):** lược đồ `262a0c65daf33d7d` lên `e762b0dfdcec12ad` (commit `0c217c2`). Bỏ `publish_reviews` và
`shops.publish_approved_at`; `shops` thêm `profile`, `plan`, `paid_until`, `activated_at`, `main_shop_id`; `edit_requests` thêm
`template_key`, `contact`, `contacted_at`, `outcome`; ba bảng mới `payment_settings`, `payments`, `join_requests`. Dữ liệu:
**yêu cầu "Nhờ admin sửa" cũ bị xoá** (không có số Zalo, cột này nay bắt buộc; lệnh in ra số đã xoá); **quán tự đăng ký đang có
được coi là đã kích hoạt**, nên vẫn "chưa tính phí" thay vì bị khoá vì quá 3 ngày dùng thử. Chạy **sau** bước "Trạng thái, ghi chú,
đã bị xoá" ở trên (production phải đang ở `262a0c65`; còn ở `6ac19fbf` thì chạy bước đó trước) và **trước** khi đẩy code. Đã chạy
thử 06/10 trên database dựng từ `6ac19fbf` có dữ liệu (qua bước `262a0c65` rồi bước này): `pg_dump -s` trùng bản dựng mới, chỉ khác
thứ tự cột (cột thêm nằm cuối bảng; code không đọc cột theo vị trí); chạy lần hai thì dừng. Không cần biến Vercel mới; sau khi đẩy
code, Tài nhập tài khoản nhận tiền ở `/gov` → Thanh toán chờ xác nhận.

```bash
cd ~/Desktop/QuiteSensational && export DATABASE_URL="$(npx -y neon@latest connection-string production --project-id purple-waterfall-11672045 --database-name neondb --role-name neondb_owner | tail -1)" && awk '/^\*\*Mô hình kinh doanh và chọn mẫu \(06\/10/{f=1} f&&/<<.SQL.$/{p=1;next} p&&/^SQL$/{exit} p' docs/production-launch.md | /Applications/Postgres.app/Contents/Versions/latest/bin/psql "$DATABASE_URL" -v ON_ERROR_STOP=1; unset DATABASE_URL
```

```sql
-- <<'SQL'
BEGIN;
-- Production phải đang ở lược đồ 262a0c65daf33d7d (sau bước "Trạng thái, ghi chú, đã bị xoá"); khác thì dừng, không đổi gì.
DO $$ DECLARE h text := (SELECT hash FROM applied_schema ORDER BY applied_at DESC LIMIT 1); BEGIN
  IF h IS DISTINCT FROM '262a0c65daf33d7d' THEN RAISE EXCEPTION 'production đang ở lược đồ %', h; END IF; END $$;
-- Chọn mẫu → Admin Tài dựng (06/10): mọi trang qua tay Tài, bỏ bước duyệt lần phát hành đầu; thông tin quán gắn vào mẫu.
DROP TABLE publish_reviews;
ALTER TABLE shops DROP COLUMN publish_approved_at,
  ADD COLUMN profile jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD CONSTRAINT shops_profile_check CHECK (((jsonb_typeof(profile) = 'object'::text) AND (octet_length((profile)::text) <= 8192)));
-- Yêu cầu "Nhờ admin sửa" cũ không có số Zalo, mà từ nay số Zalo là bắt buộc: xoá (in ra bao nhiêu), quán gửi lại khi cần.
DO $$ BEGIN RAISE NOTICE 'xoá % yêu cầu nhờ sửa cũ', (SELECT count(*) FROM edit_requests); END $$;
DELETE FROM edit_requests;
ALTER TABLE edit_requests
  ADD COLUMN template_key text CHECK (template_key IS NULL OR template_key ~ '^[a-z0-9][a-z0-9-]{0,39}$'::text),
  ADD COLUMN contact text NOT NULL CHECK (contact ~ '^0[0-9]{9}$'::text),
  ADD COLUMN contacted_at timestamp with time zone,
  ADD COLUMN outcome text CHECK (outcome IS NULL OR outcome = ANY (ARRAY['published'::text, 'closed'::text])),
  ADD CHECK ((handled_at IS NULL) = (outcome IS NULL));
-- G1–G3b: gói và hạn, kích hoạt 10k, địa chỉ quán dưới gói VIP.
ALTER TABLE shops ADD COLUMN plan text, ADD COLUMN paid_until date, ADD COLUMN activated_at timestamp with time zone,
  ADD COLUMN main_shop_id uuid REFERENCES shops(id),
  ADD CONSTRAINT shops_main_not_self CHECK (((main_shop_id IS NULL) OR (main_shop_id <> id))),
  ADD CONSTRAINT shops_branch_has_no_plan CHECK (((main_shop_id IS NULL) OR ((plan IS NULL) AND (paid_until IS NULL) AND (activated_at IS NULL) AND (NOT self_signup)))),
  ADD CONSTRAINT shops_plan_check CHECK (((plan IS NULL) OR (plan = ANY (ARRAY['basic'::text, 'events'::text, 'vip'::text])))),
  ADD CONSTRAINT shops_paid_until_needs_plan CHECK (((paid_until IS NULL) OR (plan IS NOT NULL)));
CREATE INDEX shops_main_shop ON shops USING btree (main_shop_id) WHERE (main_shop_id IS NOT NULL);
-- Quán tự đăng ký trước khi có thu tiền: coi như đã kích hoạt, nên vẫn "chưa tính phí" (mọi thứ mở) thay vì bị khoá vì đã quá
-- 3 ngày dùng thử. Muốn tính phí quán nào thì đặt gói ở /gov.
UPDATE shops SET activated_at=created_at WHERE self_signup AND activated_at IS NULL;
CREATE TABLE payment_settings (
    id boolean DEFAULT true PRIMARY KEY CHECK (id),
    bank_bin text NOT NULL CHECK (bank_bin ~ '^[0-9]{6}$'::text),
    account_number text NOT NULL CHECK (account_number ~ '^[0-9A-Za-z]{4,19}$'::text),
    account_name text NOT NULL CHECK (account_name ~ '^[A-Z0-9 ]{2,50}$'::text),
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_by uuid NOT NULL REFERENCES platform_admins(id)
);
CREATE TABLE payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind = ANY (ARRAY['activation'::text, 'plan'::text])),
    plan text NOT NULL CHECK (plan = ANY (ARRAY['basic'::text, 'events'::text, 'vip'::text])),
    months integer NOT NULL CHECK (months = ANY (ARRAY[0, 1, 12])),
    amount integer NOT NULL CHECK (amount > 0 AND amount <= 100000000),
    settles_first_month boolean DEFAULT false NOT NULL,
    code text NOT NULL UNIQUE CHECK (code ~ '^[2-9A-HJKMNP-Z]{6}$'::text),
    status text DEFAULT 'pending'::text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'received'::text, 'cancelled'::text])),
    requested_by uuid REFERENCES owner_identities_v2(id),
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid REFERENCES platform_admins(id),
    paid_until_after date,
    CHECK (kind = 'plan' OR (amount = 10000 AND months = 1 AND NOT settles_first_month)),
    CHECK ((status = 'pending') = (decided_at IS NULL)),
    CHECK ((status = 'received') = (paid_until_after IS NOT NULL))
);
CREATE UNIQUE INDEX payments_one_pending ON payments (shop_id) WHERE status = 'pending';
CREATE INDEX payments_shop ON payments (shop_id, created_at DESC);
CREATE TABLE join_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES owner_identities_v2(id) ON DELETE CASCADE,
    message text CHECK (message IS NULL OR (char_length(message) BETWEEN 1 AND 200 AND message !~ '[<>[:cntrl:]]'::text)),
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid REFERENCES owner_identities_v2(id),
    outcome text CHECK (outcome IS NULL OR outcome = ANY (ARRAY['approved'::text, 'declined'::text, 'withdrawn'::text])),
    CHECK ((decided_at IS NULL) = (outcome IS NULL))
);
CREATE UNIQUE INDEX join_requests_one_open ON join_requests (shop_id, user_id) WHERE decided_at IS NULL;
CREATE INDEX join_requests_shop_open ON join_requests (shop_id, created_at) WHERE decided_at IS NULL;
INSERT INTO applied_schema(hash) VALUES ('e762b0dfdcec12ad');
COMMIT;
SQL
```

**Bàn dựng (06/10, kịch bản 9b):** ba bảng mới `edit_request_notes`, `edit_request_files`, `edit_desks`; lược đồ
`e762b0dfdcec12ad` lên `addf0479f510d1d7`. Chạy **sau** bước lược đồ của đợt mô hình kinh doanh (G1–G3b) và **trước** khi đẩy code.
Thêm biến **`ANTHROPIC_API_KEY`** (Production, Sensitive; Tài đã thêm 06/10) — thiếu thì nút "Nhờ Claude" báo chưa có khoá, mọi
thứ khác của Bàn dựng vẫn chạy. Hàm "Nhờ Claude" chạy tới 5 phút (`maxDuration = 300`).

```bash
cd ~/Desktop/QuiteSensational && export DATABASE_URL="$(npx -y neon@latest connection-string production --project-id purple-waterfall-11672045 --database-name neondb --role-name neondb_owner | tail -1)" && awk '/^\*\*Bàn dựng \(06\/10/{f=1} f&&/<<.SQL.$/{p=1;next} p&&/^SQL$/{exit} p' docs/production-launch.md | /Applications/Postgres.app/Contents/Versions/latest/bin/psql "$DATABASE_URL" -v ON_ERROR_STOP=1; unset DATABASE_URL
```

```sql
-- <<'SQL'
BEGIN;
DO $$ DECLARE h text := (SELECT hash FROM applied_schema ORDER BY applied_at DESC LIMIT 1); BEGIN
  IF h IS DISTINCT FROM 'e762b0dfdcec12ad' THEN RAISE EXCEPTION 'production đang ở lược đồ %', h; END IF; END $$;
CREATE TABLE edit_request_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id uuid NOT NULL REFERENCES edit_requests(id) ON DELETE CASCADE,
    who text NOT NULL CHECK (who = ANY (ARRAY['khach'::text, 'tai'::text, 'claude'::text])),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 6000 AND body !~ '[<>]'::text),
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE INDEX edit_request_notes_request ON edit_request_notes (request_id, created_at);
CREATE TABLE edit_request_files (
    request_id uuid NOT NULL REFERENCES edit_requests(id) ON DELETE CASCADE,
    media_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role = ANY (ARRAY['logo'::text, 'anh'::text, 'video'::text])),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120 AND name !~ '[<>]'::text),
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    PRIMARY KEY (request_id, media_id)
);
CREATE TABLE edit_desks (
    request_id uuid PRIMARY KEY REFERENCES edit_requests(id) ON DELETE CASCADE,
    knobs jsonb DEFAULT '{}'::jsonb NOT NULL,
    details jsonb,
    claude jsonb,
    preview_hash text UNIQUE CHECK (preview_hash IS NULL OR preview_hash ~ '^[0-9a-f]{64}$'::text),
    preview_expires_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CHECK ((preview_hash IS NULL) = (preview_expires_at IS NULL))
);
INSERT INTO applied_schema(hash) VALUES ('addf0479f510d1d7');
COMMIT;
SQL
```

**Tệp theo vai, font và âm thanh của quán (07/10):** ô thả theo vai ở Bàn dựng (Poster, Nền, Logo, Logo phụ, Ảnh quán, Ảnh phụ,
Video, Font chính, Font đặc biệt, Âm thanh nền), kho nhận font và âm thanh. Chỉ nới ràng buộc, không đổi dữ liệu cũ; lược đồ
`addf0479f510d1d7` lên `fbdc7b9a546eac90`. Chạy **trước** khi đẩy code (code mới gửi vai và loại tệp mới; lược đồ cũ sẽ từ chối).

```bash
cd ~/Desktop/QuiteSensational && export DATABASE_URL="$(npx -y neon@latest connection-string production --project-id purple-waterfall-11672045 --database-name neondb --role-name neondb_owner | tail -1)" && awk '/^\*\*Tệp theo vai, font và âm thanh/{f=1} f&&/<<.SQL.$/{p=1;next} p&&/^SQL$/{exit} p' docs/production-launch.md | /Applications/Postgres.app/Contents/Versions/latest/bin/psql "$DATABASE_URL" -v ON_ERROR_STOP=1; unset DATABASE_URL
```

```sql
-- <<'SQL'
BEGIN;
DO $$ DECLARE h text := (SELECT hash FROM applied_schema ORDER BY applied_at DESC LIMIT 1); BEGIN
  IF h IS DISTINCT FROM 'addf0479f510d1d7' THEN RAISE EXCEPTION 'production đang ở lược đồ %', h; END IF; END $$;
ALTER TABLE media_assets DROP CONSTRAINT media_assets_content_type_check, DROP CONSTRAINT media_assets_kind_check,
  ADD CONSTRAINT media_assets_content_type_check CHECK (((content_type IS NULL) OR (content_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'video/mp4'::text, 'font/woff2'::text, 'font/ttf'::text, 'font/otf'::text, 'audio/mpeg'::text, 'audio/mp4'::text])))),
  ADD CONSTRAINT media_assets_kind_check CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text, 'font'::text, 'audio'::text])));
ALTER TABLE edit_request_files DROP CONSTRAINT edit_request_files_role_check,
  ADD CONSTRAINT edit_request_files_role_check CHECK (role = ANY (ARRAY['poster'::text, 'nen'::text, 'logo'::text, 'logo-phu'::text, 'anh'::text, 'anh-phu'::text, 'video'::text, 'font-chinh'::text, 'font-dac-biet'::text, 'am-thanh'::text]));
INSERT INTO applied_schema(hash) VALUES ('fbdc7b9a546eac90');
COMMIT;
SQL
```

## Đăng nhập bằng Google (D4c, 28/09)

OAuth client **QuiteSensational** (Web application) trên Google Cloud của Tài. Cấu hình cần có:

- **Branding:** tên Quite Sensational; home page `/`, privacy `/quyen-rieng-tu`, terms `/dieu-khoan` trên tên miền chính;
  authorized domain `quitesensational-review-bio.com`. **Audience:** External; Testing (thêm email thử) tới khi mở cho quán thật
  thì Publish. **Data access:** chỉ `openid`, `userinfo.email`, `userinfo.profile`.
- **Authorized JavaScript origins:** tên miền chính và alias preview. **Authorized redirect URIs:**
  `https://quitesensational-review-bio.com/api/owner/v2/google/callback` và cùng đường trên alias preview.
- **Biến môi trường** (Production + Preview, Sensitive): `NFC_GOOGLE_CLIENT_ID`, `NFC_GOOGLE_CLIENT_SECRET`. Thiếu một trong hai thì
  nút Google không hiện, mọi thứ khác chạy như cũ. Tự chạy trên VPS: đặt đúng hai biến này.
- `NFC_GOOGLE_AUTH_URL`/`NFC_GOOGLE_TOKEN_URL` chỉ dành cho harness (Google giả) và **chỉ có tác dụng khi `NFC_ENV=local`**.

## Còn phải làm trên production (tính tới 21/09)

- [x] ~~Đăng nhập `/gov`, tạo shop template~~ — xong 21/09.
- [ ] **Tạo shop thật đầu tiên** và ghi thẻ NFC cho nó. Kiểm đường dẫn trong dashboard là `.com` trước khi ghi.
- [ ] **Thử tải một ảnh lên** từ dashboard — phép kiểm CORS bucket R2 và hai khoá R2 của production.
- [x] **21/09: `MEDIA_PUBLIC_ORIGIN` = `https://media.quitesensational-review-bio.com`** (custom domain của bucket `nfc-media`, Production và Preview). Tài tải lên thử, link ra đúng `media.…`. **r2.dev vẫn bật** cho ảnh đã lưu trước đó; tắt khi không còn cấu hình nào trỏ `pub-….r2.dev`. Ảnh đại diện cũ trên `r2.dev` phải tải lại, vì `lib/owner/profile.ts` chỉ nhận ảnh dưới `MEDIA_PUBLIC_ORIGIN`. Bản ghi DNS `media` **để đám mây cam** (R2 bắt buộc); luật "không bật cam" chỉ áp cho bản ghi trỏ Vercel.
- [ ] Thử dashboard trên **điện thoại** bằng tên miền production.

## Checklist mở production (19/09, đã xong bước 1–4)

1. **Tài: biến môi trường Production trên Vercel** (mục dưới). Phải xong **trước** khi deploy: Vercel chụp biến lúc tạo deployment.
2. **Tài: thêm tên miền production vào CORS của bucket R2** (Cloudflare → R2 → `nfc-media` → Settings → CORS policy): `AllowedOrigins` thêm `https://quitesensational-review-bio.vercel.app`, giữ origin preview.
3. **Tài: tạo admin `tai` trên database production** (lệnh dưới).
4. **Agent: push `feat/local-app-foundation` lên `main`** (fast-forward) → Vercel deploy production. Agent kiểm bằng request không đăng nhập: `/gov/login` 200, `/owner/login?next=…` 200, `/api/owner/v2/x` 401.
5. **Tài: vào `/gov` trên production**, tạo shop template, rồi tạo shop thật. Tài khoản template `yourshop` chỉ vào được bằng link đặt mật khẩu dùng một lần (mọi môi trường, từ 27/09).
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
- `NFC_TOTP_KEY` (thêm ở lát A2, 20/09): 32 byte hex, **khác nhau giữa Production và Preview**. Mã hoá bí mật 2FA của admin khi lưu. Thiếu biến này thì đường đăng ký 2FA **từ chối chạy** (`TOTP_KEY_MISSING`) chứ không lưu bí mật trần. **Đổi khoá này là mọi admin mất 2FA và phải đăng ký lại** — nếu buộc phải đổi, xoá `totp_secret`/`totp_enrolled_at` của họ trong cùng một lần.
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: biến preview là Secret nên không đọc lại được. Nếu còn giữ khoá cũ thì dùng lại; không thì tạo token R2 mới (Cloudflare → R2 → Manage API tokens → Create: Object Read & Write, chỉ bucket `nfc-media`).

`DATABASE_URL`, `DATABASE_URL_UNPOOLED` do tích hợp Neon đặt sẵn cho Production. `NFC_SUPPORT_CONTACT` đã có cho Production.

## Admin trên database production

`scripts/bootstrap-admin.mjs` hỏi mật khẩu (ít nhất 16 ký tự, không hiện ra màn hình) và từ lát F6 nhận `--handle` và `--title`, vì migration 014 chỉ gắn huy hiệu cho admin `tai` **đã có** lúc chạy migration. Gõ mật khẩu bằng **bàn phím tiếng Anh** (bẫy bộ gõ tiếng Việt trong `operations-gotchas.md`). Nếu báo `duplicate key` thì admin đã có: chạy lại với `--reset` (đặt mật khẩu mới và gắn huy hiệu).

## Khi có `.com`

Gắn `.com` vào Vercel bằng DNS Cloudflare, đổi `APP_ORIGIN`, deploy lại, cho `quitesensational-review-bio.vercel.app` chuyển hướng 308 sang `.com`. Thẻ đã ghi vẫn chạy qua chuyển hướng; mọi người đăng nhập lại một lần. Có `.com` trên Cloudflare mới gắn được `media.<tên-miền>` cho R2 thay `r2.dev`.

Trước lát 19/09 production **đóng**: không có `NFC_ENV`, và `main` còn là mã cũ (`df0a485`). `main` là tổ tiên của `feat/local-app-foundation`, nên gộp là fast-forward, không xung đột.

## Đã làm (19/09)

- Tài đặt đủ 17 biến Production (kiểm bằng `vercel env ls production`). Lần kiểm đầu agent lọc sai cột bằng `awk` và tưởng thiếu biến; đọc bảng nguyên văn thì đủ.
- Tài tạo admin `tai` trên database production bằng `bootstrap-admin.mjs --handle=Quitesensational --title="Admin Tài"`. Script in cảnh báo SSL của `pg` vì chưa đổi `sslmode` như `migrate.mjs`; đã sửa trong script.
- Agent fast-forward `main` từ `df0a485` lên `c56cb7b` (19/09). Trong lúc build, tên miền production còn phục vụ bản `main` cũ với biến mới (Vercel đã redeploy bản cũ khi Tài thêm biến), nên lần kiểm đầu tưởng đã xong; phải kiểm một dấu hiệu chỉ bản mới có (chữ "@handle hoặc email" ở trang đăng nhập) và `vercel ls --prod` (trạng thái Building).
- **Production mở, kiểm không đăng nhập:** `/gov/login` 200 · `/owner/login` 200 (có dòng "Quên mật khẩu? Liên hệ …") · `/ZZZ/<mã>` 307 về đăng nhập · `/gov` 307 về `/gov/login` · `/api/owner/v2/<mã>`, `/notifications`, `/profile` 401 · `/t/<mã lạ>` 200 (trang "chưa sẵn sàng") · header `x-frame-options: DENY`, `cache-control: private, no-store`, HSTS.
- **Còn lại cho Tài:** đăng nhập `/gov` trên production bằng admin `tai`, tạo shop template, tạo shop thật, rồi thử tải ảnh lên (kiểm CORS R2 và hai khoá R2 mới).
- **Từ giờ:** production deploy từ `main`. Mỗi lát xong trên branch và đã kiểm trên preview thì fast-forward `main`; lát có migration thì migrate Neon production **trước** khi đẩy `main`.

## Tài khoản dashboard template trên production (19/09)

Tài hỏi tài khoản dashboard template. Preview là `yourshop / 1`; production **từ chối** mật khẩu yếu đó (`TEST_ACCOUNT_FORBIDDEN`), nên lát mở production để lại một lỗ: **không có cách nào sửa template trên production**. Agent không lường trước khi lên kế hoạch lát này.

Sửa: trên production, nút ở `/gov` thành **"Tạo tài khoản cho template (link đặt mật khẩu)"** và **"Tạo lại link đặt mật khẩu cho yourshop"** (`ShopProvisioning.templateAccountLink`). Tài khoản `yourshop` tạo ở trạng thái khoá (như chủ shop mới), `/gov` hiện link đặt mật khẩu dùng một lần 48 giờ; Tài tự đặt mật khẩu mạnh rồi đăng nhập dashboard template bằng `@yourshop`. Cấp link mới cũng mở khoá đếm đăng nhập sai. **Từ 27/09 preview cũng vậy:** `yourshop / 1` bị gỡ hẳn (repo công khai thì mật khẩu cố định là mật khẩu ai cũng biết); cấp lại link thì khoá tài khoản và đăng xuất mọi phiên cũ trước.

**Lỗi cũ test mới bắt được:** `OwnerSetupLinks.write` chỉ huỷ link còn mở **cùng loại** (`setup` hoặc `reset`). Link đặt mật khẩu đầu tiên (`setup`) vì thế **vẫn dùng được** sau khi admin cấp lại link (`reset`) cho chủ shop, cho tới khi hết 48 giờ. Giờ link mới huỷ mọi link còn mở của tài khoản.
- 7 bộ trên commit `0aa2f47`: tsc exit 0 · eslint exit 0 · repository `116 passed` · contracts `73 passed` · client `75 passed` · public-v2 + browser-hardening `1 skipped, 16 passed` + `2 passed` · publishing `10 passed` + `2 passed` · owner `10 passed` + `2 passed` · admin `6 passed` + `2 passed`. Không có migration; đã đẩy lên `main`.


## Đã làm (20/09)

- Lát **A1** (chặn bot trang khách) lên production cùng **migration 018**. Tài xoay mật khẩu `neondb_owner` trên **cả hai** branch Neon rồi mới migrate cả hai, sau khi một lệnh sai shell của Claude làm chuỗi kết nối production rơi vào dòng lệnh và `~/.zsh_history` (bẫy `read -p` trong `operations-gotchas.md`).
- Kiểm bản mới lên đúng bằng **`dpl-id`** trong HTML, không bằng mã trạng thái: bản cũ `dpl_GVc1WLuw8Bh…` → bản mới `dpl_6kMpix7VqHqz…` sau 45 giây. Đây là cách đúng, vì Vercel có thể redeploy **bản cũ** với biến mới và làm người kiểm tưởng đã xong.
- **Chưa chứng minh được database production đã nối lại**: mọi đường Claude kiểm được từ bên ngoài đều không đọc database, và production chưa có shop nào để mở một trang có đọc. Phép kiểm còn lại là Tài đăng nhập `/gov`.
