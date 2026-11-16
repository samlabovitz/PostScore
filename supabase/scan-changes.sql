-- Day 23 step 2c-1: our own record of what changed at each scan.
-- Safe to paste before or after the code deploys: until it's pasted, a
-- scan logs "[scan-changes] not recorded" and carries on as before.
--
-- 1. scan_changes: one row per listing field that changed since the
--    business's previous scan — the field, a direction (up / down /
--    changed / added / removed) and, when known, a small amount (+3
--    reviews, -0.1 rating). Never Google's values themselves.
-- 2. scores.field_fingerprints: each scan's keyed one-way fingerprints
--    of its listing fields ({"k": key id, "f": {field: fingerprint}}), so
--    the next scan can tell a field changed without keeping the value.
--
-- Owners can read their own rows; only the server writes them (right
-- after the scan's own score row is saved).

create table if not exists public.scan_changes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  score_id uuid not null references public.scores (id) on delete cascade,
  previous_score_id uuid references public.scores (id) on delete set null,
  field text not null check (field in ('name', 'address', 'phone', 'website', 'hours', 'categories', 'photos', 'rating', 'reviews', 'status')),
  direction text not null check (direction in ('up', 'down', 'changed', 'added', 'removed')),
  delta numeric(8, 1),
  at timestamptz not null default now(),
  unique (score_id, field)
);

create index if not exists scan_changes_business_at_idx on public.scan_changes (business_id, at desc);

alter table public.scan_changes enable row level security;

drop policy if exists "Users can view scan changes for their own businesses" on public.scan_changes;
create policy "Users can view scan changes for their own businesses"
  on public.scan_changes for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = scan_changes.business_id
        and businesses.owner_id = auth.uid ()
    )
  );

alter table public.scores add column if not exists field_fingerprints jsonb;

notify pgrst, 'reload schema';
