-- Gỡ vòng đời trang. Chạy trong một transaction, chỉ sau khi đưa ứng dụng về bản trước lát P4. Trang đang tạm ngừng hay
-- đã đóng không có chỗ trong hai trạng thái cũ, nên khi còn trang như vậy thì dừng lại, không đổi gì.
-- Mất: các báo cáo tạm dừng khẩn cấp và kết quả xử lý của chúng.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pages WHERE state IN ('paused', 'closed')) THEN
    RAISE EXCEPTION 'ROLLBACK_026_PAGES_NOT_LIVE: còn trang tạm ngừng hoặc đã đóng';
  END IF;
END $$;
DROP TABLE page_incidents;
CREATE OR REPLACE FUNCTION page_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PAGE_PERMANENT' USING ERRCODE = '23514'; END IF;
  IF NEW.id <> OLD.id OR NEW.shop_id <> OLD.shop_id OR NEW.slug <> OLD.slug OR NEW.entry_key <> OLD.entry_key
    THEN RAISE EXCEPTION 'PAGE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
ALTER TABLE pages DROP CONSTRAINT pages_closed_consistent, DROP CONSTRAINT pages_paused_consistent, DROP CONSTRAINT pages_live_released,
  DROP CONSTRAINT pages_state_check;
ALTER TABLE pages DROP COLUMN closed_at, DROP COLUMN pause_reason, DROP COLUMN paused_at;
ALTER TABLE pages ADD CONSTRAINT pages_state_check CHECK (state IN ('draft', 'active'));
ALTER TABLE pages ADD CONSTRAINT pages_check1 CHECK (state <> 'active' OR active_release_id IS NOT NULL);
