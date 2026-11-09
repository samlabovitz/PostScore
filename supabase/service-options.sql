-- Online ordering, step 1 (Nov 10): Google's service options — takeout,
-- delivery, curbside pickup, dine-in — saved as Google states them. No
-- points yet: the Google Listing Completeness card shows them as
-- information for food businesses (lib/serviceOptions.ts).
--
-- {"takeout": true, "delivery": false} — only the flags Google gave; a
-- missing one is unknown, never "no". {} = asked, Google gave none.
-- null = not asked yet (saved before this file, or no scan since).
--
-- - businesses.google_service_options: the owner's listing (Place Details).
-- - competitor_scans.service_options: each competitor in a scan (from the
--   same competitor search — no extra call).
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- scans save without them and the card shows nothing new.

alter table public.businesses
  add column if not exists google_service_options jsonb;

alter table public.competitor_scans
  add column if not exists service_options jsonb;

notify pgrst, 'reload schema';
