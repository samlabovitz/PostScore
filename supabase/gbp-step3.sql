-- Day 22B step 3 (phases C–I and the booking-tracking reminder).
--
-- Only small summaries of what Google shows are kept — never the photos,
-- the posts' text, or the listing itself:
--   gbp_connections.photo_count / newest_photo_at / photos_checked_at:
--     how many photos the listing has and the newest one's date (v4 media).
--   gbp_connections.posts_last_30_days / last_post_at / last_post_type /
--     posts_checked_at: the owner's Google posts (v4 localPosts).
--   gbp_connections.booking_reminder_snoozed_at: "I turned it on" for the
--     "Turn on Google booking" reminder (hidden 14 days, then re-checked).
-- They live on the connection row, so disconnecting removes them.
--
-- The listing's name and address (current + previous) are kept in each
-- scan's existing profile_snapshot_json — no new columns.
--
-- gbp_profile_edit_log may also take fields 'special_hours' (holiday hours)
-- and 'services' (free-form services) — the two new Google writes, through
-- the same preview → approve → read back → 7-day undo flow.

alter table public.gbp_connections
  add column if not exists photo_count integer check (photo_count is null or photo_count >= 0),
  add column if not exists newest_photo_at timestamptz,
  add column if not exists photos_checked_at timestamptz,
  add column if not exists posts_last_30_days integer check (posts_last_30_days is null or posts_last_30_days >= 0),
  add column if not exists last_post_at timestamptz,
  add column if not exists last_post_type text check (last_post_type is null or char_length(last_post_type) <= 40),
  add column if not exists posts_checked_at timestamptz,
  add column if not exists booking_reminder_snoozed_at timestamptz;

alter table public.gbp_profile_edit_log drop constraint if exists gbp_profile_edit_log_field_check;
alter table public.gbp_profile_edit_log
  add constraint gbp_profile_edit_log_field_check
  check (field in ('hours', 'phone', 'description', 'order_link', 'website_link', 'customer_details', 'special_hours', 'services'));

notify pgrst, 'reload schema';
