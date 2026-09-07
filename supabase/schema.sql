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

-- ---------------------------------------------------------------------------
-- Pricing support (lib/pricing.ts, app/actions/pricing.ts — "Price check")
-- ---------------------------------------------------------------------------

-- Google's own price-level signal for this listing (e.g.
-- "PRICE_LEVEL_MODERATE"), captured at save time alongside primary_type
-- (see saveBusiness in app/actions/businesses.ts). Nullable: Google
-- doesn't have price data for every listing (most non-restaurant
-- services have none), and an already-saved business won't have it
-- until re-saved.
alter table public.businesses
  add column if not exists price_level text;

-- One row per service the owner has told us they charge for. Prices are
-- never part of the score (lib/scoring.ts never reads this table) —
-- this is purely the owner's own private input for the "Price check"
-- tool, used only to build the prompt sent to the Anthropic API for a
-- tier assessment (see assessPricing in app/actions/pricing.ts).
create table if not exists public.prices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service text not null,
  price numeric not null check (price >= 0),
  created_at timestamptz not null default now()
);

create index if not exists prices_business_id_idx
  on public.prices (business_id);

alter table public.prices enable row level security;

drop policy if exists "Users can view prices for their own businesses" on public.prices;
create policy "Users can view prices for their own businesses"
  on public.prices for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = prices.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can insert prices for their own businesses" on public.prices;
create policy "Users can insert prices for their own businesses"
  on public.prices for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = prices.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can update prices for their own businesses" on public.prices;
create policy "Users can update prices for their own businesses"
  on public.prices for update
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = prices.business_id
        and businesses.owner_id = auth.uid ()
    )
  )
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = prices.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can delete prices for their own businesses" on public.prices;
create policy "Users can delete prices for their own businesses"
  on public.prices for delete
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = prices.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

-- The LAST "Assess my pricing" result, cached directly on the business —
-- same single-latest-value pattern as https_status/https_checked_at
-- above, not a history table, since the Pricing page only ever needs to
-- show "your most recent assessment" on return. pricing_assessment holds
-- the real PricingAssessmentPayload (see lib/pricing.ts) — the AI's
-- per-service tiers/guidance plus the real Google price-level context it
-- was assessed against — so a returning owner sees exactly what was
-- shown at assessment time, not just bare tiers. Both null until the
-- owner's first "Assess my pricing" click; re-running it overwrites both
-- rather than accumulating, and the API is never re-called just because
-- this page was opened.
alter table public.businesses
  add column if not exists pricing_assessment jsonb,
  add column if not exists pricing_assessed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Assistant chat support (lib/assistant.ts, app/actions/assistant.ts —
-- "Ask about your presence", Day 12)
-- ---------------------------------------------------------------------------

-- Google's own price-level signal for each ranked entry in a saved
-- competitor scan (e.g. "PRICE_LEVEL_MODERATE") — the same field
-- saveBusiness caches onto `businesses.price_level` above, now also
-- captured per competitor so the assistant can ground a "how do I compare
-- on price" answer in real Google data. Added after competitor_scans
-- shipped, so it's an `add column if not exists` here rather than in the
-- table's own create statement earlier in this file. Nullable: Google has
-- no price data for most non-restaurant listings, and scans saved before
-- this column existed won't have it until the next "Save this scan."
alter table public.competitor_scans
  add column if not exists price_level text;

-- One row per chat turn (owner question or assistant reply), so the
-- conversation survives navigating away and coming back — same
-- persistence intent as `tasks`/`promos`, just append-only rather than
-- upserted. `role` mirrors the Anthropic Messages API's own turn roles.
-- Every assistant reply is generated from real business data plus
-- clearly-labeled general guidance (see the system prompt built in
-- app/actions/assistant.ts) — this table only stores the resulting text,
-- never anything fabricated on our side.
create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_business_id_created_at_idx
  on public.assistant_messages (business_id, created_at asc);

alter table public.assistant_messages enable row level security;

drop policy if exists "Users can view assistant messages for their own businesses" on public.assistant_messages;
create policy "Users can view assistant messages for their own businesses"
  on public.assistant_messages for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = assistant_messages.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can insert assistant messages for their own businesses" on public.assistant_messages;
create policy "Users can insert assistant messages for their own businesses"
  on public.assistant_messages for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = assistant_messages.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can delete assistant messages for their own businesses" on public.assistant_messages;
create policy "Users can delete assistant messages for their own businesses"
  on public.assistant_messages for delete
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = assistant_messages.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

-- ---------------------------------------------------------------------------
-- Assistant business-context memory (lib/assistant.ts, app/actions/assistant.ts
-- — persistent "what I know about your business" profile, Day 12 pass 3)
-- ---------------------------------------------------------------------------

-- Owner-entered facts the assistant otherwise has no way to know, since
-- nothing else in the app captures them: what the business actually sells
-- (as a short list of service names, distinct from the priced line items in
-- `prices` above — this is the plain-language list the assistant reads,
-- not a pricing input). Nullable and owner-editable at any time from the
-- assistant's "What I know about your business" panel; absence is honestly
-- "not entered yet," never guessed. Everything else the panel shows
-- (business type, location, score history, confirmed fixes) is read live
-- from data this schema already has — `businesses` (category, primary_type,
-- address), `scores`, and `tasks` — rather than duplicated here, so there's
-- nothing else to keep in sync.
alter table public.businesses
  add column if not exists services text[];

-- Superseded by the low/high range below — drop it if an earlier pass
-- already added the single-number version.
alter table public.businesses drop column if exists avg_job_value;

-- A typical job/ticket size, entered as a LOW/HIGH range rather than one
-- number — most businesses' real jobs span a spread (e.g. "$8 to $80" for
-- a liquor store, a bottle vs. a case) and a single average would flatten
-- that into something misleading. A range is only ever both-or-neither: the
-- low end alone isn't a usable range, so the check constraint below
-- enforces they're set (or unset) together, and that low never exceeds
-- high. Used by the assistant to reason about the real dollar stakes behind
-- a gap (e.g. "each lost review-driven job is worth roughly $8-80"), never
-- as a scoring input.
alter table public.businesses
  add column if not exists avg_job_value_low numeric check (avg_job_value_low >= 0),
  add column if not exists avg_job_value_high numeric check (avg_job_value_high >= 0);

alter table public.businesses drop constraint if exists businesses_job_value_range_check;
alter table public.businesses add constraint businesses_job_value_range_check
  check (
    (avg_job_value_low is null) = (avg_job_value_high is null)
    and (avg_job_value_low is null or avg_job_value_low <= avg_job_value_high)
  );

-- Lets the owner correct their business type directly when Google's own
-- category is too generic to resolve to the right type in
-- config/bizProfiles.ts (e.g. a listing Google only categorizes as a bare
-- "store" falls through to the generic "General Business" default). null
-- = no override; resolveBizProfile() falls back to Google-category
-- auto-detection (bizProfile()) in that case. Once set, every call site
-- that resolves a business type — the assistant, Growth's offer
-- templates, Pricing's tips and AI assessment, the Competitors page's
-- "competitors" noun, the Website starter-site generator — uses the
-- override instead of the auto-detected type.
alter table public.businesses
  add column if not exists business_type_override text;

-- Named separately (rather than inline on the column above) so it can be
-- dropped and re-added idempotently — constrained to the exact set of
-- business type ids the app currently supports (see BUSINESS_TYPE_OPTIONS
-- in config/bizProfiles.ts, ~30 types as of the expanded list below).
-- Update this list if a business type is ever added or removed there.
alter table public.businesses drop constraint if exists businesses_business_type_override_check;
alter table public.businesses add constraint businesses_business_type_override_check
  check (
    business_type_override is null
    or business_type_override in (
      'barbershop', 'spa', 'nail_salon', 'salon',
      'cafe', 'bar', 'bakery', 'liquor_store', 'grocery_market', 'restaurant',
      'hardware_store', 'florist', 'retail_boutique',
      'gym_fitness', 'pet_services', 'dentist', 'medical_clinic',
      'lawyer', 'accountant', 'real_estate', 'consultant', 'coach', 'tutor_education', 'photographer', 'practitioner',
      'auto_repair', 'plumber', 'electrician', 'landscaper', 'cleaning_service',
      'default'
    )
  );

-- ---------------------------------------------------------------------------
-- Assistant conversation history (lib/assistant.ts, app/actions/assistant.ts
-- — past-chats history menu, fresh chat per open, Day 12 pass 5)
-- ---------------------------------------------------------------------------

-- One row per chat SESSION, grouping the messages in `assistant_messages`
-- below into distinct conversations. Before this table existed, every
-- message for a business belonged to one continuous, ever-growing thread;
-- now, a new row here is created lazily on a genuinely new conversation's
-- first real message (never an empty row for a chat opened and closed
-- without saying anything). Opening the assistant resumes whichever
-- conversation was last active (see getCurrentConversation in
-- app/actions/assistant.ts) rather than always starting a new row, and the
-- owner can browse and resume past ones from a history menu inside the
-- assistant. The row itself is immutable — never edited or renamed, only
-- read, listed, or added to.
create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  started_at timestamptz not null default now()
);

create index if not exists assistant_conversations_business_id_started_at_idx
  on public.assistant_conversations (business_id, started_at desc);

alter table public.assistant_conversations enable row level security;

drop policy if exists "Users can view assistant conversations for their own businesses" on public.assistant_conversations;
create policy "Users can view assistant conversations for their own businesses"
  on public.assistant_conversations for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = assistant_conversations.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can insert assistant conversations for their own businesses" on public.assistant_conversations;
create policy "Users can insert assistant conversations for their own businesses"
  on public.assistant_conversations for insert
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = assistant_conversations.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

drop policy if exists "Users can delete assistant conversations for their own businesses" on public.assistant_conversations;
create policy "Users can delete assistant conversations for their own businesses"
  on public.assistant_conversations for delete
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = assistant_conversations.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

-- Every message now belongs to exactly one conversation, in addition to
-- (still, redundantly) its business — business_id stays for the existing
-- RLS policies and the simpler business-scoped queries that don't care
-- about session grouping.
alter table public.assistant_messages
  add column if not exists conversation_id uuid references public.assistant_conversations (id) on delete cascade;

-- Backfills every message saved before this table existed into one
-- legacy conversation per business, so nothing already saved is silently
-- orphaned or hidden from the new history menu. A no-op on a fresh
-- database (nothing to backfill) and safe to re-run (the `where
-- conversation_id is null` guard means an already-migrated row is never
-- touched twice).
with legacy as (
  insert into public.assistant_conversations (business_id, started_at)
  select business_id, min(created_at)
  from public.assistant_messages
  where conversation_id is null
  group by business_id
  returning id, business_id
)
update public.assistant_messages m
set conversation_id = legacy.id
from legacy
where m.business_id = legacy.business_id
  and m.conversation_id is null;

-- Safe to apply unconditionally — a no-op if the column is already
-- NOT NULL, and every row is guaranteed one by the backfill just above.
alter table public.assistant_messages alter column conversation_id set not null;

create index if not exists assistant_messages_conversation_id_created_at_idx
  on public.assistant_messages (conversation_id, created_at asc);
