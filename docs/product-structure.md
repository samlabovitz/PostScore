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
| 1 | Overview | `/business/[id]` | built |
| 2 | Growth | `/business/[id]/growth` | built |
| 3 | Campaigns | `/business/[id]/campaigns` | **new** (coupon + referral designers move here) |
| 4 | Reviews | `/business/[id]/website-reviews` | built |
| 5 | Website | `/business/[id]/website` | built |
| 6 | Competitors | `/business/[id]/competitors` | built |
| 7 | Price check | `/business/[id]/pricing` | built — **renamed** from "Pricing" (label only; `dashboard.nav.pricing`) so it isn't confused with plan pricing |
| 8 | Google Profile | `/business/[id]/google-profile` | **new** (absorbs today's `/search-demand`; connect status) |
| 9 | PostStudio | `/business/[id]/studio` | **new** (add-on) |
| 10 | Reports | `/business/[id]/reports` | built |
| — | Settings (account menu) | `/business/[id]/settings` | built; gains a **Connections** section |

Rules for new tabs: always visible on every plan. Until built, the page shows
the business's own real data in a preview of what the feature does, plus
"Coming soon" (not built) or "Unlock with Grow / Premium / the PostStudio
add-on" (built but gated). Nothing in a preview is invented — if real data
isn't available, the preview says so instead of filling in examples.

---

## What lives on each page

### Overview — built
- The PostScore, grade and category breakdown (every check, what's wrong and why it matters).
- Top recommendations (the website one links to the Website page's 3-option chooser).
- Storefront photo.
- "Since your last visit" pop-up (`components/visits/SinceLastVisit.tsx`).
- Today also hosts: the action plan preview (`ActionPlanSection`), the compact website Re-check, and PostAI (`AssistantLauncher`). Plan gating for these is in the Plans section below.

### Growth — built
- Weekly plan, weekly routine, bigger projects, celebrations.
- When an action is "run an offer", it links to **Campaigns** (instead of embedding the designers).
- Website tasks link to the Website page's 3-option chooser.

### Campaigns — new (move)
- Coupon designer and referral card designer move here from Growth
  (`app/business/[id]/growth/CouponBuilder.tsx`, `ReferralBuilder.tsx`,
  `CardDesigner.tsx`, `CouponsSection.tsx`, `ReferralSection.tsx`,
  `ActivePromotions.tsx`, `ActiveReferral.tsx`, `PassOnChoice.tsx`,
  `ShareModal.tsx`, `HowItWorks.tsx`).
- Active promotions / referral with their +1 tally.
- Later: email, text and social campaigns (preview + "Coming soon").

### Reviews — built
- Review link, QR code, review sign designer (Sign Studio), review stats.
- Later: reply to reviews (Premium, needs Google connect) — preview + "Coming soon".

### Google Profile — new (Premium)
- Connect status (connected / not connected / "Connect in Settings → Connections").
- Live listing editing (Premium, needs connect).
- Search demand: what people search vs how many find/click you (today's `/business/[id]/search-demand` moves here).
- Insights funnel: views → calls / website clicks / directions.
- Connecting itself lives in **Settings → Connections**, not here.

### Website — built (+ new chooser)
- Site checks (visual analysis, score breakdown, security), per-builder fix guides, Re-check my website (3/day).
- The **3 options** side by side: Fix your current site · Starter website · Build in PostStudio.
- **No website, or only a Facebook/social page: never an empty page.** It leads with:
  1. an honest header ("You don't have a website yet — it's one of the biggest gaps in your PostScore", with the real points it costs them);
  2. the Starter website generator with a live real-data preview (Grow/Premium: full use + download; Free: preview + "Unlock with Grow");
  3. directly under it, the PostStudio card comparing starter vs PostStudio, with "Build it in PostStudio →" and the add-on price for their plan.

  With the add-on (or Multi), the card becomes "Continue in PostStudio →".
- FAQ draft (today) stays under the options.

### PostStudio — new (add-on)
- Website builder + hosting (multi-page, hosted by PostScore, auto-refreshing rating/reviews/hours after every scan).
- Later: Menu & catalog, Logo Studio (preview + "Coming soon").

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
