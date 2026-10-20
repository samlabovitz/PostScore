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
- Today also hosts: the action plan preview (`ActionPlanSection`), the compact website Re-check, and PostAI (`AssistantLauncher`). Plan gating for these is in the Plans section below.

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

| | Free | Grow | Premium | Multi |
|---|---|---|---|---|
| Price | $0 | $25/mo | $50/mo | $150/mo |
| PostScore, category breakdown, every check (what's wrong + why it matters) | ✓ | ✓ | ✓ | ✓ |
| Scans | first scan + 1 full re-scan/month | ✓ | ✓ | ✓ |
| Rank among nearby competitors | ✓ | ✓ | ✓ | ✓ |
| Action plan + weekly routine | preview | ✓ | ✓ | ✓ |
| Fix guides (per builder) | which checks fail + the first step of every failing check's guide | ✓ | ✓ | ✓ |
| Re-check my website | preview | ✓ | ✓ | ✓ |
| Starter website (download anytime) | live preview with real data | ✓ | ✓ | ✓ |
| Review link + QR code | ✓ (free for everyone, as today) | ✓ | ✓ | ✓ |
| Review stats | preview | ✓ | ✓ | ✓ |
| Print designs: review sign, coupons, referral cards | preview | basic | full (all templates, fonts, colors, no PostScore branding) | full |
| Campaigns | preview | basic | full | full |
| Weekly reports (recap, PDFs, past reports) | preview | ✓ | ✓ | ✓ |
| Monthly email report | ✓ (respects `MONTHLY_REPORTS_LIVE`) | ✓ | ✓ | ✓ |
| PostAI | preview | ✓ | ✓ | ✓ |
| Price check | preview | ✓ | ✓ | ✓ |
| Google Profile connect features | preview | preview | ✓ | ✓ |
| PostStudio (website builder + hosting) | real-data preview | +$15/mo add-on | +$8/mo add-on ("PostStudio at a discount") | included |
| Locations | 1 | 1 | 1 | up to 5, +$25/mo per extra |

**Free = a digital audit only.** Everything outside the audit shows a
real-data preview with a short "Here's how PostScore fixes this — unlock with
Grow" message showing what they'd get. Previews never use fake data.

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
- Settings → Plan feature list — `dashboard.settings.plan.feature.*` (today says Free includes the action plan and coupons/referrals; update when Free becomes audit-only).
- Everything else is currently open to every plan — see the Day 5 plan's gating section for the full list and the planned changes.
