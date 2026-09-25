-- Tách QUÁN và TRANG (Tài chốt 25/09/2026, `docs/goi-va-trang.md` mục 3, lát P1).
--
-- `shops` từ nay là QUÁN: thành viên, quyền, góp ý, lượt ghé, hỗ trợ, ảnh đã duyệt. Mọi thứ về cách ly dữ liệu giữa
-- các quán vẫn đứng trên `shop_id`, không đổi.
-- `pages` là TRANG: một link, một khuôn + bản, bản nháp, các bản phát hành, các thẻ NFC, bản xem trước và nội dung
-- (`shop_profile`, từ nay một hàng mỗi TRANG — tên bảng giữ nguyên để mã cũ còn đọc được, xem dưới). Một quán có
-- nhiều trang.
--
-- CHỈ THÊM, KHÔNG PHÁ: giữa lúc chạy migration này và lúc mã mới lên, mã cũ vẫn chạy. Trang khách của mã cũ đọc
-- `shops.slug`, `shops.active_release_id`, `page_releases`, `shop_profile.shop_id` — tất cả còn nguyên và đúng (mỗi quán
-- lúc này có đúng một trang). Việc ghi của mã cũ trong khoảng đó (tạo shop, lưu nháp) có thể bị từ chối: chấp nhận,
-- chưa có khách thật. Cột `shops.active_release_id` và ràng buộc của nó thôi được dùng; gỡ ở một migration sau.
--
-- Link đã cấp không bao giờ bị xoá hay cấp lại (`goi-va-trang.md` mục 5): thẻ NFC đã dán vẫn trỏ tới nó.

CREATE TABLE pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  -- Cùng luật với `shops.slug` (001 và các chữ dành riêng của 003/004/005/014/017).
  slug text NOT NULL CHECK (slug ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$'
    AND lower(slug) NOT IN ('api','zzz','t','demo','_next','preview','owner','gov','profile','password','login','logout','setup','notifications')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active')),
  active_release_id uuid,
  -- Khoá lượt ghé thẳng vào link của trang (không qua thẻ). Trang có từ trước 024 giữ 'direct:shop' để lượt ghé cũ
  -- và nút "Xoá dữ liệu của tôi" của khách cũ vẫn khớp; trang mới dùng khoá riêng của nó.
  entry_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (shop_id, id),
  UNIQUE (shop_id, entry_key),
  CHECK (entry_key = 'direct:shop' OR entry_key = 'direct:page:' || id::text),
  CHECK (state <> 'active' OR active_release_id IS NOT NULL)
);
CREATE UNIQUE INDEX pages_slug_folded ON pages (lower(slug));
CREATE INDEX pages_shop ON pages (shop_id, created_at, id);

-- Mỗi quán đang có bản nháp, bản phát hành, thẻ hay bản xem trước thì có đúng một trang, cùng link với quán.
INSERT INTO pages (shop_id, slug, state, active_release_id, entry_key)
SELECT s.id, s.slug, CASE WHEN s.active_release_id IS NULL THEN 'draft' ELSE 'active' END, s.active_release_id, 'direct:shop'
FROM shops s
WHERE EXISTS (SELECT 1 FROM page_drafts d WHERE d.shop_id = s.id)
   OR EXISTS (SELECT 1 FROM page_releases r WHERE r.shop_id = s.id)
   OR EXISTS (SELECT 1 FROM tags t WHERE t.shop_id = s.id)
   OR EXISTS (SELECT 1 FROM preview_sessions p WHERE p.shop_id = s.id);

-- Bản nháp: một mỗi trang.
ALTER TABLE page_drafts ADD COLUMN page_id uuid;
UPDATE page_drafts d SET page_id = p.id FROM pages p WHERE p.shop_id = d.shop_id;
ALTER TABLE page_drafts ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE page_drafts DROP CONSTRAINT page_drafts_pkey;
ALTER TABLE page_drafts ADD PRIMARY KEY (page_id);
ALTER TABLE page_drafts ADD FOREIGN KEY (shop_id, page_id) REFERENCES pages (shop_id, id);

-- Bản phát hành và bản xem trước là bản ghi không sửa được (trigger của 003). Tắt trigger đúng lúc gắn trang, trong
-- cùng transaction với mọi thứ khác, rồi bật lại.
ALTER TABLE page_releases DISABLE TRIGGER release_immutable;
ALTER TABLE page_releases ADD COLUMN page_id uuid;
UPDATE page_releases r SET page_id = p.id FROM pages p WHERE p.shop_id = r.shop_id;
ALTER TABLE page_releases ENABLE TRIGGER release_immutable;
ALTER TABLE page_releases ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE page_releases ADD FOREIGN KEY (shop_id, page_id) REFERENCES pages (shop_id, id);
-- Số bản nháp đếm riêng từng trang.
ALTER TABLE page_releases DROP CONSTRAINT page_releases_shop_id_draft_revision_key;
ALTER TABLE page_releases ADD UNIQUE (page_id, draft_revision);
ALTER TABLE page_releases ADD UNIQUE (page_id, id);
ALTER TABLE pages ADD CONSTRAINT pages_release_fk FOREIGN KEY (id, active_release_id) REFERENCES page_releases (page_id, id);

ALTER TABLE preview_sessions DISABLE TRIGGER preview_immutable;
ALTER TABLE preview_sessions ADD COLUMN page_id uuid;
UPDATE preview_sessions v SET page_id = p.id FROM pages p WHERE p.shop_id = v.shop_id;
ALTER TABLE preview_sessions ENABLE TRIGGER preview_immutable;
ALTER TABLE preview_sessions ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE preview_sessions ADD FOREIGN KEY (shop_id, page_id) REFERENCES pages (shop_id, id);

-- Thẻ NFC thuộc một trang. Chuyển thẻ giữa các trang là câu hỏi còn mở (`goi-va-trang.md` mục 9): chưa có đường nào.
ALTER TABLE tags ADD COLUMN page_id uuid;
UPDATE tags t SET page_id = p.id FROM pages p WHERE p.shop_id = t.shop_id;
ALTER TABLE tags ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE tags ADD FOREIGN KEY (shop_id, page_id) REFERENCES pages (shop_id, id);
CREATE INDEX tags_page ON tags (page_id);

-- Nội dung thuộc TRANG (Tài 25/09: nhân bản từ pack gốc rồi "nhập dữ liệu từ trang khác"). Tên bảng giữ nguyên: đổi
-- tên thì trang khách của mã cũ sập trong khoảng giữa migration và deploy — đúng lỗi của lát 022.
ALTER TABLE shop_profile ADD COLUMN page_id uuid;
UPDATE shop_profile f SET page_id = p.id FROM pages p WHERE p.shop_id = f.shop_id;
-- Hồ sơ của quán chưa từng có trang (không bản nháp, không thẻ) không thuộc trang nào: bỏ.
DELETE FROM shop_profile WHERE page_id IS NULL;
ALTER TABLE shop_profile ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE shop_profile DROP CONSTRAINT shop_profile_pkey;
ALTER TABLE shop_profile ADD PRIMARY KEY (page_id);
ALTER TABLE shop_profile ADD FOREIGN KEY (shop_id, page_id) REFERENCES pages (shop_id, id);

-- Hồ sơ sinh ra cùng TRANG, không cùng quán nữa: tên và link Google lấy từ quán lúc tạo trang.
DROP TRIGGER shops_seed_profile ON shops;
DROP FUNCTION shop_profile_seed();
CREATE FUNCTION page_profile_seed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shop_profile (shop_id, page_id, name, google_url, question_vi, question_en)
  SELECT NEW.shop_id, NEW.id, s.name, s.google_url, 'Trải nghiệm hôm nay của bạn thế nào?', 'How was your experience today?'
  FROM shops s WHERE s.id = NEW.shop_id
  ON CONFLICT (page_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER pages_seed_profile AFTER INSERT ON pages FOR EACH ROW EXECUTE FUNCTION page_profile_seed();

-- Quán "đang chạy" không còn buộc phải có một bản phát hành của riêng nó: bản phát hành thuộc trang.
ALTER TABLE shops DROP CONSTRAINT active_shop_release;

-- Link là vĩnh viễn: không xoá trang, không đổi link, quán hay khoá lượt ghé của nó.
CREATE FUNCTION page_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PAGE_PERMANENT' USING ERRCODE = '23514'; END IF;
  IF NEW.id <> OLD.id OR NEW.shop_id <> OLD.shop_id OR NEW.slug <> OLD.slug OR NEW.entry_key <> OLD.entry_key
    THEN RAISE EXCEPTION 'PAGE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pages_identity BEFORE UPDATE OR DELETE ON pages FOR EACH ROW EXECUTE FUNCTION page_identity();
