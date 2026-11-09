-- "Wrong site?" (Nov 9): the website the OWNER confirmed is theirs, and the
-- guard that keeps every website column the score reads server-only.
--
-- Which site PostScore grades, screenshots and shows (lib/businessWebsite.ts):
-- the owner's confirmed site (owner_website_url) when set, else the site
-- PostScore verified (verified_website_url), else the Google listing's link.
--
-- - owner_website_url / owner_website_confirmed_at: written only by the
--   server (app/actions/ownerWebsite.ts) after it checked the page loads
--   and isn't a parked page.
-- - owner_website_previous_url / owner_website_previous_at: what "Undo"
--   puts back (null = no owner choice before).
--
-- Owners can update their own businesses row (supabase/schema.sql), so a
-- trigger refuses any change to these columns, or to verified_website_url,
-- from a signed-in browser session (role "authenticated"/"anon"). The
-- server's service role and the SQL editor are unaffected.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- "Wrong site?" says it isn't available yet and nothing changes.

alter table public.businesses
  add column if not exists owner_website_url text,
  add column if not exists owner_website_confirmed_at timestamptz,
  add column if not exists owner_website_previous_url text,
  add column if not exists owner_website_previous_at timestamptz;

create or replace function public.guard_business_website_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.verified_website_url is not null
        or new.owner_website_url is not null
        or new.owner_website_confirmed_at is not null
        or new.owner_website_previous_url is not null
        or new.owner_website_previous_at is not null then
        raise exception 'website columns are set by the server only' using errcode = '42501';
      end if;
    elsif new.verified_website_url is distinct from old.verified_website_url
      or new.owner_website_url is distinct from old.owner_website_url
      or new.owner_website_confirmed_at is distinct from old.owner_website_confirmed_at
      or new.owner_website_previous_url is distinct from old.owner_website_previous_url
      or new.owner_website_previous_at is distinct from old.owner_website_previous_at then
      raise exception 'website columns are set by the server only' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_business_website_columns on public.businesses;
create trigger guard_business_website_columns
  before insert or update on public.businesses
  for each row execute function public.guard_business_website_columns();

notify pgrst, 'reload schema';
