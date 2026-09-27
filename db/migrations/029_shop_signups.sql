-- Tự tạo tài khoản, chờ duyệt (lát D4b, Tài 27/09: "chờ duyệt").
--
-- Chủ quán dựng trang ở /bat-dau rồi bấm "Lưu trang của tôi": tài khoản chủ quán được tạo ngay (@handle, email, mật khẩu
-- họ tự chọn), còn trang của quán nằm ở đây, CHỜ admin duyệt. Chưa có shop, chưa có trang, chưa có thẻ cho tới khi được
-- duyệt: một người lạ không thể đặt tên quán lên tên miền của nền tảng mà không qua mắt Tài. Duyệt thì /gov tạo shop từ
-- đúng những gì ở đây (như "Tạo shop mới"), từ chối thì tài khoản bị khoá.
--
-- Không đụng bảng nào đang có. Gỡ: DROP TABLE shop_signups; và xoá '029_shop_signups' khỏi schema_migrations.
CREATE TABLE shop_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES owner_identities_v2(id),
  -- Bản nháp đã ký ở /thu/<mã>: tên quán, template, và ba câu trả lời (lib/start/draft.ts).
  shop_name text NOT NULL CHECK (char_length(shop_name) BETWEEN 1 AND 60 AND shop_name !~ '[[:cntrl:]<>]'),
  template_key text NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9-]*$' AND length(template_key) <= 64),
  kind text CHECK (kind IN ('cafe', 'food', 'spa', 'bar', 'other')),
  hours text[] NOT NULL DEFAULT '{}' CHECK (hours <@ ARRAY['morning', 'noon', 'afternoon', 'evening', 'late']),
  goals text[] NOT NULL DEFAULT '{}' CHECK (goals <@ ARRAY['google', 'complaints', 'page', 'cards']),
  -- Số Zalo chủ quán tự để lại để được báo khi trang được duyệt. Chỉ admin thấy; không phải số của khách.
  zalo text CHECK (zalo IS NULL OR (zalo ~ '^[0-9]+$' AND length(zalo) BETWEEN 8 AND 15)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decision text CHECK (decision IN ('approved', 'rejected')),
  decided_at timestamptz,
  decided_by uuid REFERENCES platform_admins(id),
  -- Shop được tạo khi duyệt. Null ở một hồ sơ đã duyệt nghĩa là lượt tạo shop dừng giữa chừng: bấm Duyệt lại là tạo tiếp.
  shop_id uuid UNIQUE REFERENCES shops(id),
  CHECK ((decision IS NULL) = (decided_at IS NULL) AND (decision IS NULL) = (decided_by IS NULL)),
  CHECK (shop_id IS NULL OR decision = 'approved')
);
CREATE INDEX shop_signups_waiting ON shop_signups(created_at) WHERE decision IS NULL OR (decision = 'approved' AND shop_id IS NULL);
