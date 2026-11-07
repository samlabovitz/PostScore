-- The onboarding lookup's per-user limit (app/api/places/lookup —
-- lib/onboardingLookupBudget.ts): each lookup writes a 0-call
-- "onboarding_lookup" row with the signed-in user's id, and a user gets 20
-- in any 24 hours. Until this is run, the limit is skipped (the monthly
-- ceiling PLACES_ONBOARDING_MONTHLY_CAP still applies).
-- Written only by the server (service role); owners never read it.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.places_calls
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists places_calls_user_kind_created_idx
  on public.places_calls (user_id, kind, created_at)
  where user_id is not null;
