-- Per-account UI choices (e.g. "I collapsed the Score breakdown") — so
-- the owner's choice follows them to every device. One row per user and
-- key; only the owner can read or change their own rows.
--
-- Keys in use (app/actions/uiPreferences.ts):
--   overview.breakdownCollapsed   the Overview's Score breakdown
--   free.planListCollapsed        Free's "See everything in each plan" list
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- the choice is remembered on that device only.

create table if not exists public.user_ui_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 64),
  value boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_ui_preferences enable row level security;

drop policy if exists "own ui preferences: read" on public.user_ui_preferences;
create policy "own ui preferences: read" on public.user_ui_preferences for select using (auth.uid() = user_id);
drop policy if exists "own ui preferences: insert" on public.user_ui_preferences;
create policy "own ui preferences: insert" on public.user_ui_preferences for insert with check (auth.uid() = user_id);
drop policy if exists "own ui preferences: update" on public.user_ui_preferences;
create policy "own ui preferences: update" on public.user_ui_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
