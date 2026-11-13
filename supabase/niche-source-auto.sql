-- Business type detection (lib/businessTypeDetect.server.ts): when a
-- business is added — and once for saved businesses with no type — and
-- PostScore is confident, it saves the type itself as niche_source
-- 'auto'. The Overview then shows "We picked … — Change" until the owner
-- confirms or changes it. A type the owner chose ('owner') is never
-- touched.
--
-- Until this file is run, nothing is saved by detection (the save is
-- refused and logged) and the Overview keeps asking the owner, as before.
--
-- Run once in the Supabase SQL editor, after business-niches.sql. Safe to
-- run again.

alter table public.businesses drop constraint if exists businesses_niche_source_check;
alter table public.businesses
  add constraint businesses_niche_source_check check (niche_source is null or niche_source in ('owner', 'approved', 'auto'));

notify pgrst, 'reload schema';
