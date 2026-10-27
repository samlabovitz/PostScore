-- Google Business Profile connect — Step 2b: all-time reply counts
-- (lib/gbpReplyCounts.server.ts, lib/gbpReviewReplies.ts).
--
-- Alongside the recent-window counts (supabase/gbp-reply-counts.sql), how
-- many of the business's reviews have a reply, all time — newest first,
-- capped at the newest 500 (reply_all_time_capped = true when there were
-- more). Counts only: never review text, reply text, reviewer names, star
-- ratings or dates. On the gbp_connections row, so disconnect deletes
-- them. Shown to the owner, never scored (v1.12.0 scores the recent
-- window only). Never used for competitors or other businesses.
--
-- Run once in the Supabase SQL editor (after supabase/gbp-reply-counts.sql).
-- Safe to run again.

alter table public.gbp_connections add column if not exists reply_all_time_reviews integer;
alter table public.gbp_connections add column if not exists reply_all_time_replied integer;
alter table public.gbp_connections add column if not exists reply_all_time_capped boolean;

notify pgrst, 'reload schema';
