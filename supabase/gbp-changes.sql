-- Premium "Update on Google" (docs/gbp-actions-plan.md): the audit log of
-- every change PostScore sends to the owner's own Google Business Profile,
-- and the undo record. One row per field changed; one owner approval = one
-- batch_id. Holds only the previous and new value of what was changed
-- (for customer details: "true", "false" or null = not set) — never review
-- text, reviewer names, ratings or dates.
--
-- Owners can read their own business's rows; only the server (service
-- role) writes them.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- "Update on Google" says it isn't available yet and nothing is sent.

create table if not exists public.gbp_changes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  batch_id uuid not null,
  kind text not null,
  field text not null,
  before_value text,
  after_value text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz not null default now(),
  status text not null check (status in ('sent', 'pending_review', 'failed')),
  error_reason text,
  undo_of uuid,
  undone_at timestamptz
);

create index if not exists gbp_changes_business_time on public.gbp_changes (business_id, approved_at desc);
create index if not exists gbp_changes_batch on public.gbp_changes (batch_id);

alter table public.gbp_changes enable row level security;

drop policy if exists "Owners can read their own gbp changes" on public.gbp_changes;
create policy "Owners can read their own gbp changes" on public.gbp_changes
  for select using (
    exists (select 1 from public.businesses b where b.id = gbp_changes.business_id and b.owner_id = auth.uid())
  );

revoke insert, update, delete on table public.gbp_changes from anon, authenticated;
grant all on table public.gbp_changes to service_role;

notify pgrst, 'reload schema';
