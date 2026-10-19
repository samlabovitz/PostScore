-- Starter website: hours the owner enters for their website (Website page
-- → starter-site builder → "Add your hours" / "Edit for the website").
--
-- Stored on the business row so they're there next visit. Website only:
-- lib/scoring.ts never reads this column, so it can never count toward
-- the Google listing part of PostScore (only Google's own hours do).
-- Shape: lib/ownerHours.ts (OwnerHours) —
--   { "mode": "weekly" | "appointment",
--     "days": [7 × { "open": bool, "allDay": bool,
--                    "ranges": [{ "open": "HH:MM", "close": "HH:MM" }, …up to 2] }],  -- Monday first
--     "note": "≤ 80 characters" }
-- null = the owner hasn't entered any (the site uses Google's hours, if any).
--
-- Run once in the Supabase SQL editor. Safe to run again. The existing
-- businesses RLS policies (owner can select/update their own row) cover it.

alter table public.businesses
  add column if not exists starter_site_hours jsonb;

comment on column public.businesses.starter_site_hours is
  'Owner-entered hours for the starter website only (lib/ownerHours.ts). Never used for scoring.';
