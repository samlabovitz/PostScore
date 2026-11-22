# Day 25A: final report (Nov 21, 2026)

This was design only: no app code changed, and nothing is committed.
- Spec: `~/Desktop/day25a-spec.md`
- Mockups: `docs/mockups/day25a/`
- Screenshots: `~/Desktop/day25a-mockups/`

---

## 1. Hair Express's "counted actions": all test entries

Hair Express's owner in PostScore is **the dev test login account**, which owns 67 businesses. Angelica has no PostScore account. Checked read-only:

| Counted as | Table · row | Real or test? |
|---|---|---|
| Offer started Oct 21 | `promos` `9eafeb85…` · firstTime · ZSUH-J9GN · created 2026-10-21 23:19 UTC · 0 uses · ended | Test |
| Offer started Nov 13 | `promos` `f7bd3b56…` · custom "Bring a friend" · 8P2U-BZFA · created 2026-11-13 16:42 UTC · 0 uses · ended | Test |
| Offer started Nov 20 | `promos` `c16662a4…` · firstTime · FQ5A-KXLY · created 2026-11-20 21:56:49 UTC · 0 uses · ended | Test (41 s before a practice "Approve all" run) |
| Listing update Nov 3 | `gbp_changes` batch `c3ea7b44…` · 3 parking/accessibility attribute rows · `practice false` · sent 2026-11-04 04:36 UTC (Nov 3, 11:36 PM ET) · **undone** 05:00 UTC by batch `98214018…` (`undo_of`) | Test. It was a real write to the real listing, undone after 24 min; the net change is none |
| Fixes marked done Oct 27 | `tasks` × 4 (`visibility.review_count`, `.rating`, `.review_recency`, `.review_replies`) · marked 2026-10-28 01:53:33–36 UTC · `pending_verification` · reviews unchanged at 30 | Test (4 clicks in 3 s) |
| (also) fix marked done Nov 3 | `tasks` `completeness.customer_details` · marked 04:36:29 UTC, 2 s after the change above | Test |
| (never counted) | 24 `gbp_review_reply_log` rows (`status practice`); 6 `*_practice` `gbp_changes` rows (Nov 20) | Practice |

## 2. Hair Express's tier and why

- **As a real owner's business** (test and practice rows removed): 0 actions → **Tier 1 · Starting out**. It would not move to Growing on Nov 23.
- **As the dev test login (what the mockups show; decided Nov 21): Tier 2 · Building, with a gray "Test account" tag.**
  - Test rows count, practice rows count, and the undone Google change doesn't (an undone change is never an action for anyone).
  - Active weeks (Mon–Sun, ET):

    | Week | Counted | Active? |
    |---|---|---|
    | Oct 19 | offer started | ✓ |
    | Oct 26 | 4 check-offs | ✓ |
    | Nov 2 | 1 check-off | quiet (the change was undone) |
    | Nov 9 | practice replies + offer started | ✓ |
    | Nov 16 | offer started + practice Approve all | ✓ |

  - **Mon Nov 16 → Building** (3 of the last 4 weeks active).
  - **Mon Nov 23 → stays Building.** Growing needs 5 of the last 6; it has 4. One quiet week isn't two in a row, so there's no drop.
  - **Growing on Mon Nov 30** if the week of Nov 23 is active. The "real result" is already met: 152 customer actions from Google in October vs 102 last October (+49%).
  - Had the undone change counted, Nov 2 would be active, and Growing would come on Nov 23.

## 3. Final §9 answers (all decided Nov 21, 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Google results numbers on Grow | Yes |
| 2 | Fix plan | A Presence sidebar item, second, under Overview |
| 3 | Requirements on screen (not points) | Yes |
| 4 | Thresholds 3/4 · 5/6+1 · 7/8+2 · 11/12+3 | Keep; revisit after the 25B dry run |
| 5 | 2 check-offs = 1 active week | Yes |
| 6 | Print kit & QR | A simple hub in 25B: review QR + scan counts + links to coupon/referral cards |
| 7 | Campaigns | Stays in the sidebar now, "Coming soon" |
| 8 | Reviews URL | Keep `/website-reviews` |
| 9 | Dev test login businesses | A real tier including test actions + a "Test account" tag + the dev-only preview switch. Real owners never count test/practice rows. Claimed businesses start fresh |
| 10 | `is_test` on promos/referrals | Yes, in 25B, with a SQL file to paste |
| 11 | Tier reset before launch | `scripts/reset-growth-tiers.ts`, dry run first, only when Sam asks |

## 4. Tier reset plan

- **What:** wipe every business's Growth tier and the activity history used for tiers, for **all** accounts, the dev login included. Every tier then starts fresh from real owner actions after the reset date. Pre-reset test/dev activity never counts for anyone. The reset date is saved, and tier queries ignore anything older.
- **How:** `scripts/reset-growth-tiers.ts` (built in 25B).
  - Dry run first: a Desktop file listing, per business, the tier rows and weekly-activity rows that would be cleared.
  - It runs only when you ask, never automatically.
- **Doesn't touch:** PostScore scores, scans, `scan_changes`, the Google listing, or the source rows (offers, tasks, `gbp_changes`, reply logs).
- **Where it's written:** spec §6.2, and CLAUDE.md under the new "Before launch" heading.

## 5. "Google not connected" state

Shown only when the listing isn't connected. Hair Express is connected, so mockups 03 and 04 are unchanged; this state has extra screenshots, 03b and 04b.

- **Growth plan (03b):**
  - banner: "Connect your Google listing to see your results and let PostScore post for you" + Connect;
  - one-tap tasks become "I did this" steps, with "Connect Google to make this one tap", and drafts stay ready to copy;
  - offers, QR, the review link, Campaigns and Local events work as normal.
- **Google results (04b):** only the Connect card (what they'll see + Connect Google), then one line: "Your weekly tasks are on Growth plan →". No fake, sample or old numbers, no repeated task list, no listing box.
- **Rule:** Growth pages never show Presence content (listing status, OK / fix counts, +pts). Connected Google results (04) keeps only the small "Fix your listing →" in its top bar.
- **Tier without Google:**
  - active weeks come from offers, QR scans, review-link opens, photos and fixes seen on scans, and check-offs;
  - results come from new reviews, QR scans and offers used;
  - "Customer actions from Google up on last year" (R1) needs the connection, and so does Local favorite.
- **Connection lost later** (e.g. the Testing-mode 7-day expiry):
  - "Reconnect" replaces "Connect";
  - the tier is kept, and those weeks are neutral for anything that needs Google, so a lost connection never counts against the owner;
  - Overview's listing row turns red (02b).

## 6. Fix plan (Presence)

Mockup 07. "This week's fixes" is renamed **Fix plan** and sits second in the Presence sidebar, right under Overview. Overview's "See your action plan" and "View all" open it.
- **Top card: one score, two targets.**
  - Big: "**This week: 78 → 87**" (the fixes the owner can finish alone today: hours match, replies, customer details).
  - Smaller: "When every fix is done: **100 · A**" (the same as Overview, which keeps only this one).
- Each row is tagged **This week** or **Takes a few weeks**, from a `thisWeek` field on every fix type. The full list is in spec §2b.
- When all "This week" fixes are done, the card says "This week's fixes done ✓ · Next: fresh reviews (+13)".
- **Every score fix, ranked from most urgent to least**, with "+pts", the running score and **Fix it →** (the existing `fixDestination` links):

  | # | Fix | Priority | Points | Running score | Goes to |
  |---|---|---|---|---|---|
  | 1 | Match your website's hours to Google | Urgent | +0.6 | 79 | Website |
  | 2 | Get fresh reviews | High | +13 | 92 | Get more reviews |
  | 3 | Reply to recent reviews | High | +6 | 98 | Get more reviews, reply inbox |
  | 4 | Add customer details | Medium | +2 | 100 | Google listing, Customer details |

  Then "Website speed: not scored yet". These come from the Nov 20 scan, and the running score rounds 99.6 to 100.
- **Each Presence page gets one line about its own fixes.** Google listing (in 05): "Fix this 1 and your Google listing goes 28 → 30 pts (score 78 → 80)". The Reviews and Website wording is in spec §2b.
- **Plans:** Free sees the full ranked list with points, steps locked. Grow sees steps + "I did this" + "Premium does this for you in one click". Premium's "Fix it" lands on the one-click action.

## 7. Growth plan "jump" and Growth order

- **This week's plan is ranked by impact on the tier.** Each task says what it does for the tier, the first one is tagged "Do this one first", and a top line reads "**Do 1 task → on track for Growing on Mon, Nov 30**". Tier terms only, no points.
- **Why Nov 30, not Dec 7:**
  - This week (Nov 16–22) already counts.
  - The Monday post, approved now, goes out Mon Nov 23, so next week counts: 5 of the last 6 weeks + the October result → Growing on Mon Nov 30.
  - Approved items count for the week they go out.
- The same order is used on Google results (one list): post → replies → answers → photos.
- **Growth order everywhere** (sidebar, phone tab row, Free sidebar, "More customers" cards): Growth plan · Google results · Get more reviews · Customer offers · Campaigns · Print kit & QR · Local events (last).

## 8. Every file changed in this round

**Final cleanup (Nov 21)**
- **Spec:** the status line is "Approved Nov 21, 2026"; one task order everywhere (post → replies → answers → photos); Hair Express is "2 · Building + Test account" everywhere (§6.6 keeps the real-owner "Starting out" note); the duplicate counting-break note is deleted; §9 is renumbered with the decisions; §2b has the Fix plan targets and the `thisWeek` table.
- **Mockups:** `fix-plan.html` (two targets, row tags) and `free-growth-preview.html` (task order). Re-taken: `07-fix-plan` and `06-free-growth-preview`.
- **Copied into the repo:** `docs/plans/day25a-spec.md` and `docs/plans/day25a-final-report.md`. The Desktop copies stay.
- **Pre-commit checks:** 264 test files / 4,176 tests passed; `tsc`, `next lint` and `next build` (in a scratch copy) were all clean.

**Spec and project files**
- `~/Desktop/day25a-spec.md`, updated:
  - revisions 14–20 in the list at the top;
  - §1: the sidebar with Fix plan and the Growth order;
  - §2b: Fix plan;
  - §2c: the Growth plan tier jump;
  - "This week's fixes" renamed to Fix plan throughout, route `/fix-plan`;
  - §6.2: the dev-login exception, the preview switch, the tier reset;
  - new §6a: the not-connected state;
  - §6.6: Hair Express as the test account;
  - §7: mockups 03b and 04b;
  - §9: the answers.
- `~/Desktop/day25a-final-report.md`: new (this file).
- `CLAUDE.md`: new "Before launch" section (the tier reset, and the rule that test rows never count for real owners).

**Mockups (`docs/mockups/day25a/`)**
- Changed: `sidebar.html`, `overview.html`, `overview-disconnected.html`, `growth-plan.html`, `google-results.html`, `google-listing.html` (Tier 2 Building + "Test account").
- New: `growth-plan-not-connected.html`, `google-results-not-connected.html`, `fix-plan.html`.
- `free-growth-preview.html`: the Growth order in the Free sidebar (no tier tag; Free shows "?").

**Screenshots (`~/Desktop/day25a-mockups/`, each at 1280 + 390)**
- All 18 files (pages 01–07, plus 02b, 03b and 04b) are up to date. Re-taken this round:
  - `01-sidebar` (Test account tag, Fix plan, Growth order);
  - `02-overview`, `02b-overview-disconnected` (tag, Fix plan in the sidebar);
  - `03-growth-plan` (tag, tier jump, order);
  - `04-google-results` (tag, task order);
  - `05-google-listing` (tag, Fix plan line);
  - `06-free-growth-preview` (Growth order in the Free sidebar).
- New: `03b-growth-plan-not-connected`, `04b-google-results-not-connected`, `07-fix-plan`.
