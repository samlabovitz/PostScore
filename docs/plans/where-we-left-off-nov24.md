# Where we left off: Nov 24, 2026 (Day 25B step 6)

All work is on branch **`wip/day25b-step6`**, pushed but **not merged and not deployed**. `main` and production are unchanged.

- **New design:** lives on localhost:3001 (`npm run dev:new`). localhost:3000 still shows today's design, except the items marked **(3000 too)**.
- **Checks at the time of the commit:**
  - 4,429 tests pass;
  - `tsc` and `next lint` are clean;
  - the build in a scratch copy compiles.
- **Browser testing:** none of this has been tested by you in the browser yet. The CLAUDE.md rule "never commit until Sam has tested" was waived for this WIP branch at your request.

## What's built

### Growth tier and the Growth plan (step 6, Parts A + B)
- **Tier engine** (`lib/growthTier.ts`): all of spec §6.2–6.4.
- **Loader:** `lib/growthTier.server.ts`.
- **Monday job:** `/api/cron/growth-tiers` + `netlify/functions/growth-tiers-scheduler.mts`. A dry run unless `GROWTH_TIERS_LIVE` is "true".
- **Reset script:** `scripts/reset-growth-tiers.ts`. A dry run unless `--apply`.
- **`offer_uses` logging.**
- **Dev-only tier switch:** "Tier: Real · 1–5" in the plan pill. Keep states can be previewed too: `devShot --tier=2-quiet`.
- **Growth plan on 3001:**
  - the tier card and the "Keep your tier" strip (green / gold / amber / closed);
  - Tier 5 "You're at the top";
  - this week's plan ranked for the tier, with tier lines and the "Do 1 task → on track for …" top line;
  - "Also this week" (review link & QR, Check your hours);
  - "More ways", the Google results link and "More customers";
  - the Free preview and the not-connected state.
- **The tier everywhere:** the Growth header line, the Overview Growth line (with the amber line), the phone bar and "Test account".
- **"Since you did this":** never shows test offers to real owners; has its own empty state.

### Drafts and replies
- **Draft control (3000 too):**
  - an optional theme input plus a gold "Draft another with PostAI" on the post and the description;
  - Grow shows "N of 3 drafts left this week";
  - the description has its own label and example.
- **"On Google now":** the description, read live and never saved; each service marked New or Changed.
- **Review reply rules (3000 too):**
  - first name, owner voice (Me / My team);
  - Short · Medium · Long and Different wording;
  - varied openings, and no 4-word phrase repeats within a batch;
  - no stock phrases;
  - stars-only reviews get the fixed thanks plus an owner line;
  - every rule is checked in code.
  - The drafts are in `docs/mockups/day25b/reply-drafts.md`.
- **One reply tool (items 1–4):**
  - Drafts are written in the background (daily job, after each scan, after a voice change) and saved in `review_reply_batch`; pages only read them.
  - Reviews is the home: each unanswered review opens on its saved draft, with the tool's controls and "Write my own".
  - Growth plan and Google results show one line: "{n} replies drafted and ready · Review them →", or "8 of 10 ready". It's the same number Approve all sends.
  - "Me" shows as the choice by default.
- **"Since you did this" timer:** a plain fetch (`/api/business/[id]/since`), so its 20 seconds start when the read is sent. After a server restart, the Oct 21 card loaded: sent at 6 s, answered in under 1 s.

### Presence pages
- **Fix plan v2 (3001):**
  - three groups with subtotals and compact rows;
  - the priority in its own column, the status dot and a one-line "why";
  - outline buttons under "Takes months";
  - only the first row starts open;
  - the speed row at the end of "Takes a few weeks".
- **How-to wording (3000 too):** depends on plan, connection and writes. "PostScore drafts it… (Beta)" with the one-click button first; Grow's steps plus the Premium line; "Connect Google…"; read only for now; or "This one you do yourself, on Google". The stale "we can't edit your listing" line is gone everywhere, PostAI included.
- **Two scores (3001):**
  - the strip under the Overview score card and at the top of the Growth plan, with "×" remembered per user (in their account);
  - "Fix plan takes you to 100 →" and "A higher score helps more people find you on Google.";
  - the gold note under 70.
- **Reviews (3001):** the gold "Get more reviews (in Growth) →" in two places. "Back to…" is gone on the new-design pages.
- **Title points (3000 too):** "Reviews & Replies 21 / 40 pts" and "Website 29 / 30 pts · speed not scored yet", rounded like the Overview breakdown.
- **Print kit & QR:** hidden (`PRINT_KIT_LIVE = false`), off the sidebar and the Growth tools; `/print-kit` goes to Get more reviews `#review-link`; the spec is updated.

### Website page (3000 too)
- **Removed:** the FAQ draft and the PostStudio box; PostStudio is one line. Headings are one short line each.
- **Starter site:**
  - always open, and first when there's no real website;
  - a real score comparison (Recommended / keep it / "would add N points");
  - "Points count once the starter site is live…".
- **Kee's Cookies, fixed:**
  - Cause: the listing couldn't be read (the dev guard on localhost; a failed read or the cap in production), and the page and scoring didn't fall back to the site the scan graded.
  - Now they use that site ("From your last scan").
  - When the listing is read and has no link: "Your website isn't on your Google listing yet: add it →".
- **Buttons:** "Re-check my website" next to "Refresh screenshots", each with its own count under it. Re-check is now **2 a day** (was 3).
- **Fix line:** whole points: "Fix this 1 and your Website gets its last point (score 78 → 79)."
- **Score card:** one number, "29 / 30 pts · speed not scored yet". "1 check left · How to fix each check ↓" sits under it.
- **Screenshots:**
  - framed thumbnails with a fade, a phone frame, and a viewer (×/Esc); they scroll sideways on phones;
  - a **phone-size capture (390 × 844)** is now taken with the screenshots: one more paid ScreenshotOne call per capture. It shows after the next capture.

### Mockups
`docs/mockups/day25b/`: `fix-plan-v2.html`, `overview-two-scores.html` and `growth-plan-two-scores.html`, with screenshots in `screenshots/`.

## Still open

1. **Your in-person check on 3001**, for everything above:
   - Growth plan, Fix plan v2, two scores;
   - Reviews with the saved drafts (after the SQL below);
   - Website page, Kee's included.
2. **One reply tool (items 1–4):** built, but not seen working end to end. It needs `supabase/review-reply-batch.sql` run first. Then check that drafts appear after a scan or the next daily run, the "8 of 10 ready" line, posting from Reviews, and Approve all. Not checked yet: a business with many unanswered reviews, or Spanish reviews.
3. **Kee's website check:** fixed on the page and in scoring. Not yet checked:
   - a business whose listing really has no website link (the "add it →" line);
   - production behavior with live reads on.
4. **Background drafts and the "Since" timer:** built and checked once on a cold start.
   - The daily job (`reply-drafts-scheduler`, 10:00 UTC) only runs once deployed.
   - The after-scan trigger runs in the background, so it may be cut short on serverless. Watch for `[reply-drafts]` in the logs.
5. **Website page:**
   - Phone thumbnail: none yet until a fresh capture ("Refresh screenshots").
   - The viewer shows one screen per page (captures aren't full page). Full-page captures would be a separate decision (cost).
6. **Capability audit:** not started. Check every page and every message for what PostScore can actually do per plan and connection (what this session started with the how-to wording).
7. **Sweep of all 70 businesses:** not started. Screenshot or spot-check each business's pages (Website, Fix plan, Growth plan) for wrong states like Kee's "no website".
8. **Smaller follow-ups:**
   - **Replies:** a few drafts carry small inferences their reviews don't state (see `reply-drafts.md`, #5, #9 and #10).
   - **Not-connected Growth plan:** shows only the routine items (mockup 03b wanted the Google tasks as steps; that needs a scan-based task list).
   - **Campaigns tile:** reads "coming soon" (email isn't live).

## Your to-dos

1. **Run in Supabase**, then tell me "done":
   - `supabase/reply-voice.sql` (`businesses.reply_voice`);
   - `supabase/review-reply-batch.sql` (`review_reply_batch`, the saved drafts).
2. **Check `wip/day25b-step6` on localhost:3001 in the browser** (`git checkout wip/day25b-step6 && npm run dev:new`). Also check localhost:3000 for the "3000 too" items.
3. **Decide:**
   - full-page screenshot captures (cost) for the viewer;
   - whether the scan should count only owner photos for the "New photo on Google" verified action (it currently counts customer photos too);
   - the not-connected Growth plan task list (scan-based).
4. **When happy:** say "commit/merge" and then "push" to main. Nothing goes live before then. `NEW_PAGES_LIVE` stays off until you approve the full version in person.
5. **Netlify, when deploying:** the new scheduled functions (`reply-drafts-scheduler`, `growth-tiers-scheduler`) need `CRON_SECRET` and the site URL. `GROWTH_TIERS_LIVE` stays unset until you OK the Monday job.
