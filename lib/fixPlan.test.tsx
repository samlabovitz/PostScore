import { describe, expect, test, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { LocaleProvider, type Locale } from "@/lib/i18n";
import { buildFixPlan, websiteFixSummary } from "@/lib/fixPlan";
import { MERGED_REVIEW_CHECK_ID, REVIEWS_COUNT_CHECK_ID, REVIEWS_TRUST_CHECK_ID, planTaskName, type ActionPlanTask } from "@/lib/actionPlan";
import { fixWhen, fixDestination } from "@/lib/fixDestination";
import { recommendationPriority, topRecommendations } from "@/lib/overviewTiles";
import { ApproveAll, approveCount, approveTaskCount } from "@/components/gbp/ApproveAll";
import type { WeekRepliesState } from "@/components/gbp/RepliesPreview";
import type { PostDraftState } from "@/components/gbp/PostPreview";
import type { AnswersState } from "@/components/gbp/AnswersPreview";
import { TaskCard } from "@/app/business/[id]/ActionPlanSection";
import { HoursComparePanel } from "@/components/hours/HoursMismatchChooser";
import { ScoreBand } from "@/components/overview/ScoreBand";

// Day 25B step 3 (docs/plans/day25a-spec.md §2b, mockup 07): Fix plan and
// the Part A fixes that go live now.

const wrap = (node: React.ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const task = (checkId: string, points: number, extra: Partial<ActionPlanTask> = {}): ActionPlanTask =>
  ({
    checkId,
    category: checkId.startsWith("website.") ? "website" : checkId.startsWith("completeness.") ? "completeness" : "visibility",
    label: checkId,
    title: checkId,
    problem: "p",
    why: "w",
    action: "a",
    fix: "f",
    ownerActionOnGoogle: false,
    promisedPoints: points,
    status: "open",
    markedDoneAt: null,
    markedPromisedPoints: null,
    markedMetricValue: null,
    effort: "quick_win",
    weeklyTarget: null,
    weeklyTargetDelta: null,
    currentMetricValue: null,
    mergedCheckIds: null,
    mergedLabels: null,
    timingNote: null,
    weightedPoints: points,
    weightedPointsHigh: null,
    href: null,
    rangeLowOverlay: null,
    rangeHighOverlay: null,
    when: fixWhen(checkId),
    ...extra,
  }) as ActionPlanTask;

// Hair Express (scan of Nov 20), the spec's six rows. The hours mismatch is High whatever its points
// (customers turn up while it's closed) and shows the saved check's own +0.5.
const HAIR_TASKS: ActionPlanTask[] = [
  task(REVIEWS_COUNT_CHECK_ID, 6.8, { effort: "longer_term", when: "months", upTo: true, markable: false, title: "Keep growing toward 150 reviews" }),
  task("visibility.review_replies", 6, { title: "Reply to your recent reviews" }),
  task(MERGED_REVIEW_CHECK_ID, 4.7, { effort: "quick_win_action", when: "weeks", mergedCheckIds: ["visibility.review_count", "visibility.rating", "visibility.review_recency"], title: "Get 3 new reviews in the next 90 days" }),
  task("completeness.customer_details", 2, { title: "Add your customer details" }),
  task(REVIEWS_TRUST_CHECK_ID, 1.7, { effort: "longer_term", when: "months", markable: false, title: "Grow to 40 reviews" }),
  task("website.info_consistency", 0.5, { effort: "quick_win", title: "Match your website to Google", mismatchFields: ["hours"] } as Partial<ActionPlanTask>),
];
const BREAKDOWN = { total: 78, checks: [] };

describe("Fix plan: ranked rows, running score, the two targets", () => {
  const plan = buildFixPlan({ tasks: HAIR_TASKS, websiteBanner: null, breakdown: BREAKDOWN });

  test("Urgent → High → Medium → Low, most points first; the hours mismatch is High; 40 before 150; running score 84 → 85 → 89 → 91 → 93 → 100", () => {
    expect(plan.rows.map((r) => r.key)).toEqual(["visibility.review_replies", "website.info_consistency", MERGED_REVIEW_CHECK_ID, "completeness.customer_details", REVIEWS_TRUST_CHECK_ID, REVIEWS_COUNT_CHECK_ID]);
    expect(plan.rows.map((r) => r.priority)).toEqual(["high", "high", "medium", "medium", "low", "low"]);
    expect(plan.rows.map((r) => r.when)).toEqual(["this_week", "this_week", "weeks", "this_week", "months", "months"]);
    expect(plan.rows.map((r) => r.running)).toEqual([84, 85, 89, 91, 93, 100]);
    expect(plan.rows.find((r) => r.key === "website.info_consistency")!.points).toBe(0.5);
  });

  test("This week: 78 → 87 (replies + hours + customer details = 86.5); no weekly cap", () => {
    expect(plan.thisWeek).toBe(87);
    expect(plan.thisWeekCount).toBe(3);
    expect(plan.thisWeekDone).toBe(false);
    // Every fix is a row — nothing is held back by the old 3-task cap.
    expect(plan.rows).toHaveLength(HAIR_TASKS.length);
  });

  test("all This week fixes done: 'Next' is the most urgent fix left (3 new reviews, +4.7)", () => {
    const done = buildFixPlan({ tasks: HAIR_TASKS.map((t) => (t.when === "this_week" ? { ...t, status: "pending_verification" as const } : t)), websiteBanner: null, breakdown: BREAKDOWN });
    expect(done.thisWeekDone).toBe(true);
    expect(done.next?.key).toBe(MERGED_REVIEW_CHECK_ID);
    expect(done.next?.points).toBe(4.7);
  });

  test("the other website checks are one row to the Website page, counted in the running score", () => {
    const withSite = buildFixPlan({ tasks: HAIR_TASKS, websiteBanner: { kind: "improve", score: 90, earned: 27, of: 30, improvements: 2, points: 2.5 }, breakdown: BREAKDOWN });
    const site = withSite.rows.find((r) => r.kind === "website")!;
    expect(site.points).toBe(2.5);
    expect(withSite.rows[withSite.rows.length - 1].running).toBe(100);
  });

  test("setup steps and 0-point tasks never appear", () => {
    const p = buildFixPlan({ tasks: [...HAIR_TASKS, task("setup.connect_gbp", 0, { effort: "setup" })], websiteBanner: null, breakdown: BREAKDOWN });
    expect(p.rows.some((r) => r.key === "setup.connect_gbp")).toBe(false);
  });

  test("'This week' table (spec §2b): owner-only edits this week; customers/Google/time take weeks; a held Google edit takes weeks", () => {
    for (const id of ["visibility.review_replies", "completeness.phone", "completeness.hours", "completeness.photos", "completeness.customer_details", "website.info_consistency", "website.links"]) expect(fixWhen(id)).toBe("this_week");
    for (const id of ["visibility.rating", "completeness.address", "completeness.business_status", "website.has_website", "website.https", "website.performance_mobile", "website.site_freshness"]) expect(fixWhen(id)).toBe("weeks");
    expect(fixWhen("completeness.phone", { pendingGoogleReview: true })).toBe("weeks");
  });
});

describe("Fix plan rows (the step card, Fix plan variant)", () => {
  const row = (t: ActionPlanTask, locked = false, locale: Locale = "en") => wrap(<TaskCard task={t} businessId="b1" context="weekly" step={1} fixPlan={{ priority: "high", running: 89, locked }} />, locale);

  test("priority, tag, one-decimal points and the running score; asking for reviews → 'Get more reviews (in Growth) →'", () => {
    const html = row(HAIR_TASKS[2]);
    expect(text(html)).toContain("High priority");
    expect(text(html)).toContain("Takes a few weeks");
    expect(text(html)).toContain("+4.7 pts");
    expect(text(html)).toMatch(/Score → 89/);
    expect(html).toContain("Get more reviews (in Growth) →");
    expect(text(row(HAIR_TASKS[0]))).toContain("up to +6.8 pts");
    expect(text(row(HAIR_TASKS[0]))).toContain("Takes months");
  });

  test("replies → Reviews; the months rows have no 'I did this'", () => {
    expect(row(HAIR_TASKS[1])).toContain('href="/business/b1/website-reviews#reply-to-reviews"');
    expect(row(HAIR_TASKS[1])).toContain("I did this");
    expect(row(HAIR_TASKS[4])).not.toContain("I did this");
  });

  test("Free: the row and points show, 'Fix it' opens the steps as a locked preview, no 'I did this'", () => {
    const html = row(HAIR_TASKS[3], true);
    expect(text(html)).toContain("+2 pts");
    expect(html).toContain('data-kind="locked"');
    expect(html).not.toContain("I did this");
  });

  test("Spanish (usted)", () => {
    const html = text(row(HAIR_TASKS[2], false, "es"));
    expect(html).toContain("Prioridad alta");
    expect(html).toContain("Toma algunas semanas");
    expect(html).toContain("Puntuación → 89");
    expect(row(HAIR_TASKS[2], false, "es")).toContain("Consiga más reseñas (en Crecimiento) →");
  });
});

describe("Part A: honest review points everywhere", () => {
  test("Overview: never the months rows; This week items first, then Takes a few weeks; the hours mismatch is High", () => {
    const recs = topRecommendations(HAIR_TASKS, null, "b1", {}, Infinity);
    expect(recs.map((r) => r.key)).toEqual(["visibility.review_replies", "website.info_consistency", "completeness.customer_details", MERGED_REVIEW_CHECK_ID]);
    expect(recs.map((r) => r.priority)).toEqual(["high", "high", "medium", "medium"]);
    expect(recommendationPriority(4.7)).toBe("medium");
  });

  test("PostAI and reports name each review row (never one 'Reviews' lump)", () => {
    expect(planTaskName({ ...HAIR_TASKS[2], label: "Reviews" })).toBe("Reviews: Get 3 new reviews in the next 90 days (Takes a few weeks)");
    expect(planTaskName({ ...HAIR_TASKS[4], label: "Reviews" }, "es")).toBe("Reviews: Grow to 40 reviews (Toma meses)");
    expect(planTaskName(HAIR_TASKS[1])).toBe("visibility.review_replies");
  });

  test("the Overview's projection says some fixes take months (EN + ES)", () => {
    const band = (locale: Locale) => text(wrap(<ScoreBand businessId="b1" score={78} grade="C" history={[]} projectedScore={100} projectedGrade="A" biggestBoost={null} someTakeMonths />, locale));
    expect(band("en")).toContain("Some fixes take months (reviews grow over time).");
    expect(band("es")).toContain("Algunas correcciones toman meses (las reseñas crecen con el tiempo).");
  });
});

describe("points read the same everywhere: one decimal under 10, whole from 10 up", () => {
  test("displayPoints and the ranges", async () => {
    const { displayPoints, wholePointRange } = await import("@/lib/pointRange");
    expect([4.7, 0.5, 1.7, 6.8, 9.94, 13.2, 29.6].map(displayPoints)).toEqual([4.7, 0.5, 1.7, 6.8, 9.9, 13, 30]);
    expect(wholePointRange(29.2, 31.4)).toEqual({ low: 29, high: 31 });
  });
});

describe("Part A: Approve {n} tasks · {m} items go to Google", () => {
  const replies = (n: number): WeekRepliesState => ({ status: "ok", items: [], canPost: true, practice: false, more: 0, setText: vi.fn(), setInclude: vi.fn(), ready: Array.from({ length: n }, (_, i) => `r${i}`), post: vi.fn(), load: vi.fn(), redraft: vi.fn(), reload: vi.fn() });
  const post = { status: "ok", text: "Hi", problems: [], flags: [], publish: { canEdit: true, practice: false }, blockedToday: null, latest: null } as unknown as PostDraftState;
  const answers = { status: "ok", data: { canEdit: true }, ready: ["description"] } as unknown as AnswersState;

  test("Hair Express: 10 replies + the post + the answers = 3 tasks, 12 items", () => {
    expect(approveTaskCount({ replies: replies(10), post, answers })).toBe(3);
    expect(approveCount({ replies: replies(10), post, answers })).toBe(12);
  });

  test("the button names the tasks; the line under it counts the items (EN + ES)", () => {
    const en = wrap(<ApproveAll businessId="b1" replies={replies(10)} canEdit practice={false} />);
    expect(en).toMatch(/data-tasks="1"[^>]*>Approve 1 task<\/button>/);
    expect(en).toContain(">10 items go to Google<");
    const es = wrap(<ApproveAll businessId="b1" replies={replies(10)} canEdit practice={false} />, "es");
    expect(es).toContain(">Aprobar 1 tarea<");
    expect(es).toContain(">10 elementos se enviarán a Google<");
  });

  test("no empty gap: 'Will send…' sits right under the title, the button in its own column", () => {
    const html = wrap(<ApproveAll businessId="b1" title={<p>What to do this week</p>} replies={replies(2)} canEdit practice={false} />);
    expect(html.indexOf("What to do this week")).toBeLessThan(html.indexOf("approve-all-what"));
    expect(html.indexOf("approve-all-what")).toBeLessThan(html.indexOf("approve-all-button"));
  });
});

describe("Part A: Overview replies → 'Reply in Reviews →'", () => {
  test("every plan, #reply-to-reviews; Premium keeps the one-click kind", () => {
    const ctx = { businessId: "b1", premium: true, connected: true, practice: false, canEdit: true };
    expect(fixDestination({ checkId: "visibility.review_replies" }, ctx)).toEqual({ kind: "do_it", key: "replyInReviews", href: "/business/b1/website-reviews#reply-to-reviews" });
    expect(fixDestination({ checkId: "visibility.review_replies" }, { ...ctx, premium: false }).href).toBe("/business/b1/website-reviews#reply-to-reviews");
  });
});

describe("Part A: Free sees the hours difference read-only", () => {
  test("both versions, no choice buttons, nothing to write", () => {
    const view = { status: "ok", google: null, googleLines: null, live: false, site: null, builder: null, siteUrl: null, canEdit: false, tab: false } as never;
    const html = wrap(<HoursComparePanel businessId="b1" initialView={view} readOnly />);
    expect(html).toContain('data-readonly="true"');
    expect(html).toContain("version-google");
    expect(html).not.toContain("choice-google");
    expect(html).not.toContain("choice-website");
    expect(html).not.toContain("choice-own");
  });
});

describe("Website page: 'Fix this 1 and your Website goes …'", () => {
  const categories = [{ id: "website", relativeScore: (29 / 30) * 100, weight: 30 }] as never;
  test("the mismatch fix and the other website checks, from the saved scan", () => {
    expect(websiteFixSummary({ breakdown: { total: 78, categories }, websiteBanner: null, tasks: [HAIR_TASKS[5]] })).toEqual({ count: 1, from: 29, to: 29.5, score: 78, after: 79 });
    expect(websiteFixSummary({ breakdown: { total: 78, categories }, websiteBanner: null, tasks: [] })).toBeNull();
  });
  test("only with the new pages (NEW_PAGES_LIVE, or the dev test login)", () => {
    const src = readFileSync("app/business/[id]/website/page.tsx", "utf8");
    expect(src).toContain("(await canOpenNewGooglePages()) ? await loadWebsiteFixLine(params.id) : null");
  });
});

describe("the Fix plan page", () => {
  const page = readFileSync("app/business/[id]/fix-plan/page.tsx", "utf8");
  test("behind NEW_PAGES_LIVE: everyone but the dev test login lands on today's Growth recap", () => {
    expect(page).toContain("if (!(await canOpenNewGooglePages())) redirect(fixPlanHref(params.id));");
  });
  test("reads only: never writes to the database or saves Google data", () => {
    for (const file of ["app/business/[id]/fix-plan/page.tsx", "components/fixPlan/FixPlanView.tsx", "lib/fixPlan.ts", "lib/fixPlan.server.ts"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    }
  });
  test("anchor ids stay (#weekly-plan, #task-…)", () => {
    expect(readFileSync("components/fixPlan/FixPlanView.tsx", "utf8")).toContain('id="weekly-plan"');
    expect(wrap(<TaskCard task={HAIR_TASKS[1]} businessId="b1" fixPlan={{ priority: "high", running: 85, locked: false }} />)).toContain('id="task-visibility-review_replies"');
  });
});

describe("one number per fix: the old recap, the Overview and Fix plan agree on every row", () => {
  // Hair Express-like (Nov 20): 5.0★, 30 reviews, 1 in the last 90 days, 0 of 20 replied, no parking/accessibility.
  const ROW = {
    rating: 5.0, review_count: 30, phone: "1", address: "a", opening_hours: ["Mon: 9–5"], website: "https://hx.example", https_status: "https",
    categories: ["hair_salon"], category: "Hair salon", photo_count: 8, business_status: "OPERATIONAL", primary_type: "hair_salon", name: "HX",
    listing_has_accessibility: false, listing_has_payment: true, listing_has_parking: false, pure_service_area_business: false,
    gbp_reviews_in_window: 20, gbp_replied: 0, gbp_has_recent_review: true, gbp_recent_reviews: 1,
  };

  test("same points for every row, in the data and on screen (EN)", async () => {
    const { businessRowToScoringInput, getScoreWithSuggestions } = await import("@/lib/scoring");
    const ap = await import("@/lib/actionPlan");
    const input = businessRowToScoringInput(ROW as never);
    const { breakdown, suggestions } = getScoreWithSuggestions(input, "en");
    const tasks = ap.applyGrowthWebsiteRules(ap.splitReviewTasks(ap.buildActionPlan(breakdown, suggestions, [], input, "en"), breakdown, input, "en"), input, "en");
    // The old recap: this week's cards + Bigger projects, as the Growth page builds them.
    const weekly = ap.buildWeeklyPlan(tasks, breakdown, input, ap.WEEKLY_PLAN_CAP, "en", [ap.GOOGLE_MISMATCH_CHECK_ID, ...ap.V112_STEP_CHECK_IDS]);
    const recap = new Map([...weekly.weeklyTasks, ...weekly.laterTasks].map((t) => [t.checkId, t.weightedPoints]));
    const overview = new Map(topRecommendations(tasks, null, "b1", {}, Infinity).map((r) => [r.key, r.points]));
    const fixPlan = new Map(buildFixPlan({ tasks, websiteBanner: null, breakdown }).rows.map((r) => [r.key, r.points]));
    expect(fixPlan.get(MERGED_REVIEW_CHECK_ID)).toBe(4.7);
    for (const [id, points] of Array.from(fixPlan)) {
      expect(recap.get(id), `recap ${id}`).toBe(points);
      // The Overview leaves out the rows that take months (only on Fix plan).
      if (overview.has(id)) expect(overview.get(id), `overview ${id}`).toBe(points);
    }
    // On screen: the recap card and the Fix plan row read the same "+4.7".
    const card = weekly.weeklyTasks.find((t) => t.checkId === MERGED_REVIEW_CHECK_ID)!;
    expect(text(wrap(<TaskCard task={card} businessId="b1" context="weekly" />))).toContain("+4.7 pts");
    expect(text(wrap(<TaskCard task={card} businessId="b1" fixPlan={{ priority: "medium", running: 83, locked: false }} />))).toContain("+4.7 pts");
  });

  test("the old recap shows the Fix plan tag (This week / Takes a few weeks / Takes months), EN + ES", () => {
    const html = wrap(<TaskCard task={HAIR_TASKS[2]} businessId="b1" context="weekly" />);
    expect(html).toContain('data-when="weeks"');
    expect(text(html)).toContain("Takes a few weeks");
    expect(text(html)).not.toContain("This week's action");
    expect(text(wrap(<TaskCard task={HAIR_TASKS[1]} businessId="b1" context="weekly" />, "es"))).toContain("Esta semana");
    expect(text(wrap(<TaskCard task={HAIR_TASKS[0]} businessId="b1" context="later" />, "es"))).toContain("Toma meses");
  });
});
