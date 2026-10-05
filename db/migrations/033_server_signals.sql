-- Tín hiệu máy chủ (lát B3 phần hai, 29/09): lỗi không lường trước, những gì CSP chặn, lượt ghi của khách bị từ chối — đếm
-- theo ngày (giờ Việt Nam) để Tài xem ở /gov. Log của Vercel Hobby chỉ giữ một giờ, log trên VPS bị xoay vòng; bảng này giữ
-- 30 ngày (dọn ở mỗi lần ghi, lib/admin/signals.ts). KHÔNG BAO GIỜ chứa dữ liệu cá nhân hay chữ do request chọn: `code` do
-- lib/signals.ts dựng từ những danh sách ngắn (tên quy tắc CSP, loại thứ bị chặn, mã lỗi của app, họ trình duyệt).
--
-- Gỡ: DROP TABLE server_signals; và xoá '033_server_signals' khỏi schema_migrations. App không cần bảng này để chạy: thiếu
-- bảng thì việc ghi bị bỏ qua và /gov nói chưa chạy migration.
CREATE TABLE server_signals (
  kind text NOT NULL CHECK (kind IN ('unexpected', 'csp', 'guest_refused')),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 200 AND code ~ '^[A-Za-z0-9_ ?-]+$'),
  day date NOT NULL,
  count bigint NOT NULL CHECK (count > 0),
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL CHECK (last_at >= first_at),
  PRIMARY KEY (kind, code, day)
);
CREATE INDEX server_signals_day ON server_signals (day);
