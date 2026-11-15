-- Day 22B: "Add photos" from PostScore (Business Profile API v4 media).
--
-- The image files are never stored: each photo is uploaded straight
-- through to Google. gbp_changes keeps only the Google media name, the
-- category, the date and the status (kind 'photos' / 'photos_practice',
-- field 'media'), for the 7-day undo (delete that media item) and history.
-- The edit log gets 'photos' as a field.

alter table public.gbp_profile_edit_log drop constraint if exists gbp_profile_edit_log_field_check;
alter table public.gbp_profile_edit_log
  add constraint gbp_profile_edit_log_field_check
  check (field in ('hours', 'phone', 'description', 'order_link', 'website_link', 'customer_details', 'special_hours', 'services', 'photos'));

notify pgrst, 'reload schema';
