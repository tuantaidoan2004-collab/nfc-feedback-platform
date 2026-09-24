-- Gỡ cửa duyệt ảnh. Chạy trong một transaction, và CHỈ sau khi đã đưa ứng dụng về bản trước lát cửa duyệt ảnh:
-- mã mới đọc bảng này ở mỗi lần phát hành, nên gỡ bảng khi mã mới còn chạy là mọi lần phát hành đều lỗi.
-- Mất: hàng đợi ảnh chờ duyệt và lịch sử quyết định. Trang khách không mất gì (ảnh nằm trong cấu hình trang, không ở đây).
DROP TABLE media_assets;
