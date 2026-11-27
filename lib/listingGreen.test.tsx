// "Get your Google listing to all green": one goal, one count, one list on Fix plan, the Overview and the Google
// listing page (lib/listingGreen.ts).
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { foldListingTasks, listingGreen, reviewingRows, LISTING_GREEN_ID, type ListingGreen } from "@/lib/listingGreen";
import { greenTodoText } from "@/components/gbp/listingGreenText";
import { topRecommendations } from "@/lib/overviewTiles";
import { TopRecommendations } from "@/components/overview/TopRecommendations";
import type { ListingGroup } from "@/lib/googleProfileTab";

const row = (id: string, status: "ok" | "warn" | "bad" | "neutral" | "soon") => ({ id, status, value: null, note: null, action: null });
const GROUPS: ListingGroup[] = [
  { id: "reach", rows: [row("phone", "ok"), row("website", "ok"), row("booking", "ok"), row("messaging", "neutral")] },
  { id: "open", rows: [row("hours", "ok"), row("holiday", "warn")] },
  { id: "who", rows: [row("category", "ok"), row("services", "ok"), row("description", "warn"), row("customerDetails", "warn")] },
  { id: "fresh", rows: [row("photos", "ok"), row("posts", "warn"), row("reviews", "warn")] },
];
const CHECKS = [{ id: "completeness.customer_details", earnedPoints: 1, maxPoints: 3, confidence: "VERIFIED", label: "", explanation: "", category: "completeness" }] as never;

describe("the count and the list (the same everywhere)", () => {
  test("Hair Express-like: 7 of 10 green; to do: customer details +2 pts, holiday hours and the description (helps customers)", () => {
    const g = listingGreen(GROUPS, CHECKS);
    // Not counted: messaging (couldn't be read), Google posts (a Growth habit), reviews (Fix plan's own row).
    expect({ green: g.green, total: g.total }).toEqual({ green: 7, total: 10 });
    expect(g.todo).toEqual([
      { rowId: "customerDetails", points: 2, scored: true },
      { rowId: "holiday", points: 0, scored: false },
      { rowId: "description", points: 0, scored: false },
    ]);
    expect(g.points).toBe(2);
    expect(g.allGreen).toBe(false);
  });
  test("a change Google is still reviewing: 'Google reviewing', not a to-do (and not counted) until Google decides", () => {
    expect(reviewingRows([{ kind: "description", status: "reviewing" }, { kind: "phone", status: "live" }])).toEqual(["description"]);
    const g = listingGreen(GROUPS, CHECKS, { reviewing: ["description"] });
    expect(g.todo.map((x) => x.rowId)).toEqual(["customerDetails", "holiday"]);
    expect(g.reviewing).toEqual(["description"]);
    expect({ green: g.green, total: g.total }).toEqual({ green: 7, total: 9 });
    // Even when the listing already shows the new value (✓): with Google, not green.
    const shown = listingGreen([{ id: "who", rows: [row("phone", "ok"), row("description", "ok")] }], [], { reviewing: ["description"] });
    expect({ green: shown.green, total: shown.total, ok: shown.ok, reviewing: shown.reviewing }).toEqual({ green: 1, total: 1, ok: 1, reviewing: ["description"] });
  });
  test("the count everywhere: '{green} of {total} green · ● OK · ● to improve · ● to fix', '· ● n Google reviewing' when any (EN + ES)", async () => {
    const { GreenCount } = await import("@/components/gbp/listingGreenText");
    const g = listingGreen([{ id: "reach", rows: [row("phone", "ok"), row("hours", "warn"), row("website", "bad"), row("description", "warn")] }], [], { reviewing: ["description"] });
    const words = (locale: Locale) => renderToStaticMarkup(<GreenCount green={g} locale={locale} />).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    expect(words("en")).toBe("1 of 3 green · ● 1 OK · ● 1 to improve · ● 1 to fix · ● 1 Google reviewing");
    expect(words("es")).toBe("1 de 3 en verde · ● 1 bien · ● 1 por mejorar · ● 1 por arreglar · ● 1 en revisión por Google");
    const none = listingGreen([{ id: "reach", rows: [row("phone", "ok")] }], []);
    expect(renderToStaticMarkup(<GreenCount green={none} locale="en" />)).not.toContain("reviewing");
    for (const f of ["components/gbp/GoogleListingPage.tsx", "components/fixPlan/FixPlanView.tsx", "components/overview/TopRecommendations.tsx", "components/overview/GoogleListingRow.tsx"]) expect(readFileSync(f, "utf8")).toContain("<GreenCount green=");
  });
  test("all green: 'Your Google listing is all green ✓' (EN + ES)", () => {
    const all = listingGreen([{ id: "reach", rows: [row("phone", "ok"), row("hours", "ok")] }], []);
    expect(all.allGreen).toBe(true);
    const msgs = readFileSync("lib/i18n/messages.ts", "utf8");
    expect(msgs).toContain('"dashboard.googlePages.listing.allGreen": "Your Google listing is all green ✓"');
    expect(msgs).toContain('"dashboard.googlePages.listing.allGreen": "Su ficha de Google está toda en verde ✓"');
  });
  test("'Still to do: …' — scored rows '+N pts', the rest 'helps customers' (EN + ES)", () => {
    const g = listingGreen(GROUPS, CHECKS);
    expect(greenTodoText(g, "en")).toMatch(/^Still to do: .+ \+2 pts · .+ \(helps customers\) · .+ \(helps customers\)$/);
    expect(greenTodoText(g, "es")).toMatch(/^Falta: .+ \+2 pts · .+ \(ayuda a sus clientes\)/);
  });
});

describe("Fix plan and the Overview: ONE row, the projection unchanged", () => {
  const task = (checkId: string, points: number, when = "this_week") => ({ checkId, weightedPoints: points, when, status: "open", effort: "quick_win", label: checkId, category: checkId.split(".")[0], action: "", why: "", fix: "", weightedPointsHigh: null });
  test("every Google listing fix folds into one; its points are the scored rows' (no-point rows never change the projection)", () => {
    const tasks = [task("visibility.review_replies", 6), task("completeness.customer_details", 2), task("completeness.photos", 1, "weeks"), task("website.https", 1, "weeks")];
    const g = listingGreen(GROUPS, CHECKS);
    const folded = foldListingTasks(tasks, g);
    expect(folded.map((t) => t.checkId)).toEqual(["visibility.review_replies", "website.https", LISTING_GREEN_ID]);
    const one = folded[2] as typeof folded[number] & { mergedCheckIds: string[] };
    expect(one.weightedPoints).toBe(3);
    expect(one.when).toBe("this_week");
    expect(one.mergedCheckIds).toEqual(["completeness.customer_details", "completeness.photos"]);
    // The total the plan adds up is the same before and after.
    expect(folded.reduce((n, t) => n + t.weightedPoints, 0)).toBe(tasks.reduce((n, t) => n + t.weightedPoints, 0));
  });
  test("no scored listing fix but rows still non-green: the row is there with no points; all green: no row; unread: unchanged", () => {
    const g = listingGreen(GROUPS, []);
    expect(foldListingTasks([task("visibility.review_replies", 6)], g).map((t) => [t.checkId, t.weightedPoints])).toEqual([["visibility.review_replies", 6], [LISTING_GREEN_ID, 0]]);
    const all: ListingGreen = { green: 5, total: 5, ok: 5, improve: 0, fix: 0, todo: [], reviewing: [], points: 0, allGreen: true };
    expect(foldListingTasks([task("visibility.review_replies", 6)], all).map((t) => t.checkId)).toEqual(["visibility.review_replies"]);
    expect(foldListingTasks([task("completeness.customer_details", 2)], null).map((t) => t.checkId)).toEqual(["completeness.customer_details"]);
  });
  test("the Overview: one recommendation, '… all green · 7 of 10 green', 'Still to do', 'Open your Google listing →' — shown even with no points", () => {
    const g = listingGreen(GROUPS, []);
    const recs = topRecommendations(foldListingTasks([task("visibility.review_replies", 6), task("website.https", 3, "weeks"), task("visibility.rating", 2, "weeks")] as never, g) as never, null, "b1", {}, Infinity);
    expect(recs.some((r) => r.key === LISTING_GREEN_ID)).toBe(true);
    const html = (locale: Locale) =>
      renderToStaticMarkup(
        <LocaleProvider locale={locale} timeZone="America/New_York">
          <TopRecommendations businessId="b1" recommendations={recs} limit={3} green={g} />
        </LocaleProvider>
      );
    const en = html("en").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(en).toContain("Get your Google listing to all green");
    expect(en).toContain("7 of 10 green · ● 7 OK · ● 3 to improve · ● 0 to fix");
    expect(en).toContain("Still to do:");
    expect(en).toContain("Open your Google listing →");
    expect(html("es")).toContain("Ponga su ficha de Google toda en verde");
  });
  test("the three pages read the one count: Fix plan, the Overview and the Google listing page", () => {
    expect(readFileSync("app/business/[id]/fix-plan/page.tsx", "utf8")).toContain("foldListingTasks(actionPlan.tasks, green)");
    expect(readFileSync("app/business/[id]/page.tsx", "utf8")).toContain("foldListingTasks(actionPlan.tasks, listingGreen)");
    const page = readFileSync("components/gbp/GoogleListingPage.tsx", "utf8");
    expect(page).toContain("listingGreen(groups, props.checks, { reviewing: reviewingRows(props.saved?.made ?? null) })");
    expect(readFileSync("lib/listingGreen.server.ts", "utf8")).toContain("listingGroups(listingInputFrom(props as never, true))");
    expect(page).toContain("listingGroups(listingInputFrom(props, !!page))");
  });
});

describe("the Google listing page", () => {
  test("each non-green row: '+N pts', 'Helps customers · no points', or 'Google reviewing'; 'Fix all ({n})' with the confirm step (EN + ES)", () => {
    const page = readFileSync("components/gbp/GoogleListingPage.tsx", "utf8");
    expect(page).toContain('data-testid={`listing-helps-${row.id}`}');
    expect(page).toContain('data-testid={`listing-reviewing-${row.id}`}');
    expect(page).toContain("<FixAllListing businessId={props.businessId}");
    const send = readFileSync("components/fixPlan/SendToGoogle.tsx", "utf8");
    expect(send).toContain('t(locale, "dashboard.googlePages.listing.fixAll", { count: changes.length })');
    // The same confirm as Fix plan's listing send: before → after, Cancel focused, the localhost name.
    expect(send.match(/<Confirm title=\{t\(locale, "dashboard.fixPlan.send.listingConfirm"\)\}/g)?.length).toBe(2);
    const msgs = readFileSync("lib/i18n/messages.ts", "utf8");
    expect(msgs).toContain('"dashboard.googlePages.listing.helps": "Helps customers · no points"');
    expect(msgs).toContain('"dashboard.googlePages.listing.helps": "Ayuda a sus clientes · sin puntos"');
  });
  test("'Write a fuller description' shows on the listing page while it's under 250 characters", () => {
    expect(readFileSync("components/gbp/GoogleListingPage.tsx", "utf8")).toContain('!(props.page && id === "description")');
    expect(readFileSync("lib/listingIdeas.ts", "utf8")).toContain("export const THIN_DESCRIPTION = 250;");
  });
});
