-- "What PostAI knows about your business": one new owner-entered field,
-- "What makes you different" (lib/businessOffer.ts, the PostAI panel).
-- Short text, optional, owner-written only — PostAI uses it as
-- owner-provided, never as verified fact.
--
-- Nothing else changes: "What you offer" (Services / Products & brands /
-- Menu favorites / Programs & classes, by business type) is still
-- businesses.services, and the typical spend is still
-- avg_job_value_low/high — every value already saved stays as it is.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.businesses add column if not exists differentiator text;

alter table public.businesses drop constraint if exists businesses_differentiator_length;
alter table public.businesses
  add constraint businesses_differentiator_length
  check (differentiator is null or char_length(differentiator) <= 160);

notify pgrst, 'reload schema';
