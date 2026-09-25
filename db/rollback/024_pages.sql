-- Gỡ lát tách quán / trang. Chạy trong một transaction, và CHỈ sau khi đã đưa ứng dụng về bản trước lát P1: mã mới
-- đọc bảng `pages` ở mọi trang khách.
-- Chỉ gỡ được khi mỗi quán còn đúng một trang: quán nhiều trang không có cách nào nhét lại vào một hàng `shops` mà
-- không mất trang. Khi đó migration này dừng lại, không đổi gì.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pages GROUP BY shop_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'ROLLBACK_024_MULTIPLE_PAGES: một quán có nhiều trang, không gỡ được';
  END IF;
END $$;

DROP TRIGGER pages_identity ON pages;
DROP FUNCTION page_identity();

-- Quán lấy lại bản phát hành đang chạy và trạng thái của trang duy nhất của nó.
UPDATE shops s SET active_release_id = p.active_release_id FROM pages p WHERE p.shop_id = s.id;
ALTER TABLE shops ADD CONSTRAINT active_shop_release CHECK (publishing_state <> 'active' OR active_release_id IS NOT NULL);

DROP TRIGGER pages_seed_profile ON pages;
DROP FUNCTION page_profile_seed();
ALTER TABLE shop_profile DROP CONSTRAINT shop_profile_pkey;
ALTER TABLE shop_profile DROP COLUMN page_id;
ALTER TABLE shop_profile ADD PRIMARY KEY (shop_id);
CREATE FUNCTION shop_profile_seed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shop_profile (shop_id, name, google_url, question_vi, question_en)
  VALUES (NEW.id, NEW.name, NEW.google_url, 'Trải nghiệm hôm nay của bạn thế nào?', 'How was your experience today?')
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER shops_seed_profile AFTER INSERT ON shops FOR EACH ROW EXECUTE FUNCTION shop_profile_seed();
-- Quán chưa từng có trang thì 024 đã bỏ hồ sơ của nó; trả lại như 022 đã tạo.
INSERT INTO shop_profile (shop_id, name, google_url, question_vi, question_en)
SELECT s.id, s.name, s.google_url, 'Trải nghiệm hôm nay của bạn thế nào?', 'How was your experience today?' FROM shops s
ON CONFLICT (shop_id) DO NOTHING;

ALTER TABLE tags DROP COLUMN page_id;

ALTER TABLE preview_sessions DISABLE TRIGGER preview_immutable;
ALTER TABLE preview_sessions DROP COLUMN page_id;
ALTER TABLE preview_sessions ENABLE TRIGGER preview_immutable;

ALTER TABLE pages DROP CONSTRAINT pages_release_fk;
ALTER TABLE page_releases DISABLE TRIGGER release_immutable;
ALTER TABLE page_releases DROP COLUMN page_id;
ALTER TABLE page_releases ENABLE TRIGGER release_immutable;
ALTER TABLE page_releases ADD UNIQUE (shop_id, draft_revision);

ALTER TABLE page_drafts DROP CONSTRAINT page_drafts_pkey;
ALTER TABLE page_drafts DROP COLUMN page_id;
ALTER TABLE page_drafts ADD PRIMARY KEY (shop_id);

DROP TABLE pages;
