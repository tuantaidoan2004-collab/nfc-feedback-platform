-- Vòng đời trang (lát P4, `docs/goi-va-trang.md` mục 5): nháp → đang chạy ⇄ tạm ngừng → đóng.
--
-- - Tạm ngừng: khách quét thấy "Trang tạm ngừng", dữ liệu giữ nguyên, mở lại được. Ba lý do: chủ quán bấm tạm dừng khẩn
--   cấp (`emergency`, kèm một báo cáo cho admin), admin tạm dừng (`admin`), hoặc gói hết hạn (`billing`, lát P5).
-- - Đóng: link trả "không tồn tại", vĩnh viễn. Link không bao giờ cấp lại (trigger của 024). Dữ liệu CHƯA xoá: bao lâu
--   thì xoá là câu hỏi còn mở (`goi-va-trang.md` mục 9), phải khớp trang chính sách quyền riêng tư.
--
-- Chỉ thêm: mã P3 đang chạy chỉ đặt 'draft' và 'active', và trang khách của nó coi mọi trạng thái khác 'active' là chưa
-- sẵn sàng — đúng với tạm ngừng lẫn đóng trong khoảng chờ deploy.

-- Tên các ràng buộc cũ do PostgreSQL tự đặt (`pages_state_check`, `pages_check1`); tìm theo nội dung để không phụ thuộc tên.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'pages'::regclass AND contype = 'c'
    AND (pg_get_constraintdef(oid) LIKE '%state = ANY%' OR pg_get_constraintdef(oid) LIKE '%state <> ''active''%active_release_id IS NOT NULL%')
  LOOP EXECUTE format('ALTER TABLE pages DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE pages ADD CONSTRAINT pages_state_check CHECK (state IN ('draft', 'active', 'paused', 'closed'));
ALTER TABLE pages ADD COLUMN paused_at timestamptz;
ALTER TABLE pages ADD COLUMN pause_reason text CHECK (pause_reason IN ('emergency', 'admin', 'billing'));
ALTER TABLE pages ADD COLUMN closed_at timestamptz;
-- Một trang đang chạy hay tạm ngừng luôn có bản phát hành để quay lại.
ALTER TABLE pages ADD CONSTRAINT pages_live_released CHECK (state NOT IN ('active', 'paused') OR active_release_id IS NOT NULL);
ALTER TABLE pages ADD CONSTRAINT pages_paused_consistent CHECK ((state = 'paused') = (paused_at IS NOT NULL AND pause_reason IS NOT NULL));
ALTER TABLE pages ADD CONSTRAINT pages_closed_consistent CHECK ((state = 'closed') = (closed_at IS NOT NULL));

-- Chuyển trạng thái chỉ theo đường đã vẽ; trang đã đóng không đổi gì nữa (kể cả tên, bản phát hành).
CREATE OR REPLACE FUNCTION page_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PAGE_PERMANENT' USING ERRCODE = '23514'; END IF;
  IF NEW.id <> OLD.id OR NEW.shop_id <> OLD.shop_id OR NEW.slug <> OLD.slug OR NEW.entry_key <> OLD.entry_key
    THEN RAISE EXCEPTION 'PAGE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'PAGE_CLOSED' USING ERRCODE = '23514'; END IF;
  IF NEW.state <> OLD.state AND NOT (
       (OLD.state = 'draft' AND NEW.state IN ('active', 'closed'))
    OR (OLD.state = 'active' AND NEW.state IN ('paused', 'closed'))
    OR (OLD.state = 'paused' AND NEW.state IN ('active', 'closed')))
    THEN RAISE EXCEPTION 'INVALID_PAGE_TRANSITION' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;

-- Báo cáo tạm dừng khẩn cấp: chủ quán dừng trang vì một lỗi, admin xem và quyết định (cách đền bù bàn sau — Tài 25/09).
CREATE TABLE page_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  page_id uuid NOT NULL,
  -- Không khoá ngoại tới owner_identities_v2 (004): harness chế độ publishing không có bảng đó (bẫy của 023). Người báo
  -- được ghi, có khoá ngoại, trong lịch sử hoạt động của quán.
  reported_by uuid NOT NULL,
  -- Chủ quán kể lỗi gì. Độ dài kiểm bằng `length`, không bằng số lặp trong regex (bẫy A2/022).
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000 AND reason !~ '[<>]'),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  -- Không khoá ngoại tới platform_admins, như `media_assets.reviewed_by`: người xử lý được ghi, có khoá ngoại, trong admin_audit.
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text CHECK (resolution IS NULL OR (length(btrim(resolution)) BETWEEN 1 AND 1000 AND resolution !~ '[<>]')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (shop_id, page_id) REFERENCES pages (shop_id, id),
  CHECK ((state = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL))
);
CREATE INDEX page_incidents_open ON page_incidents (created_at) WHERE state = 'open';
CREATE INDEX page_incidents_page ON page_incidents (page_id, created_at DESC);
