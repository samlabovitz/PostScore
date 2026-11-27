// Day 25B: Fix plan v3 (the one weekly plan for the score) and the Growth checklist (docs/mockups/day25b/
// fix-plan-v3.html, growth-checklist.html). No task on both pages: replies and listing details only on Fix plan.
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1/growth" }));
vi.mock("@/app/actions/weeklyChecklist", () => ({ setWeeklyCheckItem: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { checkOffsToCount, nextHoliday, scoreRoom, weekHabits, SEASONAL_WINDOW_DAYS } from "@/lib/growthHabits";
import { offerChecks, isWeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import { HabitChecklist } from "@/components/growth/HabitChecklist";
import { SendToGoogle, listingChanges, reviewerList } from "@/components/fixPlan/SendToGoogle";
import type { WeekRepliesState } from "@/components/gbp/RepliesPreview";
import type { AnswersState } from "@/components/gbp/AnswersPreview";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);
const NOV27 = new Date("2026-11-27T15:00:00Z");

describe("the Growth checklist's habits", () => {
  test("post, ask for reviews, a photo, an offer — and a seasonal idea only when a holiday is within 45 days (4–5 habits)", () => {
    expect(SEASONAL_WINDOW_DAYS).toBe(45);
    const habits = weekHabits(NOV27, { reviews: true, photos: false });
    expect(habits.slice(0, 4).map((h) => h.id)).toEqual(["post_update", "share_review_link", "add_photo", "start_offer"]);
    expect(habits.length).toBe(nextHoliday(NOV27) ? 5 : 4);
    expect(habits[4]).toMatchObject({ id: "seasonal_idea", holiday: nextHoliday(NOV27) });
    for (const id of habits.map((h) => h.id)) expect(isWeeklyChecklistItemId(id)).toBe(true);
  });
  test("never a score fix: no replies, listing details or hours on the checklist", () => {
    const ids = weekHabits(NOV27, { reviews: true, photos: true }).map((h) => h.id as string);
    for (const fix of ["reply_reviews", "answer_questions", "check_hours"]) expect(ids).not.toContain(fix);
  });
  test("'Also helps your score' only where the saved scan has points left: reviews; photos only when that check isn't full", () => {
    const checks = (photos: number) => [
      { id: "completeness.photos", earnedPoints: photos, maxPoints: 4 },
      { id: "visibility.review_recency", earnedPoints: 1, maxPoints: 6 },
    ];
    // Hair Express: photos full → no photos tag.
    expect(scoreRoom(checks(4))).toEqual({ reviews: true, photos: false });
    expect(scoreRoom(checks(0))).toEqual({ reviews: true, photos: true });
    expect(scoreRoom(null)).toEqual({ reviews: false, photos: false });
    expect(weekHabits(NOV27, scoreRoom(checks(4))).find((h) => h.id === "add_photo")?.score).toBeNull();
    expect(weekHabits(NOV27, scoreRoom(checks(0))).find((h) => h.id === "add_photo")?.score).toBe("photos");
  });
  test("the tier's own rule: 1 verified action or 2 check-offs make the week count", () => {
    expect(checkOffsToCount({ verified: 1, told: 0 })).toBe(0);
    expect(checkOffsToCount({ verified: 0, told: 0 })).toBe(2);
    expect(checkOffsToCount({ verified: 0, told: 1 })).toBe(1);
    expect(checkOffsToCount({ verified: 0, told: 2 })).toBe(0);
  });
  test("an offer started in PostScore checks 'Run or refresh an offer' for its week (one per week)", () => {
    expect(offerChecks(["2026-11-24T15:00:00Z", "2026-11-26T15:00:00Z", "2026-11-17T15:00:00Z", "nope"], "America/New_York")).toEqual([
      { week_start: "2026-11-23", item_id: "start_offer", source: "sent" },
      { week_start: "2026-11-16", item_id: "start_offer", source: "sent" },
    ]);
    const action = readFileSync("app/actions/weeklyChecklist.ts", "utf8");
    // Test offers never check it; the new page only (today's routine unchanged).
    expect(action).toContain("r.is_test !== true");
    expect(action).toContain("const offers = habits ? await loadOfferChecks(supabase, businessId, timeZone) : [];");
  });
});

describe("This week's checklist (the component)", () => {
  const habits = weekHabits(NOV27, { reviews: true, photos: false });
  const html = (opts: { checked?: string[]; auto?: Record<string, "sent" | "seen">; connected?: boolean; week?: { verified: number; told: number } | null; locale?: Locale } = {}) =>
    wrap(
      <HabitChecklist businessId="b1" habits={habits} weekStart="2026-11-23" checked={(opts.checked ?? []) as never} auto={(opts.auto ?? {}) as never} connected={opts.connected ?? true} week={opts.week === undefined ? { verified: 0, told: 0 } : opts.week} />,
      opts.locale
    );
  test("each habit: a box, the title, its own way in; resets Monday (EN + ES)", () => {
    const en = text(html());
    expect(en).toContain("This week's checklist");
    expect(en).toContain("Nov 23, 2026 – Nov 29, 2026 · resets Monday");
    expect(en).toContain("Post on Google");
    expect(en).toContain("Ask 3 customers for a review");
    expect(en).toContain("Unchecked habits don't carry over: Monday starts a fresh list.");
    const raw = html();
    expect(raw).toContain('data-testid="habit-link-share_review_link" href="');
    expect(raw).toMatch(/role="checkbox" aria-checked="false" aria-label="Mark &quot;Post on Google&quot; done"/);
    expect(text(html({ locale: "es" }))).toContain("La lista de esta semana");
    expect(text(html({ locale: "es" }))).toContain("Pida una reseña a 3 clientes");
  });
  test("PostScore's own checks: checked, tagged, and not for the owner to undo; the rest say who checks them", () => {
    const raw = html({ checked: ["post_update"], auto: { post_update: "seen" } });
    const post = raw.slice(raw.indexOf('data-testid="habit-post_update"'), raw.indexOf('data-testid="habit-share_review_link"'));
    expect(post).toContain('aria-checked="true"');
    expect(post).toContain("disabled");
    expect(text(post)).toContain("Checked by PostScore · seen on Google");
    expect(text(raw)).toContain("PostScore checks this when it sees it");
    expect(text(raw)).toContain("Checks itself when you start one in PostScore");
    expect(text(raw)).toContain("You check it off");
    expect(text(raw)).toContain("Also helps your score: reviews");
    expect(text(raw)).not.toContain("Also helps your score: photos");
    expect(text(raw)).toContain(`1 of ${habits.length} done`);
  });
  test("the tier line: what the week still needs, or that it counts (EN + ES)", () => {
    expect(text(html({ week: { verified: 0, told: 0 } }))).toContain("2 check-offs make this week count toward your tier.");
    expect(text(html({ week: { verified: 0, told: 1 } }))).toContain("One more check-off makes this week count toward your tier.");
    expect(text(html({ week: { verified: 1, told: 0 } }))).toContain("This week counts toward your tier.");
    expect(text(html({ week: { verified: 0, told: 0 }, locale: "es" }))).toContain("Con 2 marcas esta semana cuenta para su nivel.");
    expect(html({ week: null })).not.toContain('data-testid="habit-counts"');
  });
  test("not connected: the owner checks everything, and Connect says what PostScore would do", () => {
    const raw = text(html({ connected: false }));
    expect(raw).not.toContain("PostScore checks this when it sees it");
    expect(raw).toContain("Connect Google and PostScore checks your posts and photos for you.");
  });
  test("the old celebration: confetti at the box, the trophy toast once when the week first counts", () => {
    const src = readFileSync("components/growth/HabitChecklist.tsx", "utf8");
    expect(src).toContain("confettiBurst(rect, 40, 1200)");
    expect(src).toContain('claimCelebration(celebrationKey("habits", businessId, weekStart))');
    expect(src).toContain("<IconTrophy size={16} />");
  });
});

describe("Growth plan: tier card on top, then the checklist, More ways, Google results", () => {
  test("the page's order, and the answers card opens the same editor as Fix plan's listing-details row", () => {
    const view = readFileSync("components/growth/GrowthPlanView.tsx", "utf8");
    const order = ["<TierCard", "<HabitChecklist", 'data-testid="habits-fix-link"', "<MoreWaysCards", 'data-testid="growth-results-link"'].map((x) => view.indexOf(x));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(readFileSync("components/gbp/MoreWaysCards.tsx", "utf8")).toContain("return <ListingAnswersEditor businessId={businessId} premium={premium} state={state} />;");
    // The listing's changes: the same answers draft on the Google listing page's "Fix all" and Fix plan's send.
    expect(readFileSync("components/fixPlan/SendToGoogle.tsx", "utf8")).toContain("const answers = useAnswers(businessId, { auto: canEdit, suggest: [] });");
  });
});

describe("Fix plan v3", () => {
  const replies = (n: number): WeekRepliesState => ({ status: "ok", items: [], canPost: true, practice: false, more: 0, setText: vi.fn(), setInclude: vi.fn(), ready: Array.from({ length: n }, (_, i) => `r${i}`), post: vi.fn(), load: vi.fn(), redraft: vi.fn(), reload: vi.fn() });
  const answers = { status: "ok", data: { canEdit: true }, ready: ["description", "services"] } as unknown as AnswersState;
  test("two separate sends, never one button: 'Post {n} review replies' and 'Update your Google listing ({m})' (EN + ES)", () => {
    const items = ["Christine Smith", "Win Browning", "Kimberly Quispe"].map((reviewer, i) => ({ reviewId: `r${i}`, reviewer, reply: "x", include: true })) as never;
    const reps = { ...replies(3), items };
    const ans = { ...answers, payload: { description: "A full-service salon." }, data: { canEdit: true, listing: { description: "Hair salon", services: [], details: [] } } } as unknown as AnswersState;
    const html = wrap(<SendToGoogle businessId="b1" replies={reps} answers={ans} canEdit practice={false} />);
    expect(html).toMatch(/data-testid="send-replies" data-count="3"[^>]*>Post 3 review replies</);
    expect(html).toMatch(/data-testid="send-listing" data-count="1"[^>]*>Update your Google listing \(1\)</);
    expect(html).not.toContain("Approve this week");
    // Nothing is open (nothing can go) until a button opens its own confirm step.
    expect(html).not.toContain('data-testid="send-confirm"');
    const es = wrap(<SendToGoogle businessId="b1" replies={reps} answers={ans} canEdit practice={false} />, "es");
    expect(es).toContain(">Publicar 3 respuestas a reseñas<");
    expect(es).toContain(">Actualizar su ficha de Google (1)<");
    expect(readFileSync("components/fixPlan/FixPlanView.tsx", "utf8")).toContain("<SendToGoogle businessId={businessId}");
  });
  test("the replies' confirm names the reviewers ('Christine, Win, Kimberly + 26 more') and 'Read them first →'", () => {
    expect(reviewerList(["Christine Smith", "Win Browning", "Kimberly Quispe", ...Array(26).fill("Someone Else")], "en")).toBe("Christine, Win, Kimberly + 26 more");
    expect(reviewerList(["Christine Smith", "Win Browning", "Kimberly Quispe", "Ana"], "es")).toBe("Christine, Win, Kimberly y 1 más");
    expect(reviewerList(["J."], "en")).toBe("J.");
    const src = readFileSync("components/fixPlan/SendToGoogle.tsx", "utf8");
    expect(src).toContain('t(locale, "dashboard.fixPlan.send.readFirst")');
  });
  test("the listing's confirm shows each change before → after (what Google has now vs what goes)", () => {
    const listing = { description: "Hair salon", services: [{ name: "Haircut", googlePrice: null }], details: [{ id: "attributes/wheelchair_accessible_entrance", label: "Wheelchair accessible entrance", current: null }] };
    const changes = listingChanges(listing, { description: "Hair Express is a full-service salon.", services: [{ name: "Haircut", price: 45 }, { name: "Balayage", price: null }], details: { "attributes/wheelchair_accessible_entrance": true } }, "en");
    expect(changes.map((c) => [c.label, c.before, c.after])).toEqual([
      ["Description", "Hair salon", "Hair Express is a full-service salon."],
      ["Haircut", "listed", "listed · $45"],
      ["Balayage", "not listed", "listed"],
      [changes[3].label, "Not set", "Yes"],
    ]);
    expect(listingChanges(null, { description: "x" }, "en")).toEqual([]);
  });
  test("every confirm: Cancel first and focused; the send waits for the localhost name when it's real", () => {
    for (const f of ["components/fixPlan/SendToGoogle.tsx", "components/gbp/ApproveAll.tsx", "components/reviews/GoogleReviewsInbox.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/autoFocus[^>]*(data-testid="(send|approve-all|approve-all-replies)-cancel"|onClick=\{(onCancel|\(\) => setConfirming\(false\))\})/);
      expect(src, f).toContain("disabled={!guard.ok}");
    }
  });
  test("Premium sends; Grow reads the same drafts (never posts) and sees 'Premium approves all {n} in one click →'", () => {
    const view = readFileSync("components/fixPlan/FixPlanView.tsx", "utf8");
    expect(view).toContain("const replies = useWeekReplies(businessId, { auto: oneClick || grow, all: true });");
    expect(view).toContain('tPlural(locale, "dashboard.fixPlan.approve.grow", drafted, { count: drafted })');
    const action = readFileSync("app/actions/approveAll.ts", "utf8");
    expect(action).toContain('if (!premium && !(opts.all && plan !== "free")) return { status: "blocked", reason: "not_premium" };');
    expect(action).toContain("canPost: premium && page.canPost");
  });
  test("every row keeps its primary button; the drafts are a secondary text link; previews are the real saved drafts", () => {
    const card = readFileSync("app/business/[id]/ActionPlanSection.tsx", "utf8");
    expect(card).toContain('data-testid="fix-row-secondary"');
    expect(card).toContain("{!rowOpen && !waiting && mainButton}");
    const view = readFileSync("components/fixPlan/FixPlanView.tsx", "utf8");
    expect(view).toContain("const items = (week.replies?.items ?? []).filter((i) => i.reply);");
    expect(view).not.toMatch(/Yadira|Angelica/);
  });
  test("holiday hours are no longer their own row: they're in 'Get your Google listing to all green' (lib/listingGreen.test.tsx)", () => {
    const view = readFileSync("components/fixPlan/FixPlanView.tsx", "utf8");
    expect(view).not.toContain("HolidayRow");
    expect(view).toContain("<ListingGreenRow");
  });
  test("the review rows name the habit that earns them, on the Growth checklist", () => {
    expect(readFileSync("components/fixPlan/FixPlanView.tsx", "utf8")).toContain('href={growthPlanHref(businessId, { hash: "this-week" })}');
  });
});

describe("Google results: numbers only; the Growth plan's header and best day", () => {
  const m = (month: string, calls: number, directions: number, websiteClicks: number, callsByWeekday: number[] | null = null) => ({ month, calls, directions, websiteClicks, callsByWeekday }) as never;
  test("no 'What to do this week' on Google results: the jump menu is Last month · Since you did this · Searches → actions · Search terms", async () => {
    const { RESULTS_SECTIONS } = await import("@/lib/googleProfileTab");
    expect(RESULTS_SECTIONS.map((s) => s.id)).toEqual(["last-month", "since", "funnel", "searches"]);
    const src = readFileSync("components/gbp/GoogleResults.tsx", "utf8");
    expect(src).not.toContain("GrowThisWeek");
    expect(src).toContain("<DriverChips businessId={props.businessId} levers={ls} />");
  });
  test("'What's driving these numbers': read-only chips, each to where it's done, and the line to the checklist (EN + ES)", async () => {
    const { DriverChips } = await import("@/components/gbp/GoogleResults");
    const ls = (["reviews", "photos", "posts", "deals", "website"] as const).map((id) => ({ id, tone: "warn", status: "none", href: "#" })) as never;
    const html = wrap(<DriverChips businessId="b1" levers={ls} />);
    expect(text(html)).toContain("What's driving these numbers");
    expect(html).toMatch(/data-testid="driver-reviews" href="\/business\/b1\/[a-z-]+#reply-to-reviews"/);
    expect(html).toMatch(/data-testid="driver-photos" href="\/business\/b1\/[a-z-]+#this-week"/);
    expect(html).toMatch(/data-testid="driver-posts" href="\/business\/b1\/[a-z-]+#this-week"/);
    expect(html).toMatch(/data-testid="driver-deals" href="\/business\/b1\/[a-z-]+"/);
    expect(html).toMatch(/data-testid="driver-website" href="\/business\/b1\/website"/);
    expect(html).not.toContain("<button");
    expect(text(html)).toContain("Your weekly checklist is on Growth plan →");
    expect(text(wrap(<DriverChips businessId="b1" levers={ls} />, "es"))).toContain("Qué impulsa estas cifras");
  });
  test("best day to post: the day before the busiest call days; hidden without enough calls", async () => {
    const { bestPostDay, BEST_DAY_MIN_CALLS } = await import("@/lib/growthHabits");
    expect(BEST_DAY_MIN_CALLS).toBe(10);
    // Sunday first: Tue–Thu busiest → Monday.
    expect(bestPostDay([m("2026-10", 30, 0, 0, [1, 2, 8, 9, 7, 2, 1])])).toEqual({ weekday: 1, busiest: "midweek" });
    expect(bestPostDay([m("2026-10", 3, 0, 0, [0, 0, 1, 1, 1, 0, 0])])).toBeNull();
    expect(bestPostDay([m("2026-10", 30, 0, 0, null)])).toBeNull();
    expect(bestPostDay(null)).toBeNull();
  });
  test("the proof line: last month's calls + directions + website clicks, vs the same month a year before; no year-ago, no comparison", async () => {
    const { lastMonthProof } = await import("@/lib/growthHabits");
    expect(lastMonthProof([m("2025-10", 40, 42, 20), m("2026-09", 1, 1, 1), m("2026-10", 30, 72, 50)])).toEqual({ month: "2026-10", count: 152, change: { dir: "up", pct: 49 } });
    expect(lastMonthProof([m("2026-10", 30, 72, 50)])).toEqual({ month: "2026-10", count: 152, change: null });
    expect(lastMonthProof([])).toBeNull();
    const msgs = readFileSync("lib/i18n/messages.ts", "utf8");
    expect(msgs).toContain('"dashboard.growthPlan.proof.other": "Last month Google brought you {count} customer actions (calls, directions, website clicks)"');
    expect(msgs).toContain('"dashboard.growthPlan.proof.connectBanner": "Conecte Google para ver cuántos clientes lo encuentran cada mes"');
    // Not connected: only the Connect banner says it (no second connect line in the header).
    const view = readFileSync("components/growth/GrowthPlanView.tsx", "utf8");
    expect(view).toContain("if (!props.connected) return null;");
    expect(view).toContain('G(lost ? "reconnectBanner" : "proof.connectBanner")');
  });
  test("Growth plan: no 'More customers' block (the sidebar has those tools); the new subtitle", () => {
    const view = readFileSync("components/growth/GrowthPlanView.tsx", "utf8");
    expect(view).not.toContain("GrowMoreCustomers");
    expect(view).toContain('t(locale, G("subtitleV3"))');
    expect(view).toContain("<ProofLine props={props} />");
  });
});

describe("safety: nothing goes to Google on the first click (Nov 27)", () => {
  test("Approve all (Growth page): the button only opens the confirm, which names what goes; Send runs it (EN + ES)", () => {
    const src = readFileSync("components/gbp/ApproveAll.tsx", "utf8");
    expect(src).toContain("onClick={() => setConfirming(true)}");
    expect(src).not.toMatch(/onClick=\{run\}/);
    expect(src).toContain('data-testid="approve-all-confirm-what"');
    const msgs = readFileSync("lib/i18n/messages.ts", "utf8");
    expect(msgs).toContain('"dashboard.approveConfirm.title.other": "Send {count} items to Google? You can still read or change any of them first."');
    expect(msgs).toContain('"dashboard.approveConfirm.title.other": "¿Enviar {count} elementos a Google? Aún puede leer o cambiar cualquiera de ellos antes."');
  });
  test("localhost only: a real bulk send needs the business name typed (never in practice, never in production)", async () => {
    const { nameMatches } = await import("@/components/gbp/LocalWriteGuard");
    expect(nameMatches("hair express on broadway", "Hair express on Broadway")).toBe(true);
    expect(nameMatches("  Hair  express on Broadway ", "Hair express on Broadway")).toBe(true);
    expect(nameMatches("Hair express", "Hair express on Broadway")).toBe(false);
    expect(nameMatches("", "")).toBe(false);
    const guard = readFileSync("components/gbp/LocalWriteGuard.tsx", "utf8");
    expect(guard).toContain("if (!name || practice) return { ok: true, field: null };");
    const layout = readFileSync("app/business/[id]/layout.tsx", "utf8");
    expect(layout).toContain('const localWriteName = process.env.NODE_ENV === "development" ? await localBusinessName(params.id) : null;');
    // Reviews' "Approve all replies" asks for it too.
    expect(readFileSync("components/reviews/GoogleReviewsInbox.tsx", "utf8")).toContain('data-testid="approve-all-replies-post" disabled={!guard.ok}');
  });
});

describe("score breakdown: rows losing points start open (Nov 27)", () => {
  const row = (id: string, earned: number | null, max: number, explanation: string) => ({ id, label: id, earnedPoints: earned, maxPoints: max, confidence: "VERIFIED", explanation });
  test("losing points: open, one sentence, 'More help' for the rest; passed rows stay folded (EN + ES)", async () => {
    const { CategoryCard } = await import("@/components/scoring/CategoryCard");
    const category = { id: "visibility", label: "Reviews", earnedPoints: 14, possiblePoints: 20, relativeScore: 70, weight: 40, checks: [row("visibility.review_count", 13.6, 14, "142 reviews on Google (full credit at 150+). More reviews also help people trust you."), row("visibility.rating", 6, 6, "4.9 stars.")] };
    const html = wrap(<CategoryCard category={category as never} embedded businessId="b1" />);
    expect(html).toMatch(/id="check-review_count"[^>]*data-open="true"/);
    expect(text(html)).toContain("142 reviews on Google (full credit at 150+).");
    expect(text(html)).not.toContain("More reviews also help people trust you.");
    expect(html).toContain('data-testid="row-more-help"');
    expect(html).toContain('data-testid="passed-toggle"');
    expect(text(wrap(<CategoryCard category={category as never} embedded businessId="b1" />, "es"))).toContain("Más ayuda");
  });
  test("the owner's open/close is kept per row in this browser only; waiting-for-Google rows open too", async () => {
    const { helpSplit } = await import("@/components/scoring/CategoryCard");
    expect(helpSplit("142 reviews on Google (full credit at 150+). More help here.")).toEqual({ first: "142 reviews on Google (full credit at 150+).", rest: "More help here." });
    expect(helpSplit("4.9 stars on 30 reviews.")).toEqual({ first: "4.9 stars on 30 reviews.", rest: null });
    const src = readFileSync("components/scoring/CategoryCard.tsx", "utf8");
    expect(src).toContain("const startOpen = losing || waiting;");
    expect(src).toContain("writeStorage(memo, value === startOpen ? null : value ? \"open\" : \"closed\");");
    expect(src).toContain("return `postscore.breakdownRow.${businessId ?? \"-\"}.${checkId}`;");
  });
});
