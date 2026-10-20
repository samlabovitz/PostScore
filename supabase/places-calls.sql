-- A log of Google Places SEARCH calls (Nearby Search) made by competitor
-- scans — one row per scan with how many calls it made. The app adds up
-- this month's rows to stay under PLACES_SEARCH_MONTHLY_CAP. Until this is
-- run, the app estimates conservatively (4 calls per saved scan this month).
-- Written only by the server (service role); owners never read it.
--
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.places_calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete set null,
  kind text not null default 'competitor_scan',
  calls smallint not null check (calls >= 0 and calls <= 50),
  created_at timestamptz not null default now()
);

create index if not exists places_calls_created_at_idx on public.places_calls (created_at);

alter table public.places_calls enable row level security;
-- No policies: only the service role (which bypasses RLS) reads and writes it.
