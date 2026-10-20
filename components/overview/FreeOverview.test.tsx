import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { NO_FACTS, type PromoFacts } from "@/lib/upgradePromos";
import { FREE_RESCAN_DAYS, rescanGate } from "@/lib/rescanPolicy";
import type { Plan } from "@/lib/plan";
import type { CheckResult, Suggestion } from "@/lib/scoring";
import type { UpgradeContextData } from "@/lib/upgradePromos.server";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { costsText, firstStep, FreePostAIPreview, FreeReviewFocus, HoldingBack, RankUnlockLine } from "./FreeOverview";

const FACTS: PromoFacts = { ...NO_FACTS, businessName: "Test Salon", score: 37, rank: 6, total: 8, reviewCount: 10, reviewAvg: 84, competitorNoun: "salons", websiteFailed: 4, builderName: "Wix", issueCount: 5 };
const ctx = (plan: Plan, facts = FACTS): UpgradeContextData => ({ businessId: "b1", plan, facts, strip: null });
const render = (node: React.ReactNode, plan: Plan = "free", locale: "en" | "es" = "en", facts = FACTS) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <UpgradeProvider value={ctx(plan, facts)}>{node}</UpgradeProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const check = (id: string, category: CheckResult["category"], max: number, earned: number, explanation: string): CheckResult => ({ id, label: id, category, maxPoints: max, earnedPoints: earned, confidence: "VERIFIED", explanation, meta: null });
const CHECKS = [
  check("completeness.hours", "completeness", 5, 0, "Google shows no opening hours for your business."),
  check("visibility.review_count", "visibility", 10, 4, "You have 10 reviews."),
  check("website.https", "website", 4, 0, "Your website isn't secure (no HTTPS)."),
  check("website.content_depth", "website", 5, 4.5, "Your homepage is thin."),
];
const SUGGESTIONS: Suggestion[] = [
  { checkId: "visibility.review_count", category: "visibility", label: "More Google reviews", promisedPoints: 6, advice: "Ask every customer for a review this week. Send them your link." },
  { checkId: "completeness.hours", category: "completeness", label: "Opening hours", promisedPoints: 5, advice: "Add your hours in Google Business Profile. Open the Info tab." },
  { checkId: "website.https", category: "website", label: "Secure website (HTTPS)", promisedPoints: 4, advice: "Turn on SSL in Wix. Go to Settings." },
  { checkId: "website.content_depth", category: "website", label: "Homepage content", promisedPoints: 0.5, advice: "Add a paragraph about your services." },
];

describe("Free re-scan: 1 a month (+ the first scan), on top of the 24-hour rule", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  test("an owner re-scan in the last 30 days blocks the next one until 30 days after it", () => {
    const gate = rescanGate(true, "2026-10-05T09:00:00Z", "2026-10-05T09:00:00Z", now);
    expect(gate).toEqual({ allowed: false, nextAvailableAt: "2026-11-04T09:00:00.000Z", limit: "monthly" });
    expect(FREE_RESCAN_DAYS).toBe(30);
  });
  test("allowed again after 30 days; never re-scanned (just the first scan) → allowed", () => {
    expect(rescanGate(true, "2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z", now)).toEqual({ allowed: true, nextAvailableAt: null, limit: null });
    expect(rescanGate(true, "2026-10-01T00:00:00Z", null, now).allowed).toBe(true);
  });
  test("the 24-hour rule still applies on Free; Grow+ ignore the monthly limit", () => {
    expect(rescanGate(true, "2026-10-20T06:00:00Z", null, now).limit).toBe("daily");
    expect(rescanGate(false, "2026-10-10T00:00:00Z", "2026-10-19T00:00:00Z", now)).toEqual({ allowed: true, nextAvailableAt: null, limit: null });
    expect(rescanGate(false, "2026-10-20T06:00:00Z", "2026-10-19T00:00:00Z", now).limit).toBe("daily");
  });
  test("the server checks the gate BEFORE any Google call, and logs each owner re-scan", () => {
    const src = readFileSync("app/actions/scoring.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function rescanBusiness("), src.indexOf("export async function rescanBusinessWithClient("));
    expect(fn.indexOf("rescanGate(")).toBeGreaterThan(0);
    expect(fn.indexOf("rescanGate(")).toBeLessThan(fn.indexOf("rescanBusinessWithClient("));
    expect(fn).toMatch(/if \(!gate\.allowed\) return \{ status: "too_soon"/);
    expect(fn).toMatch(/if \(result\.status === "ok"\) await logOwnerRescan\(businessId\)/);
    // The month's Places search cap counts competitor searches only.
    expect(readFileSync("lib/placesSearchBudget.server.ts", "utf8")).toContain('.eq("kind", "competitor_scan")');
  });
});

describe("Free makes no paid calls from the Overview", () => {
  test("the Overview page loads nothing that calls Google, PageSpeed or the AI", () => {
    const page = readFileSync("app/business/[id]/page.tsx", "utf8");
    for (const paid of ["lookupBusinessByPlaceId", "rescanBusiness", "runAndSaveCompetitorScan", "ensureFirstCompetitorScan", "refreshCompetitors", "callAnthropic", "sendAssistantMessage", "recheckWebsite", "assessPricing", "pagespeed", "searchNearby"])
      expect(page, paid).not.toMatch(new RegExp(paid, "i"));
  });
  test("on Free the Overview renders the PostAI preview, never the launcher; Grow+ keep every section", () => {
    const view = readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
    expect(view).toMatch(/\{free \? \(\s*<FreePostAIPreview[\s\S]*?\) : assistant\.status === "ok" \? \(\s*<AssistantLauncher/);
    expect(view).toMatch(/\{free \? \(\s*<FreeReviewFocus[\s\S]*?\) : \(\s*<GrowMoreCustomers/);
    expect(view).toMatch(/\{free \? \(\s*<HoldingBack[\s\S]*?\) : \(\s*<TopRecommendations/);
    expect(view).toContain('const free = plan === "free";');
    expect(view).toContain("useRescan(businessId, lastScanAt, now, free ? freeRescanNextAt : null)");
  });
  test("PostAI can't be sent on Free: the server refuses before any AI call", () => {
    const src = readFileSync("app/actions/assistant.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function sendAssistantMessage("));
    const guard = fn.indexOf('if (getPlan() === "free") return');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(fn.indexOf("callAnthropicChat("));
  });
  test("the PostAI preview can't send anything (no form, no input)", () => {
    const html = render(<FreePostAIPreview starterPrompts={["Why is my score 37?", "How do I get more reviews?"]} />);
    expect(html).not.toMatch(/<form|<textarea|<input/);
    expect(text(html)).toContain("Why is my score 37?");
    expect(text(html)).toContain("Ask PostAI anything about your score and what to fix first — with Grow.");
  });
});

describe("LockedPreview", () => {
  test("the real content, read-only and faded, a lock, the unlock line and a closed promo trigger", () => {
    const html = render(
      <LockedPreview title="How to fix it: Opening hours" unlock="Your plan for this week is ready. Unlock it with Grow.">
        <a href="/x">Open the Info tab</a>
      </LockedPreview>
    );
    expect(html).toMatch(/<div inert="" aria-hidden="true" data-testid="locked-preview-content"/);
    expect(html).toContain("bg-gradient-to-b");
    expect(text(html)).toContain("Preview of How to fix it: Opening hours. Part of Grow.");
    expect(text(html)).toContain("Your plan for this week is ready. Unlock it with Grow.");
    expect(text(html)).toContain("Unlock with Grow");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="promo-box"');
  });
  test("no data → no unlock line (the lock control stays)", () => {
    const html = render(<LockedPreview title="X" unlock={null}>x</LockedPreview>);
    expect(html).toContain('data-testid="upgrade-trigger"');
    expect(html).not.toMatch(/<p class="text-\[13px\] leading-snug text-ink">/);
  });
  test("Spanish", () => {
    expect(text(render(<LockedPreview title="Horario" unlock={null}>x</LockedPreview>, "free", "es"))).toContain("Desbloquear con Grow");
  });
});

describe("What's holding your score back", () => {
  test("the top 3 real issues, what's wrong and what each costs; fixes stay closed until asked for", () => {
    const html = render(<HoldingBack suggestions={SUGGESTIONS} checks={CHECKS} />);
    const t = text(html);
    expect(t).toContain("What's holding your score back");
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(t).toContain("More Google reviews");
    expect(t).toContain("Costs you 6 pts");
    expect(t).toContain("Google shows no opening hours for your business.");
    expect(t).not.toContain("Homepage content");
    expect(t).toContain("How to fix it");
    // Never HOW to fix it unless opened (and then only as a locked preview).
    expect(t).not.toContain("Ask every customer for a review this week.");
    expect(html).not.toContain("locked-preview");
  });
  test("helpers: the first step, and whole points", () => {
    expect(firstStep("Turn on SSL in Wix. Go to Settings.")).toBe("Turn on SSL in Wix.");
    expect(firstStep("No period here")).toBe("No period here");
    expect(costsText(6.4, "en")).toBe("Costs you 6 pts");
    expect(costsText(1.2, "en")).toBe("Costs you 1 pt");
    expect(costsText(0.5, "es")).toBe("Le cuesta 0.5 pts");
  });
  test("nothing costing points → says so", () => {
    expect(text(render(<HoldingBack suggestions={[]} checks={[]} />))).toContain("Nothing is costing you points right now.");
  });
});

describe("reviews and rank on Free", () => {
  test("the review gap, with real numbers, when they trail", () => {
    const html = render(<FreeReviewFocus businessId="b1" reviewCount={10} nearbyAverage={83.6} competitorNoun="salons" />);
    expect(html).toContain('data-trailing="true"');
    expect(text(html)).toContain("You have 10 Google reviews. Nearby salons average 84 — 74 more than you.");
    expect(html).toContain('href="/business/b1/website-reviews#get-more-reviews"');
  });
  test("ahead or no data → no gap claimed", () => {
    expect(render(<FreeReviewFocus businessId="b1" reviewCount={120} nearbyAverage={84} competitorNoun="salons" />)).not.toContain("data-trailing");
    const none = text(render(<FreeReviewFocus businessId="b1" reviewCount={10} nearbyAverage={null} competitorNoun={null} />));
    expect(none).not.toMatch(/average|more than you/);
  });
  test("Spanish (usted)", () => {
    expect(text(render(<FreeReviewFocus businessId="b1" reviewCount={1} nearbyAverage={20} competitorNoun="salones" />, "free", "es"))).toContain("Usted tiene 1 reseña en Google. Los salones cercanos tienen 20 en promedio: 19 más que usted.");
  });
  test("'You're #N of M nearby' only when they trail", () => {
    expect(text(render(<RankUnlockLine />))).toContain("You're #6 of 8 nearby. See what's holding you back with Grow.");
    expect(render(<RankUnlockLine />, "free", "en", { ...FACTS, rank: 1 })).toBe("");
    expect(render(<RankUnlockLine />, "free", "en", NO_FACTS)).toBe("");
  });
});
