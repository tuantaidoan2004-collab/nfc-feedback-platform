-- Tab Thanh toán, bản đầu (lát P5b-lite; Tài chốt 27/09, `docs/ui-ux-nguon-tham-khao.md` mục 5H): không cổng thanh toán.
-- Chủ quán chuyển khoản theo mã QR của Tài, chụp biên lai gửi Zalo; Tài bấm "ghi nhận" ở /gov.
--
-- Dữ liệu nhận tiền của Tài (ngân hàng, chủ tài khoản, số tài khoản, Zalo, ảnh QR) nằm ở ĐÂY, do Tài tự nhập ở /gov —
-- không bao giờ trong mã hay GitHub (AGENTS.md).
--
-- Mỗi lần ghi nhận là một hàng không sửa không xoá được: ghi nhầm thì ghi một hàng mới, và hàng MỚI NHẤT quyết định quán
-- đã trả (hay được dùng thử) tới ngày nào. Chưa có gì tự tạm ngừng khi quá hạn: việc đó Tài quyết sau.
--
-- Gỡ: DROP TABLE shop_payments; DROP TABLE platform_settings; và xoá '031_billing' khỏi schema_migrations.
CREATE TABLE platform_settings (
  key text PRIMARY KEY CHECK (key IN ('payment')),
  -- Ảnh QR đi kèm dạng data URL (lib/admin/billing.ts giới hạn cỡ), nên giới hạn cả hàng ở đây.
  value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object' AND pg_column_size(value) <= 700000),
  updated_by uuid NOT NULL REFERENCES platform_admins(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE shop_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  -- 'trial': Tài cho dùng miễn phí tới một ngày; 'payment': một khoản đã nhận.
  kind text NOT NULL CHECK (kind IN ('trial', 'payment')),
  amount_vnd integer NOT NULL CHECK (amount_vnd BETWEEN 0 AND 100000000),
  covers_until date NOT NULL,
  note text CHECK (note IS NULL OR (length(btrim(note)) BETWEEN 1 AND 200 AND note !~ '[[:cntrl:]<>]')),
  recorded_by uuid NOT NULL REFERENCES platform_admins(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (kind = 'payment' OR amount_vnd = 0)
);
CREATE INDEX shop_payments_latest ON shop_payments (shop_id, recorded_at DESC, id);
CREATE TRIGGER shop_payments_immutable BEFORE UPDATE OR DELETE ON shop_payments FOR EACH ROW EXECUTE FUNCTION publishing_immutable();
