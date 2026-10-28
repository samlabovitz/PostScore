-- Scoring v1.12.0, finishing changes (docs/review-scoring-plan.md):
-- recency by how many recent reviews, and owner-entered customer details.
-- Counts and yes/no facts only — never review text, reviewer names, star
-- ratings or dates.
--
-- Recent reviews (the last 90 days), stored only as a bucket:
-- 0, 1, 2 or 3 (= 3 or more).
--   businesses.recent_reviews_seen   among the few reviews (at most 5)
--                                    Google Place Details returns — a
--                                    lower bound ("at least N"); null = not
--                                    checked yet.
--   businesses.gbp_recent_reviews    from the owner's own connected Google
--                                    Business Profile — the exact count
--                                    (bucketed). Cleared on disconnect.
--   gbp_connections.reply_recent_reviews  the same bucket, kept with the
--                                    reply counts.
--
-- Owner-entered ("Added by you") — removes that part from "Customer
-- details on your listing":
--   businesses.owner_no_parking      no parking of any kind at or near
--                                    the business.
--   businesses.owner_no_payment      no payments taken on site.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- scans save without these columns and recency falls back to the yes/no
-- fact from supabase/scoring-v1-12.sql.

alter table public.businesses add column if not exists recent_reviews_seen smallint;
alter table public.businesses add column if not exists gbp_recent_reviews smallint;
alter table public.gbp_connections add column if not exists reply_recent_reviews smallint;
alter table public.businesses add column if not exists owner_no_parking boolean not null default false;
alter table public.businesses add column if not exists owner_no_payment boolean not null default false;

alter table public.businesses drop constraint if exists businesses_recent_reviews_seen_bucket;
alter table public.businesses add constraint businesses_recent_reviews_seen_bucket check (recent_reviews_seen between 0 and 3);
alter table public.businesses drop constraint if exists businesses_gbp_recent_reviews_bucket;
alter table public.businesses add constraint businesses_gbp_recent_reviews_bucket check (gbp_recent_reviews between 0 and 3);
alter table public.gbp_connections drop constraint if exists gbp_connections_reply_recent_reviews_bucket;
alter table public.gbp_connections add constraint gbp_connections_reply_recent_reviews_bucket check (reply_recent_reviews between 0 and 3);

notify pgrst, 'reload schema';
