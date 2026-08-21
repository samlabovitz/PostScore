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

create policy "Users can view their own businesses"
  on public.businesses for select
  using (auth.uid () = owner_id);

create policy "Users can insert their own businesses"
  on public.businesses for insert
  with check (auth.uid () = owner_id);

create policy "Users can update their own businesses"
  on public.businesses for update
  using (auth.uid () = owner_id)
  with check (auth.uid () = owner_id);

create policy "Users can delete their own businesses"
  on public.businesses for delete using (auth.uid () = owner_id);
