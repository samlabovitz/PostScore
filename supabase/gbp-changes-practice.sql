
-- Day 22B: every gbp_changes row records whether it was made in practice
-- mode (practice mode's fake Google — never sent to Google).
--
--   practice: true for practice rows. Existing rows are marked from what
--   they already carry: a kind ending in "_practice" or the practice
--   listing ("locations/practice"). New rows are marked the same way by a
--   trigger, so every writer is covered without depending on app code.
--   Nothing is deleted.

alter table public.gbp_changes
  add column if not exists practice boolean not null default false;

update public.gbp_changes
  set practice = true
  where practice = false
    and (kind like '%\_practice' escape '\' or coalesce(location_name, '') = 'locations/practice');

create or replace function public.gbp_changes_mark_practice()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.practice := coalesce(new.practice, false)
    or new.kind like '%\_practice' escape '\'
    or coalesce(new.location_name, '') = 'locations/practice';
  return new;
end;
$$;

drop trigger if exists gbp_changes_mark_practice on public.gbp_changes;
create trigger gbp_changes_mark_practice
  before insert or update of kind, location_name on public.gbp_changes
  for each row execute function public.gbp_changes_mark_practice();

create index if not exists gbp_changes_business_practice
  on public.gbp_changes (business_id, practice, approved_at desc);

notify pgrst, 'reload schema';
