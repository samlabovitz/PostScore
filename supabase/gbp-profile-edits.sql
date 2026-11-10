-- Premium "Edit on Google" (lib/gbpProfileEdits.server.ts): hours, phone
-- and description on the owner's own Google Business Profile.
--
-- 1. gbp_profile_edit_log: one row per edit or undo the owner approves —
--    who (user_id), when (created_at), which field, the outcome, and
--    whether it was practice mode's fake Google. Never the old or new
--    value (gbp_changes keeps those, for the undo).
-- 2. gbp_changes gets one more status, 'sending': the previous value is
--    saved BEFORE the edit goes to Google, then set to sent /
--    pending_review / failed — so an undo always has the previous value.
--
-- Owners can read their own business's rows; only the server (service
-- role) writes them. Until this file is run, Approve says it isn't set up
-- yet and nothing is sent to Google.
--
-- Run once in the Supabase SQL editor, after gbp-changes.sql and
-- gbp-changes-location.sql. Safe to run again.

create table if not exists public.gbp_profile_edit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  field text not null check (field in ('hours', 'phone', 'description')),
  action text not null check (action in ('edit', 'undo')),
  -- 'ok': Google shows it. 'pending_review': Google is reviewing it.
  -- 'unconfirmed': accepted, not showing yet. 'failed': nothing changed.
  outcome text not null check (outcome in ('ok', 'pending_review', 'unconfirmed', 'failed')),
  practice boolean not null default false,
  error_reason text check (char_length(error_reason) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists gbp_profile_edit_log_business_time on public.gbp_profile_edit_log (business_id, created_at desc);

alter table public.gbp_profile_edit_log enable row level security;

drop policy if exists "Owners can read their own profile edit log" on public.gbp_profile_edit_log;
create policy "Owners can read their own profile edit log" on public.gbp_profile_edit_log
  for select using (
    exists (select 1 from public.businesses b where b.id = gbp_profile_edit_log.business_id and b.owner_id = auth.uid())
  );

revoke insert, update, delete on table public.gbp_profile_edit_log from anon, authenticated;
grant all on table public.gbp_profile_edit_log to service_role;

-- The previous value is saved as 'sending' before the edit is sent.
alter table public.gbp_changes drop constraint if exists gbp_changes_status_check;
alter table public.gbp_changes
  add constraint gbp_changes_status_check check (status in ('sending', 'sent', 'pending_review', 'failed'));

notify pgrst, 'reload schema';
