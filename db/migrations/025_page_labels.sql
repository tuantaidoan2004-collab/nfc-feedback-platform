-- Tên trang cho chủ quán (lát P3, `docs/goi-va-trang.md` mục 3): "Phòng VIP", "Bàn 1", "Quầy bar". Chỉ hiện trong
-- dashboard; khách không bao giờ thấy nó (tên quán trên trang khách nằm trong nội dung của trang).
-- Chỉ thêm, có giá trị mặc định: mã đang chạy không biết cột này và vẫn chạy như cũ.
-- Độ dài kiểm bằng `length`, không bằng số lặp trong regex (bẫy A2/022).
ALTER TABLE pages ADD COLUMN label text NOT NULL DEFAULT '' CHECK (length(label) <= 60 AND label !~ '[[:cntrl:]<>]');
