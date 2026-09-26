-- Gỡ 028. Chạy trong một transaction, chỉ sau khi đưa ứng dụng về bản trước lát A3. Dựng lại bảng, cột và view đời cũ
-- ở dạng rỗng, đúng như 001 và 027. Mất: shop `caphe-demo` nếu 028 đã xoá nó (shop giả, không trang, không dữ liệu).
ALTER TABLE shops ADD COLUMN hero_key text, ADD COLUMN hero_kind text CHECK (hero_kind IN ('image','video'));
CREATE TABLE owner_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE memberships (
 user_id uuid REFERENCES owner_users(id), shop_id uuid REFERENCES shops(id),
 PRIMARY KEY(user_id,shop_id)
);
CREATE TABLE owner_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES owner_users(id), expires_at timestamptz NOT NULL
);
CREATE TABLE experiences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES shops(id),
 token_hash text NOT NULL, rating smallint CHECK (rating BETWEEN 1 AND 5),
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 message text NOT NULL DEFAULT '' CHECK (length(message)<=2000),
 topic text NOT NULL DEFAULT 'other' CHECK (topic IN ('wait','cut','staff','space','other')),
 status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','progress','resolved')),
 note text NOT NULL DEFAULT '' CHECK (length(note)<=2000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(shop_id,token_hash)
);
CREATE INDEX experiences_shop_updated ON experiences(shop_id,updated_at DESC,id);
CREATE VIEW shop_profile AS SELECT * FROM page_profile;
