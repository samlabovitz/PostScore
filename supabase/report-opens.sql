-- Day 25B step 4: the sidebar's Reports "New" dot (docs/plans/day25a-spec.md §1).
-- When each owner last opened Reports for a business: the dot shows when
-- the newest monthly report is newer than this, and clears when they open
-- Reports. One row per user and business. Never shown on Free.
--
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.report_opens (
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

alter table public.report_opens enable row level security;

drop policy if exists "report_opens_own_select" on public.report_opens;
create policy "report_opens_own_select" on public.report_opens
  for select using (auth.uid() = user_id);

drop policy if exists "report_opens_own_insert" on public.report_opens;
create policy "report_opens_own_insert" on public.report_opens
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

drop policy if exists "report_opens_own_update" on public.report_opens;
create policy "report_opens_own_update" on public.report_opens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
