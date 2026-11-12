-- "Update website on Google" and customer details' "Update on Google"
-- under the same switches as every other Google write
-- (lib/gbpWebsiteLink.server.ts, lib/gbpAttributes.server.ts): their
-- outcome is logged in the existing edit log, like hours, phone,
-- description and the ordering / booking link.
--
-- 1. gbp_profile_edit_log may take fields 'website_link' and 'customer_details'.
-- 2. gbp_profile_edit_log.changed_count: how many settings one approval
--    changed (1 for the website link) — never a value. gbp_changes keeps
--    the previous and new values, for Undo, as before.
--
-- Until this file is run, Approve on those two says "Editing from
-- PostScore isn't set up yet" and nothing is sent to Google.
--
-- Run once in the Supabase SQL editor, after gbp-profile-edits.sql and
-- gbp-order-link.sql. Safe to run again.

alter table public.gbp_profile_edit_log drop constraint if exists gbp_profile_edit_log_field_check;
alter table public.gbp_profile_edit_log
  add constraint gbp_profile_edit_log_field_check
  check (field in ('hours', 'phone', 'description', 'order_link', 'website_link', 'customer_details'));

alter table public.gbp_profile_edit_log add column if not exists changed_count smallint check (changed_count between 0 and 100);

notify pgrst, 'reload schema';
