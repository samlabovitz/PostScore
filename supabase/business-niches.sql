-- Business niches + competitor areas (Day 5, ~/Desktop/business-types-plan.md).
--
-- A niche is the specific kind of business ("Skate & snow shop") under its
-- parent business type (business_type_override / auto-detection — unchanged).
-- Owners pick it in Settings; until they do, PostScore detects it and asks
-- once ("We think you're a … — Change"). The competitor columns hold which
-- "also competes with" areas count for this business and how it's ranked.
-- Nothing here makes any Google call.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.businesses
  add column if not exists niche_id text,
  -- 'owner' (picked or confirmed by the owner) | 'approved' (a correction
  -- approved by PostScore, still shown to the owner once) | null (detected).
  add column if not exists niche_source text,
  -- When the owner confirmed or changed it — the one-time banner stops then.
  add column if not exists niche_confirmed_at timestamptz,
  -- Ticked "also competes with" areas (niche ids); null = all of them.
  add column if not exists competitor_areas text[],
  -- 'auto' (direct when there are 3+ direct competitors, else direct + ticked
  -- areas) | 'direct' | 'wide'.
  add column if not exists competitor_scope text not null default 'auto';

alter table public.businesses drop constraint if exists businesses_niche_source_check;
alter table public.businesses
  add constraint businesses_niche_source_check check (niche_source is null or niche_source in ('owner', 'approved'));

alter table public.businesses drop constraint if exists businesses_competitor_scope_check;
alter table public.businesses
  add constraint businesses_competitor_scope_check check (competitor_scope in ('auto', 'direct', 'wide'));

-- Owners already update their own businesses rows (existing RLS policy
-- "Users can update their own businesses"), so no new policy is needed.
