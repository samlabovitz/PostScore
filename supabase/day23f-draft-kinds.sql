-- Day 23F: post_drafts may also keep the "Your questions, answered" post,
-- the offer post and the description drafts written from the owner's
-- request ("Tell PostScore what you want"), so Grow's 3 custom drafts a
-- week are counted across all of them. Still only text PostScore wrote —
-- never anything from Google.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.post_drafts drop constraint if exists post_drafts_kind_check;
alter table public.post_drafts
  add constraint post_drafts_kind_check
  check (kind in ('week', 'another', 'good_to_know', 'qa', 'offer', 'description'));

notify pgrst, 'reload schema';
