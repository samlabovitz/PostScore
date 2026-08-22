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
