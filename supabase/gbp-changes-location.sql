-- Google undo safety (code review Nov 7, M1): every gbp_changes row records
-- the Google location it was made on, and a disconnect closes undo.
-- - location_name: "locations/456" (gbp_connections.google_location_id at
--   the time). Undo refuses any change made on a different location than
--   the one connected now, and any row without one.
-- - undo_closed_at: set on every open change when the owner disconnects
--   Google (lib/gbpTokens.server.ts closeOpenUndos) — no longer undoable.
--
-- Rows already logged get their location only when it's certain: made
-- after the current connection was made (connected_at is reset on every
-- connect), so they were made on that same location. Older rows stay
-- without one and can't be undone here.
--
-- Run once in the Supabase SQL editor, after supabase/gbp-changes.sql.
-- Safe to run again. Until it's run, Undo isn't offered and nothing is
-- undone; changes are still logged.

alter table public.gbp_changes
  add column if not exists location_name text,
  add column if not exists undo_closed_at timestamptz;

update public.gbp_changes c
set location_name = g.google_location_id
from public.gbp_connections g
where c.business_id = g.business_id
  and c.location_name is null
  and g.google_location_id is not null
  and c.approved_at >= g.connected_at;

notify pgrst, 'reload schema';
