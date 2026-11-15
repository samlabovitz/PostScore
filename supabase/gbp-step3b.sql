-- Day 22B section 6 ("Protection & changes"): Google's own edits to the
-- listing (Business Information getGoogleUpdated → diffMask).
--
--   gbp_google_edits: one row per field Google shows differently from what
--     the owner entered — the field, the owner's value and Google's value as
--     short text (listing info only: name, phone, address, hours, website,
--     categories, description; never review text), when it was seen, and how
--     it ended: kept (the owner kept Google's version), changed_back (the
--     owner changed it back from PostScore) or gone (Google no longer shows
--     a different value). At most one open row per business and field.
--   gbp_connections.google_edits_checked_at: the last check (each scan, once
--     a day, "Check now" — at most once every 10 minutes per business).
--
-- Owners read their own rows (RLS); only the server (service role) writes.

create table if not exists public.gbp_google_edits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  field text not null check (field in ('title', 'phone', 'address', 'hours', 'website', 'categories', 'description')),
  owner_value text check (owner_value is null or char_length(owner_value) <= 400),
  google_value text check (google_value is null or char_length(google_value) <= 400),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('kept', 'changed_back', 'gone')),
  practice boolean not null default false
);

create unique index if not exists gbp_google_edits_one_open
  on public.gbp_google_edits (business_id, field, practice)
  where resolved_at is null;

create index if not exists gbp_google_edits_business_time
  on public.gbp_google_edits (business_id, detected_at desc);

alter table public.gbp_google_edits enable row level security;

drop policy if exists "Owners can read their own Google edits" on public.gbp_google_edits;
create policy "Owners can read their own Google edits" on public.gbp_google_edits
  for select using (
    exists (select 1 from public.businesses b where b.id = gbp_google_edits.business_id and b.owner_id = auth.uid())
  );

alter table public.gbp_connections
  add column if not exists google_edits_checked_at timestamptz;

notify pgrst, 'reload schema';
