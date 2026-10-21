import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/websiteScreenshots", () => ({ refreshWebsiteScreenshots: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));

import { LocaleProvider } from "@/lib/i18n";
import { NO_FACTS, type PromoFacts } from "@/lib/upgradePromos";
import { FREE_RESCAN_DAYS, rescanGate } from "@/lib/rescanPolicy";
import type { Plan } from "@/lib/plan";
import type { ReviewGoal } from "@/lib/competitorComparison";
import type { UpgradeContextData } from "@/lib/upgradePromos.server";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { GrowMoreCustomers } from "./GrowMoreCustomers";
import { fixesSummary, FreePostAIShowroom, FreeReviews, RankUnlockLine, UnlockMore } from "./FreeOverview";

const FACTS: PromoFacts = { ...NO_FACTS, businessName: "Test Salon", score: 37, rank: 6, total: 8, reviewCount: 10, reviewAvg: 57, competitorNoun: "salons", websiteFailed: 4, builderName: "Wix", issueCount: 5, fixPoints: 18 };
const ctx = (plan: Plan, facts = FACTS): UpgradeContextData => ({ businessId: "b1", plan, facts, cards: [] });
const render = (node: React.ReactNode, plan: Plan = "free", locale: "en" | "es" = "en", facts = FACTS) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <UpgradeProvider value={ctx(plan, facts)}>{node}</UpgradeProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const rival = (name: string, reviewCount: number) => ({ name, reviewCount, rating: null });
const BEAT: ReviewGoal = { kind: "beat", average: 57, leader: rival("Leader Salon", 90), ownCount: 10, gap: 80, nextUp: null, runnerUp: null };
const LEAD: ReviewGoal = { kind: "lead", average: 57, leader: rival("Test Salon", 120), ownCount: 120, gap: 30, nextUp: null, runnerUp: rival("Runner Salon", 90) };
const VIEW = () => readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");

describe("Free re-scan: 1 a month (+ the first scan), on top of the 24-hour rule", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  test("an owner re-scan in the last 30 days blocks the next one until 30 days after it", () => {
    expect(rescanGate(true, "2026-10-05T09:00:00Z", "2026-10-05T09:00:00Z", now)).toEqual({ allowed: false, nextAvailableAt: "2026-11-04T09:00:00.000Z", limit: "monthly" });
    expect(FREE_RESCAN_DAYS).toBe(30);
  });
  test("allowed after 30 days, and when only the first scan exists; Grow+ ignore it; 24h still applies", () => {
    expect(rescanGate(true, "2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z", now).allowed).toBe(true);
    expect(rescanGate(true, "2026-10-01T00:00:00Z", null, now).allowed).toBe(true);
    expect(rescanGate(false, "2026-10-10T00:00:00Z", "2026-10-19T00:00:00Z", now).allowed).toBe(true);
    expect(rescanGate(true, "2026-10-20T06:00:00Z", null, now).limit).toBe("daily");
  });
  test("the server checks the gate BEFORE any Google call, and logs each owner re-scan", () => {
    const src = readFileSync("app/actions/scoring.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function rescanBusiness("), src.indexOf("export async function rescanBusinessWithClient("));
    expect(fn.indexOf("rescanGate(")).toBeLessThan(fn.indexOf("rescanBusinessWithClient("));
    expect(fn).toMatch(/if \(result\.status === "ok"\) await logOwnerRescan\(businessId\)/);
  });
});

describe("the Free Overview (the audit)", () => {
  test("its own layout, in order: score, open breakdown, reviews (biggest lever), More customers (locked tiles + both unlock buttons), PostAI showroom, rank, Unlock more — then the Grow + Premium cards from the shell", () => {
    const view = VIEW();
    const free = view.slice(view.indexOf("if (free) {"), view.indexOf("  return (\n    <div className=\"flex flex-col gap-5 nav:gap-6\">"));
    const order = ["<ScoreBand", "freeWaitingPoints=", "<ScoreBreakdownPanel", "audit", "<FreeReviews", "<GrowMoreCustomers", "locked", "<FreePostAIShowroom", "<LocalBenchmarkTile", "<RankUnlockLine", "<UnlockMore"];
    let at = -1;
    for (const piece of order) {
      const i = free.indexOf(piece, at + 1);
      expect(i, piece).toBeGreaterThan(at);
      at = i;
    }
    // None of the plan-only pieces run on Free.
    for (const live of ["<AssistantLauncher", "<TopRecommendations", "<StudioComingSoon", "<LiveListingSection", "<SinceLastScanCard"]) expect(free, live).not.toContain(live);
    expect(free).toContain("biggestBoost={null}");
    // Each section once; the reviews section is the working free tools.
    for (const piece of ["<FreeReviews", "<GrowMoreCustomers", "<FreePostAIShowroom", "<UnlockMore"]) expect(free.split(piece).length - 1, piece).toBe(1);
    expect(readFileSync("components/overview/GrowMoreCustomers.tsx", "utf8")).toContain('<UpgradeTrigger feature="grow" variant="pair" />');
    // The Grow + Premium cards follow the page (DashboardShell, after children).
    const shell = readFileSync("components/layout/DashboardShell.tsx", "utf8");
    expect(shell.indexOf("{children}")).toBeLessThan(shell.indexOf("<PromoCards />"));
  });
  test("Grow and above keep the Overview exactly as before", () => {
    const view = VIEW();
    const grow = view.slice(view.indexOf("  return (\n    <div className=\"flex flex-col gap-5 nav:gap-6\">"));
    for (const live of ["<AssistantLauncher", "<GrowMoreCustomers", "<TopRecommendations", "<SinceLastScanCard", "<StudioComingSoon", "<LiveListingSection", "<ScanHistory"]) expect(grow, live).toContain(live);
    expect(grow).not.toContain("locked");
  });
  test("the page loads nothing that calls Google, PageSpeed or the AI", () => {
    const page = readFileSync("app/business/[id]/page.tsx", "utf8");
    for (const paid of ["lookupBusinessByPlaceId", "rescanBusiness", "runAndSaveCompetitorScan", "ensureFirstCompetitorScan", "refreshCompetitors", "callAnthropic", "sendAssistantMessage", "recheckWebsite", "assessPricing", "pagespeed", "searchNearby"])
      expect(page, paid).not.toMatch(new RegExp(paid, "i"));
  });
  test("PostAI can't be sent on Free: the server refuses before any AI call", () => {
    const fn = readFileSync("app/actions/assistant.ts", "utf8");
    const send = fn.slice(fn.indexOf("export async function sendAssistantMessage("));
    expect(send.indexOf('if ((await getPlan()) === "free") return')).toBeLessThan(send.indexOf("callAnthropicChat("));
  });
});

describe("LockedPreview — advice is never in the page", () => {
  test("only the title, a lock, a real count and the unlock line are text; the rest is blurred shapes", () => {
    const html = render(<LockedPreview title="Your action plan" summary="5 fixes · 18 pts" unlock="Your plan for this week is ready. Unlock it with Grow." />);
    const start = html.indexOf(">", html.indexOf('data-testid="locked-preview-content"')) + 1;
    const content = html.slice(start, html.lastIndexOf('<div data-testid="locked-footer"'));
    expect(text(content).trim()).toBe("");
    expect(content).toMatch(/blur-\[\d+px\]/);
    expect(text(html)).toContain("Grow");
    expect(text(html)).toContain("Your action plan");
    expect(text(html)).toContain("5 fixes · 18 pts");
    expect(text(html)).toContain("Your plan for this week is ready. Unlock it with Grow.");
    // Inside a page a lock is small: the plan chip and "See plans" — never a big button pair.
    expect(html).toContain('data-testid="see-plans-link"');
    expect(html).not.toContain("unlock-grow-button");
    expect(html).not.toContain('data-testid="promo-box"');
  });
  test("labels (the review guide's headings) are the only other text allowed", () => {
    const html = render(<LockedPreview title="Guide" labels={["When to ask"]} unlock={null} />);
    expect(text(html)).toContain("When to ask");
  });
  test("compact bar; real counts only", () => {
    expect(render(<LockedPreview compact title="PostAI" unlock="x" />)).toContain('data-compact="true"');
    expect(fixesSummary(0, 10, "en")).toBeNull();
    expect(fixesSummary(1, 4, "en")).toBe("1 fix · 4 pts");
    expect(fixesSummary(3, 13, "es")).toBe("3 arreglos · 13 pts");
  });
});

describe("PostAI showroom", () => {
  test("real starter questions and one labeled example answer; nothing can be typed or sent (all open the promo box)", () => {
    const html = render(<FreePostAIShowroom starterPrompts={["Why is my score 37?", "How do I get more reviews?"]} />);
    const t = text(html);
    expect(t).toContain("Why is my score 37?");
    expect(t).toContain("Example answer");
    expect(html).not.toMatch(/<form|<textarea|<input/);
    expect(html).toMatch(/data-testid="postai-input"[^>]*aria-haspopup="dialog"|aria-haspopup="dialog"[^>]*data-testid="postai-input"/);
    expect(html).toContain('data-testid="postai-send"');
    expect(t).toContain("Ask PostAI anything about your score and what to fix first — with Grow.");
  });
  test("Spanish", () => {
    expect(text(render(<FreePostAIShowroom starterPrompts={[]} />, "free", "es"))).toContain("Respuesta de ejemplo");
  });
});

describe("reviews and rank on Free", () => {
  test("rating + count, the review goal (beat the leader), the working review link (copy, open) and QR (PNG)", () => {
    const html = render(<FreeReviews placeId="ChIJN1t_tDeuEmsRUsoyG83frY4" rating={4.6} reviewCount={10} goal={BEAT} group="nearby salons" />);
    const t = text(html);
    expect(html).toContain('id="free-reviews"');
    expect(t).toContain("4.6★ from 10 reviews");
    expect(t).toContain("Nearby salons average 57 reviews.");
    expect(t).toContain("Your goal: beat Leader Salon — 90 reviews (80 more than you).");
    expect(html).toContain("data-trailing");
    expect(html).toContain('data-testid="free-review-link"');
    expect(html).toContain("data-review-qr=");
    expect(t).toContain("Download QR (PNG)");
    expect(t).toContain("Copy");
  });
  test("leading or no data → no gap claimed; Spanish", () => {
    const lead = render(<FreeReviews placeId={null} rating={null} reviewCount={120} goal={LEAD} group="nearby salons" />);
    expect(lead).not.toContain("data-trailing");
    expect(text(lead)).toContain("You lead nearby with 120 reviews — keep the gap (30 ahead of Runner Salon).");
    expect(text(render(<FreeReviews placeId={null} rating={null} reviewCount={10} goal={null} group={null} />))).not.toMatch(/more than you|Your goal/);
    expect(text(render(<FreeReviews placeId={null} rating={null} reviewCount={10} goal={BEAT} group="salones cercanos" />, "free", "es"))).toContain("Su meta: superar a Leader Salon");
  });
  test("'You're #N of M nearby' only when they trail", () => {
    expect(text(render(<RankUnlockLine />))).toContain("You're #6 of 8 nearby. See what's holding you back with Grow.");
    expect(render(<RankUnlockLine />, "free", "en", { ...FACTS, rank: 1 })).toBe("");
  });
});

describe("More customers + Unlock more on Free", () => {
  test("same tiles as Grow; on Free the Reviews tile shows short tips — no stats, goal, numbers or button (they're right above); Competitors is free, the other tiles show a plan chip and open the promo box; the Overview's one big button pair", () => {
    const html = render(
      <GrowMoreCustomers
        businessId="b1"
        profileTools={{ referralOk: true, couponsOk: true, pricingOk: true }}
        reviewCount={10}
        nearbyReviewAverage={57}
        goal={BEAT}
        group="nearby salons"
        locked
      />
    );
    expect(text(html)).toContain("Get more Google reviews");
    // Short tips instead of the stats and goal (the Reviews section above has them).
    expect(text(html)).toContain("Ask every customer right after a good visit, put your QR code where people wait, and reply to reviews so customers see you care.");
    expect(text(html)).toContain("Never offer a discount or gift for a review — it's against Google's rules.");
    expect(html).not.toContain('data-testid="review-goal"');
    expect(text(html)).not.toMatch(/Your goal|average|10 reviews/);
    const tile = html.slice(html.indexOf("Get more Google reviews"), html.indexOf("rules.") + 6);
    expect(text(tile)).not.toMatch(/\d/);
    expect(text(html)).not.toContain("Get your review link & QR");
    const es = text(render(<GrowMoreCustomers businessId="b1" profileTools={{ referralOk: true, couponsOk: true, pricingOk: true }} reviewCount={10} nearbyReviewAverage={57} goal={BEAT} group="nearby salons" locked />, "free", "es"));
    expect(es).toContain("Pídale una reseña a cada cliente justo después de una buena visita");
    expect(es).toContain("Nunca ofrezca un descuento o regalo a cambio de una reseña: va en contra de las reglas de Google.");
    expect(html).not.toContain('href="#free-reviews"');
    expect(html).not.toContain("review-sign");
    expect(html).toContain('href="/business/b1/competitors"');
    expect(html.match(/data-testid="locked-tool"/g)).toHaveLength(4);
    expect(html).not.toContain('href="/business/b1/campaigns');
    expect(html.match(/data-testid="unlock-grow-button"/g)).toHaveLength(1);
    expect(html).toMatch(/data-testid="unlock-premium-button"[\s\S]*?Best value/);
    // The original design: no thumbnails.
    expect(html).not.toContain("drive-card");
    const grow = render(<GrowMoreCustomers businessId="b1" profileTools={{ referralOk: true, couponsOk: true, pricingOk: true }} reviewCount={10} nearbyReviewAverage={57} />, "grow");
    expect(grow).toContain('href="/business/b1/campaigns?tab=coupons"');
    // Grow and up keep the button.
    expect(text(grow)).toContain("Get your review link & QR →");
    expect(text(grow)).toContain("10 reviews");
    expect(text(grow)).not.toContain("Ask every customer right after a good visit");
    expect(grow).not.toContain("locked-tool");
    expect(grow).not.toContain("unlock-grow");
  });
  test("Unlock more: every plan-only feature as a tile — plan chip, real counts, its OWN line (never repeated), its own promo box", () => {
    const html = render(<UnlockMore fixCount={5} fixPoints={18} hasWebsite websiteChecks={4} />);
    expect(html.match(/data-testid="locked-preview"/g)).toHaveLength(12);
    expect(html.match(/data-testid="plan-chip"/g)).toHaveLength(12);
    const lines = Array.from(html.matchAll(/<p data-testid="unlock-line"[^>]*>([^<]+)<\/p>/g), (m) => m[1]);
    expect(lines).toHaveLength(12);
    expect(new Set(lines).size).toBe(12);
    const t = text(html);
    for (const s of ["5 fixes · 18 pts", "5 weekly habits", "Step-by-step fix guides for Wix", "4 website checks", "PDF on Premium", "10 reviews", "+$15 on Grow · +$8 on Premium", "PostStudio", "Add-on", "Coming soon", "Unlimited PostAI", "Download your starter website"])
      expect(t, s).toContain(s);
    // The starter site is free to build — only its download is a Grow tile.
    expect(t).toContain("Build and preview your starter website free on your Website page — download it with Grow.");
    // Each tile: one small "See plans" (no big pairs here — the Overview's are in More customers and the promo cards).
    expect(html.match(/data-testid="see-plans-link"/g)).toHaveLength(12);
    expect(html).not.toContain("unlock-grow-button");
  });
  test("no website → no fix-guide or Re-check tiles; no price check where it doesn't apply", () => {
    const html = render(<UnlockMore fixCount={2} fixPoints={6} hasWebsite={false} websiteChecks={0} pricingOk={false} />);
    expect(html.match(/data-testid="locked-preview"/g)).toHaveLength(9);
  });
});

describe("locked footers (one layout everywhere)", () => {
  test("line left (max 2 lines), 'See plans →' right and never wrapping; below the line on a phone; pinned to the bottom", () => {
    const html = render(<LockedPreview title="Your action plan" unlock="Your plan for this week is ready. Unlock it with Grow." />);
    expect(html).toMatch(/data-testid="locked-preview" class="flex h-full[^"]*flex-col/);
    expect(html).toMatch(/data-testid="locked-footer" class="flex flex-col items-start gap-2 border-t border-paper-line sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-auto p-4"/);
    expect(html).toMatch(/data-testid="unlock-line" class="line-clamp-2 min-w-0 flex-1/);
    expect(html).toMatch(/data-testid="upgrade-trigger"[^>]*class="[^"]*shrink-0[^"]*whitespace-nowrap/);
    expect(html).toMatch(/data-testid="see-plans-link"[^>]*class="[^"]*shrink-0 [^"]*whitespace-nowrap/);
  });
  test("the PostAI showroom, the rank line and the compact website score use the same footer", () => {
    for (const f of ["components/overview/FreeOverview.tsx", "app/business/[id]/website/WebsiteScoreBreakdown.tsx"]) expect(readFileSync(f, "utf8"), f).toContain("<LockFooter");
    expect(render(<RankUnlockLine />)).toContain('data-testid="rank-unlock"');
  });
});
