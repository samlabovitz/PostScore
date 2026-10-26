-- Google Business Profile connect — Step 1: the matched location
-- (lib/gbpLocations.ts, app/api/gbp/callback).
--
-- The connect callback matches the Google location whose Maps place ID is
-- this business's place_id, once, and caches it here so later steps never
-- re-list accounts. google_account_id / google_location_id already exist;
-- this adds the location's own title and one-line address from Google, so
-- the app can show "Connected: {title}, {address}". The owner's own
-- Business Profile data — never review text, reviewer names or anything
-- from other businesses. Deleted with the row on disconnect.
--
-- Run once in the Supabase SQL editor (after supabase/gbp-tokens.sql).
-- Safe to run again.

alter table public.gbp_connections add column if not exists location_title text;
alter table public.gbp_connections add column if not exists location_address text;

notify pgrst, 'reload schema';
