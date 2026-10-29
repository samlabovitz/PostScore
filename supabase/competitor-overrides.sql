-- Competitor selection v2: the owner's own choices on the Competitors page
-- (lib/competitorOverrides.ts, app/actions/competitorOverrides.ts).
--   "removed": never picked again by any future scan, with the owner's
--              reason (closed / not really a competitor / other);
--   "added":   found by searching Google by name — always kept.
-- One row per business and place. Only the place ID, its name (to show
-- "Removed by you: …"), the reason and dates — never review text,
-- reviewer names or ratings.
--
-- Owners read and write only their own businesses' rows (RLS).
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- Remove / Add say they aren't available yet and scans work as before.

create table if not exists public.competitor_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  place_id text not null,
  action text not null check (action in ('removed', 'added')),
  reason text check (reason is null or reason in ('closed', 'not_competitor', 'other')),
  name text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, place_id)
);

alter table public.competitor_overrides enable row level security;

drop policy if exists "Owners manage their own competitor overrides" on public.competitor_overrides;
create policy "Owners manage their own competitor overrides" on public.competitor_overrides
  for all
  using (exists (select 1 from public.businesses b where b.id = competitor_overrides.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = competitor_overrides.business_id and b.owner_id = auth.uid()));

grant select, insert, update, delete on table public.competitor_overrides to authenticated;
grant all on table public.competitor_overrides to service_role;

notify pgrst, 'reload schema';
