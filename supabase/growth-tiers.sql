-- Day 25B step 6: the Growth tier (docs/plans/day25a-spec.md §6).
-- Only PostScore's own facts: which weeks were active, why a week was
-- neutral, the tier on each Monday and why it changed, the owner's
-- "Closed this week" marks, when each business's tier starts counting, the
-- reset date, and a dated log of +1 offer uses (for R4 "offers used in 30
-- days"; today only a running total exists). Never a Google value: no
-- review text, no names, no Google numbers — those stay where they are
-- (gbp_monthly_insights) or live.
--
-- Written by the server (service role) except where noted: owners read their
-- own rows, mark their own "Closed this week" weeks, and log their own +1s.
--
-- Run once in the Supabase SQL editor. Safe to run again.

-- 1. Each business's weeks (Monday, the business's time zone), as computed.
create table if not exists public.growth_weeks (
  business_id uuid not null references public.businesses (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  -- ≥ 1 verified action, or ≥ 2 "You told us" check-offs.
  active boolean not null,
  verified_actions smallint not null default 0 check (verified_actions >= 0),
  told_actions smallint not null default 0 check (told_actions >= 0),
  -- Skipped, never quiet: 'closed_marked' | 'listing_closed' | 'new_plan' |
  -- 'nothing_to_suggest' | 'google_failure' | 'postscore_failure' | 'disconnected'.
  neutral_reason text check (neutral_reason is null or char_length(neutral_reason) <= 40),
  -- The dev test login's businesses count their own test rows (spec §6.2 exception).
  counts_test_rows boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (business_id, week_start)
);

-- 2. The tier each Monday, and why it changed (plain codes + our own counts).
create table if not exists public.growth_tiers (
  business_id uuid not null references public.businesses (id) on delete cascade,
  monday date not null check (extract(isodow from monday) = 1),
  tier smallint not null check (tier between 1 and 5),
  -- 'start' | 'up' | 'down_quiet' | 'down_results' | 'restored' | 'same' | 'frozen'.
  change text not null check (char_length(change) <= 20),
  -- e.g. {"activeWeeks":5,"of":6,"results":["R1","R2"],"quietWeeks":["2026-11-30","2026-12-07"]}.
  reason jsonb not null default '{}'::jsonb check (pg_column_size(reason) < 2048),
  -- One quiet week: "Keep Building: one thing from this week's plan by Sunday keeps your tier."
  warning boolean not null default false,
  counts_test_rows boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (business_id, monday)
);

-- 3. "Closed this week" (vacation, renovation): up to 4 a year, set by the owner.
create table if not exists public.growth_closed_weeks (
  business_id uuid not null references public.businesses (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  marked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, week_start)
);

-- 4. When a business's tier starts counting (a claim: activity before it never counts).
create table if not exists public.growth_business_start (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  counts_from timestamptz not null,
  created_at timestamptz not null default now()
);

-- 5. The tier reset (scripts/reset-growth-tiers.ts): one row; tier queries ignore anything older.
create table if not exists public.growth_settings (
  id smallint primary key default 1 check (id = 1),
  reset_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 6. Each +1 on an offer, dated (R4 "≥ 3 offer uses logged in 30 days").
create table if not exists public.offer_uses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  offer_kind text not null check (offer_kind in ('promo', 'referral')),
  offer_id uuid not null,
  -- A test offer's +1 (promos/referrals.is_test) never counts for a real owner.
  is_test boolean not null default false,
  logged_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists offer_uses_business_created_idx on public.offer_uses (business_id, created_at desc);

-- Row level security: owners read their own; the server writes the computed tables.
alter table public.growth_weeks enable row level security;
alter table public.growth_tiers enable row level security;
alter table public.growth_closed_weeks enable row level security;
alter table public.growth_business_start enable row level security;
alter table public.growth_settings enable row level security;
alter table public.offer_uses enable row level security;

drop policy if exists "growth_weeks_owner_select" on public.growth_weeks;
create policy "growth_weeks_owner_select" on public.growth_weeks
  for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "growth_tiers_owner_select" on public.growth_tiers;
create policy "growth_tiers_owner_select" on public.growth_tiers
  for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "growth_closed_weeks_owner_select" on public.growth_closed_weeks;
create policy "growth_closed_weeks_owner_select" on public.growth_closed_weeks
  for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
drop policy if exists "growth_closed_weeks_owner_insert" on public.growth_closed_weeks;
create policy "growth_closed_weeks_owner_insert" on public.growth_closed_weeks
  for insert with check (marked_by = auth.uid() and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
drop policy if exists "growth_closed_weeks_owner_delete" on public.growth_closed_weeks;
create policy "growth_closed_weeks_owner_delete" on public.growth_closed_weeks
  for delete using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "growth_business_start_owner_select" on public.growth_business_start;
create policy "growth_business_start_owner_select" on public.growth_business_start
  for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- growth_settings: server only (no policies).

drop policy if exists "offer_uses_owner_select" on public.offer_uses;
create policy "offer_uses_owner_select" on public.offer_uses
  for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
drop policy if exists "offer_uses_owner_insert" on public.offer_uses;
create policy "offer_uses_owner_insert" on public.offer_uses
  for insert with check (logged_by = auth.uid() and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

notify pgrst, 'reload schema';
