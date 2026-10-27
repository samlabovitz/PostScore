-- Google Business Profile connect — Step 2: review-reply counts
-- (lib/gbpReplyCounts.server.ts, lib/gbpReviewReplies.ts).
--
-- After a connect and on each normal scan, PostScore reads the owner's own
-- Google reviews and keeps ONLY these counts for the business — never
-- review text, reply text, reviewer names, star ratings or exact dates.
-- They live on the business's gbp_connections row, so disconnecting
-- deletes them with it. Never used for competitors or other businesses.
-- Not scored yet (v1.12.0).
--
-- Run once in the Supabase SQL editor (after supabase/gbp-location.sql).
-- Safe to run again.

alter table public.gbp_connections add column if not exists reply_reviews_in_window integer;
alter table public.gbp_connections add column if not exists reply_replied integer;
alter table public.gbp_connections add column if not exists reply_templated_share real;
alter table public.gbp_connections add column if not exists reply_has_recent_review boolean;
alter table public.gbp_connections add column if not exists reply_checked_at timestamptz;

notify pgrst, 'reload schema';
