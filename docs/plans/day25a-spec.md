# Day 25A: Growth score + Presence/Growth split (spec, design only)

Status: **Approved Nov 21, 2026.** Design only; no app code has changed.
Mockups: `docs/mockups/day25a/*.html`. Screenshots: `~/Desktop/day25a-mockups/` (desktop 1280 + phone 390).
All numbers are Hair Express's real numbers: scan of Nov 20, 2026 (78 · C), and Google insights through October 2026.

### Revisions (Nov 21, round 2)
1. **Hair Express's activity was all tests** (§6.6). As a real owner's business it would be **Starting out**. New rule: practice and test rows never count (§6.2). *(Superseded by 14: as the dev test account it shows 2 · Building + Test account.)*
2. Google listing on phone: each row's buttons go on their own line under the text, left-aligned.
3. Actions are never called "customers": "took action (called, got directions or visited your site)", "Actions per 100 viewers", "Searches → actions", "How searches became actions".
4. Hours row: a website mismatch is orange (!). Hair Express: **5 OK · 1 to fix · 7 to improve** everywhere.
5. The Approve button reads "Approve 3 tasks" with "12 items go to Google" under it, on both pages.
6. "Since you did this": decreases in gray, increases in green. The "other things also affect these numbers" note sits above the table.
7. This week's tasks use one order on both pages: **post → replies → answers → photos** (ranked by tier impact, §2c).
8. Free badge on Growth pages: "Locked".
9. Growth plan: the "Your results" number cards are removed. One link line replaces them: "See what Google brought you last month → Google results". Offer tracking (offers started / uses logged) lives on Customer offers.
10. Overview: Your Google listing becomes one compact row, with a red disconnected state (§2a).
11. Overview: the PostStudio card is removed; PostStudio appears only in the sidebar.
12. Sidebar: PostStudio and Reports sit directly under the open tab's pages after a thin divider; only Account is pinned to the bottom, with space above it. Reports gets a gold "New" dot for an unopened monthly report (§1). *(Nov 24: briefly pinned above Account, then moved back under the pages.)*
13. Mockups: all dashed design-note boxes removed. Their content is in §6b, and they never appear in the app.
14. Dev test login: real tier including test actions, with a "Test account" tag and the dev-only preview-tier switch. Hair Express = **Tier 2 · Building** (§6.6). Real owners keep the test/practice rule.
15. `is_test` on offers: yes, in 25B, with a SQL file.
16. Tier reset before launch: `scripts/reset-growth-tiers.ts` (§6.2 + CLAUDE.md).
17. "Google not connected" state for Growth (§6a), with new screenshots 03b and 04b.
18. **Fix plan** (renamed from "This week's fixes") is a Presence sidebar item, second, under Overview: every score fix ranked, with +pts, a running score and Fix it (§2b). Each Presence page gets a one-line summary of its own fixes. New screenshot 07.
19. **Growth plan "jump":** This week's plan is ranked by what each task does for the tier, with a tier line under each task, "Do this one first", and a top line "Do 1 task → on track for Growing on Mon, Nov 30" (§2c). Tier terms only, never points.
20. **Growth order** everywhere (sidebar, phone tab row, Free sidebar, "More customers" cards): Growth plan · Google results · Get more reviews · Customer offers · Campaigns · Print kit & QR · Local events (last). *Print kit & QR is hidden until Day 34 / 37-Core (decided Nov 24); its place stays for when it returns.*
21. **Fix plan: one score, two targets:** "This week: 78 → 87" (big) and "When every fix is done: 100 · A" (smaller). Each row is tagged "This week" or "Takes a few weeks", from a `thisWeek` field on every fix type (§2b). Overview keeps its single 100 · A.
22. **Google results shows Growth content only:** the closing listing box is removed; "Fix your listing →" stays only in the top bar. Not connected (04b): only the Connect card + "Your weekly tasks are on Growth plan →". Rule: Growth pages never show Presence content (§2, §6.5).
23. **Replies live in Presence → Reviews:** the reply inbox and drafter (`ReviewReplyDrafter`, `GoogleReviewsInbox`, `GbpReplyCheckConnect`) move to Reviews; Get more reviews (Growth) keeps only asking. Fix plan's reply fix and Google listing's "Reply in Reviews →" stay in Presence; every Presence link into Growth says "Get more reviews (in Growth) →". The Growth plan's weekly reply task + Approve stay (same drafts). New mockup 08.
24. **Honest review points:** review fixes come from the real scoring rules, split into "Get 3 new reviews in the next 90 days" (+4.7, Takes a few weeks), "Grow to 40 reviews" (+1.7, Takes months) and "Keep growing toward 150 reviews" (up to +6.8, Takes months). Used on Fix plan (07), Overview (02) and Reviews (08). 100 · A stays, with "Some fixes take months". Overview's "Replying to reviews +6" gets "Reply in Reviews →". Google results says "Down from 24.6% in September" (no points on Growth pages). The live-app places with "+13 for 3 reviews" are listed in §2b.

---

## 0. What's decided (from the brief)

- The sidebar has two tabs, **Presence** (0–100 score) and **Growth** (tier). Only the open tab's pages show.
- Today's Google Profile tab is split:
  - sections 4–6 go to Presence → **Google listing**;
  - sections 1–3 go to Growth → **Google results**;
  - each page links to the other.
- Overview stays as it is. Only the "Start here" bar changes, to one Growth line.
- Growth recap moves to Presence as **Fix plan**.
- "More customers, whatever your score" moves to the Growth plan.
- The Growth tier has five steps: Starting out → Building → Growing → Thriving → Local favorite.
  - It goes up with actions and real results.
  - It goes down one step after two quiet weeks.
  - By plan: Free = "?", Grow = steps, Premium = Approve all.
- Wording:
  - Presence pages show "+N pts".
  - Growth pages show customer actions, plus "These numbers show results from Google. They don't change your PostScore score."

---

## 1. Sidebar

Mockup: `sidebar.html` → `01-sidebar-*.png`.

```
PostScore
[Hair express on Broadway · 9 S Broadway…]
┌ Presence ─────┬ Growth ───────┐
│ 78 /100 · C   │ 2 Building    │
│               │ [Test account]│   ← two tabs; the open one is white with a brass underline
└───────────────┴───────────────┘
Presence open:  Overview · Fix plan · Google listing · Reviews · Website · Competitors · Price check
Growth open:    Growth plan · Google results · Get more reviews · Customer offers · Campaigns · Print kit & QR · Local events (Coming soon, last)
────────── (thin divider, normal spacing, directly under the open tab's pages)
PostStudio  [Coming soon]  (chip on the same line)
Reports  ● (gold "New" dot when a monthly report is ready and not opened yet)

            … empty space …
Account ▾ (pinned to the bottom, with space above it; no divider; notification count; Settings stays in here)
```

- **PostStudio and Reports are not pinned.** They follow the open tab's pages after a thin divider, with normal item spacing. Only Account is pinned to the bottom, with space above it. Same layout on Presence, Growth and Free, and in the phone menu (the drawer is this same sidebar). *(Nov 24: briefly pinned above Account, then moved back here.)*
- **Reports "New" dot:** a small gold dot on the right of the Reports item when the newest monthly report is ready and the owner hasn't opened it. It clears when they open Reports. Screen readers hear "New report ready".
  - It needs a "last opened" date per user and business; 25B decides where that's stored (SQL for you to paste if it's a column).
  - While `MONTHLY_REPORTS_LIVE` isn't "true" (testing mode), the dot shows only for test reports in dev, never to owners.
  - On Free, Reports keeps its lock and never shows the dot: Free gets no monthly report.

**How it behaves**
- **The open tab follows the URL.** Every route belongs to Presence or Growth (table in §3). Shared pages (Reports, Settings, Connect Google, PostStudio) keep whichever tab was open last. That's held in browser memory only, next to `components/layout/shellMemory.ts`; nothing is saved.
- Clicking a tab opens that tab's first page (Overview / Growth plan). On tablet and phone, the tab switch and the page change happen together, so there's no separate "switch only" state to keep in sync.
- **Tab values:**
  - Presence = the saved scan's score and grade.
  - Growth = tier number + name.
  - Free = a dashed "?" ring + lock + "Locked".
  - Paid but no tier yet (first week) = "1 Starting out".
- **Free locks:**
  - every Growth item and Reports shows the lock;
  - Presence items stay open (Overview, Fix plan, Google listing, Competitors, Website, and Reviews: rating, points, the fix line and 3 reply drafts a week, with the inbox and posting replies locked, see §5); Price check keeps today's lock *(Reviews opened on Free Nov 24)*;
  - Local events shows "Coming soon" instead of a lock.
- **Phone (<860px):**
  - the top bar shows "PostScore · Presence · 78 C ☰";
  - under it, a scrolling row of the open tab's pages;
  - the menu button opens the same sidebar as a drawer (today's drawer, with the tabs added).

---

## 2. Every page

Columns: Tab · Page · Route · What's on it · Source.

### Presence

| Page | Route | What's on it | Comes from |
|---|---|---|---|
| **Overview** | `/business/[id]` (unchanged) | See §2a. | `BusinessScoreView.tsx`, `TopRecommendations.tsx`, `GrowMoreCustomers.tsx`, `GoogleListingCard.tsx`, `StudioComingSoon.tsx` |
| **Fix plan** (Presence sidebar, 2nd, under Overview) | `/business/[id]/fix-plan` (new) | Every PostScore score fix, ranked from most urgent to least, each with "+N pts", a running projected score, and **Fix it →** to the exact spot (§2b). Replaces today's Growth recap: the weekly "+14 within reach" cap goes, Bigger projects become lower rows in the same list, and re-check website and celebrations stay. | `growth/GrowthView.tsx` (recap part), `ActionPlanSection.tsx`, `FreeGrowthPlan.tsx` (Free locked view) |
| **Google listing** | `/business/[id]/google-listing` (new) | Today's Google Profile sections 4 Your listing, 5 Show up for more, 6 Protection & changes. A top bar links "See what your listing brings in →" to Google results. Scored rows show "+N pts". Jump menu: 1 Your listing · 2 Show up for more · 3 Changes. | `GoogleProfileTab.tsx`: `ListingSection`, `NextSection`, `ProtectionSection`, `GoogleEditsBanner`, `PartHeader` "edit"/"protection" |
| **Reviews** | `/business/[id]/website-reviews` (URL kept) | What customers say **and your replies** (mockup 08): rating, count, review goal vs nearby, the fix line ("Reply to your reviews and get 3 new ones: Visibility & Reputation goes 21 → 32 pts (score 78 → 89)"; with the rest coming as reviews grow), **the reply inbox + reply drafts** (recent reviews live from Google, oldest first, "Approve 10 replies", "Paste a review" for the drafter), and the Visibility & Reputation checks with "+N pts". Links into Growth say **"Get more reviews (in Growth) →"**. | `ReviewsView.tsx` (social proof, `ReviewGapLine`, rubric `CategoryCard`), `ReviewReplyDrafter`, `GoogleReviewsInbox`, `GbpReplyCheckConnect` |
| **Website** | `/business/[id]/website` | Unchanged. | — |
| **Competitors** | `/business/[id]/competitors` | Unchanged (rank map tab arrives in 25C). | — |
| **Price check** | `/business/[id]/pricing` | Unchanged. | — |

### Growth
**Rule: Growth pages never show Presence content.** No listing status, no OK / to fix / to improve counts, no "+N pts", no score fixes. A Growth page may link to Presence in one small line (e.g. "Fix your listing →" in Google results' top bar), never with a Presence box or numbers.


| Page | Route | What's on it | Comes from |
|---|---|---|---|
| **Growth plan** | `/business/[id]/growth` (repurposed) | 1. **Tier hero**: name, "Tier N of 5", the next step in one line (Hair Express, test account: "2 · Building + Test account", "On track for Growing on Monday, Nov 30"), Active weeks (last 8), the 5-step track. 2. **To reach [next tier]** + **After that** cards. 3. **This week's plan**, the single weekly list (§4): "Approve 3 tasks" + "12 items go to Google" on Premium; steps on Grow. 4. One link line: **"See what Google brought you last month → Google results"**. No number cards: Google numbers live only on Google results, and offer tracking only on Customer offers. 5. **More ways to bring people in** (kept from today's Growth page, `#more-ways`): two visible cards, **"This week's Google post"** and **"Answer your customers' common questions"** (Premium: "PostScore can do this for you"; Grow: steps + "Premium does this for you in one click →"; Free: locked). They stay even though the same items are also in This week's plan; the post card is also where past posts and extra mid-week posts live (*decided Nov 22, for step 6*). 6. **More customers, whatever your score** (moved from Overview). | New tier parts; `WeeklyChecklist.tsx` (folds into This week's plan); `MoreWaysCards.tsx` (kept as its own block); `GrowMoreCustomers.tsx`; `ThisWeekList.tsx` / `ApproveAll.tsx` |
| **Google results** | `/business/[id]/google-results` (new) | Today's sections 1–3: Last month hero (rate + chart), KPI tiles, November so far, the "Google brought you…" estimate, What to do this week, Since you did this (decreases gray, increases green; the "other things also affect these numbers" note above the table), Searches → actions (funnel, who saw you, devices, call days, by month; "Actions per 100 viewers"), Search terms. The Growth line sits at the top, with a small "Fix your listing →" link (the page's only link to Presence; no closing listing box, no listing counts). Hero sentence: "of people who found you on Google took action (called, got directions or visited your site)". Jump: Last month · This week · Since you did this · Searches → actions · Search terms. | `GoogleProfileTab.tsx`: `LastMonthSection`, `ThisWeek`, `SinceCard`, `FunnelSection`, `SearchesSection`, `JumpMenu`, `WorthBox` |
| **Get more reviews** | `/business/[id]/get-reviews` (new) | **Asking only:** review link, QR + PNG, the "right way" guide, counter tools, Sign Studio (also listed in Print kit). No replies here: they live in Presence → Reviews. Link back: "See what customers say and reply →" (Presence → Reviews). | `ReviewsView.tsx`: `GetMoreReviews`, `ReviewGuide`, `CounterTools`, `SignStudio` |
| **Customer offers** | `/business/[id]/offers` (new; `?tab=running\|coupons\|referrals\|first-time\|loyalty`) | Opens on **Running now** (today's All campaigns rows for coupons and referrals: code, start, times used, +1, Share, End). Then the Coupons and Referrals designers. First-time customers and Loyalty programs are "Coming soon" until Day 25D. **Offer tracking lives here** (moved off the Growth plan): a summary card at the top of Running now, "{n} offers started since {date} · {uses} uses logged", plus per-offer uses. Test and practice offers are never listed or counted (§6.2). | `campaigns/CampaignsView.tsx` (coupon/referral rows), `CouponsSection`, `ReferralSection`, `HowToRunIt` |
| **Campaigns** | `/business/[id]/campaigns` (repurposed) | Email (Day 37), Text messages, Social posts: "Coming soon" until they ship, with the Premium/Grow labels from today. Small link: "Running coupons and referrals are in Customer offers →". | `campaigns/AllCampaigns.tsx` (email/text/social block) |
| **Local events** | `/business/[id]/local-events` (new) | "Coming soon" + what it will do, until Day 25D. | new |
| **Print kit & QR** | `/business/[id]/print-kit` (new) | **Hidden until Day 34 / 37-Core** *(decided Nov 24)*: off the sidebar, the phone tab row and the Growth tools (`PRINT_KIT_LIVE` in `lib/routes.ts`); the route stays and redirects to Get more reviews `#review-link` (the review link & QR). When it comes back: one place for every printable, each with its QR code: review sign (Sign Studio), coupon and referral cards (links into the designers), first-time and loyalty cards (25D). **Scan counts: not yet.** Today's QR codes open Google or the offer directly, so the page says "Scan counts aren't tracked yet" and shows the uses logged with +1 instead; short links + scan counts are built in 37-Core with offer tracking *(decided Nov 24)*. The vector kit itself is Day 34. | links to existing designers; scan counts from `/r/…` short links (37-Core) |

### 2a. Overview, in full
**Stays on Overview:**
- the header (photo, name, chips, last scan);
- the score card;
- Top recommendations, with the Growth line in place of "Start here";
- Since your last scan;
- **Score breakdown**;
- **At a glance**;
- **Your Google listing** (now one compact row);
- **Scan history**.

**Leaves Overview:**
- "More customers, whatever your score" → Growth plan;
- the "PostStudio, build your full website" card → removed (PostStudio is only in the sidebar, "Coming soon"; the Website page keeps its PostStudio link).

**Your Google listing, compact row** (mockups 02 and 02b):
- **Connected:** pin icon · "Your Google listing" · "● Connected · synced 25 h ago" · "5 OK · 1 to fix · 7 to improve" · "Open your Google listing →" (→ Presence → Google listing).
  - The counts are the same numbers as the Google listing page header.
  - The 3 item rows (Reviews, Messaging, Holiday hours) are removed; they live on the Google listing page.
- **Disconnected** (the connection is lost: the 401 → refresh flow failed, Google revoked access, or the owner disconnected):
  - the row turns red: "Disconnected: reconnect to keep your listing checked" + a **Reconnect** button;
  - Reconnect opens the Connect Google flow and returns to Overview.
  - Tokens are never deleted after one failure (CLAUDE.md), so a single failed call never shows this state.
- **Never connected:** today's not-connected wording, unchanged in meaning, in the same one-row form: "Connect Google to check your listing every day" + "Connect".

### Google listing page: row layout on phones
On screens under 860px, each row shows the status icon, then the field name, value and note, then **the buttons and "+N pts" on their own line under the text, left-aligned and fully visible**. Checked on every row of mockup 05 at 390px.
**Hours:** when the website's hours differ from Google's, the row is orange (!) with "Compare". It counts toward "to improve", not "OK".

### 2b. Fix plan (Presence, mockup 07)
- **Sidebar:** second Presence item, right under Overview; open on every plan (Free included).
- **Top card: one score, two targets** (not two scores):
  - **Big: "This week: 78 → 87"**. That's the score after every "This week" fix.
  - **Smaller, beside it: "When every fix is done: 100 · A"**. That's the same projection Overview shows; Overview keeps only this one.
  - The progress bar fills from the current score toward the weekly number, with the rest of the way to 100 shown lighter.
  - Under it: "From your last scan" and "points confirmed on your next scan".
- **"This week" vs "Takes a few weeks"** (each row gets one of these two tags; the urgency ranking stays):
  - **This week:** the owner can finish it alone, today, without waiting on customers, Google or time.
  - **Takes a few weeks:** it depends on customers, Google or time.
  - It's a field on every fix type, `thisWeek: true | false`, in the same table as the check (next to `lib/fixDestination.ts`), so it works for every business.
  - **Dynamic override:** a "This week" fix whose Google edit is held for review ("Pending Google review") shows "Takes a few weeks" until it's live.
- **All "This week" fixes done:** the top card says "This week's fixes done ✓ · Next: get 3 new reviews (+4.7)" (the most urgent remaining fix).

| Fix type (check) | Area | `thisWeek` | Why |
|---|---|---|---|
| Replying to reviews | Reviews | **true** | Owner replies today |
| Star rating | Reviews | false | Depends on customers |
| Review count | Reviews | false | Depends on customers |
| Review recency | Reviews | false | Depends on customers and time |
| Phone number | Google listing | **true** | Instant edit (override if Google holds it) |
| Address | Google listing | false | Google usually re-verifies |
| Business hours | Google listing | **true** | Instant edit |
| Holiday hours *(listing idea, not scored today)* | Google listing | **true** | Instant edit |
| Website link on listing | Google listing | **true** | Instant edit (override if held) |
| Categories | Google listing | **true** | Owner edit (override if held) |
| Photos | Google listing | **true** | Owner uploads today |
| Description *(not scored today)* | Google listing | **true** | Owner writes it today |
| Services *(not scored today)* | Google listing | **true** | Owner adds them today |
| Customer details (accessibility, payments, parking) | Google listing | **true** | Instant edit |
| Operational status | Google listing | false | Google must approve |
| Has a website | Website | false | Building a site takes time |
| Uses HTTPS | Website | false | Needs the host or a web person |
| Loads in a reasonable time (speed) | Website | false | Needs a second test, often a web person |
| Works well on phones | Website | false | Usually a web person |
| Site security | Website | false | Host or a web person |
| Site freshness | Website | false | Depends on time |
| Matches your Google listing | Website | **true** | Owner edits the site or the listing today |
| Up-to-date notices | Website | **true** | Owner edits the site today |
| No broken links | Website | **true** | Owner edits the site today; "Re-check my website" confirms |
| Content depth | Website | **true** | Same |
| Contact & conversion | Website | **true** | Same |
| About / our story | Website | **true** | Same |
| Services / products | Website | **true** | Same |
| Social media links | Website | **true** | Same |

Hair Express: hours match (+0.6), replies (+6) and customer details (+2) are "This week": 78 + 8.6 = 86.6 → **87**. The review fixes take weeks or months: +4.7 + 1.7 + 6.8 = 13.2, so 86.6 + 13.2 = 99.8 → **100**.

**Honest review points (decided Nov 21).** Review fixes are computed from the real scoring rules in `lib/scoring.ts`, never as one lump:
- **Recency:** reviews in the last 90 days: 0 → 0, 1 → 2, 2 → 4, 3+ → 6 points.
- **Review count:** √(count / 150) × 14.
- **Rating:** the rating curve × a trust factor that reaches full at 40 reviews (0.85 at 25), × 14.
- Points shown are what **N new reviews actually earn**, assuming the current star rating holds.

The review fix is split into three honest rows:

| Row | Hair Express | Points | Tag |
|---|---|---|---|
| Get 3 new reviews in the next 90 days | 30 → 33, recency 2 → 6 | **+4.7** (recency +4, rating +0.4, count +0.3) | Takes a few weeks |
| Grow to 40 reviews | 33 → 40: rating counts fully, count grows | **+1.7** (rating +1.0, count +0.7) | Takes months |
| Keep growing toward 150 reviews | 40 → 150 | **up to +6.8** (count) | Takes months |

The rows add up to the old +13.2, so the 100 · A projection is unchanged. A small line under it reads: "Some fixes take months (reviews grow over time)".

**Fix this in the live app in 25B** (no app code changed now):
- `lib/actionPlan.ts` `mergeReviewTasks`: the merged reviews card sums the full rating + count + recency gaps into `promisedPoints` (+13.2) and labels it with `dashboard.actionPlan.weeklyReviewTarget` ("Get {count}+ new reviews this week ({before} → {after}+)", EN + ES in `lib/i18n/messages.ts`).
- **Seen live on Hair Express (Nov 20 screenshots):**
  - Overview → Top recommendations: "Reviews · Get 3+ new reviews this week (30 → 33+) · +13 pts".
  - Growth recap card #2: the same label with "Up to +5 pts", so the live app already disagrees with itself.
- **Other places that read the same action plan and need checking:**
  - `components/overview/TopRecommendations.tsx`;
  - `app/business/[id]/ActionPlanSection.tsx`;
  - `lib/overviewTiles.ts` (the Overview "Biggest boost" / projection);
  - `app/actions/assistant.ts` (PostAI answers);
  - `lib/monthlyReport.ts`, `lib/reports/reportData.server.ts` and `app/api/cron/monthly-reports/route.ts` (report emails, in testing mode).
- **Also:** "this week" is the wrong time frame for 3 new reviews; use "in the next 90 days".
- **Rows**, ranked from most urgent to least (Urgent → High priority → Medium → Low; within a level, the most points first). Each row shows:
  - number, title, one-line why, and a priority badge;
  - where "Fix it" goes;
  - **"+N pts"** and the **running projected score** going down the list;
  - **Fix it →**, which uses the existing `lib/fixDestination.ts` links to land on the exact spot:
    - the Google listing row (e.g. `#customer-details`);
    - Presence → Reviews (replies) / Get more reviews in Growth (asking);
    - the Website check.
- **Hair Express** (scan of Nov 20; Top recommendations' own order and points):
  1. Match your website's hours to Google · Urgent · This week · +0.6 · → 79 · Website
  2. Reply to your recent reviews · High · This week · +6 · → 85 · Presence → Reviews, reply inbox (stays in Presence)
  3. Get 3 new reviews in the next 90 days · High · Takes a few weeks · +4.7 · → 89 · button **"Get more reviews (in Growth) →"**
  4. Add your customer details · Medium · This week · +2 · → 91 · Google listing, Customer details
  5. Grow to 40 reviews · Low · Takes months · +1.7 · → 93 · "Get more reviews (in Growth) →"
  6. Keep growing toward 150 reviews · Low · Takes months · up to +6.8 · → 100 · "Get more reviews (in Growth) →"
  - Then "Website speed: not scored yet" (up to 3 pts), with no button.
  - The running score rounds 99.8 to 100, matching Overview's projection.
  - Within a priority level, more points rank first (replies +6 before 3 new reviews +4.7).
  - Tags: **This week** · **Takes a few weeks** · **Takes months**. `thisWeek` becomes `when: "this_week" | "weeks" | "months"`; review-count growth beyond the next 3 reviews is `months`.
- **Replies stay in Presence** (Reviews). Only the "new reviews" rows leave Presence; its button says "Get more reviews (in Growth) →", and following it switches the sidebar to the Growth tab.
- **Each Presence page gets a one-line summary of its own fixes**, linking to Fix plan:
  - **Google listing:** "Fix this 1 and your Google listing goes 28 → 30 pts (score 78 → 80)" (in mockup 05).
  - **Reviews:** "Reply to your reviews and get 3 new ones: Visibility & Reputation goes 21 → 32 pts (score 78 → 89). The rest comes as your reviews grow."
  - **Website:** "Fix this 1 and your Website goes 29 → 29.5 pts (score 78 → 79)", plus "Speed is checked on your next scan".
  - With nothing left to fix: "Nothing to fix here. Your [area] has every point it can get right now."
- **Overview:** "See your action plan" and "View all" open Fix plan.
- **Plans:**
  - Free: the full ranked list with points and the running score; the steps are locked.
  - Grow: steps + "I did this" + "Premium does this for you in one click →".
  - Premium: "Fix it" lands on the one-click action.

### 2c. Growth plan: the tier "jump" (mirrors Fix plan's score jump)
- **This week's plan is ranked by impact on the tier**, most first:
  1. the first task that makes a week count that isn't counted yet;
  2. tasks that bring in a missing **result** for the next tier ("Gets you your result for Growing: 3 new reviews");
  3. tasks that make the week count when it doesn't yet;
  4. everything else.
- Each task shows **one line on what it does for the tier**. The first task that makes a not-yet-counted week active gets a **"Do this one first"** tag.
- **Top line** (computed from the real tier rules, like Fix plan's score projection): "Do 1 task → on track for Growing on Mon, {date}", plus the next tier's missing result.
- **Tier terms only.** Never PostScore points on Growth pages.
- **Timing rule:** an approved item counts for the week it **goes out**. A scheduled post approved on Saturday for Monday counts for Monday's week.
- **Hair Express (test account, Sat Nov 21), real rules:**
  - This week (Nov 16–22) already counts.
  - So the task that moves the tier is the **Monday post**: approved now, it goes out Mon Nov 23, which makes next week count. That's 5 of the last 6 weeks + R1 → **Growing on Mon Nov 30**. Your example said Dec 7; the rules give Nov 30.
  - Replies and answers go out today, in a week that already counts. Photos count for the week they're uploaded.
  - Next result (for Thriving): 3 new reviews in 30 days.
- **Same order on Google results** (one list). Mockups 03, 03b, 04 and 04b all use: post → replies → answers → photos.
- **Not connected:** the same ranking. Check-offs need 2 for a week to count, so the top line reads "Check off 2 tasks → next week counts". Mockup 03b shows the steps without the top line.

### 2d. One home per task (Nov 25)

**Rule.** Presence = one-time fixes to what's wrong or missing; they raise the PostScore score. Growth = repeat actions that bring customers in, every week, whatever the score. **No task appears as a task on both sides.** A link to the other side is fine ("Get more reviews (in Growth) →"); a second copy of the task isn't.

**Task by task**

| Task | Home | Where it shows | Removed from | Counts toward the Growth tier? |
|---|---|---|---|---|
| Reply to reviews (backlog and new) | Presence | Fix plan row "Reply to your recent reviews" → Reviews (pre-drafted replies) | Growth plan "This week" reply item, Growth plan replies line, Google results replies line, weekly routine | Yes: "Replied to reviews" (tag on the Fix plan row) |
| Business description | Presence | Fix plan row (from the description check) → Google listing | Growth plan "Answer your customers' common questions", "More ways" answers card | Yes: "Listing fix applied" |
| Services & prices | Presence | Fix plan row → Google listing | Same answers task and card | Yes: "Listing fix applied" |
| Customer details (parking, accessibility, payments) | Presence | Fix plan row "Add your customer details" | Answers task ("Missing: … parking, accessibility") | Yes: "Listing fix applied" |
| Hours | Presence | Fix plan row (hours check), Google listing | Growth plan "Also this week: Check your hours…", weekly routine | Yes: "Listing fix applied" |
| Holiday hours | Presence | Google listing (holiday hours) + Fix plan row when a holiday is coming with none set | Weekly routine (if listed) | Yes: "Listing fix applied" |
| Phone, website link, categories | Presence | Fix plan rows | (Growth never had them) | Yes: "Listing fix applied" |
| Weekly Google post (incl. a Q&A-style post) | Growth | Growth plan "This week", "More ways" post card, Google results | — | Yes: "Google post published" |
| Ask for reviews (link, QR, signs) | Growth | Growth plan "Also this week: Share your review link", Get more reviews | — (Fix plan review-count rows keep "Get more reviews (in Growth) →" as a link) | Yes: "Review link / QR shared" |
| Fresh photos | Growth | Growth plan "Add 3 photos this week" | — (the photos check, when it loses points, links to Growth) | Yes: "New photo on Google" |
| Offers | Growth | Customer offers | — | Yes |
| Campaigns | Growth | Campaigns | — | Yes (Day 37) |
| Local events | Growth | Local events | — | Yes (25D) |

**What changes on each page**
- **Growth plan:**
  - "This week" keeps only Growth items: the post, photos, and the asks (review link). The reply item, the answers item and "Check your hours" are removed.
  - The "More ways" answers card moves to the Google listing page (its answers editor) and the description/services become Fix plan rows; the post card stays.
  - "Approve this week" approves Growth items only (this week's post); its count is that page's own.
- **Google results:** the replies line goes; results only (calls, directions, clicks, reviews), with "Reply in Reviews →" left as a plain link if wanted.
- **Weekly routine** (Growth): drop the reply and hours items.
- **Fix plan:**
  - Rows that are also Growth-tier actions get a small gray **"Counts toward your Growth tier"** tag (replies, listing fixes: description, services, customer details, hours, holiday hours, phone, website link, categories).
  - New **"Approve fixes ({n})"** at the top for Premium + connected + writes on: the one-click fixes that have a saved draft or value ready (the pre-drafted replies the "Include in Approve all" boxes allow, plus listing updates). {n} counts what it will send; the count matches that page only.
  - Review-count rows keep "Get more reviews (in Growth) →".
- **Tier ranking and the "Do 1 task → on track for …" line** (Growth plan): when the quickest way to make this week count is a Presence fix (e.g. 10 replies are drafted and ready), the line points there: "Approve your 10 drafted replies in Fix plan → on track for Growing". The ranking scores Presence one-click fixes alongside Growth items for "makes the week count"; Growth items still lead when equal.

**Drafts written in the background, never on page load**
- The weekly Google post and the answers (description, services) drafts are written like the replies: by the daily job and after a scan or a voice change, saved, and read by pages.
- A page with a saved draft shows it at once. "Getting drafts ready…" and "Approve all (getting ready…)" appear only when no saved draft exists yet.
- Same plan rule as the replies (`PLAN_BASED_DRAFTING`): until checkout exists, every connected business in production.
- Needs one SQL file (a table for saved post/answers drafts, like `review_reply_batch`) for you to run first.

**EN + ES wording (new)**
- "Counts toward your Growth tier" / "Cuenta para su nivel de Growth"
- "Approve fixes ({n})" / "Aprobar correcciones ({n})"
- "Approve this week ({n})" / "Aprobar esta semana ({n})"
- "Approve your {n} drafted replies in Fix plan → on track for {tier}" / "Apruebe sus {n} respuestas redactadas en el Plan de correcciones → en camino a {tier}"

**Decided (Nov 25, approved with these)**
1. Holiday hours: a Fix plan row when a holiday in the next 30 days has no hours set.
2. Reviews: "Reply in Reviews →" stays as a link (no reply task outside Presence).
3. The answers card moves to Presence → Google listing.

**Growth plan keeps 3–5 tasks every week, all Growth-type** (ranked for the tier as before, none duplicating a Fix plan row):
- this week's Google post (or a Q&A-style post);
- ask for reviews (share the link / QR with recent customers);
- fresh photos;
- start or refresh an offer (coupon, referral, first-time);
- a seasonal idea tied to the next holiday or local event.

**Speed (decided Nov 25, scoring version bump):** "Loads in a reasonable time" (3 pts, weights unchanged) uses real-visitor data when Google has it; otherwise Speed Index from the same PageSpeed run, with the same 6-second line and two-test rule. Page weight is advice only ("Your 2 photos are 1.2 MB; smaller photos load faster"). The failure reason is saved, so a page Google can't measure never says "one more test on your next scan".

**SQL:** `supabase/day25b-background-drafts.sql` (one new `post_drafts` kind for the background description draft).

### Bottom

| Page | Route | Change |
|---|---|---|
| PostStudio | `/business/[id]/studio` | Becomes a sidebar item with "Coming soon" (today it's only reached from the Overview card / Website page). Page unchanged. |
| Reports | `/business/[id]/reports` | Page unchanged. In the sidebar it sits under PostStudio, after the divider, with the gold "New" dot (§1). |
| Account / Settings | account menu | Unchanged. |

---

## 3. What moves where (file by file)

### Sidebar and shell
| File | Change |
|---|---|
| `components/layout/Sidebar.tsx` | `NAV_ITEMS` → `PRESENCE_ITEMS`, `GROWTH_ITEMS`, `BOTTOM_ITEMS`. Adds the two-tab switch, the open-tab-from-route logic, the tier/score values, and "Coming soon" chips. Takes `presence: {score, grade}` and `growth: {tier} \| "locked" \| null`. |
| `components/layout/DashboardShell.tsx` | Passes the score/tier into the sidebar; phone top bar + page row. |
| `components/layout/shellMemory.ts` | Also remembers the last open tab (memory only) for shared pages. |
| `lib/freeTabs.ts` | `SHOWROOM_TABS` gains `google-results`, `get-reviews`, `offers`, `print-kit`, `local-events` (showroom = the locked preview). `growth` stays. `campaigns` stays. |
| `components/layout/Sidebar.test.tsx` | Rewritten for both tabs, locks, active tab by route. |
| `lib/i18n/messages.ts` | New `dashboard.nav.*` keys + tab labels (EN + ES, §8). |

### Google Profile tab → two pages
| From | To |
|---|---|
| `app/business/[id]/growth/page.tsx`, `?tab=google-profile` branch | `app/business/[id]/google-results/page.tsx` (performance data loads: insights, booking, average visit, actions) and `app/business/[id]/google-listing/page.tsx` (listing extras, edits, protection, photos/posts, undo state). Each page loads only its own data. |
| `components/gbp/GoogleProfileTab.tsx` (2,765 lines) | Split into `components/gbp/GoogleResults.tsx` (sections 1–3 + `JumpMenu` with results sections) and `components/gbp/GoogleListingPage.tsx` (sections 4–6). Shared bits (`Box`, `SectionHead`, `InfoPop`, `SyncMessage`, `SampleTag`) go to `components/gbp/googleTabParts.tsx`. |
| `components/gbp/GoogleProfilePanel.tsx` | The Free/Grow locked preview splits the same way. |
| `lib/googleProfileTab.ts` `JUMP_SECTIONS` | Two lists: `RESULTS_SECTIONS` (last-month, this-week, since, funnel, searches) and `LISTING_SECTIONS` (listing, next, protection). `jumpIdFromHash` resolves per page. |
| "Reviews, coupons and weekly tasks are in Growth recap" (end of section 5) | "Every score fix, ranked, is in Fix plan. Posts, offers and review asks are in Growth plan." |
| `NotConnectedCard` | Shown on both pages, with page-specific wording (listing: "Connect to edit from here"; results: "Connect to see calls, directions and clicks"). |

### Growth page → Growth plan + Fix plan
| From (`GrowthView.tsx`) | To |
|---|---|
| `ProjectedSummary` ("78 → 92"), `PlanBlurb`, action plan (`#weekly-plan`, `#task-…`), Bigger projects, `WebsiteBannerCard`, re-check website, `WeeklyPlanCelebration` | `app/business/[id]/fix-plan/` (Presence) |
| `WeeklyChecklist` ("Your weekly routine") | Folded into Growth plan → This week's plan (no separate list) |
| `MoreWaysCards` (This week's Google post, Answer common questions) | **Stays on Growth plan as its own block, "More ways to bring people in"** (two visible cards, `#more-ways`), as on today's Growth page. The same two items also appear in This week's plan; the post card also keeps past posts and extra mid-week posts. *(Revised Nov 22: no longer folded into This week's plan.)* |
| `GrowthMoveCard` list ("Ways to grow") | Growth plan → More customers, whatever your score |
| `WeeklyGoalCelebration` | Growth plan (it's about the week's activity) |
| `FreeGrowthPlan.tsx` | Split: score-fix previews → `/fix-plan` on Free; Growth locked preview (mockup 06) → `/growth` on Free |

### Overview
| File | Change |
|---|---|
| `components/overview/TopRecommendations.tsx` | "Start here: your Growth recap" bar → the Growth line. "View all" → `/fix-plan`. |
| `components/overview/ScoreBand.tsx` | "See your action plan →" → `/fix-plan`. |
| `components/overview/GrowMoreCustomers.tsx` | Removed from Overview; rendered on Growth plan. |
| `components/overview/GoogleListingCard.tsx` | Becomes the compact row (§2a): drop the 3 item rows; add the red disconnected state + Reconnect; the link → `/google-listing`. Counts come from the same helper as the Google listing page header (`listingCounts`), with Hours mismatch = "to improve". |
| `components/overview/StudioComingSoon.tsx` (Overview PostStudio card) | Removed from Overview. PostStudio becomes a sidebar item with "Coming soon". |
| `components/overview/DetailsMismatchTasks.tsx`, `components/scoring/FixButton.tsx`, `lib/fixDestination.ts`, `lib/fixFlows.ts`, `lib/actionPlan.ts` | Fix links to listing editors → `/google-listing#…`; links to the recap → `/fix-plan#…`. |

### Reviews split
| From (`website-reviews/ReviewsView.tsx`) | To |
|---|---|
| `GetMoreReviews`, `ReviewGuide`, `CounterTools`, `SignStudio` (asking) | `app/business/[id]/get-reviews/` (Growth) |
| `ReviewReplyDrafter`, `GoogleReviewsInbox`, `GbpReplyCheckConnect` (replying) | **Stay on Reviews (Presence)**: replies are a score check ("Replying to reviews"), so they live with the points |
| `ReviewSocialProof`, `ReviewGapLine`, rubric `CategoryCard`, `LiveUnavailableNote` | Stay on Reviews (Presence) |

The Growth plan's weekly "Reply to your 10 newest unanswered reviews" task and its Approve button stay as they are. They're a shortcut that sends the **same** drafts as the Reviews inbox (one set of drafts; approving in one place marks them sent in the other).

### Campaigns split
| From | To |
|---|---|
| `campaigns/AllCampaigns.tsx` coupon/referral rows, `CouponsSection`, `ReferralSection`, `HowToRunIt`, `ShareModal`, `ActivePromotions`, `ActiveReferral` | `app/business/[id]/offers/` |
| Email/text/social block | Stays on `/campaigns` |
| `lib/campaignsTabs.ts` `campaignsHref` | → `offersHref(id, tab)`; `campaignsHref` kept for email/text/social |

### Every other link to Growth (44 files reference `/growth`; each gets the new route)
`lib/assistant.ts` (7), `lib/growthMoves.ts` (6), `GrowthView.tsx` (5), `app/actions/gbpGoogleEdits.ts` (4), `lib/monthlyReport.ts` (3), `lib/growthMoveOverlap.ts` (3), `DetailsMismatchTasks.tsx` (3), `app/actions/assistant.ts` (3), `lib/postaiLinks.ts` (2), `lib/fixDestination.ts` (2), `TopRecommendations.tsx` (2), `ScoreBand.tsx` (2), `app/api/cron/monthly-reports/route.ts` (2), `app/actions/growthMoves.ts` (2), `gbpPosts.ts` (2), `gbpPhotos.ts` (2), and one each in: `weeklyChecklist.ts`, `starterSiteScoring.ts`, `overviewTiles.ts`, `overviewListing.ts`, `notifications.ts`, `growBannerTools.ts`, `gbpLanding.ts`, `competitors.ts`, `HoursMismatchChooser.tsx`, `BookingSteps.tsx`, `StarterHoursEditor.tsx`, `settings/page.tsx`, `connect-gbp/ConnectGbpView.tsx`, `ActionPlanSection.tsx`, `googleSince.ts`, `gbpListingFields.ts`, `bookingReminder.ts`, `averageVisit.ts`, `search-demand/page.tsx`, `google-profile/page.tsx`.
**Rule for 25B:** one helper per destination (`fixPlanHref`, `googleListingHref`, `googleResultsHref`, `growthPlanHref`, `offersHref`). No hand-written `/growth…` strings stay; a test greps for them.

Also: emails (`emails/`), PostAI page map (`lib/postaiDock`, `lib/postaiFeatureMap`), notification links, and `docs/product-structure.md` (rewrite the Sidebar section).

### Redirects (old links keep working)
| Old | New |
|---|---|
| `/growth?tab=google-profile` | `/google-results` |
| `/growth?tab=google-profile#listing` / `#next` / `#protection` / `#edit-…` | `/google-listing#…` |
| `/growth?tab=google-profile#last-month` / `#funnel` / `#searches` | `/google-results#…` |
| `/google-profile` | `/google-results` |
| `/search-demand` | `/google-results#searches` |
| `/growth#weekly-plan`, `/growth#task-…`, `/growth#ways-to-grow` | `/fix-plan#…` (except `#ways-to-grow` → `/growth#more`) |
| `/growth#weekly-routine` | `/growth#this-week` |
| `/growth#more-ways` | stays `/growth#more-ways` (the block stays, Nov 22). *Step 6: drop the `more-ways` → `this-week` rename in `legacyRedirect` (`lib/routes.ts`) and its test.* |
| `/campaigns?tab=all` | `/offers` (Running now) |
| `/campaigns?tab=coupons` / `referrals` | `/offers?tab=coupons` / `referrals` |
| `/growth?tab=coupons` / `referral(s)` | `/offers?tab=…` (today's redirects re-pointed) |
| `/website-reviews#get-more-reviews` / `#review-link` | `/get-reviews#…` (asking moved to Growth; replies and points stay on Reviews). *Approved Nov 21 (25B step 1).* |
| `/growth?open=howto#task-…` | `/fix-plan?open=howto#task-…` (a fix's own steps). *Approved Nov 21.* |
| `/growth?tab=google…#google-connection` (the Google connect message) | `/google-results#google-connection`, keeping `?gbp=`. *Approved Nov 21.* |

Hashes never reach the server, so hash-based moves need a small client redirect on `/growth` (and the old Google tab URL) that reads `location.hash` and replaces the URL. Saved emails and notifications already sent use the old URLs, which is why these stay for good.

**Built in 25B step 1:**
- The redirect table is `legacyRedirect` in `lib/routes.ts`, with one test per row.
- It's off until `NEW_PAGES_LIVE`. Hash rows are handled by `components/layout/LegacyHashRedirect.tsx`.

**Rule: anchor ids stay.**
- The new pages keep today's anchor ids: `weekly-routine`, `weekly-plan`, `get-more-reviews`, `reply-to-reviews`, `google-reviews`, `reply-check`, `review-link`, `searches`, `task-…` and every `edit-…`.
- If a page must rename one, every caller changes in the same step, and `lib/routes.test.ts` is updated with it.
- The route helpers pass anchors through unchanged. The redirects only rename anchors for old saved links (e.g. `#weekly-routine` → `#this-week`), so the new Growth plan answers to both ids.

---

## 4. Links between pages

| From | Link text | To |
|---|---|---|
| Overview, Top recommendations | **Growth · Tier {n} {name} · 4 tasks this week → Open your Growth plan** (Hair Express: Tier 2 Building + Test account) | Growth plan |
| Overview, Your Google listing row | Open your Google listing → / Reconnect | Google listing / Connect Google |
| Overview, Top recommendations | View all → | Fix plan |
| Overview, score card | See your action plan → | Fix plan |
| Overview, Your Google listing card | Open your Google listing → | Google listing |
| Google listing (top bar) | See what your listing brings in → | Google results |
| Google listing, Reviews row | Reply in Reviews → | Reviews (Presence) |
| Google listing, end of section 2 | Fix plan / Growth plan | both |
| Google results (top info bar only) | Fix your listing → | Google listing |
| Google results, What to do this week | (same items as Growth plan) | Growth plan → This week's plan |
| Growth plan (link line under This week's plan) | See what Google brought you last month → Google results | Google results |
| Growth plan, More customers | Get your review link & QR → / Customer offers / Local events / Print kit / Campaigns | each Growth page |
| Reviews (Presence): goal card + Review count / recency rows | Get more reviews (in Growth) → | Get more reviews |
| Overview, Top recommendations (Reviews) | Get more reviews (in Growth) → | Get more reviews |
| Any other Presence link into Get more reviews | always worded "Get more reviews (in Growth) →" | Get more reviews |
| Get more reviews | See what customers say and reply → | Reviews |
| Growth plan, "Reply to your 10 newest reviews" | (Approve here = the same drafts as the Reviews inbox) | Reviews (shared state) |
| Website (Presence) "Grow this" bar | (after launch) Build a better site → PostStudio | PostStudio |
| Competitors "Grow this" bar | Win more customers than them → | Growth plan |
| Price check "Grow this" bar | Run an offer → | Customer offers |
| Fix plan | Each fix's button → its spot (Google listing row, Reviews inbox, Website); "Get fresh reviews" → "Get more reviews (in Growth) →" | Presence pages (+ Get more reviews) |
| Campaigns | Running coupons and referrals are in Customer offers → | Customer offers |

**One weekly list, two views.** "What to do this week" on Google results and "This week's plan" on Growth plan are the same list with the same state. **Same items, same order** on both pages (the plan's own priority order; ranked by tier impact (§2c); for Hair Express: **post → replies → answers → photos**). Google results adds the lever chips above the list.
**Approve button:** "Approve {n} tasks" (the one-tap tasks), with small text under it: "{m} items go to Google" (Hair Express: 3 tasks; 10 replies + 1 post + 1 set of answers = 12 items). The same button on both pages.

---

## 5. Plans (every new page)

The rule from CLAUDE.md applies everywhere: **Grow tells you what's wrong and shows you how to fix it yourself. Premium does it for you, with one click.** On Grow, every one-click item shows "Premium does this for you in one click →" next to its steps.

| Page | Free | Grow | Premium / Multi |
|---|---|---|---|
| Sidebar Growth tab | "?" + lock | Tier | Tier |
| Overview Growth line | "Growth · ? Locked · See what your Growth score would measure →" | "Growth · Tier N Name · 4 steps this week →" | "… · 4 tasks this week →" |
| Fix plan | **Full ranked list with "+N pts" and the running score** (it's the audit). "Fix it" opens the steps as a locked preview | The same ranked list; each row opens steps + "I did this" + "Premium does this for you in one click →" | The same list; "Fix it" lands on the one-click "PostScore can do this for you" at the destination |
| Google listing | ✓/!/✕ rows and "+N pts" visible (it's the audit); steps locked; editors hidden | Rows + step-by-step how-to per row + Premium line; "Changes by anyone else" shown with how to change it back yourself | One-click editors (preview → approve → 7-day undo), "Change back", holiday hours/services writes |
| Google results | Locked preview: no numbers shown, "Connect Google with Grow to see your calls, direction requests and website clicks" | **Decided:** all numbers (hero, tiles, funnel, search terms, Since you did this); This week as steps | Everything + Approve all |
| Growth plan | Locked preview (mockup 06): the page badge reads **"Locked"** (on every Growth page), "?", what it would measure, real task titles blurred | Tier, requirements, This week's plan as steps with "I did this" | Tier, requirements, **"Approve 3 tasks" / "12 items go to Google"**, "Needs you · N min" items |
| Get more reviews | Link, QR, guide rule visible, the rest locked | Guide fully open, basic sign | Full Sign Studio |
| Reviews (Presence) | Rating, count, points; 3 free reply drafts (paste); inbox locked | 3 free reply drafts + "Unlimited with Premium"; steps to reply on Google + "Premium does this for you in one click →" | Inbox with drafts + Approve, unlimited |
| Customer offers | Today's Campaigns showroom | 2 styles, tracking | Full customization |
| Campaigns | Locked | Locked "Premium" chip | Coming soon |
| Local events | Coming soon | Coming soon | Coming soon |
| Print kit & QR | Review QR + PNG (free today); the rest locked | Basic signs/cards | Full designer |
| Reports | Locked (today) | Open | Open |

**Fairness rule:** the tier rules are the **same on Grow and Premium**. Premium makes a tier easier to keep (one tap), never higher for the same work.

---

## 6. Growth tier: first draft of the rules

### 6.1 Why requirements instead of points
You asked for "points per tier". I recommend **plain requirements per tier**, not a points total:
- Presence pages already use "+N pts". A second kind of points would blur exactly the line the wording rule draws ("They don't change your PostScore score").
- A points total invites gaming (ten small clicks = one real result). Requirements can demand a *real* result for each tier above Building.
- "To reach Growing: 5 active weeks out of the last 6 + one real result" is something an owner can read and act on. "You have 340 of 500 points" isn't.

If you'd still rather have points, §6.8 gives a points version of the same rules.

### 6.2 Building blocks
**A week** runs Monday–Sunday in the business's time zone. Tiers are recomputed every **Monday** from the week that just closed (never mid-week, so the tier doesn't flicker).

**Actions** (what the owner did). Each is *verified* (PostScore can see it) or *"You told us"* (the owner checked it off):

| Action | Verified when | Otherwise |
|---|---|---|
| Google post published | Sent from PostScore, or seen via Business Profile | You told us |
| Replied to reviews | Sent from PostScore, or the reply count rises (Business Profile) | You told us |
| New photo on Google | Business Profile photo date / scan photo count rises | You told us |
| Listing fix applied (hours, holiday hours, services, description, customer details) | Sent from PostScore, or seen on the next scan | You told us |
| Offer started (coupon, referral, first-time, loyalty) | Created in PostScore | — |
| Offer use logged (+1) | — | You told us |
| Review link / QR shared | A scan of the `/r/…` link | You told us |
| Email campaign sent (Day 37) | Sent from PostScore | — |
| Local event joined (25D) | — | You told us |
| Approved items (Premium Approve all) | Each approved item counts as its own verified action once it goes out | — |

**Rule: practice and test rows never count toward the tier, toward results, or in "Since you did this" / offer tracking.** A row is a test when any of these is true:
1. **Practice mode:** `gbp_changes.practice = true` or a `kind` ending in `_practice`; `gbp_review_reply_log.status = 'practice'`. Practice mode is never used in production, but its rows stay in the database.
2. **Made by an internal account:** the person who did it (`approved_by`, or the business owner for promos and tasks) is on the internal list: the dev test login account, `PLAN_SWITCHER_EMAILS`, and admin accounts.
3. **Undone:** a Google change undone within its undo window cancels out; the change and its undo are both ignored (`undone_at` set, or the row has `undo_of`).
4. **Marked as a test:** `promos` and `referrals` have no practice flag today. 25B adds `is_test boolean default false` (SQL for you to paste). Offers created in practice mode or by an internal account get `true`.

The dry run (§6.7) prints how many rows each part of the rule removed, per business.

**Exception: the dev test login only (decided Nov 21).**
- Businesses owned by the dev test login (`DEV_TEST_LOGIN_EMAIL`) **do** get a real tier. It's computed from all their activity **including** test rows (rules 1, 2 and 4 are skipped), so Sam can see the design with real data.
- Rule 3 (an undone change cancels out) still applies. It isn't a test rule: an undone change is never an action for anyone.
- Wherever the dev login sees that tier, a small gray **"Test account"** tag sits next to it:
  - the sidebar Growth tab (under the tier);
  - the Overview Growth line;
  - the Growth plan and Google results headings.
- It applies **only** to the dev test login. Other internal accounts (`PLAN_SWITCHER_EMAILS`, admins) and every real owner keep the full rule: test and practice rows never count.
- **Claimed businesses start fresh:** if a real owner later claims a business the dev login had, its tier starts at Starting out from that owner's own actions. Activity from before the claim (the claim date) never counts for them.
- **Dev-only "preview tier" switch:**
  - visible only to the dev test login, in the existing dev plan pill (`components/dev/DevPlanPill.tsx`), as "Tier: Real · 1 · 2 · 3 · 4 · 5";
  - picking a tier shows that tier everywhere for design checks;
  - it's a cookie in that browser only (like `--plan`): it never saves, never counts and never reaches a real owner;
  - "Real" goes back to the computed tier;
  - `scripts/devShot.ts` gains `--tier=1..5`.

**Before launch (or when Sam says): tier reset.**
- `scripts/reset-growth-tiers.ts` (built in 25B) wipes every business's Growth tier and the activity history used for tiers, for **all** accounts, the dev login included.
- From the reset date, every tier starts fresh from real owner actions. Test and dev activity from before the reset never counts for anyone. The reset date is saved, and tier queries ignore anything older.
- It runs a dry run first, listing per business what would be cleared (tier rows, weekly activity rows, counts). It never runs on its own, only when Sam asks.
- It does **not** touch PostScore scores, scans, `scan_changes`, the Google listing, or the source rows themselves (offers, tasks, `gbp_changes`, reply logs). It clears only the tier data built from them, and sets the start date.
- It's also written in CLAUDE.md under "Before launch".

**Active week** = at least **1 verified action**, or at least **2 "You told us" check-offs**.
(Grow owners can stay active by checking things off; one tap of "I did this" alone can't.)

**Results** (what happened). Each is measured over the last 30 days or the last full month:

| # | Result | Bar | Source | Kind |
|---|---|---|---|---|
| R1 | Customer actions from Google up on last year | Last full month's calls + directions + bookings + website clicks ≥ the same month last year (needs 13 months of data; otherwise ≥ the 3-month average before it) | Business Profile | Measured |
| R2 | Fresh reviews | ≥ 3 new Google reviews in 30 days | Scans / Business Profile | Measured |
| R3 | QR scans | ≥ 10 scans of PostScore QR codes / short links in 30 days | `/r/…` (37-Core) | Measured, once QR tracking is on. Until then it can't count: shown as "Counts once QR tracking is on", never as failed or 0 *(decided Nov 24)* |
| R4 | Offers used | ≥ 3 offer uses logged in 30 days | +1 tally | You told us |
| R5 | Email campaign opened (from Day 37) | ≥ 1 campaign sent with ≥ 20% opens | Day 37 | Measured |

Comparing with the same month last year keeps season out of it (a salon's December isn't compared with its October).

### 6.3 What each tier needs
| Tier | Active weeks | Results | Extra |
|---|---|---|---|
| 1 Starting out | — | — | Everyone starts here |
| 2 Building | 3 of the last 4 | — | Habit first |
| 3 Growing | 5 of the last 6 | 1 | — |
| 4 Thriving | 7 of the last 8 | 2, at least 1 measured | — |
| 5 Local favorite | 11 of the last 12 | 3, at least 2 measured | R1 met 3 months in a row |

- **Up at most one tier per Monday**, so each move reads as earned.
- Not connected to Google: R1 isn't available, so tiers 3–4 use R2–R5. Local favorite needs R1, so unconnected owners see "Connect Google to reach Local favorite" (honest, not a penalty).
- Online-only / service-area businesses (25B): in-person actions and results (window sign, counter QR) are left out, never failed. Their own actions replace them, per the 25B list.

### 6.4 Going down, and how to avoid unfair drops
**Decay (decided):** **two quiet weeks in a row → down one tier.** Then one more step for every further two quiet weeks. Never below Starting out.
**Results slipping:** if the tier's results bar isn't met for **4 Mondays in a row**, down one tier. Results lag, so they get a longer grace period than activity.

Protections:
1. **Warning first.** After one quiet week, show "Keep Building: one thing from this week's plan by Sunday keeps your tier" on Growth plan and the Overview line, plus one notification. Never a surprise drop.
2. **Neutral weeks** (skipped, never counted as quiet):
   - weeks the owner marks **"Closed this week"** (up to 4 a year; vacation, renovation);
   - weeks the Google listing shows closed all week (holiday hours / temporarily closed);
   - the first 2 weeks on a paid plan;
   - weeks where PostScore had nothing to suggest (fewer than 2 items in the plan);
   - weeks where **Google or PostScore failed**: a token that won't refresh after the 401 → refresh flow, a Business Profile outage, or our own outage. The first 2 weeks after a Google disconnect are neutral too, with a "Reconnect Google" nudge.
3. **Missing data never counts against the owner.** If a result can't be measured (no insights yet, Google's numbers late before the 5th), it's "not checked", not failed.
4. **Coming back is quick.** After a drop, **2 active weeks in a row restore the tier they had**, if its results are still met. No need to climb the full ladder again.
5. **Plan changes:**
   - Downgrade to Free: the tier is frozen and hidden ("?").
   - Upgrade within 60 days: the tier resumes where it was.
   - After 60 days: it resumes one step lower.
6. **No mid-week changes** and no more than one step down per two weeks.
7. **Every change says why, in plain words.** Examples: "You moved to Building: no activity the weeks of Nov 30 and Dec 7. Two active weeks bring Growing back." / "You moved up to Growing: 5 active weeks and 152 customer actions from Google in October."

### 6.5 Wording rules for the tier
- **Growth pages never show Presence content:** listing status, OK / to fix / to improve counts, "+N pts" or score fixes. At most one small link to Presence (§2, Growth).
- No game language: no XP, levels, badges, streaks, "unlock achievements". "Tier" + name, "active weeks", "results".
- "Customer actions", never "sales". Every result names its source ("from Google", "You told us").
- Growth pages never show "+N pts"; Presence pages never show the tier as a score.
- The Growth line appears wherever Google numbers are shown.

### 6.6 Hair Express: where each counted action came from (checked Nov 21, read-only)
Hair Express's owner in PostScore is **the dev test login account** (it owns 67 businesses). Angelica has no PostScore account. So nothing on this business was done by the real owner.

| Counted as | Table · row | Real or test? |
|---|---|---|
| Offer started Oct 21 | `promos` id `9eafeb85…`, type `firstTime`, code ZSUH-J9GN, created 2026-10-21 23:19 UTC; `redemptions 0`, `active false` | **Test:** made by the test account, ended, never used |
| Offer started Nov 13 | `promos` id `f7bd3b56…`, type `custom` ("Bring a friend"), code 8P2U-BZFA, created 2026-11-13 16:42 UTC; `redemptions 0`, `active false` | **Test:** same |
| Offer started Nov 20 | `promos` id `c16662a4…`, type `firstTime`, code FQ5A-KXLY, created 2026-11-20 21:56:49 UTC; `redemptions 0`, `active false` | **Test:** created 41 seconds before a practice-mode "Approve all" run (practice `gbp_changes` rows at 21:57:30) |
| Listing update Nov 3 | `gbp_changes` batch `c3ea7b44…`, 3 rows (`attributes/has_parking_street_paid`, `has_parking_lot_paid`, `has_wheelchair_accessible_parking`), `practice false`, `status sent`, approved 2026-11-04 04:36 UTC (Nov 3, 11:36 PM ET) by the test account; **undone** at 05:00 UTC (batch `98214018…`, `undo_of` the first) | **Test:** a real write to Hair Express's real Google listing, undone 24 minutes later. Net change: none |
| Fixes marked done Oct 27 | `tasks` (4 rows: `visibility.review_count`, `.rating`, `.review_recency`, `.review_replies`), `marked_done_at` 2026-10-28 01:53:33–36 UTC (Oct 27, 9:53 PM ET), all `pending_verification`; reviews still 30 | **Test:** 4 clicks in 3 seconds by the test account; nothing changed on Google |
| (also) fix marked done Nov 3 | `tasks` `completeness.customer_details`, marked 2026-11-04 04:36:29 UTC, 2 s after the change above | **Test:** marked automatically by the undone change |

Not counted before and still not counted: 24 `gbp_review_reply_log` rows (`status practice`) and 6 `*_practice` `gbp_changes` rows (Nov 20).

**Recomputed with every test row removed:** 0 actions → 0 active weeks → **Tier 1 · Starting out**.
- Hair Express does **not** move to Growing on Nov 23. It isn't Building today either.
- R1 is still met: the Google numbers are real, from Hair Express's own listing. October: 152 customer actions vs 102 in October 2025, +49%. So Growing's result is already in hand; only the active weeks are missing.
- Earliest path if real activity starts this week:
  - Building on **Mon Dec 7** (weeks of Nov 16, 23 and 30 active);
  - Growing on **Mon Dec 21** (5 of 6: the weeks of Nov 16 through Dec 14, with R1 still met).
- This is what a **real owner** with this history would see. The mockups show the test-account tier (below).

**Superseded on Nov 21:** the test account now gets a tier computed *with* its test rows (§6.2 exception). For a real owner, the "Starting out" result above is what Hair Express's history would give.

**Hair Express as the dev test account (what the mockups show): Tier 2 · Building + "Test account".**
Weeks run Monday–Sunday, ET. Test rows are counted, practice rows too; the undone Google change isn't.

| Week | Counted | Active? |
|---|---|---|
| Oct 12 | none | quiet |
| Oct 19 | offer started Oct 21 | ✓ |
| Oct 26 | 4 check-offs Oct 27 | ✓ (2+ check-offs) |
| Nov 2 | 1 check-off Nov 3. The Google change was undone, so it doesn't count | quiet (1 check-off < 2) |
| Nov 9 | practice review replies (Nov 9, 9 PM ET) + offer started Nov 13 | ✓ |
| Nov 16 (this week) | offer started Nov 20 + practice Approve all | ✓ |

- Mon Nov 16: 3 of the last 4 weeks active → **Building**.
- Mon Nov 23: Growing needs 5 of the last 6; it has 4 → stays Building. The single quiet week (Nov 2) isn't two in a row, so there's no drop.
- **Growing on Mon Nov 30** if the week of Nov 23 is active (5 of 6, and R1 is already met: 152 vs 102). The Growth plan mockup says this.
- If the undone change *had* counted, Nov 2 would be active: Building on Nov 9 and Growing on Nov 23. It's left out on purpose.

One more thing to know:
- (b) The Nov 3 change was a real Google write to a real customer's listing, undone within 24 minutes. That's just for the record; it's consistent with "real edits wait for an owner who says yes".

Note on Google's numbers: website clicks show 0 in most months before Aug 2025 and between Nov 2025 and Jul 2026, which looks like a counting break. R1 should compare calls + directions alone when either month has 0 website clicks. Hair Express still passes: 102 vs 76, +34%.

### 6.7 Dry run before anyone sees it (25B)
Compute tiers for every saved paid-plan business, as of each of the last 12 Mondays, without showing them. Report to a Desktop file:
- the spread per tier;
- how many drops, and why;
- how many neutral weeks, and why.

Pass = not everyone at Starting out, not everyone at Local favorite, and no drop caused by a Google or PostScore failure. You OK the result before it turns on.

### 6.8 If you prefer points (same rules, expressed as points)
- 10 per active week (rolling 12 weeks, max 120).
- 20 per result met (max 100).
- Tiers at 30 / 60 / 110 / 180, with the same "measured" and "R1 3 months" conditions.
- Decay: an active week falls out of the window after 12 weeks, plus the two-quiet-weeks step-down.

I'd still show requirements on screen even with this underneath.

---

## 6a. "Google not connected" state for Growth
Shown **only** when the business's Google listing isn't connected. Hair Express is connected, so its main mockups (03, 04) stay as they are; this state has its own screenshots: **03b-growth-plan-not-connected** and **04b-google-results-not-connected**.

**Growth plan (03b)**
- **Banner at the top:** "Connect your Google listing to see your results and let PostScore post for you" + **Connect**.
- **This week's plan** turns into steps: "4 steps · do them on Google, then check them off" / "Connect Google and 3 of these become one tap".
  - Each task shows how to do it on Google, an **"I did this"** button, and "Connect Google to make this one tap" under the steps for the one-tap tasks.
  - There's no Approve button.
  - Drafts (the post, the answers, the reply drafts) are still written, ready to copy.
- **Work as normal:** Customer offers, Print kit & QR, the review link and QR, Campaigns, Local events.
- The link line becomes "See what Google results will show you → Google results".

**Google results (04b)**
- The numbers are replaced by a short explanation and **Connect Google**:
  - "Connect your Google listing to see your results. Google keeps these numbers for your listing…";
  - then what they'd see: calls / directions / website clicks / bookings; people who saw the listing and took action; search terms; what changed after things you did.
- **No fake, sample or old numbers.** If an earlier connection left saved monthly totals, they're still not shown while disconnected; the page says when the last update was.
- Only the Connect card, then one line under it: "Your weekly tasks are on Growth plan →". The week's tasks are **not** repeated here, and there's no listing box (Growth pages never show Presence content, §6.5).

**Tier without Google**
- **Active weeks can still be met:**
  - verified actions PostScore sees itself: offers started, QR scans (once QR tracking is on, 37-Core), review-link opens;
  - new photos and listing fixes seen on the next scan;
  - "I did this" check-offs (2 = an active week).
- **Real results still available:**
  - R2 fresh reviews: seen on every scan;
  - R3 QR scans, once QR tracking is on (37-Core); until then "Counts once QR tracking is on";
  - R4 offers used ("You told us");
  - R5 email campaigns, once Day 37 ships.
- **R1 "customer actions from Google up on last year" needs the connection.** The requirement row says "counts once Google is connected" (shown in 03b). Local favorite needs R1, so it needs the connection.

**Connection lost later** (e.g. the Testing-mode 7-day token expiry, a revoked access, or the refresh failing after the 401 → refresh flow):
- the banner and buttons say **"Reconnect"** instead of "Connect";
- **the tier is kept**;
- weeks while disconnected are neutral for anything that needs Google (§6.4), so a lost connection never counts against the owner;
- Overview's listing row turns red (02b).

## 6b. Page notes (moved out of the mockups)
These notes used to sit inside the mockups as dashed yellow boxes. They're review notes for this spec only. **None of them is app text, and none may ever appear in the app.** The mockups and screenshots now show only what an owner would see.

**Sidebar (01)**
- Presence shows the real 0–100 score and grade from the saved scan.
- Growth shows the tier number and name. Hair Express shows 2 · Building + "Test account": it's the dev test login, whose tier counts its own test activity (§6.2, §6.6).
- Free never shows a tier, only "?" with a lock.
- Local events shows "Coming soon" until Day 25D ships.
- PostStudio and Reports sit right under the open tab's pages, after a thin line. Only Account is pinned to the bottom.
- Reports shows a gold dot when a monthly report is ready and not opened yet. On Free, Reports keeps its lock and never shows the dot: Free gets no monthly report.
- On phones, the same sidebar opens from the menu button, and a row of the open tab's pages sits under the top bar.
- The three small labels above the sidebars ("Presence open (Premium)", etc.) are mockup labels only.

**Overview (02 connected, 02b disconnected)**
- **What changed:**
  - The "Start here: your Growth recap" bar is now one Growth line. It goes to Growth → Growth plan.
  - "View all" and "See your action plan" now open Fix plan (today's Growth recap, moved into Presence).
  - The "More customers, whatever your score" cards moved to the Growth plan.
  - The PostStudio card is removed; PostStudio appears only in the sidebar, "Coming soon".
  - Your Google listing is now one compact row.
- **Growth line by plan:**
  - Grow: the same line, with "4 steps this week".
  - Free: "Growth · ? Locked · See what your Growth score would measure →", which opens the locked preview.
  - Hair Express shows Tier 2 Building + "Test account" (§6.6).
- **Connected state:** the listing row replaces today's card and its 3 item rows (Reviews, Messaging, Holiday hours), which live on Presence → Google listing. The counts match the Google listing page.
- **Disconnected state:**
  - Shown only when the Google connection is lost: the 401 → refresh flow has failed. Tokens are never deleted after one failure.
  - Reconnect opens the Connect Google flow and comes back to Overview.

**Growth plan (03)**
- **Plans:**
  - Grow sees the same 4 tasks as steps. Each has "How to do it", an "I did this" check, and under the steps: "Premium does this for you in one click →". No Approve button on Grow.
  - Free: task titles only, in a locked preview.
- Same list, same order as Google results → What to do this week.
- **Moved here from Overview:** "More customers, whatever your score".
  - The Price check and Competitors cards are dropped from this block; they're one click away in Presence.
  - "Weekly routine" is now part of This week's plan (no separate list).
- **Kept from today's Growth page: "More ways to bring people in"** (*decided Nov 22, built in step 6*).
  - Two visible cards: "This week's Google post" and "Answer your customers' common questions", as today.
  - Premium: "PostScore can do this for you". Grow: the steps + "Premium does this for you in one click →". Free: locked.
  - They stay even though the same two items are also in This week's plan (same drafts, same state).
  - The post card is also where past posts and extra mid-week posts live.
  - Google numbers live only on Google results. Offer tracking (offers started, uses logged) lives on Customer offers.

**Google results (04)**
- **This week's list:**
  - Same list and same order as Growth plan → This week's plan: one list shown in two places. Approving on one page marks the item done on the other.
  - The button names the tasks ("Approve 3 tasks"). The line under it counts what goes to Google: 10 replies + 1 post + 1 set of answers = 12 items.
  - The Website chip shows ✓ instead of "29/30": Growth pages don't show PostScore points.
- **"Since you did this":**
  - Decreases are gray; increases are green.
  - For Hair Express, the three offers shown are **test entries**. The mockup keeps the Oct 21 one only so the table design can be reviewed.
  - In the real build, test rows never appear here or count toward the tier (§6.2). Real Hair Express would see this card's empty state ("Nothing from your plan last month yet"), not the table.

**Google listing (05)**
- **On Grow, a row opens to steps instead of an editor.** Example, Customer details:
  1. Open your Business Profile → Edit profile → More.
  2. Turn on the Parking and Accessibility options that are true.

  Then: "Premium does this for you in one click →".
- On Free, the ✓ / ! / ✕ rows and "+N pts" still show (that's the audit); the steps are a locked preview.

**Free Growth preview (06)**
- Never a made-up Growth number, only "?". The tier is never computed for display on Free.
- Task titles are real (from this week's plan) and blurred below the title line.
- Every Growth sidebar item opens a locked preview like this one, with the "Locked" badge.

## 7. Mockups (`docs/mockups/day25a/`, screenshots in `~/Desktop/day25a-mockups/`)
| # | File | Shows |
|---|---|---|
| 01 | `sidebar.html` | The three sidebar states: Presence open, Growth open, Growth on Free |
| 02 | `overview.html` | Overview with the Growth line, score breakdown, At a glance, compact Google listing row (connected), Scan history; no PostStudio card |
| 02b | `overview-disconnected.html` | The same page, with the red "Disconnected: reconnect to keep your listing checked" row + Reconnect |
| 03 | `growth-plan.html` | Tier hero (Building + Test account), active weeks, To reach Growing / After that: Thriving, This week's plan ("Approve 3 tasks"), link line to Google results, More customers |
| 03b | `growth-plan-not-connected.html` | Connect banner, the same tier, "I did this" steps, R1 needs Google |
| 07 | `fix-plan.html` | Fix plan: This week 78 → 87 · every fix 100 · A, 4 ranked fixes tagged This week / Takes a few weeks with +pts, running score and Fix it, the not-scored-yet speed row |
| 08 | `reviews.html` | Presence → Reviews: rating/count, fix line, reply inbox ("Approve 10 replies", review text live from Google, never saved), paste-a-review drafter, review points with +pts |
| 04b | `google-results-not-connected.html` | Only the Connect card (what they'll see + Connect Google) and "Your weekly tasks are on Growth plan →" |
| 04 | `google-results.html` | Growth line, hero 21.6% ("took action…"), tiles, estimate, What to do this week (same order, "Approve 3 tasks"), Since you did this (gray decreases, note above), Searches → actions, search terms; "Fix your listing →" only in the top bar |
| 05 | `google-listing.html` | Listing rows with "+N pts", Show up for more, Protection & changes, "See what your listing brings in" |
| 06 | `free-growth-preview.html` | Free: "?" ring, what it would measure, blurred real tasks, Grow vs Premium |

Each in `*-desktop.png` (1280) and `*-phone.png` (390). EN only, as asked. The mockups contain no review notes; those are in §6b.

---

## 8. New wording (EN + ES, usted)
| Key idea | EN | ES |
|---|---|---|
| Tab | Presence | Presencia |
| Tab | Growth | Crecimiento |
| Growth line | Growth · Tier {n} {name} · {count} tasks this week → Open your Growth plan | Crecimiento · Nivel {n} {name} · {count} tareas esta semana → Abra su plan de crecimiento |
| Growth line (Free) | Growth · ? Locked · See what your Growth score would measure → | Crecimiento · ? Bloqueado · Vea lo que mediría su puntuación de crecimiento → |
| Tiers | Starting out · Building · Growing · Thriving · Local favorite | Comenzando · Construyendo · Creciendo · Prosperando · Favorito local |
| Results line | These numbers show results from Google. They don't change your PostScore score. | Estas cifras muestran resultados de Google. No cambian su puntuación de PostScore. |
| Link | See what your listing brings in → | Vea lo que le trae su ficha → |
| Link | Fix your listing → | Corrija su ficha → |
| On track | On track for {tier} on Monday, {date} | Va camino de {tier} el lunes {date} |
| Warning | Keep {tier}: one thing from this week's plan by Sunday keeps your tier. | Mantenga {tier}: una tarea del plan de esta semana antes del domingo mantiene su nivel. |
| Neutral | Closed this week | Cerrado esta semana |
| Pages | Growth plan · Google results · Get more reviews · Customer offers · Campaigns · Local events · Print kit & QR · Google listing · Fix plan | Plan de crecimiento · Resultados en Google · Consiga más reseñas · Ofertas para clientes · Campañas · Eventos locales · Kit de impresión y QR · Ficha de Google · Plan de correcciones |
| Premium line | Premium does this for you in one click → (existing key) | (existing) |
| Hero sentence (replaces "became customers"; app key `rate.sentenceShort` in 25B) | of people who found you on Google took action (called, got directions or visited your site) | de las personas que le encontraron en Google realizaron una acción (llamaron, pidieron indicaciones o visitaron su sitio) |
| Table row (replaces "Customers per 100 viewers") | Actions per 100 viewers | Acciones por cada 100 personas que le vieron |
| Section / jump | How searches became actions · Searches → actions | Cómo las búsquedas se convirtieron en acciones · Búsquedas → acciones |
| Approve button | Approve {n} tasks | Aprobar {n} tareas |
| Under it | {m} items go to Google | {m} elementos se enviarán a Google |
| Free badge | Locked | Bloqueado |
| Growth plan link | See what Google brought you last month → Google results | Vea lo que Google le trajo el mes pasado → Resultados en Google |
| Overview row | Disconnected: reconnect to keep your listing checked · Reconnect | Desconectado: vuelva a conectar para que sigamos revisando su ficha · Volver a conectar |
| Dev only | Test data: doesn't count | Datos de prueba: no cuentan |

**Also fix in the app in 25B** (today's strings that call actions "customers"): the hero sentence key, the "Customers per 100 viewers" row in "Who saw you", the jump label "Searches → customers" and the section title "How searches became customers", plus their ES versions. "Customer actions" stays (it's the approved term).

---

## 9. Decisions (all answered Nov 21, 2026)
1. **Google results numbers on Grow:** yes. Grow sees the real Google numbers; Premium keeps one-tap actions.
2. **Fix plan:** a Presence sidebar item, second, under Overview (§2b).
3. **Requirements vs points:** requirements on screen (§6.1). Points never appear on Growth pages.
4. **Thresholds:** keep 3/4 · 5/6 + 1 · 7/8 + 2 · 11/12 + 3. Revisit after the 25B dry run.
5. **"You told us" weight:** yes, 2 check-offs = 1 active week.
6. **Print kit & QR:** ship a simple hub in 25B: the review QR + links to the coupon and referral cards. Scan counts wait for short links in 37-Core (the page says so honestly). The full vector kit stays Day 34.
7. **Campaigns:** stays in the sidebar now, with "Coming soon".
8. **Reviews URL:** keep `/website-reviews`.
9. **Dev test login businesses:** a real tier computed including test actions, with a gray "Test account" tag, plus the dev-only preview-tier switch. Real owners never count test or practice rows. Claimed businesses start fresh. (§6.2)
10. **`is_test` on promos/referrals:** yes. 25B adds the column and gives you a SQL file to paste into Supabase (ending with `notify pgrst, 'reload schema';`). Backfilling `true` for internal-account offers waits for a dry run with counts.
11. **Tier reset before launch:** `scripts/reset-growth-tiers.ts`: dry run first, only when you ask (§6.2, and CLAUDE.md "Before launch").

## 10. Build order for 25B (after your OK)
1. Route helpers + redirects + the `/growth` grep test (no visible change).
2. Split the Google Profile tab into `/google-results` + `/google-listing`.
3. Move the Growth recap to `/fix-plan`; Overview links.
4. Sidebar with the two tabs (score; the tier shows "Starting out" for everyone until step 6).
5. Reviews / Get more reviews split; Campaigns / Customer offers split; Print kit hub; Local events placeholder.
6. Tier computation + dry run → your OK → Growth plan tier hero, the Overview line, the Free locked preview.
