-- Upgrade promos the owner has hidden (the strip's x),
-- for 14 days, per user and business, on every device.
-- Until this runs, a hide is kept on the device only.
-- Run once in the Supabase SQL editor. Safe to rerun.

create table if not exists public.promo_dismissals (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  business_id uuid not null
    references public.businesses (id) on delete cascade,
  promo_key text not null
    check (char_length(promo_key) <= 40),
  hidden_until timestamptz not null,
  primary key (user_id, business_id, promo_key)
);

alter table public.promo_dismissals
  enable row level security;

-- Older policy names (an earlier version of this file).
drop policy if exists
  "Users read their own promo dismissals"
  on public.promo_dismissals;
drop policy if exists
  "Users add their own promo dismissals"
  on public.promo_dismissals;
drop policy if exists
  "Users update their own promo dismissals"
  on public.promo_dismissals;

drop policy if exists "promo_read"
  on public.promo_dismissals;
create policy "promo_read"
  on public.promo_dismissals
  for select
  using (user_id = auth.uid());

drop policy if exists "promo_insert"
  on public.promo_dismissals;
create policy "promo_insert"
  on public.promo_dismissals
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "promo_update"
  on public.promo_dismissals;
create policy "promo_update"
  on public.promo_dismissals
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
