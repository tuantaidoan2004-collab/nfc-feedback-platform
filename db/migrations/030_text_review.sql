-- Cửa duyệt chữ (lát M2b, Tài 27/09): lời cảm ơn trước Google do shop tự viết phải qua admin duyệt trước khi lên trang.
--
-- Giống hệt cửa duyệt ảnh (023): chặn ở LÚC PHÁT HÀNH (`PublishingAdmin.publish`), không ở lúc lưu. Lưu bản nháp có câu
-- mới thì câu đó vào hàng chờ; trong lúc chờ, bản đã phát hành trước đó VẪN SỐNG với câu cũ. Một hàng là một cặp câu
-- (tiếng Việt + tiếng Anh) của một shop: câu đã duyệt dùng lại được ở mọi trang của shop đó. `kind` để dành cho chữ tự do
-- khác sau này; hôm nay chỉ có 'thanks'.
--
-- Không đụng bảng nào đang có. Gỡ: DROP TABLE text_reviews; và xoá '030_text_review' khỏi schema_migrations.
CREATE TABLE text_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  kind text NOT NULL CHECK (kind IN ('thanks')),
  -- Đúng chữ nằm trong cấu hình trang (lib/publishing/config.ts THANKS_MAX = 120). Độ dài bằng char_length, không bằng regex.
  text_vi text NOT NULL CHECK (char_length(text_vi) BETWEEN 1 AND 120 AND text_vi !~ '[[:cntrl:]<>]'),
  text_en text NOT NULL CHECK (char_length(text_en) BETWEEN 1 AND 120 AND text_en !~ '[[:cntrl:]<>]'),
  -- Ai lưu câu này: `owner:<uuid>` hoặc `admin:<uuid>` (phiên hỗ trợ thiết kế).
  submitted_by text NOT NULL CHECK (length(submitted_by) BETWEEN 1 AND 80),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected')),
  reason text CHECK (reason IS NULL OR (length(btrim(reason)) BETWEEN 1 AND 300 AND reason !~ '[[:cntrl:]<>]')),
  -- Không khoá ngoại tới platform_admins, như 023: mọi lần phát hành đọc bảng này, cả ở nơi chưa có bảng admin. Người
  -- duyệt thật nằm trong admin_audit, cùng transaction với quyết định.
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (shop_id, kind, text_vi, text_en),
  CHECK ((state = 'pending') = (reviewed_at IS NULL)),
  CHECK (state <> 'rejected' OR reason IS NOT NULL),
  CHECK (state = 'rejected' OR reason IS NULL)
);
CREATE INDEX text_reviews_pending ON text_reviews (created_at) WHERE state = 'pending';
