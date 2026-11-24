# PostScore — working rules

Next.js 14 + Supabase. These rules are standing: follow them in every session.

## Google data
- **Places data is fetched fresh when shown and never saved** (Google's terms). The only things saved:
  - place IDs;
  - PostScore's own results (scores, grades, points, ranks, distances, `scan_changes`, fingerprints);
  - owner-confirmed details (`owner_details`, owner website, owner answers);
  - lat/lng, kept 30 days at most.
- Scans read Google live, score in memory (`lib/listingScoringRow.ts`), and save only results. Pages read the listing live (`lib/ownerListing.server.ts`, 10-minute in-memory cache; Business Profile for connected owners, 0 Places calls), or show "Couldn't load from Google right now".
- Never store review text. Every live Places call is logged to `places_calls` and respects its monthly cap.
- Tests never call Google (`test/noLiveGoogle.ts`).

## Scores
- **Points, grade and total always come from the saved scan.** Live data only changes the wording. When live data disagrees with a Google-side check's saved points, show the saved result with "Changed on Google since your last scan · Re-scan to update your score" — never contradicting words.
- **Page loads never save scans or re-scores.** Only real scans and deliberate re-score scripts do. A scoring-version bump re-scores only the businesses it changes, from their last scan, labeled "PostScore updated how it scores" (never a gain or loss), after a dry run Sam has OK'd.

## Plans
- Grow tells you what's wrong and shows you how to fix it yourself. Premium does it for you, with one click.
- Every plan screen, upgrade prompt, locked preview, fix button, email and PostAI plan answer must make this difference obvious.
- On Grow, every fix that Premium can do in one click shows a small "Premium does this for you in one click →" line next to its steps.

## Wording
- EN + ES for every new string; Spanish uses the formal "usted". Wording must be honest.

## Safety flags and modes
- Respect `MONTHLY_REPORTS_LIVE` (testing mode unless "true") and `GOOGLE_WRITES_LIVE_PLACES` (Google writes only for listed places, only through the safety flow).
- Practice mode is never used in production.
- Google tokens: on a 401, refresh first; never delete tokens after one failure.

## Database
- **Schema changes:** write `supabase/*.sql` ending with `notify pgrst, 'reload schema';`, give Sam the file to paste into Supabase, and wait for "done". Never run SQL yourself.
- Dry run first, and show counts, before any delete, backfill or re-score.
- One-off DB scripts: `tmp-*.ts`, run with `npx --no-install tsx --env-file=.env.local`, `scripts/allowServerOnly.ts` before importing server code, plain supabase-js with the service role, a `setTimeout` guard and `process.exit`. Delete them afterwards.

## Testing
- **While working:** run only the tests related to the changed files, e.g. `npx vitest related <changed files> --run`, plus `npx tsc --noEmit -p .` when types change.
- **Once, right before a commit:** the full suite and every check:
  1. `npx vitest run`
  2. `npx tsc --noEmit -p .`
  3. `npx next lint`
  4. the build, in a scratch copy, so the running dev server's `.next` isn't touched:
     `rsync -a --delete --exclude .next --exclude node_modules --exclude .git ./ <scratchpad>/buildcopy/`, then in it `ln -sfn /Users/samlabo/postscore/node_modules node_modules` and `npx next build`.

## Self-check before reporting a UI change as done
- Open the affected pages on localhost (signed in) with Playwright, take screenshots, check them in EN and ES where the change has wording, and fix obvious problems before reporting.
- Name the pages checked in the report. If a page couldn't be checked, say so.
- **How:** with the dev server running, `npx --no-install tsx --env-file=.env.local scripts/devShot.ts /business/<id>/website [more paths] [--lang=es] [--plan=premium] [--width=1280]`. Screenshots go to `.devshots/` (gitignored); open them with Read.
  - It signs in through `/dev/test-login` as `DEV_TEST_LOGIN_EMAIL` / `DEV_TEST_LOGIN_PASSWORD` from `.env.local`, which the server reads. Never type, print or commit them.
  - The route only works under `next dev` on localhost. It returns 404 in production, in tests, from another host or machine, or when those variables aren't set; the `x-dev-test-login` header says why.
  - Only that account's businesses can be checked.
  - `--lang=es` shows the pages (and drafts) in Spanish through a dev-only cookie in the script's own browser — it never changes a business's saved language.
  - `--plan=free|grow|premium|multi` views the pages as that plan, in the script's own browser only. Free and paid plans show different Website cards, so check both.
  - It uses `playwright-core` with the installed Google Chrome (no browser download).

## Before launch
- **Growth tier reset:** before launch (or when Sam says), wipe every business's Growth tier and the activity history used for tiers, for ALL accounts, the dev test login included. Every tier then starts fresh from real owner actions after that date. Test/dev activity from before the reset never counts for anyone.
  - Run it with `scripts/reset-growth-tiers.ts` (built in Day 25B): dry run first, listing what would be cleared. It runs only when Sam asks, never automatically.
  - It never touches PostScore scores, scans or the Google listing.
- **New design (Presence/Growth):** it goes live for owners (`NEW_PAGES_LIVE` true in production, `lib/routes.ts`) only after Sam approves the full version in person on localhost:3001. Never flip it without that OK.
  - Preview: `npm run dev:new` runs the same code on localhost:3001 with the new design on (`NEXT_PUBLIC_NEW_DESIGN_PREVIEW=true`, its own `.next-new` build folder). `npm run dev` on :3000 and production stay as today.
  - Claude Code's own dev servers and screenshots use port 3100 (its own build folder), never 3000 or 3001.
- Until then: test and practice rows never count toward a real owner's tier. Only the dev test login's businesses count their own test activity, shown with a "Test account" tag.

## Committing
- **Never commit until Sam has tested in the browser** and says so. Push only when Sam says push.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Output
- Write long output (plans, previews, inventories, dry-run lists) to a file on the Desktop and summarize it in the reply.

## Dev
- `npm run dev`: the usual dev server (webpack).
- `npm run dev:fast`: Turbopack (`next dev --turbo`). **Not supported yet: use `npm run dev`.** It breaks the Competitors page (`Cannot read properties of null (reading 'useContext')`).
