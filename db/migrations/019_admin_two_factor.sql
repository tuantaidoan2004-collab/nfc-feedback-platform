-- Second factor for platform administrators (lát A2, Tài 2026-09-20). One administrator reaches every shop, so a
-- stolen password must not be enough on its own.
--
-- The secret is stored encrypted (AES-256-GCM under NFC_TOTP_KEY, `iv:tag:ciphertext` in hex), not in the clear:
-- whoever can read this table would otherwise be able to produce valid codes, which is exactly the situation the
-- second factor exists for.
--
-- A secret without `enrolled_at` is an enrolment in progress: the person has the secret in their app but has not
-- yet proved a code from it works. That state deliberately does NOT demand a code at login -- otherwise starting
-- an enrolment and closing the tab would lock the only administrator out of the platform. Only `enrolled_at`
-- turns the second factor on, and it is set in the same statement that proves a code was correct.
ALTER TABLE platform_admins
 -- PostgreSQL refuses a regex repetition count above 255, so the body is bounded by length(), not by the pattern.
 ADD COLUMN totp_secret text CHECK (totp_secret ~ '^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$' AND length(totp_secret) BETWEEN 90 AND 600),
 ADD COLUMN totp_enrolled_at timestamptz CHECK (isfinite(totp_enrolled_at)),
 ADD CONSTRAINT platform_admins_totp_enrolled_needs_secret CHECK (totp_enrolled_at IS NULL OR totp_secret IS NOT NULL);

-- Ten single-use codes, kept as hashes for the same reason session tokens are: the database never holds anything
-- that can be presented as-is. A used code keeps its row so the record of when it was spent survives.
CREATE TABLE admin_backup_codes (
 code_hash text PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
 admin_id uuid NOT NULL REFERENCES platform_admins(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 used_at timestamptz CHECK (isfinite(used_at) AND used_at >= created_at)
);
CREATE INDEX admin_backup_codes_unused ON admin_backup_codes(admin_id) WHERE used_at IS NULL;

-- A code is valid for thirty seconds, which is thirty seconds in which someone who read it over a shoulder could
-- use it too. Recording the step spends it: the same code never works twice, even inside its own window.
CREATE TABLE admin_totp_steps (
 admin_id uuid NOT NULL REFERENCES platform_admins(id),
 step bigint NOT NULL CHECK (step > 0),
 used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (admin_id, step)
);
