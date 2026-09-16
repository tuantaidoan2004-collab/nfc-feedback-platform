-- Run in a transaction; never discard contact addresses or the record of links that were issued.
LOCK TABLE owner_identities_v2,owner_setup_tokens IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM owner_setup_tokens) OR EXISTS(SELECT 1 FROM owner_identities_v2 WHERE email IS NOT NULL)
 THEN RAISE EXCEPTION 'OWNER_SETUP_DATA_EXISTS'; END IF;
END $$;
DROP TABLE owner_setup_tokens;
DROP INDEX owner_identity_email;
ALTER TABLE owner_identities_v2 DROP COLUMN email;
