// Day 25B §2d "One home per task" (docs/plans/day25a-spec.md), the drafts written in the background, and the score
// breakdown's clickable rows.
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1", useParams: () => ({ id: "b1" }) }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { weekKinds } from "@/lib/tabIdeas";
import { growthExtras, nextHoliday, SEASONAL_WINDOW_DAYS } from "@/lib/growthWeek";
import { isWeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import { countsTowardTier } from "@/app/business/[id]/ActionPlanSection";
import { holidayRowFor, HOLIDAY_ROW_DAYS } from "@/lib/fixPlan";
import { CategoryCard, HoursStateContext } from "@/components/scoring/CategoryCard";
import { postState } from "@/components/gbp/ThisWeekList";

const wrap = (node: ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("one home per task: the Growth week is Growth-type only (new design)", () => {
  const recs = (["replies", "photos", "posts", "answers", "description"] as const).map((kind) => ({ kind, plan: {} })) as never;
  test("the Google tasks are the post and photos; replies and the answers are Presence fixes (today's design unchanged)", () => {
    expect(weekKinds(recs, true).map((r) => r.kind)).toEqual(["photos", "posts"]);
    expect(weekKinds(recs, false).map((r) => r.kind)).toEqual(["replies", "photos", "posts", "answers"]);
  });
  test("every week: ask for reviews and an offer, plus the next holiday within 45 days → 3–5 tasks with the post and photos", () => {
    const nov = new Date("2026-11-25T12:00:00Z");
    expect(SEASONAL_WINDOW_DAYS).toBe(45);
    expect(nextHoliday(nov)).toEqual({ id: "thanksgiving", date: "2026-11-26" });
    expect(growthExtras(nov, true).map((e) => e.id)).toEqual(["share_review_link", "start_offer", "seasonal_idea"]);
    // No holiday close: the two that are always there.
    expect(growthExtras(new Date("2026-02-01T12:00:00Z"), true).map((e) => e.id)).toEqual(["share_review_link", "start_offer"]);
    for (const extras of [growthExtras(nov, true), growthExtras(new Date("2026-02-01T12:00:00Z"), true)]) {
      expect(extras.length).toBeGreaterThanOrEqual(2);
      expect(extras.length + 2).toBeLessThanOrEqual(5);
    }
    expect(growthExtras(nov, false)).toEqual([]);
  });
  test("none duplicates a Fix plan row: no replies, answers or hours task on the Growth plan; the answers card lives on the Google listing", () => {
    const view = readFileSync("components/growth/GrowthPlanView.tsx", "utf8");
    expect(view).not.toContain('"check_hours"');
    expect(readFileSync("components/gbp/GoogleListingPage.tsx", "utf8")).toContain("<AnswersCard businessId={props.businessId} premium={premium} />");
  });
  test("check-offs: only the app's own ids are written (the new tasks included)", () => {
    expect(isWeeklyChecklistItemId("start_offer")).toBe(true);
    expect(isWeeklyChecklistItemId("seasonal_idea")).toBe(true);
    expect(isWeeklyChecklistItemId("anything")).toBe(false);
    expect(readFileSync("app/actions/weeklyChecklist.ts", "utf8")).toContain("if (!isWeeklyChecklistItemId(itemId))");
  });
});

describe("Fix plan: the tier tag, Approve fixes, the holiday-hours row", () => {
  test("'Counts toward your Growth tier' on replies and listing fixes, never on reviews to earn or the website", () => {
    expect(countsTowardTier({ checkId: "visibility.review_replies" })).toBe(true);
    expect(countsTowardTier({ checkId: "completeness.customer_details" })).toBe(true);
    expect(countsTowardTier({ checkId: "completeness.hours" })).toBe(true);
    expect(countsTowardTier({ checkId: "visibility.review_count" })).toBe(false);
    expect(countsTowardTier({ checkId: "website.https" })).toBe(false);
    expect(countsTowardTier({ checkId: "visibility.review_count", mergedCheckIds: ["visibility.review_replies"] })).toBe(true);
  });
  test("Approve fixes: Premium, connected, writes on; its own count (the replies and the listing's answers)", () => {
    const src = readFileSync("components/fixPlan/FixPlanView.tsx", "utf8");
    expect(src).toContain("const on = gbp.enabled && gbp.premium && (gbp.connected || !!gbp.practice);");
    expect(src).toContain("<ApproveAll");
    expect(src).toContain("fixes");
  });
  test("a holiday in the next 30 days with no hours set → the row; later or past: none", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(HOLIDAY_ROW_DAYS).toBe(30);
    expect(holidayRowFor({ holiday: "thanksgiving", date: "2026-11-26" }, now)).toEqual({ holiday: "thanksgiving", date: "2026-11-26" });
    expect(holidayRowFor({ holiday: "newYear", date: "2027-01-01" }, now)).toBeNull();
    expect(holidayRowFor(null, now)).toBeNull();
  });
});

describe("the tier line can point to a Presence fix", () => {
  test("Premium, this week not counted yet, replies drafted: the top line points to Approve fixes on Fix plan", () => {
    const src = readFileSync("components/growth/GrowthPlanView.tsx", "utf8");
    expect(src).toContain("const presenceFirst = oneTap && state && !state.thisWeekCounts && ready > 0;");
    expect(readFileSync("lib/googlePages.server.ts", "utf8")).toContain("readyReplies: await readyReplyCount(businessId),");
  });
});

describe("drafts written in the background, never on page load", () => {
  test("the post: openPostDraft only reads the saved draft (the plain draft, said plainly, until one is saved)", () => {
    const actions = readFileSync("app/actions/gbpPosts.ts", "utf8");
    const open = actions.slice(actions.indexOf("export async function openPostDraft("), actions.indexOf("export async function", actions.indexOf("export async function openPostDraft(") + 10));
    expect(open).not.toContain("await draft(inputs, cleanDay(day));");
    expect(open).toContain("pending = true;");
    expect(readFileSync("lib/postDrafts.server.ts", "utf8")).toContain("export async function writeWeekDrafts(");
    expect(readFileSync("app/api/cron/reply-drafts/route.ts", "utf8")).toContain("await writeWeekDrafts(admin, id, plan)");
    expect(readFileSync("lib/replyBatch.server.ts", "utf8")).toContain('(await import("@/lib/postDrafts.server")).writeWeekDrafts(admin, businessId, plan)');
  });
  test("the answers' description: read from post_drafts, never written on page load", () => {
    const answers = readFileSync("app/actions/googleAnswers.ts", "utf8");
    expect(answers).toContain("return savedAnswersDescription(admin, businessId, inputs.locale);");
    expect(answers).not.toContain("callAnthropicMessage");
  });
  test("a saved draft shows at once: never 'Getting drafts ready…' for it", () => {
    expect(postState({ status: "loading", text: "Saved", latest: null, blockedToday: null, problems: [], flags: [], publish: null } as never)).toBe("ready");
    expect(postState({ status: "loading", text: "", latest: null, blockedToday: null, problems: [], flags: [], publish: null } as never)).toBe("loading");
  });
});

describe("score breakdown: rows that look and act clickable", () => {
  const check = { id: "visibility.review_replies", label: "Replying to reviews", earnedPoints: 0, maxPoints: 6, confidence: "VERIFIED", explanation: "You replied to 0 of your last 20 reviews." };
  const category = { id: "visibility", label: "Reviews", earnedPoints: 0, possiblePoints: 6, relativeScore: 0, weight: 40, checks: [check] };
  test("the whole row toggles; keyboard Enter/Space; aria-expanded; a chevron with 'Details' from 1024 px; buttons inside don't toggle", () => {
    const html = wrap(<CategoryCard category={category as never} embedded businessId="b1" />);
    expect(html).toMatch(/role="button" tabindex="0" aria-expanded="false" aria-controls="more-check-review_replies"/);
    expect(html).toContain('data-testid="row-chevron"');
    expect(html).toMatch(/<span class="hidden lg:inline">Details<\/span>/);
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("hover:bg-paper");
    const src = readFileSync("components/scoring/CategoryCard.tsx", "utf8");
    expect(src).toContain('if ((e.target as HTMLElement).closest("a, button, input, label, summary")) return;');
    expect(src).toContain('if (e.key !== "Enter" && e.key !== " ") return;');
    // Open: a soft tint and a thin gold left edge.
    expect(src).toContain('show ? "rounded-r-lg border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_7%,white)]"');
    expect(text(wrap(<CategoryCard category={category as never} embedded businessId="b1" />, "es"))).toContain("Detalles");
  });
  test("the waiting row says 'Waiting for Google' once (the pill), then 'Your Business Profile already matches your website…' (EN + ES)", () => {
    const hours = { id: "website.info_consistency", label: "Matches your Google listing", earnedPoints: 0.5, maxPoints: 1, confidence: "VERIFIED", explanation: "x" };
    const card = (locale: Locale) => text(wrap(<HoursStateContext.Provider value={{ kind: "differs", days: [], profileAhead: true }}><CategoryCard category={{ ...category, id: "website", checks: [hours] } as never} embedded businessId="b1" /></HoursStateContext.Provider>, locale));
    const en = card("en");
    expect(en.match(/Waiting for Google/g)?.length).toBe(1);
    expect(en).toContain("Your Business Profile already matches your website; Google Maps hasn't published it yet.");
    expect(card("es")).toContain("Su Perfil de Empresa ya coincide con su sitio web; Google Maps aún no lo ha publicado.");
  });
});
