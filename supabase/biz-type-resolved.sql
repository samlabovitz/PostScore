-- Day 23 2d-1: our own resolved business type (e.g. "barbershop"), saved
-- at each scan from that scan's live Google category/types. It's
-- PostScore's own result, so pages read it instead of Google's saved
-- category, primary_type and types (blanked later, in 2d-5). The owner's
-- business_type_override still wins over it. Filled for existing
-- businesses by scripts/biz-type-resolved-backfill.ts (dry run first).

alter table public.businesses add column if not exists biz_type_resolved text;

notify pgrst, 'reload schema';
