import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { LocaleProvider, type Locale } from "@/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }) }));

// Day 25B polish: Fix plan's open row (What we found · What to do · footer), the hours rule
// ("Changed since your last scan" when the hours shown on both sides are the same) on Fix plan,
// the Overview and the score breakdown, and the breakdown's folded passed checks (EN + ES).

import { TaskCard } from "@/app/business/[id]/ActionPlanSection";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { CategoryCard, HoursStateContext, hoursChangedSinceScan, hoursRowState } from "@/components/scoring/CategoryCard";
import { readFileSync } from "node:fs";
import { fixRowSteps, moreHelpLinks, oneClickSentence } from "@/lib/fixRow";
import { shownHoursState } from "@/lib/hoursCheck";

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const SAME_EN = "Your website's Hours say Thursday 9:30 AM–6:00 PM; Google says Thursday 9:30 AM–6:00 PM.";
const DIFF_EN = "Your website's Hours say Thursday 9:30 AM–6:00 PM; Google says Thursday 9:30 AM–7:00 PM.";
const SAME_ES = "Los Horario de su sitio web dicen jueves 9:30–18:00; Google dice jueves 9:30–18:00.";

const replies = {
  checkId: "visibility.review_replies", label: "Replying to reviews", title: "Reply to your recent reviews", status: "open", effort: "quick_win",
  why: "Customers read how you answer.", action: "Reply to your recent reviews", problem: "You replied to 0 of your last 20 reviews (full credit at 80%).",
  fix: "Open your reviews on Google, then post a short, personal thank-you to each recent review. Full points at 80% of your recent reviews.",
  ownerActionOnGoogle: true, weightedPoints: 6, weightedPointsHigh: null, pointsAvailable: 6, minutes: 15,
  links: [
    { href: "/business/b1/website-reviews#reply-to-reviews", label: "Reply to reviews in PostScore" },
    { href: "https://business.google.com/reviews?hl=en", label: "Your reviews on Google", external: true },
    { href: "https://support.google.com/business/answer/3474050", label: "Google's help: manage reviews", external: true },
  ],
} as never;
const phone = { ...(replies as object), checkId: "completeness.phone", title: "Add your phone number", label: "Phone number", problem: "No phone number on your listing.", fix: "In Google Business Profile: Edit profile → Contact information → Phone number.", links: [{ href: "https://business.google.com/", label: "Open Google Business Profile", external: true }, { href: "https://support.google.com/business/answer/3039617", label: "Google's help: edit your Business Profile", external: true }] } as never;
const hoursTask = { ...(replies as object), checkId: "website.info_consistency", title: "Match your website to Google", label: "Matches your Google listing", mismatchFields: ["hours"], problem: SAME_EN, action: "Your website and Google listing show different hours — check which is correct and update the other.", fix: "Decide which one is right, then update the other one.", ownerActionOnGoogle: false, weightedPoints: 0.5, links: [] } as never;

const row = (task: unknown, gbp: Record<string, unknown>, locale: Locale = "en") =>
  wrap(
    <GbpEditProvider value={{ undo: null, ...gbp } as never}>
      <ul>
        <TaskCard task={task as never} businessId="b1" context="weekly" premium={gbp.premium === true} lastScanAt="2026-11-23T17:14:00Z" fixPlan={{ priority: "high", running: 84, locked: false, compact: { open: true, outline: false } }} />
      </ul>
    </GbpEditProvider>,
    locale
  );
const PREMIUM = { enabled: true, premium: true, connected: true, canEdit: true };
const GROW = { enabled: true, premium: false, connected: true, canEdit: true };

describe("Fix plan's open row: What we found · What to do · footer", () => {
  test("Premium + connected + writable: one sentence + ONE button; the steps behind 'Do it yourself instead'", () => {
    const html = row(replies, PREMIUM);
    expect(html).toContain('data-testid="fix-found"');
    expect(text(html)).toContain("What we found You replied to 0 of your last 20 reviews (full credit at 80%). Checked Nov 23");
    expect(html).toContain('data-mode="one_click"');
    expect(text(html)).toContain("PostScore drafts each reply; you read it, change anything and approve, and it goes to Google. (Beta)");
    // One primary button per row, ever: the row's own moves into "What to do" while it's open.
    expect(html.match(/data-testid="fix-button"/g)).toHaveLength(1);
    expect(text(html)).toContain("Do it yourself instead");
    expect(html).not.toContain('data-testid="fix-steps"');
    // Gone: "Do this:" (repeats the title) and the separate "How to fix it" box.
    expect(text(html)).not.toMatch(/Do this:|How to fix it How:/);
    // Footer: "I did this · More help ↗"; the PostScore link to where the button goes isn't repeated.
    expect(text(html)).toMatch(/I did this · More help ↗/);
    expect(html).not.toContain("Reply to reviews in PostScore");
    expect(html).toContain("Google&#x27;s help: manage reviews");
  });

  test("Grow: up to 3 numbered steps + one button + 'Premium does this for you in one click →' (EN + ES)", () => {
    const html = row(replies, GROW);
    expect(html).toContain('data-mode="steps"');
    expect(html.match(/<li class="flex gap-2/g)).toHaveLength(3);
    expect(text(html)).toContain("1 Open your reviews. 2 Write a short, personal thank-you to each recent review with no reply. 3 Reply to at least 8 of every 10 recent reviews for full points.");
    expect(html.match(/data-testid="fix-button"/g)).toHaveLength(1);
    expect(text(html)).toContain("Premium does this for you in one click");
    const es = text(row(replies, GROW, "es"));
    expect(es).toContain("Lo que encontramos");
    expect(es).toContain("Qué hacer");
    expect(es).toContain("Abra sus reseñas.");
    expect(es).toContain("Más ayuda");
  });

  test("a listing fix on Grow: the one button goes to Google, and 'More help' doesn't repeat it", () => {
    const html = row(phone, GROW);
    expect(html).toMatch(/data-testid="fix-button" data-kind="google"/);
    expect(html.match(/data-testid="fix-button"/g)).toHaveLength(1);
    expect(text(html)).toContain("Open Google Business Profile ↗");
    const help = html.slice(html.indexOf('data-testid="fix-more-help"'));
    expect(help).not.toContain(">Open Google Business Profile ↗<");
    expect(help).toContain("Google&#x27;s help: edit your Business Profile");
  });

  test("Premium, not connected: the steps + 'Connect Google and PostScore can do this for you.'", () => {
    const html = row(phone, { enabled: true, premium: true, connected: false, canEdit: false });
    expect(html).toContain('data-who="connect"');
    expect(text(html)).toContain("Connect Google and PostScore can do this for you.");
  });
});

describe("hours: only a live read of Google Maps decides; the Business Profile ahead of Maps is 'Waiting for Google'", () => {
  const WAITING = { kind: "differs" as const, days: [], profileAhead: true };
  const STALE = { kind: "stale" as const };
  const DIFFERS = { kind: "differs" as const, days: [{ day: 4, website: { mode: "open", ranges: [{ open: 570, close: 1080 }] }, google: { mode: "open", ranges: [{ open: 600, close: 1020 }] } }], profileAhead: false } as never;
  test("never 'Changed since your last scan' from the page's own words (their Google side can be the Business Profile)", () => {
    expect(shownHoursState({ checkId: "website.info_consistency", mismatchFields: ["hours"], problem: SAME_EN }, null)).toBeNull();
    expect(shownHoursState({ checkId: "website.info_consistency", mismatchFields: ["hours"], problem: SAME_EN }, STALE)).toBe(STALE);
    expect(shownHoursState({ checkId: "completeness.phone", mismatchFields: ["hours"] }, STALE)).toBeNull();
    void DIFF_EN;
    void SAME_ES;
  });
  test("the live check: Maps unreadable and the Business Profile matches the website → waiting, never stale", () => {
    const src = readFileSync("lib/hoursCheck.server.ts", "utf8");
    expect(src).toContain('if (profile?.kind === "stale") return withWaitingSince(businessId, { kind: "differs", days: [], profileAhead: true });');
  });
  test("Fix plan: waiting → 'Waiting for Google', the sentence, no fix button (EN + ES)", () => {
    for (const [locale, line] of [["en", "Your Business Profile already matches your website; Google Maps hasn't published it yet."], ["es", "Su Perfil de Empresa ya coincide con su sitio web; Google Maps aún no lo ha publicado."]] as const) {
      const html = wrap(
        <GbpEditProvider value={{ undo: null, ...PREMIUM } as never}>
          <ul>
            <TaskCard task={hoursTask} businessId="b1" context="weekly" premium lastScanAt="2026-11-25T18:29:00Z" hoursCheck={WAITING} fixPlan={{ priority: "low", running: 85, locked: false, compact: { open: false, outline: false } }} />
          </ul>
        </GbpEditProvider>,
        locale
      );
      expect(text(html)).toContain(line);
      expect(html).toContain('data-testid="fix-waiting-google"');
      expect(html).not.toContain('data-testid="fix-button"');
      expect(text(html)).not.toMatch(/Changed since your last scan|Cambió desde su último análisis/);
    }
  });
  test("Fix plan: stale (a live Maps read matches) keeps the re-scan wording (EN + ES)", () => {
    for (const [locale, words] of [["en", "Changed since your last scan · Re-scan to update"], ["es", "Cambió desde su último análisis · Vuelva a analizar para actualizar"]] as const) {
      const html = wrap(
        <GbpEditProvider value={{ undo: null, ...PREMIUM } as never}>
          <ul>
            <TaskCard task={hoursTask} businessId="b1" context="weekly" premium lastScanAt="2026-11-23T17:14:00Z" hoursCheck={STALE} fixPlan={{ priority: "high", running: 84, locked: false, compact: { open: true, outline: false } }} />
          </ul>
        </GbpEditProvider>,
        locale
      );
      expect(text(html)).toContain(words);
      expect(html).toContain('data-mode="rescan"');
    }
  });
  test("the breakdown's 'Matches your Google listing' row: waiting (no button), differing days side by side (the button), stale", () => {
    const check = { id: "website.info_consistency", label: "Matches your Google listing", earnedPoints: 0.5, maxPoints: 1, confidence: "VERIFIED", explanation: SAME_EN };
    const category = { id: "website", label: "Website", earnedPoints: 0.5, possiblePoints: 1, relativeScore: 50, weight: 30, checks: [check] };
    const card = (state: unknown, locale: Locale = "en") => wrap(<HoursStateContext.Provider value={state as never}><CategoryCard category={category as never} embedded businessId="b1" /></HoursStateContext.Provider>, locale);
    expect(hoursRowState(check, WAITING)).toBe("waiting");
    expect(hoursChangedSinceScan(check, null)).toBe(false);
    const waiting = card(WAITING);
    expect(waiting).toContain('data-testid="hours-waiting"');
    expect(waiting).not.toContain('data-testid="fix-button"');
    expect(text(waiting)).not.toContain("Thursday 9:30 AM–6:00 PM");
    expect(text(card(WAITING, "es"))).toContain("Esperando a Google");
    const differs = card(DIFFERS);
    expect(differs).toContain('data-testid="hours-diff-4"');
    expect(text(card(STALE))).toContain("Changed since your last scan · Re-scan to update");
    // No live state: the scan's own words, never "changed since".
    expect(text(card(null))).not.toContain("Changed since your last scan");
  });
});

describe("score breakdown cards: only what needs work; passed checks fold into one line", () => {
  const c = (id: string, earned: number | null, max: number) => ({ id, label: id, earnedPoints: earned, maxPoints: max, confidence: "VERIFIED", explanation: `${id} explained` });
  const category = { id: "completeness", label: "Profile", earnedPoints: 5, possiblePoints: 8, relativeScore: 60, weight: 30, checks: [c("completeness.phone", 1, 1), c("completeness.hours", 0, 2), c("completeness.address", 2, 2), c("completeness.photos", 0, 3)] };

  test("needs work open with their button; '✓ 2 checks passed · Show all' (EN + ES)", () => {
    const html = wrap(<CategoryCard category={category as never} embedded businessId="b1" />);
    expect(html).toContain('id="check-hours"');
    expect(html).toContain('id="check-photos"');
    expect(html).not.toContain('id="check-phone"');
    expect(html).not.toContain('id="check-address"');
    expect(text(html)).toContain("2 checks passed · Show all");
    expect(html).toMatch(/data-testid="passed-toggle"[^>]*>/);
    expect(text(wrap(<CategoryCard category={category as never} embedded businessId="b1" />, "es"))).toContain("2 comprobaciones aprobadas · Mostrar todas");
    // Opened: every row, and "Show less".
    const open = wrap(<CategoryCard category={category as never} embedded businessId="b1" openPassed />);
    expect(open).toContain('id="check-phone"');
    expect(text(open)).toContain("Show less");
  });

  test("nothing needs work: 'Everything here passes ✓ · Show all checks' (EN + ES)", () => {
    const all = { ...category, checks: [c("completeness.phone", 1, 1), c("completeness.address", 2, 2)] };
    expect(text(wrap(<CategoryCard category={all as never} embedded businessId="b1" />))).toContain("Everything here passes · Show all checks");
    expect(text(wrap(<CategoryCard category={all as never} embedded businessId="b1" />, "es"))).toContain("Todo aquí está aprobado · Mostrar todas las comprobaciones");
    expect(text(wrap(<CategoryCard category={{ ...all, checks: [c("completeness.phone", 1, 1)] } as never} embedded businessId="b1" />))).not.toContain("checks passed");
  });
});

describe("lib/fixRow", () => {
  test("steps: own lines (at most 3), customer details' path, else the first sentences of the How", () => {
    expect(fixRowSteps({ checkId: "completeness.hours", fix: "" }, "en")).toHaveLength(3);
    expect(fixRowSteps({ checkId: "completeness.customer_details", fix: "On Google: Google Business Profile → Edit profile → Accessibility, Payments. Add only what's true." }, "en")[1]).toBe("Go to Accessibility, Payments.");
    expect(fixRowSteps({ checkId: "website.links", fix: "One. Two. Three. Four." }, "en")).toEqual(["One.", "Two.", "Three."]);
  });
  test("one-click sentence and More help", () => {
    expect(oneClickSentence({ checkId: "website.info_consistency", mismatchFields: ["hours"] }, "es")).toContain("ambos horarios");
    expect(moreHelpLinks([{ href: "https://business.google.com/?hl=es" }, { href: "https://support.google.com/x" }, { href: "https://support.google.com/x#a" }], "https://business.google.com/")).toEqual([{ href: "https://support.google.com/x" }]);
  });
});
