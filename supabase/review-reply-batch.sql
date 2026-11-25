-- Day 25B: one set of saved review reply drafts (the "one reply tool").
-- PostAI writes a draft for each unanswered Google review in the background
-- (the daily job, after a scan, or after the owner changes "Replies are
-- written as") — never during a page load. The Reviews inbox, the Growth
-- plan and Google results only READ these rows.
--
-- Saved: our own drafts and the owner's choices. Never the review's text,
-- the reviewer's name or anything else from Google: the review is read live
-- when shown. review_id is Google's id for the review (an identifier, like
-- a place id); review_updated is its update time, so an edited review gets
-- a fresh draft.
--
-- Written by the server with the service role (lib/replyBatch.server.ts).
-- Owners read their own rows and update their own edits (the text, the
-- length, "Include in Approve all") through RLS.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- the pages say the drafts aren't ready yet and nothing else changes.

create table if not exists public.review_reply_batch (
  business_id uuid not null references public.businesses(id) on delete cascade,
  review_id text not null,
  review_updated text,
  reply text,
  -- 'ready' (a draft that passed every reply rule) or 'failed' (PostAI couldn't write one that does).
  status text not null default 'ready' check (status in ('ready', 'failed')),
  length text not null default 'medium' check (length in ('short', 'medium', 'long')),
  voice text not null default 'me' check (voice in ('me', 'team')),
  rules_version int not null default 0,
  -- "Include in Approve all" (the owner's choice).
  include boolean not null default true,
  -- The owner edited the text: a background run never replaces it.
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, review_id)
);

alter table public.review_reply_batch enable row level security;

drop policy if exists "review_reply_batch_owner_select" on public.review_reply_batch;
create policy "review_reply_batch_owner_select" on public.review_reply_batch
  for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "review_reply_batch_owner_update" on public.review_reply_batch;
create policy "review_reply_batch_owner_update" on public.review_reply_batch
  for update using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

comment on table public.review_reply_batch is
  'Saved PostAI review reply drafts (our own text) per unanswered Google review id. Never review text. Written in the background, read by pages.';

notify pgrst, 'reload schema';
