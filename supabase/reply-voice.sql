-- Day 25B step 6, item 9: "Replies are written as: Me (I) / My team (we)".
-- The owner's own choice for PostAI's review reply drafts
-- (lib/reviewReplies.ts ReplyVoice). null = not chosen yet: drafts are
-- written as "Me" (the owner, in the first person).
--
-- Written by the server (app/actions/reviewReplies.ts setReplyVoice) for the
-- signed-in owner; the existing businesses RLS policies (owner can select /
-- update their own row) cover it. Not Google data.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it's run,
-- drafts use "Me" and the setting says it can't be saved yet.

alter table public.businesses
  add column if not exists reply_voice text check (reply_voice in ('me', 'team'));

comment on column public.businesses.reply_voice is
  'Review reply drafts are written as the owner (me: I) or the team (team: we). null = me. Chosen by the owner.';

notify pgrst, 'reload schema';
