-- Postscore: businesses table + Row-Level Security
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  name text,
  address text,
  phone text,
  website text,
  rating numeric,
  review_count integer,
  category text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

-- Fields other than owner_id/place_id/created_at are nullable on purpose:
-- Google doesn't guarantee every field is present, and we store exactly
-- what it returned rather than inventing a value.

-- One saved row per (user, place) — saving the same business again updates
-- it instead of creating a duplicate.
create unique index if not exists businesses_owner_place_unique
  on public.businesses (owner_id, place_id);

create index if not exists businesses_owner_id_idx
  on public.businesses (owner_id);

alter table public.businesses enable row level security;

-- create policy has no "if not exists" in Postgres, so drop-then-create is
-- the standard idempotent pattern — safe to re-run the whole file.
drop policy if exists "Users can view their own businesses" on public.businesses;
create policy "Users can view their own businesses"
  on public.businesses for select
  using (auth.uid () = owner_id);

drop policy if exists "Users can insert their own businesses" on public.businesses;
create policy "Users can insert their own businesses"
  on public.businesses for insert
  with check (auth.uid () = owner_id);

drop policy if exists "Users can update their own businesses" on public.businesses;
create policy "Users can update their own businesses"
  on public.businesses for update
  using (auth.uid () = owner_id)
  with check (auth.uid () = owner_id);

drop policy if exists "Users can delete their own businesses" on public.businesses;
create policy "Users can delete their own businesses"
  on public.businesses for delete using (auth.uid () = owner_id);

-- ---------------------------------------------------------------------------
-- Scoring engine support (lib/scoring.ts)
-- ---------------------------------------------------------------------------

-- Additional Google Places fields the scoring engine reads that weren't
-- captured by the original save flow. All nullable for the same reason as
-- the columns above: absence is real, verifiable data, not a data gap to
-- paper over. Safe to re-run — `add column if not exists` is a no-op if
-- you've already applied this.
alter table public.businesses
  add column if not exists business_status text,
  add column if not exists categories text[],
  add column if not exists opening_hours text[],
  add column if not exists photo_count integer,
  add column if not exists google_maps_uri text;

-- One row per scan. Scores are never overwritten in place — history
-- accumulates so you can see a business's PostScore change over time, and
-- so a score is always attributable to the exact scoring_version that
-- produced it (see SCORING_VERSION in lib/scoring.ts).
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  total integer not null,
  grade text not null,
  breakdown_json jsonb not null,
  scoring_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists scores_business_id_created_at_idx
  on public.scores (business_id, created_at desc);

alter table public.scores enable row level security;

-- Scores have no owner_id of their own — ownership is inherited from the
-- business they were scanned for, via the same RLS check the businesses
-- table policies use.
drop policy if exists "Users can view scores for their own businesses" on public.scores;
create policy "Users can view scores for their own businesses"
  on public.scores for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = scores.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can insert scores for their own businesses" on public.scores;
create policy "Users can insert scores for their own businesses"
  on public.scores for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = scores.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

-- ---------------------------------------------------------------------------
-- Competitors feature support (lib/competitors.ts)
-- ---------------------------------------------------------------------------

-- Google's machine-readable primary type slug (e.g. "hair_salon"), distinct
-- from `category` (the human-readable primaryTypeDisplayName, e.g. "Hair
-- Salon"). The competitors feature uses this to ask Nearby Search for
-- genuinely same-category places instead of guessing from a display label.
-- Nullable: existing saved businesses won't have it until re-saved, and the
-- competitors feature falls back to `categories`/`category` when it's null.
alter table public.businesses
  add column if not exists primary_type text;

-- One row per ranked entry per scan (the saved business itself, flagged
-- via is_subject, plus each scored competitor), grouped by scan_id. Like
-- `scores`, snapshots are never overwritten — history accumulates so you
-- can see how the competitive ranking moved over time.
create table if not exists public.competitor_scans (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  is_subject boolean not null default false,
  place_id text not null,
  name text,
  address text,
  distance_meters numeric,
  rating numeric,
  review_count integer,
  has_website boolean,
  total integer,
  grade text,
  scoring_version text,
  breakdown_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists competitor_scans_business_id_created_at_idx
  on public.competitor_scans (business_id, created_at desc);

create index if not exists competitor_scans_scan_id_idx
  on public.competitor_scans (scan_id);

alter table public.competitor_scans enable row level security;

-- Ownership is inherited from the business the scan was run for, same
-- pattern as the `scores` table policies above.
drop policy if exists "Users can view competitor scans for their own businesses" on public.competitor_scans;
create policy "Users can view competitor scans for their own businesses"
  on public.competitor_scans for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = competitor_scans.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can insert competitor scans for their own businesses" on public.competitor_scans;
create policy "Users can insert competitor scans for their own businesses"
  on public.competitor_scans for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = competitor_scans.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

-- ---------------------------------------------------------------------------
-- Action plan support (lib/actionPlan.ts)
-- ---------------------------------------------------------------------------

-- One row per (business, check) the owner has actually marked "I did
-- this" on — an open task the owner hasn't touched yet has NO row here
-- at all; it's simply derived live from the current breakdown
-- (generateSuggestions in lib/scoring.ts). A row only ever exists in one
-- of two states:
--   pending_verification: the owner says they made the change; it does
--     NOT add any points on its own.
--   completed: a later re-scan actually found the underlying check at
--     full points (see reconcileTasks() in lib/actionPlan.ts, run from
--     saveScoreSnapshot in app/actions/scoring.ts) — this is the ONLY
--     way a row becomes completed. If a completed check later regresses
--     (the real data reverts), the reconciler deletes the row rather
--     than leaving a stale "completed" claim; marking it done again
--     creates a fresh row.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  check_id text not null,
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'completed')),
  -- The points that check was missing at the moment the owner marked it
  -- done, recomputed server-side from real data (never trusted from the
  -- client) — this is what "+N pts confirmed" shows once verified.
  promised_points numeric not null,
  marked_done_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_score_id uuid references public.scores (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One standing task per (business, check) — marking a task done again
-- (e.g. after a regression) updates the same row rather than piling up
-- duplicates.
create unique index if not exists tasks_business_check_unique
  on public.tasks (business_id, check_id);

create index if not exists tasks_business_id_idx
  on public.tasks (business_id);

alter table public.tasks enable row level security;

drop policy if exists "Users can view tasks for their own businesses" on public.tasks;
create policy "Users can view tasks for their own businesses"
  on public.tasks for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = tasks.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can insert tasks for their own businesses" on public.tasks;
create policy "Users can insert tasks for their own businesses"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = tasks.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can update tasks for their own businesses" on public.tasks;
create policy "Users can update tasks for their own businesses"
  on public.tasks for update
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = tasks.business_id
        and businesses.owner_id = auth.uid ()
    )
  )
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = tasks.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can delete tasks for their own businesses" on public.tasks;
create policy "Users can delete tasks for their own businesses"
  on public.tasks for delete
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = tasks.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

-- ---------------------------------------------------------------------------
-- Coupon promotions support (lib/promos.ts, Day 9 pass 2b)
-- ---------------------------------------------------------------------------

-- One row per coupon the owner has actually started running. `type`
-- records which offer angle it came from (see OfferAngle ids in
-- CouponBuilder.tsx: "firstTime" | "seasonal" | "slowDay" | "custom").
-- `redemptions` is an honest, staff-incremented tally (see
-- increment_promo_redemption below) — there is no POS integration or
-- auto-detection anywhere in this feature, so this number is exactly
-- and only how many times a human tapped "+1 Redeemed".
create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null,
  offer text not null,
  code text not null,
  instructions text,
  terms text,
  expiry date,
  redemptions integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists promos_business_id_idx
  on public.promos (business_id);

-- Speeds up the "how many active promos does this business have" check
-- the trigger below runs on every insert/update.
create index if not exists promos_business_active_idx
  on public.promos (business_id)
  where active;

alter table public.promos enable row level security;

drop policy if exists "Users can view promos for their own businesses" on public.promos;
create policy "Users can view promos for their own businesses"
  on public.promos for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = promos.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can insert promos for their own businesses" on public.promos;
create policy "Users can insert promos for their own businesses"
  on public.promos for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = promos.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can update promos for their own businesses" on public.promos;
create policy "Users can update promos for their own businesses"
  on public.promos for update
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = promos.business_id
        and businesses.owner_id = auth.uid ()
    )
  )
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = promos.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can delete promos for their own businesses" on public.promos;
create policy "Users can delete promos for their own businesses"
  on public.promos for delete
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = promos.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

-- Enforces "at most 2 active promos per business" as a real database
-- invariant, not just a UI check — the app disables the "Start & track
-- this offer" button at 2 active promos, but this trigger is what
-- actually guarantees it, including against races or a second tab.
-- `language plpgsql` (not `security definer`) so it runs as the calling
-- role and stays subject to the same RLS the policies above define.
create or replace function public.enforce_max_active_promos()
returns trigger
language plpgsql
as $$
begin
  if new.active then
    if (
      select count(*) from public.promos
      where business_id = new.business_id
        and active
        and id <> new.id
    ) >= 2 then
      raise exception 'A business can run at most 2 active promotions at once. End one before starting another.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists promos_enforce_max_active on public.promos;
create trigger promos_enforce_max_active
  before insert or update on public.promos
  for each row execute function public.enforce_max_active_promos();

-- Atomic "+1 Redeemed" tap. A plain client-side read-then-update could
-- lose a count under concurrent taps (two staff members, two devices);
-- this does the increment in one statement instead. `language sql`
-- (not `security definer`) so it still runs as the calling role and is
-- still subject to the update RLS policy above — a user can only ever
-- increment redemptions on a promo their own business owns.
create or replace function public.increment_promo_redemption(p_promo_id uuid)
returns integer
language sql
as $$
  update public.promos
  set redemptions = redemptions + 1
  where id = p_promo_id
  returning redemptions;
$$;

grant execute on function public.increment_promo_redemption(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Referral program support (lib/referrals.ts, Day 10 pass 2)
-- ---------------------------------------------------------------------------

-- A dedicated table rather than reusing `promos` with a type of
-- 'referral': a referral is genuinely two-sided (a reward for the
-- referrer AND a separate reward for the friend they bring), which
-- `promos` has no columns for, and it has its own active-limit rule
-- (see enforce_max_active_referrals below) that's different from the
-- coupon 2-max and would have had to special-case `type` inside the
-- shared enforce_max_active_promos trigger. Real, named columns for
-- both rewards and a trigger that only ever means one thing is cleaner
-- than overloading `promos.offer` or bolting nullable referral-only
-- columns onto a table other code already depends on.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  referrer_reward text not null,
  friend_reward text not null,
  code text not null,
  redemptions integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists referrals_business_id_idx
  on public.referrals (business_id);

-- Speeds up the "does this business already have an active referral"
-- check the trigger below runs on every insert/update.
create index if not exists referrals_business_active_idx
  on public.referrals (business_id)
  where active;

alter table public.referrals enable row level security;

drop policy if exists "Users can view referrals for their own businesses" on public.referrals;
create policy "Users can view referrals for their own businesses"
  on public.referrals for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = referrals.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can insert referrals for their own businesses" on public.referrals;
create policy "Users can insert referrals for their own businesses"
  on public.referrals for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = referrals.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can update referrals for their own businesses" on public.referrals;
create policy "Users can update referrals for their own businesses"
  on public.referrals for update
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = referrals.business_id
        and businesses.owner_id = auth.uid ()
    )
  )
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = referrals.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can delete referrals for their own businesses" on public.referrals;
create policy "Users can delete referrals for their own businesses"
  on public.referrals for delete
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = referrals.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

-- Enforces "at most 1 active referral program per business" as a real
-- database invariant, same real-enforcement approach as the coupon
-- 2-max (enforce_max_active_promos above). One active referral is the
-- right default — unlike coupons, where a business plausibly runs a
-- first-visit offer AND a separate slow-day offer at once, a referral
-- program is a single standing structure ("bring a friend, you both
-- get X"); running two simultaneously just means two different
-- rewards for the same action, which is confusing rather than useful.
create or replace function public.enforce_max_active_referrals()
returns trigger
language plpgsql
as $$
begin
  if new.active then
    if (
      select count(*) from public.referrals
      where business_id = new.business_id
        and active
        and id <> new.id
    ) >= 1 then
      raise exception 'A business can run at most 1 active referral program at once. End it before starting another.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists referrals_enforce_max_active on public.referrals;
create trigger referrals_enforce_max_active
  before insert or update on public.referrals
  for each row execute function public.enforce_max_active_referrals();

-- Atomic "+1 Referral" tap — same reasoning as increment_promo_redemption
-- above: a plain client-side read-then-update could lose a count under
-- concurrent taps, and `language sql` (not `security definer`) keeps
-- this subject to the update RLS policy above.
create or replace function public.increment_referral_redemption(p_referral_id uuid)
returns integer
language sql
as $$
  update public.referrals
  set redemptions = redemptions + 1
  where id = p_referral_id
  returning redemptions;
$$;

grant execute on function public.increment_referral_redemption(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- HTTPS check caching (lib/websiteHttps.ts, lib/scoring.ts's website.https
-- check — fixes the check previously guessing HTTPS from the URL string)
-- ---------------------------------------------------------------------------

-- A real, server-side network probe of the business's website (see
-- lib/websiteHttps.ts) is run once when the business is saved/re-saved
-- (see saveBusiness in app/actions/businesses.ts) and its result cached
-- here, rather than re-fetched on every score view. https_status holds
-- one of 'https' | 'http_only' | 'unreachable' (see HttpsCheckStatus in
-- lib/scoring.ts) as plain text — validated back into that union by
-- parseHttpsStatus when read, never trusted blindly. Both columns are
-- nullable: an already-saved business won't have either until it's next
-- saved, and the scoring engine treats null exactly like a probe that
-- couldn't complete — excluded from the score, never scored as a
-- failure.
alter table public.businesses
  add column if not exists https_status text,
  add column if not exists https_checked_at timestamptz;
