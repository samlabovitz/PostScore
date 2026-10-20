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
  - 1 owner re-scan per 30 days (+ the first scan) on top of the 24-hour rule — `rescanGate` in `lib/rescanPolicy.ts`, checked in `rescanBusiness` before any Google call; owner re-scans are logged in `places_calls` (kind `owner_rescan`, one Places Details call) and the note says "Next free re-scan: {date}";
  - the Grow showcase strip stays at the bottom.
  Grow, Premium and Multi see the Overview unchanged.
- **`LockedPreview`** (`components/plan/LockedPreview.tsx`) is the shared locked feature for 5f: the real UI with the business's own data, read-only (`inert`), fading under a small lock, one unlock line (shown only when its data is real) and "Unlock with Grow/Premium", which opens the promo box. It never fetches anything itself.

### Growth — built
Two tabs (`?tab=google-profile`):
- **This week's plan:** weekly plan, weekly routine, bigger projects, celebrations, ways to bring in customers. "Run an offer" ideas link to the right **Campaigns** tab; website tasks link to the Website page.
- **Google Profile** (Premium), `components/gbp/GoogleProfilePanel.tsx`:
  - what Google shows today (the real listing fields from the last scan);
  - connect status;
  - search demand;
  - listing editing and the insights funnel ("coming soon").

  Free and Grow see a lock on the tab; opening it shows their real listing as a preview with "Unlock with Premium" and the Premium features listed as locked. Connecting itself is on the Connect Google page (`/connect-gbp`) until Settings → Connections exists.

### Campaigns — built
Three tabs (`?tab=coupons` / `?tab=referrals`), in `app/business/[id]/campaigns/`:
- **All campaigns** (default): the running coupons and referral card (code, times used, +1); "Create a coupon" and "Create a referral card"; "Coming soon" cards for email, text and social campaigns.
- **Coupons:** the full coupon designer (`CouponsSection` → `CouponBuilder` + `CardDesigner`).
- **Referrals:** the full referral card designer (`ReferralSection` → `ReferralBuilder`, `PassOnChoice`).

Nothing is lost in the move: templates, pass-on options, double-sided, numbering, saved designs, sheet preview, How it works, Ask PostAI, tallies, and print gating (Free preview / Grow basic / Premium full via `signAccess`).

### Reviews — built
- Review link, QR code, review sign designer (Sign Studio), review stats.
- Later: reply to reviews (Premium, needs Google connect) — preview + "Coming soon".


### Website — built (+ new chooser)
- Site checks (visual analysis, score breakdown, security), per-builder fix guides, Re-check my website (3/day).
- The **3 options** side by side: Fix your current site · Starter website · Build in PostStudio.
- **No website, or only a Facebook/social page: never an empty page.** It leads with:
  1. an honest header ("You don't have a website yet — it's one of the biggest gaps in your PostScore", with the real points it costs them);
  2. the Starter website generator with a live real-data preview (Grow/Premium: full use + download; Free: preview + "Unlock with Grow");
  3. directly under it, the PostStudio card comparing starter vs PostStudio, with "Build it in PostStudio →" and the add-on price for their plan.

  With the add-on (or Multi), the card becomes "Continue in PostStudio →".
- FAQ draft (today) stays under the options.

### PostStudio — full-screen page (add-on; not open yet)
`/business/[id]/studio`, with no sidebar. A slim top bar shows PostStudio, the business name and "← Leave PostStudio" (it asks to confirm only if there are unsaved changes; there's no editor yet, so today it never asks).
- **With PostStudio** (Multi until the add-on can be bought): "Your site checklist", the four page outlines, and "Building tools coming soon".
- **Without it,** an honest info page:
  - what PostStudio builds;
  - "Your site checklist" from real data (✓ ready from the listing / ○ you'll add this; `lib/postStudio.ts`);
  - the four page outlines (wireframes, labelled "not your real site yet");
  - starter vs PostStudio comparison;
  - the price for their plan, and "PostStudio isn't open yet — there's nothing to buy today";
  - "Want something now? Use the free starter website →".
- Later: website builder + hosting (auto-refreshing rating/reviews/hours after every scan), Menu & catalog, Logo Studio.

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

**Grow · $25/mo · "Fix it yourself, step by step"** — We show you exactly how to fix every problem.
- Step-by-step fix guides for every issue
- A weekly action plan that tells you what to do next
- Re-check your website as soon as you fix something
- A starter website, plus basic review signs, coupons and referral cards
- PostAI for your questions (monthly limit: 100 questions)

**Premium · $50/mo · "We do the work for you"** (highlighted, "Best value") — Connect Google and PostScore fixes things for you.
- One-click fixes to your Google listing: hours, info, photos (coming soon)
- AI-drafted replies to every review, ready to post (coming soon)
- See who searches for you and who calls or clicks (coming soon)
- Your campaign hub: track every coupon and referral in one place, plus email, text and social campaigns (coming soon)
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
| Campaign hub (all campaigns + email, text, social) | preview | — | ✓ (email, text, social coming soon) | ✓ |
| Website | preview | starter site | starter + PostStudio discount | starter + PostStudio included |
| PostAI | — | 100 questions/month | unlimited | unlimited |
| Fixes done for you (Google connect) | — | — | ✓ coming soon | ✓ coming soon |
| Reports | monthly email | weekly recap | weekly + PDF | weekly + PDF |
| PostStudio add-on (coming soon) | with Grow | +$15/mo | +$8/mo | included |
| Locations | 1 | 1 | 1 | up to 5, +$25/mo each extra |

Desktop: the four plan cards and this table, Premium highlighted. Phone: one
card per plan, the owner's current plan first, each with its own rows.

### For step 5f to enforce (not gated yet)
- **Campaigns:** the "All campaigns" tab (the campaign hub) is **Premium**.
  Grow gets the Coupons and Referrals tabs (basic designs), each campaign's
  +1 tally on its own tab. Free sees previews of all three tabs.
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
  recap on screen; Free gets the monthly email.
- The Free "unlock" lines (`dashboard.upgrade.unlock.*`, built by
  `unlockLine()` in `lib/upgradePromos.ts` from real data only — a line
  whose data is missing is never shown) are ready for the locked previews.

### Upgrade promotion (Free and Grow only)
All in `components/upgrade/` + `lib/upgradePromos.ts`; the data comes from
`loadUpgradeContext()` (`lib/upgradePromos.server.ts`) through
`DashboardShell`'s `upgrade` prop.
- **Promo box** (`UpgradeTrigger` → `PromoBox`): opens only when the owner
  clicks something locked — a popover beside it on desktop, a bottom sheet
  on a phone. Title "{feature} · {plan}", 2–3 benefit lines (their real data
  where we have it), "Coming soon" on anything not built, "See plans" (→
  Settings → Compare plans) and "Not now". Closes with ×, Esc or a tap
  outside; never modal, never opens by itself. Today it's on: the designers'
  "Premium preview" bar and locked tabs, Free's read-only designer note, the
  locked review sign (Free), the Google Profile tab's Premium card, and
  Campaigns' "What's next". A 5f `LockedPreview` should render
  `<UpgradeTrigger feature=…>` for its unlock button.
- **Showcase strip** (`ShowcaseStrip`), above the footer of Overview, Growth,
  Campaigns, Reviews, Website, Competitors, Price check and Reports: "Premium:
  we do the work for you" + 3 rotating chips for that page ("soon" where not
  built) + "See what's included" (the promo box with every Premium benefit).
  Free sees Grow's benefits on Overview and Growth instead. × hides it for 14
  days for that business (`promo_dismissals`, `supabase/promo-dismissals.sql`;
  this device's localStorage until the SQL is run).
- **Premium** sees no promos except one PostStudio line on the Website page;
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
