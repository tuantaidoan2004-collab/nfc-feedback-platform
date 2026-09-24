-- Cửa duyệt ảnh (Tài chốt 22/09/2026; `docs/thiet-ke-va-khuon.md` mục 10).
--
-- Chủ quán tải lên được bất cứ thứ gì — logo của hãng khác, ảnh người khác, ảnh phản cảm — và nó hiện trên một URL
-- công khai dưới tên miền của nền tảng, cạnh chữ "Đánh giá trên Google". Nên mọi ảnh và video của shop phải được
-- admin duyệt trước khi lên trang khách.
--
-- Chặn ở LÚC PHÁT HÀNH, không ở lúc tải lên: `PublishingAdmin.publish` chỉ nhận URL có trong bảng này ở trạng thái
-- `approved`. Chặn ở lúc tải lên thì gọi thẳng API lưu bản nháp với một URL tự chọn là đi vòng được — đúng lỗ hôm nay:
-- trước bảng này, bản nháp nhận MỌI URL https, kể cả ảnh ở trang ngoài.
--
-- Trong lúc chờ duyệt, bản đã phát hành trước đó VẪN SỐNG. Không bao giờ để trang khách trống vì một ảnh đang chờ.
CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  -- Đúng chuỗi URL nằm trong cấu hình trang. Độ dài kiểm bằng `length`, không bằng số lặp trong regex (bẫy A2/022).
  url text NOT NULL UNIQUE CHECK (length(url) BETWEEN 9 AND 2048 AND url ~ '^https://' AND url !~ '[[:space:]<>]'),
  kind text NOT NULL CHECK (kind IN ('image', 'video')),
  -- NULL chỉ ở các hàng ghi sẵn lúc migrate (ảnh đã nằm trên trang trước khi có cửa duyệt).
  content_type text CHECK (content_type IS NULL OR content_type IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')),
  size_bytes integer CHECK (size_bytes IS NULL OR size_bytes > 0),
  -- Ai xin link tải lên: `owner:<uuid>`, `admin:<uuid>` (phiên hỗ trợ thiết kế), hoặc `backfill-023`.
  uploaded_by text NOT NULL CHECK (length(uploaded_by) BETWEEN 1 AND 80),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected')),
  reason text CHECK (reason IS NULL OR (length(btrim(reason)) BETWEEN 1 AND 300 AND reason !~ '[[:cntrl:]<>]')),
  -- Không khoá ngoại tới platform_admins (migration 005), có chủ ý: mọi lần phát hành đọc bảng này, và trang khách vẫn
  -- chạy ở những nơi chưa có bảng admin (harness chế độ publishing). Người duyệt thật được ghi, có khoá ngoại, trong
  -- admin_audit cùng transaction với quyết định.
  -- Cửa duyệt (lib/publishing/media-gate.ts) đọc `shops.is_template` của migration 009: nơi nào áp 023 phải có 009.
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Đã có quyết định thì có thời điểm; từ chối thì phải có lý do để chủ quán biết sửa gì.
  CHECK ((state = 'pending') = (reviewed_at IS NULL)),
  CHECK (state <> 'rejected' OR reason IS NOT NULL),
  CHECK (state = 'rejected' OR reason IS NULL)
);
-- Hàng đợi của `/gov`: chỉ những ảnh đang chờ, cũ nhất trước.
CREATE INDEX media_assets_pending ON media_assets (created_at) WHERE state = 'pending';
CREATE INDEX media_assets_shop ON media_assets (shop_id, created_at DESC);

-- Ảnh đang nằm trên trang trước khi có cửa duyệt được ghi là ĐÃ DUYỆT, với `uploaded_by = 'backfill-023'`, để không
-- trang nào đang chạy mất ảnh và không bản nháp nào đang sửa dở bị chặn phát hành vì ảnh cũ của chính nó. Quét cả bản
-- nháp, mọi bản phát hành và hồ sơ tài khoản (migration 022). Đường dẫn dựng sẵn trong app (`/media/…`) không phải
-- https nên không vào bảng — chúng là của nền tảng.
WITH configs AS (
  SELECT shop_id, config AS c FROM page_drafts
  UNION ALL SELECT shop_id, config_snapshot FROM page_releases
  UNION ALL SELECT shop_id, jsonb_build_object('logo', logo, 'poster', poster) FROM shop_profile
), found AS (
  SELECT shop_id, c -> 'poster' ->> 'url' AS url, c -> 'poster' ->> 'kind' AS kind FROM configs
  UNION ALL SELECT shop_id, c -> 'poster' ->> 'still', 'image' FROM configs
  UNION ALL SELECT shop_id, c -> 'logo' ->> 'url', 'image' FROM configs
  UNION ALL SELECT shop_id, c -> 'background' -> 'media' ->> 'url', c -> 'background' -> 'media' ->> 'kind' FROM configs
  UNION ALL SELECT shop_id, c -> 'background' -> 'media' ->> 'still', 'image' FROM configs
)
INSERT INTO media_assets (shop_id, url, kind, uploaded_by, state, reviewed_at)
SELECT DISTINCT ON (url) shop_id, url, CASE WHEN kind = 'video' THEN 'video' ELSE 'image' END, 'backfill-023', 'approved', clock_timestamp()
FROM found
WHERE url LIKE 'https://%' AND length(url) <= 2048 AND url !~ '[[:space:]<>]'
ORDER BY url, shop_id
ON CONFLICT (url) DO NOTHING;
