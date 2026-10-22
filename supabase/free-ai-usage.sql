-- Free plan AI allowance (lib/freeAiAllowance.ts, lib/freeAiUsage.server.ts):
-- 3 PostAI questions and 3 review reply drafts per business per week, and
-- the FREE_AI_MONTHLY_CAP spending guard across all Free accounts.
--
-- One row per Free AI call. A row is added as 'pending' BEFORE the AI is
-- called (so two clicks at once can't both get past the limit); a failed
-- call deletes its row, so it never uses up a question or a draft; a
-- finished call becomes 'ok'. Grow, Premium and Multi never write here.
--
-- Nothing from Google and no question or reply text is stored here — only
-- which business, which kind, and when.
--
-- Written only by the server (service role), after the action has checked
-- the signed-in owner owns the business — so an owner can't delete rows to
-- reset the counter. Owners may read their own rows.
--
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.free_ai_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('postai', 'reply_draft')),
  status text not null default 'pending' check (status in ('pending', 'ok')),
  created_at timestamptz not null default now()
);

create index if not exists free_ai_usage_business_kind_idx
  on public.free_ai_usage (business_id, kind, created_at);

create index if not exists free_ai_usage_created_at_idx
  on public.free_ai_usage (created_at);

alter table public.free_ai_usage enable row level security;

drop policy if exists "Owners read their free AI usage" on public.free_ai_usage;
create policy "Owners read their free AI usage"
  on public.free_ai_usage for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = free_ai_usage.business_id and b.owner_id = auth.uid()
    )
  );

-- No insert/update/delete policies: only the service role writes.

notify pgrst, 'reload schema';
