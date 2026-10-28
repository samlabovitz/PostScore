-- "Yes, we've closed": the owner archives a business that Google shows as
-- closed. While archived_at is set, PostScore stops re-scanning it
-- (owner, monthly and bulk), stops its monthly report and competitor
-- scans, and PostAI won't answer for it. Restoring clears it.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- the "Yes, we've closed" button says it isn't available yet.

alter table public.businesses add column if not exists archived_at timestamptz;

notify pgrst, 'reload schema';
