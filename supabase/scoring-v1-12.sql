-- Scoring v1.12.0 (docs/review-scoring-plan.md, Stage 2). Yes/no facts
-- only — never review text, reviewer names, star ratings or dates.
--
-- From Google Place Details at each scan:
--   has_recent_review           true = a review Google shows is from the last
--                               90 days; null = couldn't confirm (Google shows
--                               only a few reviews) or not checked yet.
--   listing_has_accessibility / listing_has_payment / listing_has_parking
--                               the listing shows that info at all
--                               ("Customer details on your listing").
--   pure_service_area_business  no storefront (no parking part).
--
-- From the owner's own connected Google Business Profile (the reply check,
-- lib/gbpReplyCounts.server.ts) — copied here so every page scores the same;
-- cleared on disconnect (and when Google needs reconnecting). Never used for
-- competitors or any other business:
--   gbp_reviews_in_window, gbp_replied, gbp_has_recent_review
--
-- Run once in the Supabase SQL editor before scoring v1.12.0 goes live.
-- Safe to run again. Until it's run, scans save without these columns and
-- the new checks are left out ("not checked yet").

alter table public.businesses add column if not exists has_recent_review boolean;
alter table public.businesses add column if not exists listing_has_accessibility boolean;
alter table public.businesses add column if not exists listing_has_payment boolean;
alter table public.businesses add column if not exists listing_has_parking boolean;
alter table public.businesses add column if not exists pure_service_area_business boolean;
alter table public.businesses add column if not exists gbp_reviews_in_window integer;
alter table public.businesses add column if not exists gbp_replied integer;
alter table public.businesses add column if not exists gbp_has_recent_review boolean;

notify pgrst, 'reload schema';
