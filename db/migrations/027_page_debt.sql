-- Dọn nợ của lát P1 (migration 024 đã hẹn, `docs/goi-va-trang.md` mục 10).
--
-- 1. `shops.active_release_id`: từ 024 bản phát hành đang chạy thuộc TRANG (`pages.active_release_id`); cột này đứng yên
--    ở giá trị cũ và dễ bị đọc nhầm. Không mã nào còn đọc nó.
-- 2. `shop_profile` giữ nội dung của TRANG từ 024 nhưng mang tên của quán. Đổi thành `page_profile`.
--
-- Khoảng chờ deploy: mã đang chạy còn đọc và upsert `shop_profile`, nên để lại một VIEW cùng tên trỏ vào bảng mới (upsert
-- qua view đơn giản chạy được — đã thử). Migration sau xoá view khi không còn mã nào dùng tên cũ.
ALTER TABLE shops DROP CONSTRAINT shops_release_fk;
ALTER TABLE shops DROP COLUMN active_release_id;

ALTER TABLE shop_profile RENAME TO page_profile;
ALTER TABLE page_profile RENAME CONSTRAINT shop_profile_pkey TO page_profile_pkey;
CREATE OR REPLACE FUNCTION page_profile_seed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO page_profile (shop_id, page_id, name, google_url, question_vi, question_en)
  SELECT NEW.shop_id, NEW.id, s.name, s.google_url, 'Trải nghiệm hôm nay của bạn thế nào?', 'How was your experience today?'
  FROM shops s WHERE s.id = NEW.shop_id
  ON CONFLICT (page_id) DO NOTHING;
  RETURN NEW;
END $$;
-- Chỉ cho khoảng chờ deploy (xem trên). Xoá ở migration kế tiếp.
CREATE VIEW shop_profile AS SELECT * FROM page_profile;
