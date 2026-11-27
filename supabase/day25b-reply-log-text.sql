-- Day 25B (Nov 27): keep the reply text PostScore itself sent, so a reply Google is slow to show can be shown as
-- "Posted · waiting for Google to show it" with the words we sent — and never drafted or posted again by mistake.
-- This is PostScore's own text (the owner's approved reply), never the review's text.
-- Additive only: one nullable column. Nothing is backfilled here.

alter table public.gbp_review_reply_log
  add column if not exists reply_text text check (reply_text is null or char_length(reply_text) <= 4096);

notify pgrst, 'reload schema';
