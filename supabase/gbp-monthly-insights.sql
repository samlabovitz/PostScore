-- Day 22B step 2: Google's monthly numbers for the Google Profile tab
-- (lib/gbpInsights.ts, lib/gbpInsights.server.ts).
--
-- gbp_monthly_insights keeps ONE row per business per month: the month's
-- totals only, summed from Google's daily Business Profile Performance
-- series, which are never stored. Totals (all views, Maps vs Search, phone
-- vs computer) are sums of the four view columns.
--   calls_by_weekday: 7 numbers, Sunday first.
--   top_keywords: [{ "term": "...", "count": 123 }], biggest first, only
--     terms over Google's own threshold.
--
-- Written only by the server (service role: the monthly job, the backfill
-- on connect / first tab visit, scripts/fetch-insights.ts). Owners read
-- their own rows. Disconnect / business delete removes them (cascade).
--
-- Also:
--   gbp_connections.insights_backfilled_at: the 18-month backfill ran once.
--   businesses.average_visit_value: the owner's own average visit in
--     dollars ("What that could be worth"), set in Settings; null until set.

create table if not exists public.gbp_monthly_insights (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  views_search_mobile integer not null default 0 check (views_search_mobile >= 0),
  views_maps_mobile integer not null default 0 check (views_maps_mobile >= 0),
  views_search_desktop integer not null default 0 check (views_search_desktop >= 0),
  views_maps_desktop integer not null default 0 check (views_maps_desktop >= 0),
  calls integer not null default 0 check (calls >= 0),
  directions integer not null default 0 check (directions >= 0),
  bookings integer not null default 0 check (bookings >= 0),
  website_clicks integer not null default 0 check (website_clicks >= 0),
  calls_by_weekday jsonb,
  top_keywords jsonb,
  fetched_at timestamptz not null default now(),
  unique (business_id, month)
);

create index if not exists gbp_monthly_insights_business_month on public.gbp_monthly_insights (business_id, month desc);

alter table public.gbp_monthly_insights enable row level security;

drop policy if exists "Owners can read their own monthly insights" on public.gbp_monthly_insights;
create policy "Owners can read their own monthly insights" on public.gbp_monthly_insights
  for select using (
    exists (select 1 from public.businesses b where b.id = gbp_monthly_insights.business_id and b.owner_id = auth.uid())
  );

revoke insert, update, delete on table public.gbp_monthly_insights from anon, authenticated;
grant all on table public.gbp_monthly_insights to service_role;

alter table public.gbp_connections add column if not exists insights_backfilled_at timestamptz;

alter table public.businesses add column if not exists average_visit_value numeric(10, 2)
  check (average_visit_value is null or (average_visit_value > 0 and average_visit_value < 100000));

notify pgrst, 'reload schema';
