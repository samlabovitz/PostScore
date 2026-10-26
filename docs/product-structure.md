# PostScore — product structure

The map of where everything lives: the sidebar, what each page holds, and
what each plan includes. Keep this file current when a page or plan changes.
The build plan that gets us here is `docs/day5-website-studio-plan.md`
(Day 5a); hosted-site notes are in `docs/website-studio.md`.

Status legend: **built** = live today · **move** = built, moving pages ·
**new** = not built yet (shows a real-data preview + "Coming soon" or the
plan it needs — never hidden, never a fake feature).

---

## Sidebar

One simple list, no group headings, same style as today
(`components/layout/Sidebar.tsx`, `NAV_ITEMS`). Settings stays in the
account menu (`components/layout/AccountMenu.tsx`).

| # | Tab | Route | Status |
|---|-----|-------|--------|
| 1 | Overview | `/business/[id]` | built (with the PostStudio card) |
| 2 | Growth | `/business/[id]/growth` | built — tabs: This week's plan · Google Profile |
| 3 | Campaigns | `/business/[id]/campaigns` | built — tabs: All campaigns · Coupons · Referrals |
| 4 | Reviews | `/business/[id]/website-reviews` | built |
| 5 | Website | `/business/[id]/website` | built |
| 6 | Competitors | `/business/[id]/competitors` | built |
| 7 | Price check | `/business/[id]/pricing` | built — renamed from "Pricing" (label only; `dashboard.nav.pricing`) |
| 8 | Reports | `/business/[id]/reports` | built |
| — | Settings (account menu) | `/business/[id]/settings` | built; gains a **Connections** section (planned) |

**Not sidebar tabs:**
- **Google Profile** is a tab inside Growth: `/business/[id]/growth?tab=google-profile`.
- **PostStudio** is a full-screen page with no sidebar, `/business/[id]/studio?from=…`, opened from the Overview card or the Website page's "Build it in PostStudio" link. "← Leave PostStudio" returns to where they came from (default: the Overview).

**Old URLs redirect** (no broken links):

| Old URL | Goes to |
|---|---|
| `/business/[id]/google-profile` | `/business/[id]/growth?tab=google-profile` |
| `/business/[id]/search-demand` | `/business/[id]/growth?tab=google-profile#search-demand` |
| `/business/[id]/growth?tab=coupons` | `/business/[id]/campaigns?tab=coupons` |
| `/business/[id]/growth?tab=referral` | `/business/[id]/campaigns?tab=referrals` |

Tabs live in the URL (`?tab=…`), so links and back/forward land on the right one.

Rule for unbuilt features: always visible. They show the business's own real
data plus "Coming soon" (not built) or the plan they need ("Unlock with
Premium", the PostStudio price). Nothing in a preview is invented — if real
data isn't available, the preview says so.

---

## What lives on each page

### Overview — built
- The PostScore, grade and category breakdown (every check, what's wrong and why it matters).
- Top recommendations (the website one links to the Website page's 3-option chooser).
- Storefront photo.
- "Since your last visit" pop-up (`components/visits/SinceLastVisit.tsx`).
- **PostStudio card**, "PostStudio — build your full website" (below the score and next steps), which opens the full-screen PostStudio page.
- Also: PostAI (`AssistantLauncher`), "More customers" (`GrowMoreCustomers`), the Live listing section and scan history.
- **On Free (5f, done)** — the Overview is the audit (`components/overview/FreeOverview.tsx`):
  - score, grade and breakdown unchanged;
  - "Your next steps" → **"What's holding your score back"**: the top 3 real issues (biggest first) with what each costs; "How to fix it" opens a `LockedPreview` of the fix guide's first step + the matching unlock line (`issueUnlockLine`);
  - reviews first (`FreeReviewFocus`): the real review gap when they trail nearby competitors, and the review link & QR (free);
  - competitor rank fully visible, plus "You're #N of M nearby…" when they trail;
  - PostAI → a `LockedPreview` with their real starter questions — no AI call (`sendAssistantMessage` also refuses on Free, server-side);
  - 1 owner re-scan per 7 days (+ the first scan) on top of the 24-hour rule — `rescanGate` in `lib/rescanPolicy.ts`, checked in `rescanBusiness` before any Google call; owner re-scans are logged in `places_calls` (kind `owner_rescan`, one Places Details call) and the note says "Next free re-scan: {date}";
  - Free competitors are never refreshed after the first scan — not by a re-scan (no Nearby Search), the monthly report (testing mode only — reuses the saved scan) or `scripts/rescan-all.ts`. Grow re-scans also refresh competitors when the last refresh is 7+ days old; Premium and Multi on every re-scan (`rescanRefreshesCompetitors` in `lib/competitorScanPolicy.ts`), all still under `PLACES_SEARCH_MONTHLY_CAP`. Outside a request there's no stored plan yet (no checkout), so the cron and the script treat every account as Free (`backgroundPlan` in `lib/plan.ts`) — and Free gets no monthly report email, so until subscriptions ship the cron emails no one;
  - the Grow showcase strip stays at the bottom.
  Grow, Premium and Multi see the Overview unchanged.
- **`LockedPreview`** (`components/plan/LockedPreview.tsx`) is the shared locked feature for 5f: the real UI with the business's own data, read-only (`inert`), fading under a small lock, one unlock line (shown only when its data is real) and a small "See plans", which opens the promo box. It never fetches anything itself.

### Growth — built
Two tabs (`?tab=google-profile`):
- **This week's plan:** weekly plan, weekly routine, bigger projects, celebrations, ways to bring in customers. "Run an offer" ideas link to the right **Campaigns** tab; website tasks link to the Website page.
- **Google Profile** (Premium), `components/gbp/GoogleProfilePanel.tsx`:
  - what Google shows today (the real listing fields from the last scan);
  - connect status;
  - search demand;
  - listing editing and the insights funnel ("coming soon").

  Free and Grow see a lock on the tab; opening it shows their real listing as a preview with "Unlock with Premium" and the Premium features listed as locked. Connecting itself is on the Connect Google page (`/connect-gbp`) until Settings → Connections exists.

**On Free (5f part 2, done)** — `app/business/[id]/growth/FreeGrowthPlan.tsx`:
- the weekly routine, "This week's plan" and "Bigger projects" are `LockedPreview`s of their REAL content (task titles, what's wrong and the points visible; the steps and "I did this" locked), with "Your plan for this week is ready. Unlock it with Grow.";
- no weekly-goal tracking or celebrations (`WeeklyGoalCelebration`, the routine's streak and completed-task celebrations don't render);
- "Re-check my website" is a locked card (promo box, feature `recheck`); `recheckWebsite` also refuses on Free server-side (no PageSpeed);
- links into Growth (`#weekly-plan`, `#weekly-routine`, `#task-…`) land on the matching preview;
- the Google Profile tab stays the Premium preview. Grow, Premium and Multi are unchanged.

### Campaigns — built
Three tabs (`?tab=coupons` / `?tab=referrals`), in `app/business/[id]/campaigns/`:
- **All campaigns** (default on Grow, Premium and Multi) — the tracking home: every running coupon and referral card with its type, code, start date, times used, +1, Share and End (there's no pause). Then email, text and social campaigns: Premium and coming soon — a lock + "Premium" chip on Grow, "Coming soon" on Premium. The rows live in `CampaignsView`, so nothing moved in the data: existing campaigns keep their tallies.
- **Coupons:** the full coupon designer (`CouponsSection` → `CouponBuilder` + `CardDesigner`).
- **Referrals:** the full referral card designer (`ReferralSection` → `ReferralBuilder`, `PassOnChoice`).

Nothing is lost in the move: templates, pass-on options, double-sided, numbering, saved designs, sheet preview, How it works, Ask PostAI, tallies, and print gating (Free preview / Grow basic / Premium full via `signAccess`).


**By plan (5f part 3, done):**
- **Coupons / Referrals** — design only (no tracking lists there). "Save & start tracking →" with "You'll track redemptions on All campaigns." under it; after saving, a toast "Saved — track it on All campaigns" and All campaigns opens with the new one highlighted at the top for a few seconds.
- Free: the Campaigns showroom (see "Free" below): "All campaigns" (tracking, Grow) and "Email, text and social campaigns" (Premium, coming soon) as locked blocks, the locked "How to run it" guide, then the real designers as blurred previews (no saving, printing, sharing or tally).
- Grow: opens on All campaigns (every running coupon and referral, +1); Coupons + Referrals (basic designs) with the "How to run it" guide (step 4 points to All campaigns). Email, text and social: Premium.
- Premium/Multi: everything, opening on All campaigns; email, text and social are coming soon.
### Reviews — built
- Review link, QR code, review sign designer (Sign Studio), review stats.
- **Reply to a review** (AI reply drafts, built — option B, nothing from Google): the owner copies a review from Google and pastes it in (stars optional); PostAI drafts a short, polite reply in the business's language (thanks them, answers what they said; never an offer, discount or gift, never asks to change the review, never made-up facts — a draft that breaks a rule is refused and doesn't count); the owner edits it, then "Copy reply" + "Open my Google reviews" (their listing on Google Maps by place id). The pasted review is never saved, only the reply. `components/reviews/ReviewReplyDrafter.tsx`, `app/actions/reviewReplies.ts`, rules in `lib/reviewReplies.ts`.
  - Where: the Free Overview's reviews section, and the Reviews page (Grow and up, in the reply assistant block).
  - Limit: **3 free drafts per business, lifetime, on Free and Grow** ("2 of 3 free replies left"), counted on the server in `review_reply_drafts` (`supabase/review-reply-drafts.sql` — written only by the service role; a draft reserves its row first so two clicks can't pass the limit; failures don't count; each row records the PostAI tokens used). After 3: "You've used your 3 free replies." + the side-by-side plans box (feature `replies`: Premium = unlimited). Grow also sees "Unlimited with Premium". **Premium/Multi: unlimited.**
  - Footer, Free/Grow: "Drafts only — paste it into Google yourself. With Premium, PostScore shows every review you haven't answered and posts replies for you (coming soon)." Premium/Multi: the same with "With Google connect…".
  - Until the SQL is run the block says drafts aren't available (no button).
- Later: every unanswered review + posting replies for them (Premium, needs Google connect) — "Coming soon".



**By plan (5f part 3, done):**
- Free and every plan: the review link, copy button, basic QR + PNG, rating/review count and the review goal (`ReviewGapLine`: beat the leader).
- Free: the "right way" guide keeps the rule ("Never offer a discount or gift…") visible; the rest is a `LockedPreview` with the headings (when to ask, what to say, where to put the QR) and the details locked. The sign designer stays a preview; counter tools stay visible.
- Grow: the guide fully open, the basic sign. Premium/Multi: the full designer + "Unlimited replies; with Google connect, every unanswered review + posting for you (coming soon)". Grow and up: "Reply to a review" (above).
### Website — built (+ new chooser)
- Site checks (visual analysis, score breakdown, security), per-builder fix guides, Re-check my website (3/day).
- The **3 options** side by side: Fix your current site · Starter website · Build in PostStudio.
- **No website, or only a Facebook/social page: never an empty page.** It leads with:
  1. an honest header ("You don't have a website yet — it's one of the biggest gaps in your PostScore", with the real points it costs them);
  2. the Starter website generator with a live real-data preview (Grow/Premium: full use + download; Free: full use + a watermarked full preview, download with Grow);
  3. directly under it, the PostStudio card comparing starter vs PostStudio, with the prices ("$30/mo on its own · +$15 on Grow · +$8 on Premium · included in Multi"), "Add PostStudio" (opens the PostStudio box) and "See PostStudio →" (the full-screen page).

  With the add-on (or Multi), the card becomes "Continue in PostStudio →".
- FAQ draft (today) stays under the options.

### PostStudio — full-screen page (its own option or an add-on; not open yet)
**PostStudio = Website + Menu & catalog + Logo Studio** (all coming soon), shown everywhere as three compact tiles (`PostStudioFeatures` in `components/studio/PostStudioOptions.tsx`, icon + title + one line):
- **Website:** a multi-page site, hosted for you on your own domain, updated after every scan;
- **Menu & catalog:** your menu or product list, always up to date, with a QR code that never changes;
- **Logo Studio:** upload your logo or make a simple one, used across your site and printouts.

`/business/[id]/studio`, with no sidebar. A slim top bar shows PostStudio, the business name and "← Leave PostStudio" (it asks to confirm only if there are unsaved changes; there's no editor yet, so today it never asks).
- **With PostStudio** (`hasPostStudio(plan, await getAddons())`: Multi, or the add-on once checkout ships — "PostStudio only" is plan Free + addon `poststudio`): "Your site checklist", "What PostStudio includes" (the three tiles), and "Building tools coming soon".
- **Without it,** an honest info page:
  - what PostStudio builds;
  - "Your site checklist" from real data (✓ ready from the listing / ○ you'll add this; `lib/postStudio.ts`);
  - "What PostStudio includes": the three tiles (no page outlines here or in the PostStudio box; the Website page's PostStudio card keeps its four wireframe outlines);
  - starter vs PostStudio comparison;
  - the price for their plan, and "PostStudio isn't open yet — there's nothing to buy today", with the ways to get it side by side (PostStudio only $30/mo · Grow + PostStudio $40/mo · Premium + PostStudio $58/mo, Best value · Included in Multi), their plan highlighted;
  - "Want something now? Use the free starter website →".
- Later: website builder + hosting (auto-refreshing rating/reviews/hours after every scan), Menu & catalog, Logo Studio.
- **Booking + online ordering connections** (plan only, `docs/day5-website-studio-plan.md` §10):
  - **Phase 1, at PostStudio launch:** a setup question ("Do you take bookings or sell online?") with tools recommended by business type (salons/spas/barbers: Square Appointments, Vagaro, Booksy, Fresha, GlossGenius; services/lessons: Calendly, Acuity; fitness: Mindbody; restaurants: Toast, Square Online, Clover; retail: Square Online, Shopify); step-by-step guides from each provider's official help docs (links + "last verified" date) to create an account and find the booking/ordering link or button code; the owner pastes the link/embed code and PostScore validates it (a real URL on that provider's domain, it loads, no unsafe scripts — only allowlisted provider embeds, never arbitrary scripts), then adds "Book now" / "Order online" on every page plus a Book/Order page. It counts toward the website "Contact & conversion" check once a re-scan confirms it. Honest: PostScore doesn't take payments or bookings itself; the provider does.
  - **Phase 2, after launch:** an official Square API connection (OAuth) to show real services/prices/products and keep them synced; other providers only if they offer official APIs. Cost + terms review first.
  - Build order: right after "Custom domains".

### Competitors — built
Nearby competitors, rank, comparisons.

### Price check — built (renamed)
Your prices vs a typical range and nearby price levels.

### Reports — built
Weekly recap, past weekly reports, weekly PDF, monthly email setting.

### Settings — built (account menu)
Profile, businesses, plan & billing, emails, business type, account —
plus a new **Connections** section (Google Business Profile connect and the
other connect cards that live on `/connect-gbp` today).

---

## Plans

Plan is decided only by `getPlan()` (`lib/premium.ts`); pure rules in
`lib/plan.ts`. Checkout isn't built yet, so every real account is Free today.
The plan copy and comparison below live in `lib/planComparison.ts` +
`dashboard.settings.plans.*` (Settings → Plan & billing → "Compare plans",
`#compare-plans`); PostAI describes the plans the same way (`lib/assistant.ts`).
Anything not built says "coming soon".

**Free · $0 · "Your free digital audit"** — See exactly what's costing you customers.
- Your PostScore and grade, refreshed monthly
- Every problem on your Google listing, reviews and website
- How you rank against nearby competitors
- Your review gap compared to businesses near you
- 3 free AI review replies to try

**Grow · $25/mo · "Fix it yourself, step by step"** — We show you exactly how to fix every problem.
- Step-by-step fix guides for every issue
- A weekly action plan that tells you what to do next
- Re-check your website as soon as you fix something
- A starter website, plus basic review signs, coupons and referral cards
- Track every coupon and referral in one place
- PostAI for your questions (monthly limit: 100 questions)

**Premium · $50/mo · "We do the work for you"** (highlighted, "Best value") — Connect Google and PostScore fixes things for you.
- One-click fixes to your Google listing: hours, info, photos (coming soon)
- Unlimited replies; with Google connect, every unanswered review + posting for you (coming soon)
- See who searches for you and who calls or clicks (coming soon)
- Email, text and social campaigns (coming soon)
- Every design tool unlocked, with no PostScore branding
- Unlimited PostAI, and PostStudio websites at a discount (PostStudio coming soon)

**Multi · $150/mo · "Premium for every location"**
- Everything in Premium for up to 5 locations (+$25 each extra)
- PostStudio included (coming soon)
- All your locations in one dashboard (coming soon)

| | Free | Grow | Premium | Multi |
|---|---|---|---|---|
| See what's wrong + your score | ✓ | ✓ | ✓ | ✓ |
| Rank vs. nearby competitors | ✓ | ✓ | ✓ | ✓ |
| Step-by-step fixes + weekly plan | preview | ✓ | ✓ | ✓ |
| Instant website re-checks | — | ✓ | ✓ | ✓ |
| Review signs, coupons, referral cards | preview | basic | full, no branding | full, no branding |
| Campaign hub (every coupon and referral, with +1) | preview | ✓ | ✓ | ✓ |
| Email, text & social campaigns | — | — | coming soon | coming soon |
| Website | preview | starter site | starter + PostStudio discount | starter + PostStudio included |
| PostAI | — | 100 questions/month | unlimited | unlimited |
| AI review replies | 3 to try | 3 to try | unlimited · auto-post coming soon | unlimited · auto-post coming soon |
| Fixes done for you (Google connect) | — | — | ✓ coming soon | ✓ coming soon |
| Reports | — (no monthly email) | weekly recap | weekly + PDF | weekly + PDF |
| PostStudio — your full website (coming soon) | $30/mo on its own | +$15/mo | +$8/mo | ✓ included |
| Locations | 1 | 1 | 1 | up to 5, +$25/mo each extra |

**PostStudio — your full website** (coming soon), its own section under the
four plan cards (`PostStudioSection` in `components/settings/SettingsParts.tsx`,
the options from `components/studio/PostStudioOptions.tsx`):
- a multi-page site, hosted for you, your own domain, rating/hours updated after every scan, built to pass every website check;
- the ways to get it: **PostStudio only $30/mo** (the free audit + PostStudio; Grow/Premium tools stay locked — plan `free` + addon `poststudio`) · Grow + PostStudio $40/mo (+$15) · Premium + PostStudio $58/mo (+$8, Best value) · included in Multi; the owner's plan highlighted;
- "PostStudio is coming soon — nothing is charged today."

Desktop: the four plan cards, the PostStudio section and this table, Premium
highlighted. Phone: one card per plan, the owner's current plan first, each
with its own rows; the PostStudio options stack.

### Free = the Overview audit + the Website page (5f, built)
**Paid plans are unchanged by this redesign** (enforced page by page in `app/business/[id]/paidLayout.test.tsx`), except: the review goal (all plans), the Website page's two paths (PostStudio's card replaces Premium's bottom PostStudio line), "All campaigns" as the tracking home for Grow and up (Coupons/Referrals design only; only email, text and social are Premium), Premium/Multi's replies line on Reviews, "Reply to a review" on Reviews (Grow and up), and on Grow the designers' Grow/Premium marks, the "How to run it" guides, the Premium card at the bottom and the both-plans lock box. Locks on Grow keep their original look (one link / button / chip).

On Free the **Overview is the audit**, top to bottom:
1. header + score hero ("{n} points are waiting to be fixed" instead of the projection);
2. the score breakdown, open: every check, what's wrong and the points it costs (no fix links);
3. **reviews — "Reviews: your biggest lever"**: rating + count, the **review goal** (below), the working free review link (copy, open) and QR (PNG) — `#free-reviews`;
4. "More customers, whatever your score" (the original design, no thumbnails): the same tiles as Grow; "Get more Google reviews" keeps its star and title but, on Free, shows short tips instead of the stats and goal (those, the link and the QR are in the Reviews section right above): "Ask every customer right after a good visit, put your QR code where people wait, and reply to reviews so customers see you care." + the small line "Never offer a discount or gift for a review — it's against Google's rules." No button, no numbers. Grow/Premium/Multi keep the stats, goal and "Get your review link & QR →"; Competitors is free (a normal link); Coupons, Referrals, Weekly routine and Price check show a lock + "Grow" chip and open the promo box; the section ends with the big pair "Unlock with Grow" / "Unlock with Premium" ("Best value");
5. PostAI showroom: real starter questions and one labeled, generic "Example answer" — the questions, the box and Send open the promo box; `sendAssistantMessage` refuses on Free (no AI call);
6. competitor rank, with "You're #N of M nearby…" when they trail;
7. "Unlock more with a plan" — 12 locked tiles (2 columns; 1 on a phone), each with its plan chip, a real count where there is one, skeleton rows with the feature's real icon, its OWN unlock line and a small "See plans": action plan, weekly routine, fix guides for their builder, Re-check, **downloading** the starter website (building it is free on the Website page), price check, weekly reports (PDF on Premium), campaign hub (coming soon), Google Profile fixes + insights (coming soon), AI review replies (coming soon), unlimited PostAI, PostStudio ("$30/mo alone · +$15 on Grow · +$8 on Premium", coming soon; its lock opens the PostStudio box);
8. the Grow + Premium ("Best value") promo cards.

**Website page — two paths, every plan** (`app/business/[id]/website/page.tsx` + `WebsiteGeneratorSection`):
- **Free:** the screenshot ("What customers see on your website", "Captured {date}", Refresh locked) → ONE compact website score card (`WebsiteScoreCompact`: ring, "83/100 · 25/30 pts · B", each check with only a status chip — Done / Needs work / Couldn't check — and its points, halves as "½ / ½"; "See exactly what's wrong and how to fix each one — Grow" + "See plans") → **A) "Keep your current website — fix it with PostScore"** ("Like your site? Fix every issue and aim for a perfect 100/100 — PostScore shows you exactly how, in {builder}."): the locked step-by-step fix guides, Re-check and FAQ draft → **B) "Or start fresh with a new website"** ("Rather replace your current site? Build a new one instead."): the starter generator, open ("Build your starter website — try it free", the quiet "Need more than one page? PostStudio →"), then the PostStudio card. No "How to publish it" / "Mark as published" on Free.
- **Grow / Premium / Multi:** the screenshot (with "See more pages" and Refresh) → the website score + FULL breakdown (each check's per-builder fix steps live in it) → **A)** "Fix every issue and aim for a perfect 100/100 — step by step, in {builder}.": "{n} checks left to fix" + "How to fix each check, step by step ↑" (to the breakdown), Re-check my website (N of 3 left today), the FAQ draft → **B)** the starter generator COLLAPSED ("Build a one-page starter site →"; full use, download, and the publish steps inside), then the PostStudio card (Grow/Premium: the add-on price + "Coming soon"; Multi: "Continue in PostStudio →").
- **No website, or only a social page** (`socialPagePlatform`): no path A; B leads with the honest "no website yet" header (social: "A Facebook page isn't a website — build a real one."), and the generator is open on every plan.

- **Builder layout (all plans):** options on the left; the live preview on the right stays in view (sticky, about the viewport tall, the site scrolls inside its frame); under it ONE row: "Open full preview" (left) and "Download your site" (right — on Free a locked button with a small "Grow" chip that opens the plans box). On a phone the preview comes first (fixed height, inner scroll), the options below. The download goes through `POST /api/business/[id]/starter-site` (owner via RLS; `starterSiteDownload` in `lib/starterSiteDownload.ts` refuses Free with 403 `plan_required`).
- "Open full preview" opens `/business/[id]/website/preview` in a new tab (owner only — anyone else gets "not found"; `noindex, nofollow`). A slim fixed bar above the site (never under the watermark): "← Back to PostScore" (a plain link to the Website page, so it works in a new tab), "Preview of your starter website", and on Free "Download with Grow" (opens the plans box). The Website page posts the site it built to that tab (same origin, `postMessage` handshake); it shows in a sandboxed frame under a light, widely spaced, unclickable watermark "Preview · Made with PostScore · Download with Grow" (pointer-events none, so the map and its links work) and a "© PostScore preview" footer.
- The storefront map (Maps Embed API, `GOOGLE_MAPS_EMBED_KEY`) loads eagerly: a `loading="lazy"` map inside the preview frames (iframe `srcdoc`) never started, which left a blank box. The address, "Open in Google Maps" and "Get directions" always show under it; without a key there's no map frame at all. The previews allow popups to escape the sandbox, so those links open normally. Honest limit: the preview HTML is built in the browser, so a technical user could copy it; the server only gates the download.

**Review goal = beat the leader** (`reviewGoal` / `reviewLeader` in `lib/competitorComparison.ts`, text in `lib/reviewGoal.ts`, the group name from `scopeGroupLabel`): "{Group} average {n} reviews." + "Your goal: beat {leader} — {n} reviews ({gap} more than you)." When the leader has more than 3× the average it's a "Stretch goal" plus "Next up: {name}, {n} reviews." When they lead: "You lead nearby with {n} reviews — keep the gap." No line with fewer than 3 competitors. Shown on the Overview, Reviews, Competitors, the report + PDF, "Since your last visit", the Growth review task, the Free unlock line and PostAI (quoted, never recomputed).

**Plan switcher:** one floating pill (bottom-left, every page, `components/dev/DevPlanPill.tsx` from the root layout); collapsible, remembered on the device. Local development: always on. Production: only for a signed-in user whose email is in `PLAN_SWITCHER_EMAILS` (testing only — remove before launch); `canSwitchPlan()` decides the pill, and `/api/dev/plan` (403 for anyone else, 404 when the list is empty) and `getPlan()` both re-check the email on the server, so the cookie alone does nothing. Requests without the switch cookie never look the user up.

**Tabs on Free** (`lib/freeTabs.ts`): Overview, Competitors (read-only — Refresh is locked; `refreshCompetitors` refuses on Free), Website and Settings are open. Growth, Campaigns, Reviews, Price check and Reports show a lock in the sidebar and render their **showroom** (`components/plan/TabShowroom.tsx` via `freeShowroom()`, called first in each page, so old deep links land there and none of the tab's own data — or paid calls — loads):
- the tab name and the chip "Grow · more with Premium";
- ONE "With Grow" (3 bullets; Campaigns 4) | "Premium adds" (crown, "Best value", 1–3 bullets, "coming soon" where not built) card with the big button pair — the page's only plan comparison, so showroom pages have **no** promo cards at the bottom;
- the tab's sections as fully hidden `LockedPreview`s with real counts. Campaigns: "All campaigns" (Grow) and email/text/social (Premium, coming soon) first, then the locked "How to run it" guide (step headings only), then the REAL coupon and referral designers (`DesignerPreview`: Customize panel open, every option marked Grow or Premium, under a light 2.5px blur, not clickable — a click opens the promo box — with a clear, never-blurred heading above each: icon, "Coupon designer" / "Referral card designer", a one-line description and a small "Preview" chip; sections are ≥32px apart with a thin rule between them). Reviews: a link to the free review link & QR on the Overview, the locked guide and the real "Review sign designer" the same way. Growth shows the locked Google Profile block (Premium, coming soon) first, right under the plans card, then the action plan, routine and the rest.

**Locks (item 15 — less advertising, always both plans):**
- At most ONE full Grow vs Premium comparison per page with the two big buttons (`<UpgradeTrigger variant="pair">`): the showroom's top card; on the Overview, "More customers" + the bottom promo cards.
- Every other lock is small (`UpgradeTrigger`'s default): a lock chip naming the plan ("Grow", or "Premium" with a crown; "Add-on" for PostStudio) and a "See plans" text link (`plain` drops the chip where the block already names its plan, e.g. `LockedPreview`). Locked actions (`UpgradeButton`) keep their own look.
- **Every promo box is never cut off** (`PromoBox`, the one box behind every lock): fixed and fully on screen — centered on desktop, a bottom sheet on a phone — at most the viewport height minus a margin; the title + × and the footer stay visible while the middle scrolls. No backdrop; the page keeps working.
- Any lock click opens the side-by-side box: both plans always, Premium "Best value", the clicked feature's plan highlighted (Premium-only features lead with Premium).
- **PostStudio has its own box** (every PostStudio lock, tile and "Add PostStudio", on every plan that doesn't have it): the three tiles (Website, Menu & catalog, Logo Studio), then the three ways side by side — "PostStudio only" $30/mo · "Grow + PostStudio" $40/mo · "Premium + PostStudio" $58/mo (Best value) — plus "Included in Multi", the plan they're on highlighted (Free → PostStudio only), and the footer "Coming soon — nothing is charged today."
- One unlock line per section, never repeated on a page.
- Every locked footer is the same `LockFooter` (`components/plan/LockedPreview.tsx`): the unlock line left (max 2 lines), "See plans →" right as a small pill that never wraps, ≥16px apart, vertically centered; on a phone the link drops below the line, left-aligned. Locked tiles stretch to the row's height with the footer pinned to the bottom. Used by `LockedPreview`, the PostAI showroom, the rank line and the compact website score.

**Designer plan marks (Grow and the showroom):** every Customize option is marked "Grow" or "Premium" (crown), with the legend "Grow: 2 styles · 2 sizes · basic QR. Premium: every template, font, color, logo, double-sided, numbering — and no PostScore branding." On Grow, Premium options stay visible with the crown + lock and preview with a watermark.

**Campaign guides (Grow and up):** each Coupons/Referrals tab has a collapsible "How to run it" (`app/business/[id]/campaigns/HowToRunIt.tsx`): 1) pick an offer, 2) design and print (wallet or 4×6, cardstock, home vs print shop), 3) share it (counter, receipts, text, social; what to say), 4) redeem and track with +1, 5) end or refresh it — plus "Never reward reviews". Free sees it as a locked block in the showroom.

**Two levels of locked content (Free and Grow):**
- *Advice* (suggestions, steps, plans, routine, guides, ways to grow, the review guide's details): `LockedPreview` — only the title, a lock, a real count and ONE unlock line are readable; the content is never rendered into the page (blurred placeholder shapes only).
- *Tools* (coupon/referral/sign designers, PostAI): visible with their real data; Save, Print, Download, Share and Send open the promo box (`UpgradeButton`).

**Paid calls on Free:** only the weekly AI allowance — 3 PostAI questions and 3 review reply drafts per business per week, on the Free re-scan clock, reserved in `free_ai_usage` before any AI call (`lib/freeAiUsage.server.ts`, `supabase/free-ai-usage.sql`), with a failed call given back and `FREE_AI_MONTHLY_CAP` (default 500 Free calls a month, all Free accounts) pausing them until the 1st. Free PostAI gets the same real data minus the step-by-step fix text, a Free rule (explain what it means and why, then point to Grow), no link markers, and an answer that repeats a fix step is replaced. Everything else refuses on Free server-side: Re-check (`recheckWebsite`), the AI price check (`assessPricing`), competitor refresh and the niche re-scan (`refreshCompetitors`, `updateCompetitorsForNiche`) all refuse on Free server-side; Free never triggers a screenshot capture. Free keeps 1 owner re-scan per 7 days (+ the first scan), and its re-scans make no competitor (Nearby Search) calls.

**Promo cards** (bottom of the Overview and unlocked pages, `PromoCards`; never on showroom pages): Free sees Grow + Premium side by side (stacked on a phone), Premium always shown with "Best value"; Grow sees Premium; Premium and Multi nothing (on the Website page, PostStudio's one mention is its card in path B). Each card has page-relevant chips, "See plans" (the promo box) and × (hidden 14 days, per card and page, `promo_dismissals` + the device).

**Fonts:** self-hosted in `app/fonts` (SIL OFL) via `next/font/local` — Fraunces 400–700 (`font-serif`: headings, page titles, business names, score numbers) and Inter 400–600 (`font-sans`). They used to come from `next/font/google`, which falls back to a metric-matched sans silently when the download fails at server start.

### For step 5f to enforce (not gated yet)
- **Campaigns:** "All campaigns" (tracking every coupon and referral, +1)
  is Grow and up; only its email, text and social campaigns are Premium
  (coming soon). Coupons and Referrals are design only. Free sees previews.
- **PostAI:** Grow has a monthly question limit; Premium is unlimited.
  Grow's limit: **100 questions/month** (decided). Cost per question today: PostAI
  runs on Claude Haiku 4.5 ($1/M input, $5/M output tokens); each question
  sends ~7.7k tokens of fixed rules + ~2–4k of the business's data + recent
  history (≈ 10–13k input) and gets ≤ 450 output tokens → about
  **$0.012–0.015 per question**, so 100 questions ≈ $1.50/month worst case
  (~6% of Grow's $25). Caching the fixed rules (prompt caching) would cut
  the input cost by roughly two thirds. At the limit, Grow sees: "You've
  used this month's questions. Premium is unlimited."
- **Reports:** downloadable PDF reports are **Premium**; Grow gets the weekly
  recap on screen; Free gets no Reports page and no monthly report email
  (Grow, Premium and Multi get the monthly email).
- The Free "unlock" lines (`dashboard.upgrade.unlock.*`, built by
  `unlockLine()` in `lib/upgradePromos.ts` from real data only — a line
  whose data is missing is never shown) are ready for the locked previews.

### Upgrade promotion (Free and Grow only)
All in `components/upgrade/` + `lib/upgradePromos.ts`; the data comes from
`loadUpgradeContext()` (`lib/upgradePromos.server.ts`) through
`DashboardShell`'s `upgrade` prop.
- **Promo box** (`UpgradeTrigger` / `UpgradeButton` → `PromoBox`): opens only
  when the owner clicks something locked — centered on desktop, a bottom
  sheet on a phone, never cut off (header and footer fixed, the middle
  scrolls). It ALWAYS shows Grow and Premium side by side
  (price, tagline, key benefits, Premium "Best value", "See plans" under
  each → Settings → Compare plans), the clicked plan highlighted, led by the
  feature's own title and lines (their real data where we have it, "Coming
  soon" on anything not built). Closes with ×, "Not now", Esc or a tap
  outside; never modal, never opens by itself. Small lock + "See plans" by
  default; the big button pair only where a page has its one comparison.
- **Promo cards** (`PromoCards`, replaced the old showcase strip) above the
  footer of the Overview and the unlocked main pages (never the showrooms):
  page-relevant chips ("soon" where not built), "See plans" and × (hidden for
  14 days for that business: `promo_dismissals`,
  `supabase/promo-dismissals.sql`; this device's localStorage until the SQL
  is run).
- **Premium** sees no promo cards (on the Website page, PostStudio's one mention is its card in path B);
  **Multi** sees none.
- Never: an upgrade page, pop-ups on page load, countdowns, fake discounts or
  scarcity, blocking a core action, or anything that pretends to charge.
- Premium items share one look: a subtle brass border and a small crown.

**PostStudio**: anyone can open it and see a preview of their own site built
from their real data; publishing needs the add-on (or Multi) **and** a
verified owner.

## Ownership verification

The scan and audit stay free and open to everyone with **no verification**,
because they only use public data. Verification is asked for only at the
moment someone tries a sensitive action, never at signup:
- publishing a PostStudio site under the business's name;
- connecting a custom domain;
- connecting Google Business Profile, editing the listing, or viewing private Google insights;
- anything that acts or speaks as the business publicly.

Methods:
- a one-time code by text or automated call to **the phone number on the Google listing**;
- Google Business Profile connect, once live, which proves it automatically.

If the listing has no phone, the app explains the options honestly: add a
phone to the listing, or use Google connect.

Verified status is saved per **user + business**, so multiple managers can
verify the same business. It shows as a small "Verified owner" badge. This is
not built yet; it's step 5k-0 in the Day 5 plan.

### Where gating lives in code today
- `getPlan()` / `hasPremium()` / `canConnectGbp()` — `lib/premium.ts`.
- Print access (`none` / `basic` / `studio`) — `signAccess()` in `lib/signStudio/design.ts`, used by Sign Studio, the card designer, `/api/business/[id]/review-sign` and `/api/business/[id]/print-card`.
- Settings → Plan & billing copy and comparison — `lib/planComparison.ts` (wording only; describes the plans, gates nothing).
- Upgrade promos (box + strip) — `lib/upgradePromos.ts`, `components/upgrade/`.
- Everything else is currently open to every plan — see the Day 5 plan's gating section for the full list and the planned changes.

## Google Maps Platform terms compliance — MUST fix before launch

Full review: `~/Desktop/places-storage-review.md` (2026-10-21). Plain reading of Google's published terms, not legal advice. Google Maps Platform support's reply (Oct 21, 2026): `docs/google-maps-support-reply-2026-10-21.md`. **Storage not changed yet; attribution added (below).**

**Where it stands (after Google support's reply, Oct 21, 2026).**
- **Owner-entered first-party data is NOT restricted** (confirmed by Google): details the owner types in, edits or explicitly confirms in PostScore are their own data and can be stored.
- **Stored derived scores are uncertain:** §3.2.3(c) ("no creating content from Google Maps Content") may cover scores, grades and pass/fail results computed from Places data. **Pending legal counsel + Google Maps Platform Sales** — until then, plan as if derived history must come from owner-provided and website data.
- **Attribution: done** — the official Google Maps logo next to Places data shown without a map (see "Attribution (built)").
- **Off-platform: no Google content** — nothing from Google is printed or put on the owner's own website (see "Off-platform (built)").

**What the terms allow.**
- Maps Platform Terms §3.2.3: no scraping — never "copy and save business names, addresses, or user reviews" — and no caching except where the Service Specific Terms allow it.
- Service Specific Terms §14.3 (Places): only latitude/longitude may be cached, for up to 30 days.
- Places policies: place IDs may be stored indefinitely; reviews and photos need author attribution; Places data shown without a Google Map needs the Google logo.
- Sources: https://cloud.google.com/maps-platform/terms · https://cloud.google.com/maps-platform/terms/maps-service-terms · https://developers.google.com/maps/documentation/places/web-service/policies

**What we store today that isn't allowed** (kept forever):
- `businesses.lat`/`lng` (30-day max);
- `businesses` name, address, phone, website, category/categories, primary type, hours, status, Maps URL, price level, photo count, rating, review count — the values that came from Google;
- `scores.profile_snapshot_json` (a per-scan history of those fields);
- `competitor_scans` (other businesses' name, address, phone, hours, categories, status, rating, review count, every scan) — the biggest exposure.

Allowed: place IDs; owner-entered data (confirmed by Google support); our own website checks (`website_analysis_json`); photos (fetched fresh, never stored). Uncertain: our computed scores/grades (derived from Places content) — pending legal counsel + Sales. Review replies are already compliant: the owner pastes the review, nothing from Google is fetched or stored.

**Plan (no code yet).**
- **(a) Owner-provided details at setup (B8):** during setup the owner enters, or explicitly edits/confirms, their own business details — name, address or service area, phone, website, hours, category. Stored as **"provided by you"** (with who/when), shown with that label, and used for scoring and the starter site instead of stored Google values. Google's current values are shown beside each field, fetched live, as suggestions only.
- **(b) Google data shown live:** listing values not confirmed by the owner (rating, review count, photos count, other businesses' details) are fetched when shown and kept only for that request/visit, never in the database; lat/lng kept at most 30 days or replaced by the derived time zone. Competitors: store place IDs only and fetch names/ratings live.
- **(c) Google connect for Premium:** the Business Profile API (owner OAuth, its own terms) for the owner's own reviews, replies and insights.
- **(d) Score history from owner-provided + website data where possible:** "what changed" and the score history use the owner's confirmed details and our own website checks; anything that can only come from Places (rating, review count, competitors) waits for counsel/Sales before it's kept as history. Then drop the raw Google fields from `profile_snapshot_json` and `competitor_scans` (cleanup SQL to review first).

**Attribution (built).** `components/google/GoogleMapsAttribution.tsx` — Google's official Gray "Google Maps" logo (`public/google/`, from Google's attribution asset pack, unmodified). The pack has no full-color logo — only Gray, Dark Gray, White and outlined versions — and the policy asks for the non-outlined one on plain backgrounds, so Gray it is. 16px tall (Google's minimum; max 19), 10px clear space (5px below), alt "Google Maps", `translate="no"`. On cards it's a quiet footnote at the bottom right (`GoogleMapsAttribution`), sharing a line with the card's small text or button where there is one; in a line of text it's `GoogleMapsLogo`, vertically centered. A "View on Google Maps" link doesn't replace it — the policy's only exemption is content shown on a visible Google Map. Where it is:
- Overview: the header — at the end of the scan line ("Last scanned … · photo author · logo"; the chip row untouched), also when there's no photo; Free's reviews section (bottom); the paid "Get more Google reviews" tile (on the button's line); the rank card (Free) and "At a glance" (paid), bottom;
- Competitors: the bottom of the hero card and under the ranked list;
- Website: under "Your business details" while they're still Google's pre-fill (the generated site itself carries no Google content — see "Off-platform");
- Reviews: under the rating/review stats;
- Reports: the weekly recap, when it lists listing or review changes;
- PDF reports (monthly + weekly): the Gray logo top right of the header, 12pt (= 16px, the minimum), embedded from Google's PNG (`lib/google/mapsLogoPng.ts`);
- Monthly email: the Gray logo at 16px (hosted `…/google/GoogleMaps_Logo_Gray_2x.png`) under the rating, reviews, competitors and listing changes; text "Google Maps" when no URL (previews);
- Growth: the task lists that include Google listing tasks (on the footnote's line), and the Google profile panel's listing (on the "Open on Google" line);
- "Since your last visit": under the rank and reviews.

**Off-platform (built).** Printing or publishing Google content outside our app is the riskiest use, so none goes there:
- **Printed review sign:** no Google rating, ever — the "Show star rating" option is gone and the PDF route no longer receives the rating. The sign keeps the QR, headline, name and "Follow us".
- **Downloaded starter site:** no Google rating, review count, price level or Google hours. Hours = only the owner's own (the hours editor; Google's hours only pre-fill it). Reviews = a "Read our reviews on Google" link to the live listing by place ID (Google Maps URLs). The map stays Google's own Maps Embed (it carries Google's attribution).
- **Name, type of business, address, phone on the site:** "Your business details" shows them as editable inputs pre-filled from Google; the owner edits or confirms them, and they're saved as **"provided by you"** (`businesses.starter_site_details`, `supabase/starter-site-details.sql`, with the confirmation time). The site uses only the owner's values, and the download waits for the confirmation.
- **Gray area for legal counsel:** pre-fill + confirm. Google confirmed owner-entered first-party data isn't restricted, but a value pre-filled from Places and confirmed unchanged may still count as Google Maps Content. Ask counsel whether confirm-as-is is enough, or the fields should start empty (with Google's value shown beside each as a hint).

**Open questions for Google Maps Platform support** (sent Oct 21; reply in `docs/google-maps-support-reply-2026-10-21.md` — owner-entered data confirmed OK; derived scores → counsel + Sales).
1. May we store a business's own listing fields when the verified owner has connected or confirmed them in PostScore (is that our customer's content)?
2. Are scores and pass/fail results computed from Places fields "content created from Google Maps Content" (§3.2.3(c)), and may we keep them?
3. May we keep a per-scan history of a business's own rating and review count, or only our derived results?
4. For competitor comparisons: may we store competitor place IDs + our computed scores, and show names/ratings only by fetching them live?
5. Is there a data agreement or partner program for listing-audit / local-SEO tools that allows storing this data?
6. May review text the owner pastes from Google be sent to an AI model to draft their reply (no storage)? And may a review fetched live through the Places API be used the same way?
7. Exactly where the Google logo is required (web dashboard, PDF reports, emails).

**Estimated extra live-fetch cost per month** (list prices, first volume tier; each SKU has 1,000 free calls/month, shared with today's scans). Assumptions per business: ~12 dashboard visits a month (1 Place Details Enterprise call each, $0.020), ~6 Competitors/report views (1 Nearby Search Enterprise call each, $0.035), monthly scans unchanged.

| | 100 businesses | 1,000 businesses |
|---|---|---|
| Listing fields (Place Details Enterprise; scans already use ~100 / ~1,000 of its 1,000 free) | 1,200 calls, ~300 billable → ~$6 | 12,000 calls, all billable → ~$240 |
| Competitors live (Nearby Search Enterprise; scans already use ~400 / ~4,000 of its 1,000 free) | 600 calls, within the free 1,000 → ~$0 | 6,000 calls, all billable → ~$210 |
| **Total extra** | **~$6/mo** | **~$450/mo** |

Caching the live result for the length of one visit (in memory, not the database), and fetching competitors only when that tab is opened, keeps it near these numbers. Confirm prices on Google's pricing list before deciding.

## Launch checklist

1. **Google Maps Platform terms compliance** (above): attribution done; no Google content on the printed sign or the starter site done; owner-provided details at setup (B8), live Google data, the cleanup SQL; derived-score history after legal counsel + Sales. Blocks launch.
2. Remove `PLAN_SWITCHER_EMAILS` from production (testing only).
   - remove PLAN_SWITCHER_EMAILS — also removes the unlimited-businesses test exception
3. Checkout and billing as in `docs/billing-compliance.md` (lawyer review).
4. Run every pending `supabase/*.sql` file, including `review-reply-drafts.sql`, `starter-site-details.sql`, `free-ai-usage.sql` and `monthly-report-test-runs.sql`.
5. Search demand: its own launch checklist in `docs/search-demand.md` §4.
6. File the POSTSCORE trademark (Class 42, ~$350).
7. Decide LLC vs personal ownership.
8. ~~Get Google Maps Platform's written answer on storage (case opened Oct 21).~~ Answered Oct 21 (`docs/google-maps-support-reply-2026-10-21.md`): owner-entered data OK; §3.2.3(c) → legal counsel + Sales.
9. Legal counsel: derived scores and score history (§3.2.3(c)), and whether pre-fill + confirm makes the starter-site details the owner's own.
10. Contact Google Maps Platform Sales (https://mapsplatform.google.com/contact-us/) about terms for derived scores and history, if counsel says it's needed.
11. `lib/plan.ts` background-job plan lookup (`backgroundPlan`) must read the real subscription plan once Stripe is live. Until then it treats everyone as Free — for competitors (monthly report + rescan-all) and for the monthly report itself: Free gets no monthly report email, so in live mode the job emails no one until real plans exist.
12. At launch: set MONTHLY_REPORTS_LIVE=true only after the business list is cleaned; testing mode then stops. (Until then the monthly job is in testing mode: 3 random scored businesses' reports go only to REPORT_TEST_EMAIL as "[TEST]" reports — no owner gets a normal report. REPORT_TEST_EMAIL may be an address with a PostScore account; it still gets only the "[TEST]" reports. Nothing is sent when REPORT_TEST_EMAIL is missing. Run `supabase/monthly-report-test-runs.sql` so picks don't repeat month to month.)
