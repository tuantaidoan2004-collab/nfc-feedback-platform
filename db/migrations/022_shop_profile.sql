-- Khuôn là ổ cắm, tài khoản là phích (Tài chốt 23/09/2026; `docs/decisions.md` mục 11).
--
-- Tài nêu bằng một ví dụ: tài khoản `4raushop` đã có sẵn link trang sao; khi nó đăng nhập vào một bản nhân bản
-- rỗng của khuôn, link đó phải **tự** chui vào nút Google đang rỗng. Không gõ lại, không chép tay.
--
-- Hôm nay điều đó không xảy ra, vì nội dung của tài khoản đang nằm trong `page_releases.config_snapshot` —
-- tức là nằm trong bản chụp của khuôn. Đổi khuôn là chép lại từ đầu. Bảng này đem nội dung về đúng chỗ của nó:
-- tài khoản sở hữu nội dung, khuôn sở hữu diện mạo, trang khách ghép hai thứ lúc render.
--
-- Bản chụp release KHÔNG bị đụng tới. Nó vẫn là hồ sơ lịch sử bất biến của lần phát hành đó; chỉ có lớp đọc
-- lấy các trường thuộc về tài khoản từ bảng này thay vì từ bản chụp. Nhờ vậy một trang phát hành hôm qua
-- không rớt đài vì một luật thêm hôm nay (cùng nguyên tắc với lát F-013).
CREATE TABLE shop_profile (
  shop_id uuid PRIMARY KEY REFERENCES shops(id),
  -- Tên quán hiện trên trang khách. Cùng giới hạn với `validateConfig`, để hai đường không lệch nhau.
  -- Độ dài kiểm bằng `length`, KHÔNG bằng số lặp trong regex: PostgreSQL từ chối số lặp lớn hơn 255
  -- (`invalid repetition count(s)`). Bẫy này đã ghi ở `operations-gotchas.md` từ lát A2 và vẫn dẫm lại ở 022.
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100 AND name !~ '[[:cntrl:]<>]'),
  -- NULL nghĩa là tài khoản chưa cấp link Google. Trang khách vẫn dựng, nút Google hiện ở trạng thái tắt —
  -- nó không bao giờ biến mất, vì "lời mời giống hệt nhau với mọi khách" là luật cứng.
  google_url text CHECK (google_url IS NULL OR (length(google_url) <= 2048
    AND google_url ~ '^https://' AND google_url !~ '[[:space:]<>]')),
  question_vi text NOT NULL CHECK (length(question_vi) BETWEEN 1 AND 180),
  question_en text NOT NULL CHECK (length(question_en) BETWEEN 1 AND 180),
  -- Tối đa 6, khớp trần của `validateConfig`. Bố cục có cách bày riêng cho từng số lượng 1..6
  -- (`components/coats.css` mục 10), nên con số này là một ràng buộc thiết kế chứ không phải con số tuỳ tiện.
  links jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(links) = 'array' AND jsonb_array_length(links) <= 6),
  logo jsonb CHECK (logo IS NULL OR jsonb_typeof(logo) = 'object'),
  poster jsonb CHECK (poster IS NULL OR jsonb_typeof(poster) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Chuyển nội dung đang nằm trong bản phát hành đang chạy về tài khoản. Shop chưa phát hành lần nào thì lấy từ
-- chính bảng `shops`, nơi tên và link Google vốn đã có cột riêng từ migration 001.
-- `NULLIF(..., 'null')` vì toán tử `->` trả về JSON null chứ không trả về SQL NULL.
INSERT INTO shop_profile (shop_id, name, google_url, question_vi, question_en, links, logo, poster)
SELECT
  s.id,
  COALESCE(NULLIF(r.config_snapshot ->> 'name', ''), s.name),
  COALESCE(NULLIF(r.config_snapshot ->> 'googleUrl', ''), s.google_url),
  COALESCE(NULLIF(r.config_snapshot -> 'text' -> 'question' ->> 'vi', ''), 'Trải nghiệm hôm nay của bạn thế nào?'),
  COALESCE(NULLIF(r.config_snapshot -> 'text' -> 'question' ->> 'en', ''), 'How was your experience today?'),
  COALESCE(NULLIF(r.config_snapshot -> 'links', 'null'::jsonb), '[]'::jsonb),
  NULLIF(r.config_snapshot -> 'logo', 'null'::jsonb),
  NULLIF(r.config_snapshot -> 'poster', 'null'::jsonb)
FROM shops s
LEFT JOIN page_releases r ON r.shop_id = s.id AND r.id = s.active_release_id;

-- Một shop mới phải có hồ sơ ngay, kể cả trước khi ai kịp mở dashboard: trang khách đọc bảng này.
CREATE FUNCTION shop_profile_seed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shop_profile (shop_id, name, google_url, question_vi, question_en)
  VALUES (NEW.id, NEW.name, NEW.google_url,
          'Trải nghiệm hôm nay của bạn thế nào?', 'How was your experience today?')
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER shops_seed_profile AFTER INSERT ON shops
  FOR EACH ROW EXECUTE FUNCTION shop_profile_seed();
