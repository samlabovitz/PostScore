-- Day 23 step 2a: no-regret storage fixes (part 1 — safe to paste now:
-- the live site keeps working with or without it). The private screenshot
-- bucket is its own file, supabase/screenshots-private.sql, pasted only
-- after the signed-URL code is deployed.
--
-- 1. businesses.lat_lng_fetched_at: when lat/lng were last read from
--    Places. Google's Places terms allow keeping coordinates at most 30
--    days; the nightly cleanup (lib/storageCleanup.server.ts) clears them
--    after that and features read them again when needed. Backfilled from
--    each business's latest scan.
-- 2. gbp_review_reply_log.review_id may be null: disconnect clears the
--    Google review ids and keeps the audit row (lib/gbpDataCleanup.server.ts).

alter table public.businesses add column if not exists lat_lng_fetched_at timestamptz;

update public.businesses b
  set lat_lng_fetched_at = coalesce(
    (select max(s.created_at) from public.scores s where s.business_id = b.id),
    b.created_at
  )
  where b.lat is not null and b.lat_lng_fetched_at is null;

alter table public.gbp_review_reply_log alter column review_id drop not null;

notify pgrst, 'reload schema';
