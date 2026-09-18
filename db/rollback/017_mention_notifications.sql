-- Run in a transaction; refuse while anyone has a notification, since dropping the table would erase their inbox.
LOCK TABLE owner_notifications, shops IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM owner_notifications) THEN RAISE EXCEPTION 'NOTIFICATIONS_PRESENT: keep migration 017 and roll the application back instead'; END IF;
END $$;
DROP TABLE owner_notifications;
ALTER TABLE shops DROP CONSTRAINT shops_account_routes_reserved;
ALTER TABLE shops ADD CONSTRAINT shops_account_routes_reserved CHECK(lower(slug) NOT IN ('profile','password','login','logout','setup'));
