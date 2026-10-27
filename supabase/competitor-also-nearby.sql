-- Competitors page: "Also nearby, with few or no reviews yet"
-- (lib/competitorQuality.ts alsoNearby). Up to 3 closer listings of the
-- business's own kind a competitor scan found but didn't pick for having
-- few or no reviews — name, distance and review count only, never ranked
-- or scored. Saved as JSON on the business's own row of each scan (the
-- is_subject row), so nothing else in competitor_scans changes.
--
-- Until this is run, scans save without it and the page works it out from
-- the business's earlier saved scans instead.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.competitor_scans add column if not exists also_nearby_json jsonb;

notify pgrst, 'reload schema';
