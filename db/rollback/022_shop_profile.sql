-- Gỡ bảng hồ sơ tài khoản. An toàn vì bảng này chỉ **che** các trường trong bản chụp release chứ không thay
-- thế chúng: `page_releases.config_snapshot` vẫn giữ nguyên tên, link Google, câu hỏi và danh sách link của
-- lần phát hành đó. Gỡ xong, lớp đọc quay về đọc thẳng bản chụp như trước migration 022.
--
-- Cái MẤT khi gỡ: mọi sửa nội dung mà chủ quán thực hiện sau lần phát hành cuối. Chúng chỉ nằm ở bảng này.
-- Vì vậy từ chối gỡ nếu có hồ sơ nào mới hơn bản phát hành đang chạy — người vận hành phải phát hành lại
-- trước, để nội dung mới nhất được ghi vào một bản chụp rồi mới rút bảng đi.
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM shop_profile p
   JOIN shops s ON s.id = p.shop_id
   JOIN page_releases r ON r.id = s.active_release_id
   WHERE p.updated_at > r.created_at
 ) THEN
   RAISE EXCEPTION 'PROFILE_NEWER_THAN_RELEASE: publish each shop once before rolling 022 back, or the edits are lost';
 END IF;
END $$;
DROP TRIGGER shops_seed_profile ON shops;
DROP FUNCTION shop_profile_seed();
DROP TABLE shop_profile;
