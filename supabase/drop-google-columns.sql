-- Day 23 2d-5 (step D): drop the Google listing columns on businesses.
-- They were emptied on Nov 19, 2026, after every reader moved to the live
-- listing, the owner's confirmed details or PostScore's own results
-- (lib/noSavedGoogleColumns.test.ts keeps it that way). Dropping them means
-- nothing can write Google's values here again by accident.
--
-- Run on or after Nov 25, 2026, once a week has passed with everything
-- working. Run once in the Supabase SQL editor. It stops, changing
-- nothing, if any of these columns still holds a value.
--
-- Kept: gbp_* (the owner's own Business Profile counts), lat/lng (30-day
-- cleanup), owner_details, owner_website_url, verified_website_url,
-- biz_type_resolved, the niche columns, website_analysis_json.

-- One transaction: if any step fails, nothing at all is changed (the
-- policies below included).
begin;

-- Stop unless every one of these columns is empty on every row.
do $$
declare
  leftover bigint;
begin
  select count(*) into leftover
  from public.businesses
  where name is not null or address is not null or phone is not null or website is not null
     or category is not null or primary_type is not null or business_status is not null
     or price_level is not null or google_maps_uri is not null
     or rating is not null or review_count is not null or photo_count is not null
     or categories is not null or opening_hours is not null or opening_hours_periods is not null
     or google_service_options is not null or has_recent_review is not null or recent_reviews_seen is not null
     or listing_has_accessibility is not null or listing_has_payment is not null or listing_has_parking is not null
     or pure_service_area_business is not null;
  if leftover > 0 then
    raise exception 'Not dropped: % business row(s) still hold a Google value. Nothing was changed.', leftover;
  end if;
end $$;

-- "One website-only business per owner per website" was an index on
-- lower(website); a website-only business's site is now the owner's own
-- (owner_website_url). Dropping `website` drops the old index, so the same
-- rule moves to that column first.
create unique index if not exists businesses_owner_website_only_site_idx
  on public.businesses (owner_id, lower(owner_website_url))
  where listing_mode = 'website_only';

-- The two owner-write policies on the website-screenshots bucket (schema.sql)
-- were meant to compare the FILE's name (storage.objects.name) with
-- "<business id>.png". Inside their "exists (select … from businesses b)"
-- the bare word "name" resolved to businesses.name instead, so they compared
-- the business name with "<id>.png" (never true) and tied themselves to that
-- column. Recreated first with the same permission (the owner may write the
-- file named after their own business id), keyed on the business id and
-- owner id only. "name" now sits outside the subquery, where it can only
-- mean the file's name. Uploads themselves run server-side with the service
-- role and don't go through these policies.
drop policy if exists "Owners can write their business's website screenshot" on storage.objects;
create policy "Owners can write their business's website screenshot"
  on storage.objects for insert
  with check (
    bucket_id = 'website-screenshots'
    and name in (select b.id::text || '.png' from public.businesses b where b.owner_id = auth.uid ())
  );

drop policy if exists "Owners can update their business's website screenshot" on storage.objects;
create policy "Owners can update their business's website screenshot"
  on storage.objects for update
  using (
    bucket_id = 'website-screenshots'
    and name in (select b.id::text || '.png' from public.businesses b where b.owner_id = auth.uid ())
  );

-- Stop, listing them, if anything else (a policy or a view) still depends on
-- a column about to be dropped. No CASCADE: nothing is ever dropped along
-- with them.
do $$
declare
  deps text;
begin
  select string_agg(distinct coalesce(
           (select format('policy "%s" on %s', pol.polname, pol.polrelid::regclass) from pg_policy pol where pol.oid = d.objid),
           (select format('view %s', r.ev_class::regclass) from pg_rewrite r where r.oid = d.objid),
           format('%s %s', d.classid::regclass, d.objid)
         ) || ' (uses ' || a.attname || ')', '; ')
    into deps
  from pg_depend d
  join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
  where d.refobjid = 'public.businesses'::regclass
    and d.classid in ('pg_policy'::regclass, 'pg_rewrite'::regclass)
    and a.attname in ('name', 'address', 'phone', 'website', 'rating', 'review_count', 'category', 'categories',
                      'primary_type', 'opening_hours', 'opening_hours_periods', 'photo_count', 'business_status',
                      'price_level', 'google_maps_uri', 'google_service_options', 'has_recent_review',
                      'recent_reviews_seen', 'listing_has_accessibility', 'listing_has_payment',
                      'listing_has_parking', 'pure_service_area_business');
  if deps is not null then
    raise exception 'Not dropped: still in use by %. Nothing was changed.', deps;
  end if;
end $$;

alter table public.businesses
  drop column if exists name,
  drop column if exists address,
  drop column if exists phone,
  drop column if exists website,
  drop column if exists rating,
  drop column if exists review_count,
  drop column if exists category,
  drop column if exists categories,
  drop column if exists primary_type,
  drop column if exists opening_hours,
  drop column if exists opening_hours_periods,
  drop column if exists photo_count,
  drop column if exists business_status,
  drop column if exists price_level,
  drop column if exists google_maps_uri,
  drop column if exists google_service_options,
  drop column if exists has_recent_review,
  drop column if exists recent_reviews_seen,
  drop column if exists listing_has_accessibility,
  drop column if exists listing_has_payment,
  drop column if exists listing_has_parking,
  drop column if exists pure_service_area_business;

commit;

notify pgrst, 'reload schema';
