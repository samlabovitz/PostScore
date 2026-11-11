-- The "Order online" / "Booking link" card, and "Add to 'Order online'"
-- on the platform link card (lib/gbpOrderLink.server.ts): the owner's own
-- ordering or booking link on Google, logged in the existing edit log.
--
-- 1. gbp_profile_edit_log may take field 'order_link'.
-- 2. gbp_profile_edit_log.link_type: Google's link type for that row
--    (FOOD_ORDERING, APPOINTMENT…) — never the URL. gbp_changes keeps the
--    previous and new link, for Undo, as before.
--
-- Until this file is run, Approve says "Editing from PostScore isn't set up
-- yet" and nothing is sent to Google.
--
-- Run once in the Supabase SQL editor, after gbp-profile-edits.sql. Safe to
-- run again.

alter table public.gbp_profile_edit_log drop constraint if exists gbp_profile_edit_log_field_check;
alter table public.gbp_profile_edit_log
  add constraint gbp_profile_edit_log_field_check check (field in ('hours', 'phone', 'description', 'order_link'));

alter table public.gbp_profile_edit_log add column if not exists link_type text check (char_length(link_type) <= 40);

notify pgrst, 'reload schema';
