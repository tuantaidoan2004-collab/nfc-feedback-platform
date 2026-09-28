-- Đăng nhập bằng Google cho chủ quán (lát D4c, Tài 27/09 ý 2; OAuth client "QuiteSensational" Tài tạo 28/09).
--
-- Một tài khoản chủ quán nối với nhiều nhất một tài khoản Google, và ngược lại: `google_sub` là mã Google trả trong ID
-- token, không bao giờ đổi, không phải email. Nối chỉ xảy ra theo hai cách: lưu trang ở /bat-dau bằng Google (tài khoản
-- mới), hoặc bấm "Kết nối Google" trong Hồ sơ khi đang đăng nhập. KHÔNG tự nối theo email: email của tài khoản cũ do
-- người khác gõ vào, chưa ai xác minh (lib/owner/google.ts).
--
-- Gỡ: ALTER TABLE owner_identities_v2 DROP COLUMN google_sub; và xoá '032_google_sign_in' khỏi schema_migrations.
ALTER TABLE owner_identities_v2 ADD COLUMN google_sub text UNIQUE
  CHECK (google_sub IS NULL OR (google_sub ~ '^[0-9]+$' AND length(google_sub) BETWEEN 1 AND 255));
