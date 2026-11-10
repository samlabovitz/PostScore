-- Premium "Reply to your Google reviews" (lib/gbpReviewInbox.server.ts,
-- app/actions/googleReviews.ts): the audit log of every reply PostScore
-- posts, edits or deletes on the owner's own Google Business Profile —
-- always after the owner's own click (Google's policy).
--
-- One row per attempt: who (user_id), when (created_at), which review
-- (Google's review id) and how long the reply was. Never the review text,
-- the reply text, the reviewer's name or the star rating.
--
-- Owners can read their own business's rows; only the server (service
-- role) writes them. PostScore checks this table is there before it posts:
-- until this file is run, posting says it isn't available yet and nothing
-- is sent to Google.
--
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.gbp_review_reply_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('post', 'edit', 'delete')),
  review_id text not null check (char_length(review_id) <= 200),
  reply_length integer check (reply_length >= 0),
  -- 'ok': Google confirmed it on read-back. 'unconfirmed': Google accepted
  -- it but the read-back didn't show it yet. 'failed': nothing changed.
  -- 'practice': practice mode's fake Google (lib/gbpReviewPractice.ts),
  -- with the outcome in error_reason — never mixed with real rows.
  status text not null check (status in ('ok', 'unconfirmed', 'failed', 'practice')),
  error_reason text check (char_length(error_reason) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists gbp_review_reply_log_business_time on public.gbp_review_reply_log (business_id, created_at desc);

alter table public.gbp_review_reply_log enable row level security;

drop policy if exists "Owners can read their own review reply log" on public.gbp_review_reply_log;
create policy "Owners can read their own review reply log" on public.gbp_review_reply_log
  for select using (
    exists (select 1 from public.businesses b where b.id = gbp_review_reply_log.business_id and b.owner_id = auth.uid())
  );

revoke insert, update, delete on table public.gbp_review_reply_log from anon, authenticated;
grant all on table public.gbp_review_reply_log to service_role;

notify pgrst, 'reload schema';
