-- Weekly snapshots: one small row of numbers per business per finished
-- week (Monday–Sunday, business time zone), behind the Reports page's
-- weekly recap and "Past reports" (lib/weekly/snapshots.ts).
--
-- No PDFs or images are stored: a past week's PDF is drawn from its row
-- when someone clicks Download, then discarded. Rows are created lazily
-- by the app (next visit / Reports view after the week ends) from scans
-- already saved — no cron, no Google or PageSpeed calls — and are never
-- updated afterwards (insert-only), so old reports don't change if the
-- scoring changes later. Weeks without a scan get no row.
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- Storage estimate (one row ≈ 0.4–0.6 KB including index entries; the
-- largest column is `categories`, ~120 bytes of jsonb):
--   100 businesses   × 52 weeks ≈   5,200 rows ≈ 2–3 MB after 1 year
--   1,000 businesses × 52 weeks ≈  52,000 rows ≈ 20–30 MB after 1 year
-- (Upper bound: a row is capped well under 2 KB; weeks without scans add
-- nothing, so real usage is lower.)

create table if not exists public.weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  week_start date not null,
  scan_id uuid not null,
  compared_scan_id uuid,
  scan_count smallint not null default 1,
  score smallint not null,
  grade text not null,
  prev_score smallint,
  scoring_version text,
  prev_scoring_version text,
  -- {"listing": [before, after], "website": [...], "reviews": [...]} (0–100)
  categories jsonb not null default '{}'::jsonb,
  rank smallint,
  rank_of smallint,
  prev_rank smallint,
  fixes_confirmed smallint not null default 0,
  review_count integer,
  rating numeric(2, 1),
  review_count_change integer,
  rating_change numeric(2, 1),
  -- Listing fields that changed ("hours", "photos", …).
  listing_changes text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint weekly_snapshots_size check (pg_column_size(categories) < 1024)
);

-- One row per business per week — a second insert is a no-op.
create unique index if not exists weekly_snapshots_business_week_unique
  on public.weekly_snapshots (business_id, week_start);

alter table public.weekly_snapshots enable row level security;

-- Owners read and create their own businesses' snapshots. No update or
-- delete policy: a snapshot is frozen once written.
drop policy if exists "Owners can read their weekly snapshots" on public.weekly_snapshots;
create policy "Owners can read their weekly snapshots"
  on public.weekly_snapshots for select
  using (exists (select 1 from public.businesses b where b.id = weekly_snapshots.business_id and b.owner_id = auth.uid()));

drop policy if exists "Owners can add their weekly snapshots" on public.weekly_snapshots;
create policy "Owners can add their weekly snapshots"
  on public.weekly_snapshots for insert
  with check (exists (select 1 from public.businesses b where b.id = weekly_snapshots.business_id and b.owner_id = auth.uid()));
