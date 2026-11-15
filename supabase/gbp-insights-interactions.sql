-- Day 22B Phase A: Google's "interactions" in full, and a lock for syncing.
--
-- gbp_monthly_insights gains the two interaction kinds it didn't keep on
-- their own: messages (BUSINESS_CONVERSATIONS) and food orders
-- (BUSINESS_FOOD_ORDERS; until now added into bookings). Interactions =
-- calls + directions + website clicks + bookings + messages + food orders
-- (lib/gbpInsights.ts actions()). Rows saved before this keep 0 for both
-- until they're read again (scripts/fetch-insights.ts --months 18).
--
-- gbp_connections.insights_sync_started_at: one sync at a time per
-- business (lib/gbpInsights.server.ts syncInsights) — set when a sync
-- starts, cleared when it ends; a claim older than 5 minutes is ignored.

alter table public.gbp_monthly_insights
  add column if not exists conversations integer not null default 0 check (conversations >= 0),
  add column if not exists food_orders integer not null default 0 check (food_orders >= 0);

alter table public.gbp_connections add column if not exists insights_sync_started_at timestamptz;

notify pgrst, 'reload schema';
