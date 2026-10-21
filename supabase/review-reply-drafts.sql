-- AI review reply drafts (lib/reviewReplies.ts, app/actions/reviewReplies.ts).
-- One row per draft PostAI writes. It is both the owner's saved reply and
-- the server-side counter for the 3 free drafts per business (lifetime;
-- Premium and Multi are unlimited), and it records the PostAI tokens each
-- draft used (cost tracking).
--
-- Nothing from Google is stored here: the owner pastes the review
-- themselves, and the pasted review text is NOT saved — only the stars
-- they picked (optional) and the reply.
--
-- Written only by the server (service role), after the action has checked
-- the signed-in owner owns the business — so an owner can't add, edit or
-- delete rows to reset the counter. Owners may read their own drafts.
--
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.review_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- 'pending' while PostAI writes it (it already counts, so two clicks at
  -- once can't both get past the limit); 'ok' once written. A failed draft
  -- is deleted, so it never uses up a free draft.
  status text not null default 'pending' check (status in ('pending', 'ok')),
  stars smallint check (stars between 1 and 5),
  reply text check (char_length(reply) <= 1200),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

create index if not exists review_reply_drafts_business_id_idx
  on public.review_reply_drafts (business_id, created_at);

alter table public.review_reply_drafts enable row level security;

drop policy if exists "Owners read their review reply drafts" on public.review_reply_drafts;
create policy "Owners read their review reply drafts"
  on public.review_reply_drafts for select
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = review_reply_drafts.business_id
        and businesses.owner_id = auth.uid ()
    )
  );
-- No insert / update / delete policies: only the service role writes.

notify pgrst, 'reload schema';
