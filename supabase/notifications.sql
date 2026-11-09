-- In-app notifications (Nov 9): the Account menu's "Notifications". In-app
-- only — never emails or texts. lib/notifications.ts has the rules.
--
-- Today only "urgent" ones exist (lib/urgency.ts): one per issue per
-- business, created when a scan finds it, resolved automatically when a
-- later scan shows it's fixed. `type` and `key` are free text so other
-- kinds (a Google change approved, a new review, a score drop) can be
-- added later without a table change.
--
-- - severity: "urgent" | "high" | "info" (the pill).
-- - payload: small facts for the wording (e.g. {"parked": true}) — never
--   review text or anything personal.
-- - read_at: the owner opened the panel. resolved_at: fixed ("Fixed ✓").
--
-- Owners can read their own business's notifications and mark them read
-- (read_at only). Only the server (service role) creates or resolves them.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- the Account menu simply shows no notifications.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null,
  key text not null,
  severity text not null check (severity in ('urgent', 'high', 'info')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz
);

-- Never two open notifications for the same thing.
create unique index if not exists notifications_one_open
  on public.notifications (business_id, type, key)
  where resolved_at is null;

create index if not exists notifications_business_time
  on public.notifications (business_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Owners can read their own notifications" on public.notifications;
create policy "Owners can read their own notifications" on public.notifications
  for select using (
    exists (select 1 from public.businesses b where b.id = notifications.business_id and b.owner_id = auth.uid())
  );

drop policy if exists "Owners can mark their own notifications read" on public.notifications;
create policy "Owners can mark their own notifications read" on public.notifications
  for update using (
    exists (select 1 from public.businesses b where b.id = notifications.business_id and b.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.businesses b where b.id = notifications.business_id and b.owner_id = auth.uid())
  );

-- Owners may change read_at and nothing else.
revoke insert, update, delete on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

notify pgrst, 'reload schema';
