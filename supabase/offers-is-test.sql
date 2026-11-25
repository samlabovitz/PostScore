-- Day 25B step 5: test offers (docs/plans/day25a-spec.md §6.2, rule 4).
-- Coupons/first-time offers (promos) and referral programs (referrals)
-- made in practice mode or by an internal account (the dev test login,
-- PLAN_SWITCHER_EMAILS, admins) are marked is_test = true. Customer
-- offers never lists or counts them for real owners. Every existing row
-- starts false; marking the old ones is a separate backfill, after a dry
-- run you approve.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.promos add column if not exists is_test boolean not null default false;
alter table public.referrals add column if not exists is_test boolean not null default false;

notify pgrst, 'reload schema';
