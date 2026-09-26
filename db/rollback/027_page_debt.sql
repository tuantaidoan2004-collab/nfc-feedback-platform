-- Gỡ 027. Chạy trong một transaction, chỉ sau khi đưa ứng dụng về bản trước lát dọn nợ P1. Cột cũ của quán được dựng lại
-- từ trang đầu tiên của mỗi quán (trang giữ khoá lượt ghé cũ 'direct:shop' nếu có), như 024 đã chép sang.
DROP VIEW shop_profile;
ALTER TABLE page_profile RENAME CONSTRAINT page_profile_pkey TO shop_profile_pkey;
ALTER TABLE page_profile RENAME TO shop_profile;
CREATE OR REPLACE FUNCTION page_profile_seed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shop_profile (shop_id, page_id, name, google_url, question_vi, question_en)
  SELECT NEW.shop_id, NEW.id, s.name, s.google_url, 'Trải nghiệm hôm nay của bạn thế nào?', 'How was your experience today?'
  FROM shops s WHERE s.id = NEW.shop_id
  ON CONFLICT (page_id) DO NOTHING;
  RETURN NEW;
END $$;
ALTER TABLE shops ADD COLUMN active_release_id uuid;
UPDATE shops s SET active_release_id = (SELECT p.active_release_id FROM pages p WHERE p.shop_id = s.id AND p.active_release_id IS NOT NULL
  ORDER BY p.entry_key <> 'direct:shop', p.created_at, p.id LIMIT 1);
ALTER TABLE shops ADD CONSTRAINT shops_release_fk FOREIGN KEY (id, active_release_id) REFERENCES page_releases (shop_id, id);
