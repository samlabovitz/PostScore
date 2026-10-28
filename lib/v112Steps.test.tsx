import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
vi.mock("@/app/actions/customerDetails", () => ({ setCustomerDetailsOwnerAnswer: vi.fn() }));
import { LocaleProvider, type Locale } from "@/lib/i18n";
import {
  buildActionPlan,
  buildConnectGbpWeeklyTask,
  buildWeeklyPlan,
  connectGoogleHref,
  mergeReviewTasks,
  stepLinks,
  V112_STEP_CHECK_IDS,
  withStepLinks,
  WEEKLY_PLAN_CAP,
  type ActionPlanTask,
} from "@/lib/actionPlan";
import { businessRowToScoringInput, getScoreWithSuggestions, type BusinessScoringInput } from "@/lib/scoring";
import { GOOGLE_LINKS } from "@/lib/googleHelpLinks";
import { TaskCard } from "@/app/business/[id]/ActionPlanSection";
import { CustomerDetailsExtras } from "@/components/scoring/CustomerDetailsExtras";

// Scoring v1.12.0 — the Growth plan's new steps (Day 21 finish).

const render = (node: React.ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );

// A bakery: connected Google, 2 of 20 recent reviews replied to, 1 recent
// review, payment on the listing but no accessibility or parking.
const ROW = {
  rating: 5.0, review_count: 200, phone: "1", address: "a", opening_hours: ["Mon: 9–5"], website: "https://kees.example", https_status: "https",
  categories: ["bakery"], category: "Bakery", photo_count: 12, business_status: "OPERATIONAL", primary_type: "bakery", name: "Kee's",
  listing_has_accessibility: false, listing_has_payment: true, listing_has_parking: false, pure_service_area_business: false,
  gbp_reviews_in_window: 20, gbp_replied: 2, gbp_has_recent_review: true, gbp_recent_reviews: 1,
};

function growthPlan(input: BusinessScoringInput, locale: Locale = "en") {
  const { breakdown, suggestions } = getScoreWithSuggestions(input, locale);
  const tasks = withStepLinks(mergeReviewTasks(buildActionPlan(breakdown, suggestions, [], input, locale), breakdown, input, locale), "b1", locale);
  return buildWeeklyPlan(tasks, breakdown, input, WEEKLY_PLAN_CAP, locale, V112_STEP_CHECK_IDS);
}

describe("this week's plan: the v1.12.0 steps while they lose points", () => {
  const input = businessRowToScoringInput(ROW);
  const weekly = growthPlan(input).weeklyTasks;
  const step = (id: string) => weekly.find((t) => t.checkId === id)!;

  test("each shows with a how-to, a time estimate and links; recency rides on the one reviews card", () => {
    expect(step("visibility.review_replies")).toMatchObject({ title: "Reply to your recent reviews", minutes: 15, automatable: true });
    expect(step("completeness.customer_details")).toMatchObject({ title: "Add your customer details", minutes: 5 });
    // 4.8★ with 200 reviews: only recency loses points among the three → its own card.
    expect(step("visibility.review_recency")).toMatchObject({ title: "Get fresh reviews this month", minutes: 10 });
    for (const id of V112_STEP_CHECK_IDS) {
      expect(step(id).fix.length).toBeGreaterThan(40);
      expect(step(id).links!.length).toBeGreaterThan(0);
      expect(step(id).weightedPoints).toBeGreaterThan(0);
    }
    expect(step("completeness.customer_details").fix).toContain("Google Business Profile → Edit profile → accessibility / payments / parking");
    expect(step("completeness.customer_details").fix).toContain("street parking, or a free or paid lot nearby");
    expect(step("completeness.customer_details").fix).toContain("Payments: list only the ways customers can really pay");
  });

  test("they never push other tasks out (pinned, outside the cap)", () => {
    const { breakdown, suggestions } = getScoreWithSuggestions(input);
    const tasks = mergeReviewTasks(buildActionPlan(breakdown, suggestions, [], input), breakdown, input);
    const unpinned = buildWeeklyPlan(tasks, breakdown, input).weeklyTasks.filter((t) => !V112_STEP_CHECK_IDS.includes(t.checkId)).map((t) => t.checkId);
    const pinned = weekly.filter((t) => !V112_STEP_CHECK_IDS.includes(t.checkId)).map((t) => t.checkId);
    expect(pinned).toEqual(unpinned.filter((id) => !V112_STEP_CHECK_IDS.includes(id)).slice(0, pinned.length));
  });

  test("gone once full: 80%+ replied, 3+ recent reviews, every part on the listing", () => {
    const full = businessRowToScoringInput({ ...ROW, gbp_replied: 17, gbp_recent_reviews: 3, listing_has_accessibility: true, listing_has_parking: true });
    const ids = growthPlan(full).weeklyTasks.map((t) => t.checkId);
    for (const id of V112_STEP_CHECK_IDS) expect(ids).not.toContain(id);
  });

  test("replies only when connected; recency only below 6/6", () => {
    const notConnected = businessRowToScoringInput({ ...ROW, gbp_reviews_in_window: null, gbp_replied: null, gbp_has_recent_review: null, gbp_recent_reviews: null, recent_reviews_seen: 2 });
    const ids = growthPlan(notConnected).weeklyTasks.map((t) => t.checkId);
    expect(ids).not.toContain("visibility.review_replies");
    expect(ids).toContain("visibility.review_recency");
  });

  test("Spanish (usted)", () => {
    const es = growthPlan(input, "es").weeklyTasks;
    expect(es.find((t) => t.checkId === "visibility.review_replies")!.action).toBe("Responda a sus reseñas recientes");
    expect(es.find((t) => t.checkId === "visibility.review_recency")!.action).toBe("Consiga reseñas nuevas este mes");
    expect(es.find((t) => t.checkId === "completeness.customer_details")!.fix).toContain("Perfil de Negocio de Google → Editar perfil → accesibilidad / pagos / estacionamiento");
  });
});

describe("links: PostScore's own tools, then official Google pages only", () => {
  const official = new Set<string>(Object.values(GOOGLE_LINKS));
  test("each step's links", () => {
    expect(stepLinks("visibility.review_replies", "b1").map((l) => l.href)).toEqual(["/business/b1/website-reviews#reply-to-a-review", GOOGLE_LINKS.businessProfileReviews, GOOGLE_LINKS.reviewsHelp]);
    expect(stepLinks("visibility.review_recency", "b1").map((l) => l.href)).toEqual(["/business/b1/website-reviews#get-more-reviews", GOOGLE_LINKS.getReviewsHelp]);
    expect(stepLinks("completeness.customer_details", "b1").map((l) => l.href)).toEqual([GOOGLE_LINKS.businessProfile, GOOGLE_LINKS.attributesHelp]);
    for (const id of V112_STEP_CHECK_IDS) {
      for (const link of stepLinks(id, "b1")) expect(link.external ? official.has(link.href) : link.href.startsWith("/business/b1/")).toBe(true);
    }
  });

  test("Spanish help articles open in Spanish", () => {
    expect(stepLinks("completeness.customer_details", "b1", "es")[1].href).toBe(`${GOOGLE_LINKS.attributesHelp}?hl=es`);
  });

  test("the drafter and review-link anchors exist on the Reviews page", async () => {
    const fs = await import("node:fs");
    expect(fs.readFileSync("components/reviews/ReviewReplyDrafter.tsx", "utf8")).toContain('id="reply-to-a-review"');
    expect(fs.readFileSync("app/business/[id]/website-reviews/ReviewsView.tsx", "utf8")).toContain('id="get-more-reviews"');
  });
});

describe("Connect Google — a setup step that unlocks replies and exact recency", () => {
  test("where each plan connects", () => {
    expect(connectGoogleHref("b1", "free")).toBe("/business/b1#reply-check");
    expect(connectGoogleHref("b1", "grow")).toBe("/business/b1/website-reviews#reply-check");
    expect(connectGoogleHref("b1", "premium")).toBe("/business/b1/connect-gbp");
    expect(connectGoogleHref("b1", "multi")).toBe("/business/b1/connect-gbp");
  });

  test("explains what it unlocks; a link, never \"I did this\" or points", () => {
    const task = buildConnectGbpWeeklyTask("b1", "en", "grow");
    expect(task.why).toContain("reply rate");
    expect(task.why).toContain("exact count of your recent reviews");
    const html = render(<TaskCard task={task} businessId="b1" context="weekly" step={4} />);
    expect(html).toContain('href="/business/b1/website-reviews#reply-check"');
    expect(html).toContain("Connect Google");
    expect(html).not.toContain("I did this");
    expect(html).not.toContain("pts");
    expect(render(<TaskCard task={buildConnectGbpWeeklyTask("b1", "es", "premium")} businessId="b1" context="weekly" />, "es")).toContain("Conectar Google");
  });
});

describe("the step card", () => {
  const input = businessRowToScoringInput(ROW);
  const replies = growthPlan(input).weeklyTasks.find((t) => t.checkId === "visibility.review_replies")! as ActionPlanTask;

  test("time estimate and links; Google links open in a new tab", () => {
    const html = render(<TaskCard task={replies} businessId="b1" context="weekly" step={1} />);
    expect(html).toContain("About 15 min");
    expect(html).toContain('href="/business/b1/website-reviews#reply-to-a-review"');
    expect(html).toContain(`href="${GOOGLE_LINKS.businessProfileReviews}" target="_blank" rel="noopener noreferrer"`);
    expect(html).not.toContain("Coming soon");
  });

  test("Premium: \"Coming soon: PostScore can do this for you\" — a label, never a button", () => {
    const html = render(<TaskCard task={replies} businessId="b1" context="weekly" premium />);
    expect(html).toMatch(/<p data-testid="step-coming-soon"[^>]*>Coming soon: PostScore can do this for you<\/p>/);
    expect(render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, "es")).toContain("Próximamente: PostScore podrá hacerlo por usted");
    const photos = { ...replies, checkId: "completeness.photos", automatable: false, links: [] };
    expect(render(<TaskCard task={photos} businessId="b1" context="weekly" premium />)).not.toContain("Coming soon");
  });
});

describe("customer details row: the owner's answers", () => {
  const meta = (extra: Record<string, string> = {}) => ({ meta: { parts: "accessibility,payment,parking", ownerRemoved: "", ownerCanRemove: "payment,parking", ...extra } });

  test("\"No parking available\" and no payments on site — labeled \"Added by you\" once set", () => {
    const html = render(<CustomerDetailsExtras check={meta()} businessId="b1" />);
    expect(html).toContain("No parking available");
    expect(html).toContain("We take no payments on site");
    expect(html).not.toContain("Added by you");
    const set = render(<CustomerDetailsExtras check={meta({ parts: "accessibility,payment", ownerRemoved: "parking" })} businessId="b1" />);
    expect(set).toMatch(/checked=""[^>]*\/><span>No parking available/);
    expect(set).toContain("Added by you");
    expect(render(<CustomerDetailsExtras check={meta({ ownerRemoved: "parking" })} businessId="b1" />, "es")).toContain("Agregado por usted");
  });

  test("an office (accessibility only) gets no answers to give; read-only without a business", () => {
    expect(render(<CustomerDetailsExtras check={{ meta: { parts: "accessibility", ownerRemoved: "", ownerCanRemove: "" } }} businessId="b1" />)).not.toContain("type=\"checkbox\"");
    expect(render(<CustomerDetailsExtras check={meta()} />)).not.toContain("type=\"checkbox\"");
  });
});

// ---------------------------------------------------------------------
// Gregg L. Smith fixes (Day 21): how-to per row, one reviews card,
// action titles, photos, Check again, plan-done celebration.
// ---------------------------------------------------------------------
import { checkHowTo, CHECK_MINUTES, MERGED_REVIEW_CHECK_ID, officialLinksFor, timeEstimateText } from "@/lib/actionPlan";
import { CHECKS_V112, scoreBusiness } from "@/lib/scoring";
import { normalizeDetails } from "@/lib/google/places";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import { breakdownFixLinks } from "@/components/overview/ScoreBreakdownPanel";
import { planDoneMessage } from "@/app/business/[id]/growth/WeeklyPlanCelebration";
import { parseWeekPlan, planStepIds, weekPlanDone } from "@/lib/celebrate";

// Gregg L. Smith as scanned: a law office, 4.0★ / 28 reviews, no hours,
// no photos, recency not confirmable, not connected.
const GREGG = {
  rating: 4.0, review_count: 28, phone: "1", address: "a", opening_hours: null, website: "https://glscrimlaw.example", https_status: "https",
  categories: ["lawyer"], category: "Lawyer", photo_count: 0, business_status: "OPERATIONAL", primary_type: "lawyer", name: "Law Offices of Gregg L. Smith",
  listing_has_accessibility: false, listing_has_payment: false, listing_has_parking: false, pure_service_area_business: false, recent_reviews_seen: 0,
};

describe("every Needs work row: its own How to fix it", () => {
  const breakdown = scoreBusiness(businessRowToScoringInput(GREGG));
  const links = breakdownFixLinks(breakdown.categories, "b1", "en");

  test("steps, a time and verified official links; the PostScore page stays secondary", () => {
    expect(links["completeness.hours"].howTo).toMatchObject({ minutes: 5, links: [{ href: GOOGLE_LINKS.businessProfile }, { href: GOOGLE_LINKS.editProfileHelp }] });
    expect(links["completeness.hours"].howTo!.steps.length).toBeGreaterThan(30);
    const html = render(<CategoryCard category={breakdown.categories.find((c) => c.id === "completeness")!} embedded fixLinks={links} businessId="b1" />);
    expect(html).toContain("How to fix it");
    expect(html).toContain("About 5 min");
    expect(html).toContain(`href="${GOOGLE_LINKS.editProfileHelp}" target="_blank" rel="noopener noreferrer"`);
    expect(html).toContain(`href="${links["completeness.hours"].href}"`);
    expect(html.indexOf("How to fix it")).toBeLessThan(html.indexOf(`href="${links["completeness.hours"].href}"`));
  });

  test("every v1.12.0 check has a time; every official link is a verified one (EN + ES)", () => {
    const verified = new Set<string>(Object.values(GOOGLE_LINKS));
    for (const def of CHECKS_V112) {
      expect(CHECK_MINUTES[def.id], def.id).toBeGreaterThan(0);
      for (const l of officialLinksFor(def.id, "en")) expect(verified.has(l.href), l.href).toBe(true);
      for (const l of officialLinksFor(def.id, "es")) expect(verified.has(l.href.replace("?hl=es", "")), l.href).toBe(true);
    }
    // Google has no page for website content — no invented link.
    expect(officialLinksFor("website.about_presence")).toEqual([]);
    expect(timeEstimateText(120, "en")).toBe("About 2 hr");
    expect(timeEstimateText(15, "es")).toBe("Unos 15 min");
  });

  test("customer details: an office sees accessibility only — no parking or payment notes; EN + ES", () => {
    const cd = breakdown.checks.find((c) => c.id === "completeness.customer_details")!;
    expect(checkHowTo(cd, "en").steps).toBe("On Google: Google Business Profile → Edit profile → accessibility. Add only what's true.");
    expect(checkHowTo(cd, "es").steps).toBe("En Google: Perfil de Negocio de Google → Editar perfil → accesibilidad. Agregue solo lo que sea cierto.");
    const { suggestions } = getScoreWithSuggestions(businessRowToScoringInput(GREGG));
    expect(suggestions.find((s) => s.checkId === "completeness.customer_details")!.advice).toBe("Add it on Google: Google Business Profile → Edit profile → accessibility.");
    // A bakery: all three, with the payment and parking notes.
    const bakery = scoreBusiness(businessRowToScoringInput(ROW)).checks.find((c) => c.id === "completeness.customer_details")!;
    expect(checkHowTo(bakery).steps).toContain("→ accessibility / payments / parking.");
    expect(checkHowTo(bakery).steps).toContain("street parking");
    // A plumber: no row at all.
    expect(scoreBusiness(businessRowToScoringInput({ ...GREGG, categories: ["plumber"], category: "Plumber", primary_type: "plumber", name: "Joe's Plumbing" })).checks.some((c) => c.id === "completeness.customer_details")).toBe(false);
  });
});

describe("one \"Get fresh reviews\" card for review count, star rating and recency", () => {
  const input = businessRowToScoringInput(GREGG);
  const weekly = growthPlan(input).weeklyTasks;
  const card = weekly.find((t) => t.checkId === MERGED_REVIEW_CHECK_ID)!;

  test("Helps with all three — recency too while it can't be confirmed — and never a separate recency card", () => {
    expect(card.title).toBe("Get fresh reviews");
    expect(card.mergedLabels).toEqual(["Review count", "Star rating", "Review recency"]);
    expect(card.mergedCheckIds).toEqual(["visibility.review_count", "visibility.rating"]);
    expect(card.fixAlsoCovers).toEqual(["visibility.review_recency"]);
    expect(weekly.some((t) => t.checkId === "visibility.review_recency")).toBe(false);
  });

  test("one combined estimate from the same projection, shown \"Up to +N pts\"", () => {
    const { breakdown } = getScoreWithSuggestions(input);
    const without = buildWeeklyPlan([{ ...card, fixAlsoCovers: [] }], breakdown, input).weeklyTasks[0].weightedPoints;
    const alone = buildWeeklyPlan([card], breakdown, input);
    expect(alone.weeklyTasks[0].weightedPoints).toBeGreaterThan(without);
    expect(alone.weeklyTasks[0].weightedPoints).toBe(alone.weeklyPointsWithinReach);
    const html = render(<TaskCard task={card} businessId="b1" context="weekly" step={1} />);
    expect(html).toMatch(/Up to \+\d+ pts/);
    expect(html).toContain("Review count, Star rating, Review recency");
    expect(render(<TaskCard task={growthPlan(input, "es").weeklyTasks.find((t) => t.checkId === MERGED_REVIEW_CHECK_ID)!} businessId="b1" context="weekly" />, "es")).toContain("Consiga reseñas nuevas");
  });

  test("only one losing points: its own card", () => {
    const onlyRecency = businessRowToScoringInput({ ...ROW, gbp_recent_reviews: 1 });
    const ids = growthPlan(onlyRecency).weeklyTasks.map((t) => t.checkId);
    expect(ids).toContain("visibility.review_recency");
    expect(ids).not.toContain(MERGED_REVIEW_CHECK_ID);
  });
});

describe("card titles are the action; the check name is a small label", () => {
  const weekly = growthPlan(businessRowToScoringInput(GREGG)).weeklyTasks;
  test("Add your business hours (Business hours)", () => {
    const hours = weekly.find((t) => t.checkId === "completeness.hours")!;
    const html = render(<TaskCard task={hours} businessId="b1" context="weekly" />);
    expect(html).toMatch(/<h3[^>]*>Add your business hours<\/h3>/);
    expect(html).toContain('data-testid="task-check-label" class="w-full text-[11.5px] text-ink-mute">Business hours</span>');
    expect(render(<TaskCard task={growthPlan(businessRowToScoringInput(GREGG), "es").weeklyTasks.find((t) => t.checkId === "completeness.hours")!} businessId="b1" context="weekly" />, "es")).toMatch(/<h3[^>]*>Agregue su horario<\/h3>/);
  });
  test("never the title twice", () => {
    const replies = growthPlan(businessRowToScoringInput(ROW)).weeklyTasks.find((t) => t.checkId === "visibility.review_replies")!;
    const html = render(<TaskCard task={replies} businessId="b1" context="weekly" />);
    expect(html.split("Reply to your recent reviews").length - 1).toBe(1);
  });
});

describe("photos: a listing Google returns with no photos is 0/4, needs work", () => {
  test("no `photos` in Google's answer = 0 photos, never \"couldn't check\" — EN + ES", () => {
    expect(normalizeDetails({ id: "p" }).photoCount).toBe(0);
    const photos = scoreBusiness(businessRowToScoringInput(GREGG)).checks.find((c) => c.id === "completeness.photos")!;
    expect(photos).toMatchObject({ earnedPoints: 0, maxPoints: 4, confidence: "VERIFIED", explanation: "No photos on your listing." });
    expect(scoreBusiness(businessRowToScoringInput(GREGG), "es").checks.find((c) => c.id === "completeness.photos")!.explanation).toBe("No hay fotos en su ficha.");
  });
});

describe("Check again", () => {
  const hours = growthPlan(businessRowToScoringInput(GREGG)).weeklyTasks.find((t) => t.checkId === "completeness.hours")!;
  const pending = { ...hours, status: "pending_verification" as const, markedDoneAt: "2026-10-20T12:00:00Z", markedPromisedPoints: hours.promisedPoints };
  test("checked, no change yet: same status, \"Check again\" and the Google-delay line — EN + ES", () => {
    const html = render(<TaskCard task={pending} businessId="b1" context="weekly" lastScanAt="2026-10-27T12:00:00Z" />);
    expect(html).toContain("Checked — no change yet");
    expect(html).toContain("Check again");
    expect(html).not.toContain("I did this again");
    expect(html).toContain("Changes on Google can take a few days — we&#x27;ll also re-check on your next scan.");
    const es = render(<TaskCard task={pending} businessId="b1" context="weekly" lastScanAt="2026-10-27T12:00:00Z" />, "es");
    expect(es).toContain("Comprobar de nuevo");
    expect(es).toContain("Los cambios en Google pueden tardar unos días");
  });
  test("not re-checked yet: no button, no line", () => {
    const html = render(<TaskCard task={pending} businessId="b1" context="weekly" lastScanAt="2026-10-19T12:00:00Z" />);
    expect(html).not.toContain("Check again");
    expect(html).not.toContain("can take a few days");
  });
  test("\"Check again\" is the same server call as \"I did this\" (no new path around it)", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("app/business/[id]/ActionPlanSection.tsx", "utf8");
    expect(src.match(/markTaskDone\(businessId, checkId\)/g)).toHaveLength(1);
  });
});

describe("This week's plan is done", () => {
  const plan = { steps: ["completeness.hours", "visibility.review_count", "visibility.rating", "setup.connect_gbp"], start: 67, setAt: "2026-10-26T12:00:00Z" };
  const done = (id: string, at = "2026-10-28T09:00:00Z") => ({ checkId: id, verifiedAt: at });
  const all = [done("completeness.hours"), done("visibility.review_count"), done("visibility.rating")];

  test("only when every step is confirmed by a re-check after the plan was set", () => {
    expect(weekPlanDone(plan, { completed: all, gbpConnected: true, score: 76, lastScanAt: "2026-10-28T09:00:00Z" })).toEqual({ diff: 9 });
    // Google not connected yet → not done.
    expect(weekPlanDone(plan, { completed: all, gbpConnected: false, score: 76, lastScanAt: "2026-10-28T09:00:00Z" })).toBeNull();
    // One step only clicked (no confirmed completion) → not done.
    expect(weekPlanDone(plan, { completed: all.slice(1), gbpConnected: true, score: 76, lastScanAt: "2026-10-28T09:00:00Z" })).toBeNull();
    // Confirmed before this week's plan → doesn't count.
    expect(weekPlanDone(plan, { completed: [done("completeness.hours", "2026-10-20T00:00:00Z"), ...all.slice(1)], gbpConnected: true, score: 76, lastScanAt: "2026-10-28T09:00:00Z" })).toBeNull();
    // No re-scan since → not done.
    expect(weekPlanDone(plan, { completed: all, gbpConnected: true, score: 76, lastScanAt: "2026-10-25T00:00:00Z" })).toBeNull();
  });

  test("the real change only — EN + ES", () => {
    expect(planDoneMessage(9, "en")).toBe("This week's plan is done! Your score is up 9 points.");
    expect(planDoneMessage(1, "en")).toBe("This week's plan is done! Your score is up 1 point.");
    expect(planDoneMessage(0, "en")).toBe("This week's plan is done — great work.");
    expect(planDoneMessage(-2, "en")).toBe("This week's plan is done — great work.");
    expect(planDoneMessage(4, "es")).toBe("¡Terminó el plan de esta semana! Su puntuación subió 4 puntos.");
  });

  test("a merged card stands for its real checks; a bad record is ignored", () => {
    expect(planStepIds([{ checkId: MERGED_REVIEW_CHECK_ID, mergedCheckIds: ["visibility.review_count", "visibility.rating"] }, { checkId: "completeness.hours", mergedCheckIds: null }])).toEqual(["visibility.review_count", "visibility.rating", "completeness.hours"]);
    expect(parseWeekPlan("not json")).toBeNull();
    expect(parseWeekPlan(JSON.stringify({ steps: [], start: 1, setAt: "x" }))).toBeNull();
  });

  test("once per week's plan, reduce motion respected, and it takes the goal toast's slot", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("app/business/[id]/growth/WeeklyPlanCelebration.tsx", "utf8");
    expect(src).toContain('claimCelebration(celebrationKey("plan", businessId, weekStart))');
    expect(src).toContain("if (!prefersReducedMotion())");
    expect(src).toContain('claimCelebration(celebrationKey("goal", businessId, weekStart))');
    const view = fs.readFileSync("app/business/[id]/growth/GrowthView.tsx", "utf8");
    expect(view.indexOf("<WeeklyPlanCelebration")).toBeLessThan(view.indexOf("<WeeklyGoalCelebration"));
  });
});
