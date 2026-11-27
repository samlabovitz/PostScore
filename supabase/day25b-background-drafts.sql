-- Day 25B §2d: the weekly Google post and the answers (description) drafts
-- are written in the background like the review replies (the daily job, and
-- after a scan), saved, and only READ by pages, so a page with a saved draft
-- shows it at once instead of "Getting drafts ready…".
--
-- The weekly post already has its home: post_drafts, kind 'week' (one per
-- business, week and language). This adds one kind:
--   'answers_description': the Google listing description PostScore drafted
--   in the background for the answers card (now on Presence → Google
--   listing). Until now it lived only in the server's memory for a day.
-- It is written by PostScore itself, never at the owner's request, so it does
-- not count toward Grow's 3 own drafts a week (those count 'another', 'qa',
-- 'offer' and 'description' only).
--
-- Still only text PostScore wrote — never anything from Google (the current
-- description and services are read live when shown).
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run, the
-- description draft keeps working as today (written when the page opens).

alter table public.post_drafts drop constraint if exists post_drafts_kind_check;
alter table public.post_drafts
  add constraint post_drafts_kind_check
  check (kind in ('week', 'another', 'good_to_know', 'qa', 'offer', 'description', 'answers_description'));

notify pgrst, 'reload schema';
