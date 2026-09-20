-- Flood control for the guest page API (lát A1, Tài 2026-09-20). Counting alone cannot tell a busy shop from a bot:
-- Tài puts a peak minute at well over 30 taps on one card, so the thresholds are wide and a second, different signal
-- -- how fast the answer came after the page opened -- carries the rest.
--
-- Its own table, not owner_login_limits: a flood on the guest page must never use up the buckets owner login and
-- setup share, which is the same reason 005 gave the administrator buckets a table of their own.
CREATE TABLE public_request_limits (
 bucket text PRIMARY KEY CHECK (length(btrim(bucket)) BETWEEN 1 AND 128),
 window_start timestamptz NOT NULL CHECK (isfinite(window_start)),
 attempts integer NOT NULL CHECK (attempts > 0)
);
-- The mark sits on the session, not on the rating: one bot session inflates the touch count, the star average and
-- the feedback count alike, so one flag has to take all three out of the shop's numbers at once. Nothing is refused
-- and nothing is deleted (Tài, 2026-09-20): a real customer standing in a crowd still gets their say, the shop can
-- look at what was marked, and the numbers stay clean meanwhile.
ALTER TABLE visit_sessions
 ADD COLUMN suspected_at timestamptz CHECK (isfinite(suspected_at)),
 ADD COLUMN suspected_reason text CHECK (suspected_reason ~ '^[a-z][a-z0-9_]{0,31}$'),
 ADD CONSTRAINT visit_sessions_suspected_pair CHECK ((suspected_at IS NULL) = (suspected_reason IS NULL));
CREATE INDEX visit_sessions_suspected ON visit_sessions(shop_id,scope) WHERE suspected_at IS NOT NULL;
