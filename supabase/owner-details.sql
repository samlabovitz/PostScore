-- Day 23 2d-3: the business details the OWNER confirmed or edited
-- (Settings → "Your business details", or the one-line "Confirm your
-- business details" prompt). The card is pre-filled from a live read of
-- the listing (lib/ownerListing.server.ts); only what the owner confirms
-- is saved, as "provided by you" (first-party data, like
-- starter_site_details and owner_website_url). Google's own values are
-- never saved (Day 23).
--
-- The header, the business switcher, emails and Print studio show these
-- once confirmed; until then they show the listing as read live.
-- lib/scoring.ts never reads them.
--
-- - owner_details: lib/ownerDetails.ts (OwnerDetails) —
--     { "name": "≤ 100", "address": "≤ 200", "phone": "≤ 40",
--       "hours": ["Monday: 9:00 AM – 5:00 PM", …] | null }
--   null = not confirmed yet (the prompt shows).
-- - owner_details_confirmed_at: when the owner last confirmed them.
--
-- Written by the server (app/actions/ownerDetails.ts) for the signed-in
-- owner; the existing businesses RLS policies (owner can select/update
-- their own row) cover it.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- the card says it isn't available yet and nothing else changes.

alter table public.businesses
  add column if not exists owner_details jsonb,
  add column if not exists owner_details_confirmed_at timestamptz;

comment on column public.businesses.owner_details is
  'Owner-confirmed name/address/phone/hours (lib/ownerDetails.ts), provided by the owner. Never used for scoring.';

notify pgrst, 'reload schema';
