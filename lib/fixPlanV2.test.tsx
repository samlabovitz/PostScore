// Day 25B: Fix plan v2 (docs/mockups/day25b/fix-plan-v2.html) and "How your two scores work together".
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1", useParams: () => ({ id: "b1" }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { updateUser: vi.fn(() => Promise.resolve({})) } }) }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { groupFixPlan, type FixPlanRow } from "@/lib/fixPlan";
import { fixPlanWhy } from "@/app/business/[id]/ActionPlanSection";
import { ShellDataProvider, type ShellData } from "@/components/layout/ShellData";
import { PresenceUnder70Note, TwoScoresStrip } from "@/components/overview/TwoScoresStrip";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const wrap = (node: ReactNode, shell: Partial<ShellData> = {}, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <ShellDataProvider value={{ presence: { score: 78, grade: "C" }, plan: "premium", testAccount: false, ...shell } as ShellData}>{node}</ShellDataProvider>
    </LocaleProvider>
  );
const row = (key: string, when: "this_week" | "weeks" | "months", points: number, upTo = false): FixPlanRow => ({ kind: "task", key, task: { checkId: key } as never, points, upTo, when, priority: "high", running: 0 });

describe("Fix plan v2: three groups with subtotals", () => {
  test("This week · Takes a few weeks · Takes months, ranked within each; the running score follows the shown order", () => {
    // Ranked order (as buildFixPlan gives it): the 4.7 review row sits between this week's rows.
    const rows = [row("replies", "this_week", 6), row("match", "this_week", 0.5), row("recent", "weeks", 4.7), row("details", "this_week", 2), row("forty", "months", 1.7), row("onefifty", "months", 6.8, true)];
    const g = groupFixPlan({ rows, today: 78 });
    expect(g.map((x) => x.when)).toEqual(["this_week", "weeks", "months"]);
    expect(g[0].rows.map((r) => [r.key, r.running])).toEqual([["replies", 84], ["match", 85], ["details", 87]]);
    expect(g[0]).toMatchObject({ points: 8.5, to: 87, upTo: false });
    expect(g[1]).toMatchObject({ points: 4.7, to: 91 });
    expect(g[2]).toMatchObject({ points: 8.5, to: 100, upTo: true });
    expect(groupFixPlan({ rows: [row("a", "months", 3)], today: 90 }).map((x) => x.when)).toEqual(["months"]);
  });
  test("one short why per row (EN + ES), never cut with '…'; a check without one keeps its own line", () => {
    expect(fixPlanWhy({ checkId: "visibility.review_replies", why: "long" }, "en")).toBe("Customers read how you answer their reviews.");
    expect(fixPlanWhy({ checkId: "visibility.reviews_trust", why: "long" }, "es")).toBe("Su calificación cuenta por completo cuando tenga suficientes reseñas.");
    expect(fixPlanWhy({ checkId: "website.links", why: "Its own line." }, "en")).toBe("Its own line.");
    const src = readFileSync("app/business/[id]/ActionPlanSection.tsx", "utf8");
    expect(src).not.toMatch(/fix-row-why[^>]*truncate|line-clamp-1/);
  });
  test("compact rows: the priority in its own column, the status dot, outline buttons under 'Takes months', only the first open; anchors and fixDestination kept", () => {
    const view = readFileSync("components/fixPlan/FixPlanView.tsx", "utf8");
    expect(view).toContain("compact: { open: step === 1, outline }");
    expect(view).toContain('const outline = g.when === "months";');
    expect(view).toContain('data-testid="fix-plan-speed"');
    expect(view.indexOf('g.when === "weeks" && plan.speed')).toBeGreaterThan(0);
    const card = readFileSync("app/business/[id]/ActionPlanSection.tsx", "utf8");
    expect(card).toContain("nav:grid-cols-[26px_112px_minmax(0,1fr)_auto]");
    expect(card).toContain('data-testid="fix-row-status"');
    expect(card).toContain("<li id={cardId}");
    expect(card).toContain('get("open") === "howto"');
    expect(card).toContain("<FixButton");
  });
});

describe("How your two scores work together", () => {
  test("the strip: Presence gets you found, Growth gets you chosen; each half links to its page; '×' hides it (EN + ES)", () => {
    const html = wrap(<TwoScoresStrip businessId="b1" />);
    const words = text(html);
    expect(words).toContain("How your two scores work together");
    expect(words).toContain("Presence · Get found Fix these and your score climbs to 100. A complete, accurate listing with fresh reviews helps Google show you to people searching nearby. Fix plan →");
    expect(words).toContain("Growth · Get chosen and come back Offers, reviews and weekly posts that bring customers in the door, whatever your score. Growth plan →");
    expect(html).toContain('data-testid="two-scores-hide"');
    expect(words).not.toMatch(/guarantee|rank #?1|top of Google/i);
    expect(wrap(<TwoScoresStrip businessId="b1" />, { twoScoresHidden: true })).toBe("");
    expect(text(wrap(<TwoScoresStrip businessId="b1" />, {}, "es"))).toContain("Presencia · Que lo encuentren");
  });
  test("remembered per user: the account's own metadata, read with the shell", () => {
    expect(readFileSync("components/overview/TwoScoresStrip.tsx", "utf8")).toContain("auth.updateUser({ data: { two_scores_hidden: true } })");
    expect(readFileSync("lib/shellData.server.ts", "utf8")).toContain("two_scores_hidden === true");
  });
  test("Growth plan: the gold note only under 70", () => {
    expect(wrap(<PresenceUnder70Note businessId="b1" />)).toBe("");
    const low = text(wrap(<PresenceUnder70Note businessId="b1" />, { presence: { score: 64, grade: "D" } }));
    expect(low).toBe("Your Presence score is 64. Fixing it is the fastest way to be found by more customers. Open Fix plan →");
    expect(text(wrap(<PresenceUnder70Note businessId="b1" />, { presence: { score: 64, grade: "D" } }, "es"))).toContain("Su puntuación de Presencia es 64.");
  });
  test("placed on the new design only: under the Overview's score card, at the top of the Growth plan; the score card's two lines", () => {
    expect(readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8").match(/\{NEW_PAGES_LIVE && <TwoScoresStrip businessId=\{businessId\} \/>\}/g)?.length).toBe(2);
    const growth = readFileSync("components/growth/GrowthPlanView.tsx", "utf8");
    expect(growth.match(/<PresenceUnder70Note businessId=/g)?.length).toBe(2);
    const band = readFileSync("components/overview/ScoreBand.tsx", "utf8");
    expect(band).toContain('t(locale, "dashboard.twoScores.fixPlanTo", { score: projectedScore })');
    expect(band).toContain('t(locale, "dashboard.twoScores.higherScore")');
  });
});
