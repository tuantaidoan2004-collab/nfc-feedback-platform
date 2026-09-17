-- Run in a transaction; refuse while a template shop exists, since dropping the flag would turn it into a plain shop.
LOCK TABLE shops IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM shops WHERE is_template) THEN RAISE EXCEPTION 'TEMPLATE_SHOP_EXISTS'; END IF;
END $$;
DROP INDEX shops_one_template;
ALTER TABLE shops DROP COLUMN is_template;
