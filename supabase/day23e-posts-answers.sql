-- Day 23E: Google posts, "Answer your customers' common questions", Approve all.
--
-- 1. gbp_changes.origin: which PostScore flow made a change — 'answers'
--    (the answers preview) or 'approve_all' (the This-week "Approve all").
--    null = an ordinary edit. Used only to label results on the chart and
--    in "Since you did this". Posts themselves are gbp_changes rows with
--    kind 'local_post' (practice: 'local_post_practice'), field 'post':
--    Google's post name and PostScore's own choices only — never the text.
--
-- 2. gbp_profile_edit_log may take field 'posts'.
--
-- 3. post_drafts: the week's Google post draft PostScore wrote (the
--    business's own post text, never anything from Google), so opening the
--    tab again shows the same draft without a new AI call, and Grow's
--    "1 draft a week + 3 Write another" is counted on the server.
--    Written only by the server (service role) after the owner check.
--    Owners may read their own rows.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.gbp_changes
  add column if not exists origin text
    check (origin is null or origin in ('answers', 'approve_all'));

alter table public.gbp_profile_edit_log drop constraint if exists gbp_profile_edit_log_field_check;
alter table public.gbp_profile_edit_log
  add constraint gbp_profile_edit_log_field_check
  check (field in ('hours', 'phone', 'description', 'order_link', 'website_link', 'customer_details', 'special_hours', 'services', 'photos', 'posts'));

create table if not exists public.post_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Monday of the week, in the business's time zone.
  week_start date not null,
  kind text not null check (kind in ('week', 'another', 'good_to_know')),
  -- The business's language when it was written (a draft is never shown in the other one).
  language text not null default 'en' check (language in ('en', 'es')),
  text text not null check (char_length(text) between 1 and 1500),
  created_at timestamptz not null default now()
);

create index if not exists post_drafts_business_week_idx
  on public.post_drafts (business_id, week_start, language, created_at desc);

alter table public.post_drafts enable row level security;

drop policy if exists "Owners read their post drafts" on public.post_drafts;
create policy "Owners read their post drafts"
  on public.post_drafts for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = post_drafts.business_id and b.owner_id = auth.uid()
    )
  );

-- No insert/update/delete policies: only the service role writes.

notify pgrst, 'reload schema';
