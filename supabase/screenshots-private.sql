-- Day 23 step 2a (part 2): the website-screenshots bucket turns PRIVATE.
-- Paste ONLY after the code that serves screenshots through signed URLs is
-- deployed (app/business/[id]/website/page.tsx → lib/screenshotStorage.server.ts):
-- before that, the live site still shows the old public links, which stop
-- working the moment this runs. Each owner then sees their own screenshots
-- through signed URLs that last 1 hour; uploads stay server-side.

update storage.buckets set public = false where id = 'website-screenshots';
drop policy if exists "Public read of website screenshots" on storage.objects;

notify pgrst, 'reload schema';
