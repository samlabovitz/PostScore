-- Brings the live business-type rule up to date with supabase/schema.sql
-- (Day 2b added Community Center, Nonprofit, Place of Worship, Dessert Shop
-- and Specialty Store). Without it, choosing a niche under one of those
-- types (e.g. "Toy, game & hobby store" → Specialty store) is rejected.
-- Lists exactly the 44 types in config/bizProfiles.ts, plus 'default'.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.businesses drop constraint if exists businesses_business_type_override_check;
alter table public.businesses add constraint businesses_business_type_override_check
  check (
    business_type_override is null
    or business_type_override in (
      'barbershop', 'spa', 'nail_salon', 'salon',
      'dessert_shop', 'cafe', 'bar', 'bakery', 'liquor_store', 'grocery_market', 'restaurant',
      'hardware_store', 'florist', 'retail_boutique', 'specialty_store',
      'community_center', 'gym_fitness', 'pet_services', 'dentist', 'medical_clinic',
      'lawyer', 'accountant', 'real_estate', 'consultant', 'coach', 'tutor_education', 'photographer', 'practitioner',
      'auto_repair', 'plumber', 'electrician', 'landscaper', 'cleaning_service',
      'home_services', 'repair_dropoff', 'recreation', 'events', 'car_wash_detailing',
      'childcare', 'lodging', 'tattoo_body_art',
      'nonprofit', 'place_of_worship',
      'default'
    )
  );
