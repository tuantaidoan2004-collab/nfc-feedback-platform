-- Dọn đời cũ (lát A3, `docs/roadmap-slices.md`). Mã đời 001 — trang khách lưu sao qua cookie, dashboard đăng nhập bằng
-- `owner_sessions`, ảnh bìa ở `shops.hero_key` — đã gỡ cùng lát này; publishing (003) và dashboard v2 (004) thay nó từ lâu.
--
-- Tài đếm trên cả hai branch Neon ngày 26/09: bốn bảng đời cũ đều 0 dòng, không shop nào có `hero_key`. Migration vẫn tự
-- kiểm lại và DỪNG nếu có dữ liệu, để không bao giờ xoá thứ gì chưa ai nhìn thấy.
--
-- Khoảng chờ deploy: mã đang chạy trên production không đọc view `shop_profile` (027 đã chuyển sang `page_profile`) và
-- chỉ đọc bảng / cột đời cũ ở các route đời cũ, vốn không có khách.
DO $$
DECLARE t text; used boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['experiences', 'memberships', 'owner_sessions', 'owner_users'] LOOP
    -- EXECUTE không đặt FOUND; phải lấy kết quả ra biến.
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', t) INTO used;
    IF used THEN RAISE EXCEPTION 'A3: bảng % còn dữ liệu, không xoá', t; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM shops WHERE hero_key IS NOT NULL OR hero_kind IS NOT NULL) THEN
    RAISE EXCEPTION 'A3: còn shop có ảnh bìa đời cũ (hero_key), không xoá';
  END IF;
END $$;

DROP VIEW shop_profile; -- 027 để lại cho khoảng chờ deploy
DROP TABLE owner_sessions, memberships, experiences, owner_users;
ALTER TABLE shops DROP COLUMN hero_key, DROP COLUMN hero_kind;

-- `caphe-demo`: shop demo dựng tay bằng INSERT trước khi có khuôn (16/09), không trang, không chủ. Tài 26/09: "shop giả".
-- Chỉ xoá khi không còn hàng nào ở bất kỳ bảng nào trỏ tới nó; còn thì giữ nguyên (nhật ký admin không xoá được, và
-- không xoá dữ liệu chưa ai xem). Tìm các bảng trỏ tới `shops` theo khoá ngoại, không theo một danh sách viết tay.
DO $$
DECLARE target uuid; c record; used boolean;
BEGIN
  SELECT id INTO target FROM shops s WHERE slug = 'caphe-demo' AND NOT is_template AND publishing_state = 'draft'
    AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.shop_id = s.id);
  IF target IS NULL THEN RETURN; END IF;
  FOR c IN SELECT conrelid::regclass AS tab, a.attname AS col FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    WHERE k.contype = 'f' AND k.confrelid = 'shops'::regclass AND array_length(k.conkey, 1) = 1
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', c.tab, c.col) INTO used USING target;
    IF used THEN RAISE NOTICE 'A3: giữ caphe-demo, còn hàng ở %', c.tab; RETURN; END IF;
  END LOOP;
  DELETE FROM shops WHERE id = target;
END $$;
