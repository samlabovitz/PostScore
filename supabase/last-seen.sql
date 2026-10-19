-- "Since your last visit": when each owner last opened each business.
--
-- One row per (user, business). The app updates last_seen_at the first
-- time a business is opened in a browser session (not on every page
-- load), and shows the "Since your last visit" pop-up when the previous
-- value is 7 or more days old (app/actions/weekly.ts →
-- lib/weekly/weeklyData.server.ts).
--
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.business_last_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

alter table public.business_last_seen enable row level security;

-- Each user reads and writes only their own visit rows, and only for
-- businesses they own.
drop policy if exists "Users read their own last-seen rows" on public.business_last_seen;
create policy "Users read their own last-seen rows"
  on public.business_last_seen for select
  using (user_id = auth.uid());

drop policy if exists "Users add their own last-seen rows" on public.business_last_seen;
create policy "Users add their own last-seen rows"
  on public.business_last_seen for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.businesses b where b.id = business_last_seen.business_id and b.owner_id = auth.uid())
  );

drop policy if exists "Users update their own last-seen rows" on public.business_last_seen;
create policy "Users update their own last-seen rows"
  on public.business_last_seen for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
