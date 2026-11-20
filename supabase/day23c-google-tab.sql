-- Day 23C: Google Profile tab upgrades.
--
-- gbp_connections.photo_categories: the photo TYPES the listing has on
--   Google (INTERIOR, AT_WORK, TEAMS…, from the v4 media list's
--   locationAssociation.category), so "Add 3 photos this week" can name the
--   types that are missing. Only the type names are kept — never the photos.
--   It lives on the connection row, so disconnecting removes it.
--
-- businesses.visit_share: the owner's own "how many of these become paying
--   visits" for the Google Profile tab's revenue estimate (0–1, e.g. 0.5 for
--   about half). null = PostScore's default range (a third to all).
--
-- "Since you did this" stores nothing new: the daily numbers are read live
-- from Google when the card opens.

alter table public.gbp_connections
  add column if not exists photo_categories text[]
    check (photo_categories is null or cardinality(photo_categories) <= 20);

alter table public.businesses
  add column if not exists visit_share numeric
    check (visit_share is null or (visit_share > 0 and visit_share <= 1));

notify pgrst, 'reload schema';
