-- Starter website: the business details the owner confirmed or edited
-- (Website page → starter-site builder → "Your business details" →
-- "Confirm details"). The builder pre-fills them from the Google listing;
-- only these confirmed values go on the owner's own website, stored as
-- "provided by you" (first-party data; see
-- docs/google-maps-support-reply-2026-10-21.md and the compliance section
-- of docs/product-structure.md).
--
-- Website only: lib/scoring.ts never reads this column.
-- Shape: lib/starterSiteDetails.ts (StarterSiteDetails) —
--   { "name": "≤ 100", "category": "≤ 60", "address": "≤ 200",
--     "phone": "≤ 40", "confirmedAt": "ISO timestamp" }
-- null = not confirmed yet (the download waits for it).
--
-- Run once in the Supabase SQL editor. Safe to run again. The existing
-- businesses RLS policies (owner can select/update their own row) cover it.

alter table public.businesses
  add column if not exists starter_site_details jsonb;

comment on column public.businesses.starter_site_details is
  'Owner-confirmed name/type/address/phone for the starter website only (lib/starterSiteDetails.ts), provided by the owner. Never used for scoring.';
