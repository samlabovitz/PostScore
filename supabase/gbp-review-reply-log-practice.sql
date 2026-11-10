-- Review replies practice mode (lib/gbpReviewPractice.ts): log rows from
-- the fake, in-memory Google get status 'practice' (the outcome is kept in
-- error_reason: 'ok', 'failed:INVALID_ARGUMENT', 'unconfirmed:…'), so they
-- never mix with real posts, edits and deletes.
--
-- Run once in the Supabase SQL editor, after gbp-review-reply-log.sql.
-- Safe to run again.

alter table public.gbp_review_reply_log drop constraint if exists gbp_review_reply_log_status_check;
alter table public.gbp_review_reply_log
  add constraint gbp_review_reply_log_status_check check (status in ('ok', 'unconfirmed', 'failed', 'practice'));

notify pgrst, 'reload schema';
