import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";

// Closed businesses (Google's businessStatus): OPERATIONAL /
// CLOSED_TEMPORARILY / CLOSED_PERMANENTLY — the owner's own business and
// their competitors.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/businessArchive", () => ({ archiveBusiness: vi.fn(), restoreBusiness: vi.fn() }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
const nearby: { results: unknown[] } = { results: [] };
vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return { ...actual, searchNearbyPlaces: async () => nearby.results };
});

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { closureOf, MARK_OPEN_STEP_ID, scoreOnHold } from "@/lib/businessStatus";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { ClosedListingBanner } from "@/components/scoring/ClosedListingBanner";
import { ScoreBand } from "@/components/overview/ScoreBand";
import { GOOGLE_LINKS } from "@/lib/googleHelpLinks";
import { buildMarkOpenStep } from "@/lib/actionPlan";
import { TaskCard } from "@/app/business/[id]/ActionPlanSection";
import { buildPostaiFacts, factsBlockText } from "@/lib/postaiFacts";
import { buildReportExtras } from "@/lib/monthlyReportExtras";
import { closedAlertText } from "@/emails/MonthlyReportEmail";
import { findAndScoreCompetitors, type CompetitorSourceBusiness } from "@/lib/competitors";

const render = (node: React.ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const status = (s: string) => scoreBusiness({ ...scoringInput(), businessStatus: s }).checks.find((c) => c.id === "completeness.business_status")!;

describe("the status check", () => {
  test("open = full points; temporarily closed = 0; permanently closed = 0 and the score is on hold — EN + ES", () => {
    expect(status("OPERATIONAL")).toMatchObject({ earnedPoints: 4, maxPoints: 4 });
    expect(status("CLOSED_TEMPORARILY")).toMatchObject({ earnedPoints: 0, explanation: "Google shows your business as temporarily closed." });
    expect(status("CLOSED_PERMANENTLY")).toMatchObject({ earnedPoints: 0, explanation: "Google shows your business as permanently closed — your score is on hold until it shows you open." });
    expect(scoreBusiness({ ...scoringInput(), businessStatus: "CLOSED_TEMPORARILY" }, "es").checks.find((c) => c.id === "completeness.business_status")!.explanation).toBe("Google muestra su negocio como cerrado temporalmente.");
    expect([closureOf("OPERATIONAL"), closureOf("CLOSED_TEMPORARILY"), closureOf("CLOSED_PERMANENTLY"), closureOf(null)]).toEqual([null, "temporary", "permanent", null]);
    expect([scoreOnHold("CLOSED_PERMANENTLY"), scoreOnHold("CLOSED_TEMPORARILY"), scoreOnHold("OPERATIONAL")]).toEqual([true, false, false]);
  });
});

describe("Overview banner", () => {
  test("permanently closed: urgent red, the fix, verified links, and \"Yes, we've closed\" (no browser dialog)", () => {
    const html = render(<ClosedListingBanner businessId="b1" status="CLOSED_PERMANENTLY" archived={false} />);
    expect(html).toContain('data-testid="closed-banner-permanent"');
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("Google shows your business as permanently closed. Customers searching for you are told you're closed. If you're still open, fix this now.");
    expect(text(html)).toContain("Edit profile → Business information → Open date / status");
    expect(html).toContain(`href="${GOOGLE_LINKS.businessProfile}"`);
    expect(html).toContain(`href="${GOOGLE_LINKS.closedStatusHelp}"`);
    expect(text(html)).toContain("Yes, we've closed");
    const src = fs.readFileSync("components/scoring/ClosedListingBanner.tsx", "utf8");
    expect(src).not.toMatch(/window\.confirm|confirm\(/);
    const es = render(<ClosedListingBanner businessId="b1" status="CLOSED_PERMANENTLY" archived={false} />, "es");
    expect(text(es)).toContain("Google muestra su negocio como cerrado permanentemente.");
    expect(es).toContain(`href="${GOOGLE_LINKS.closedStatusHelp}?hl=es"`);
  });

  test("temporarily closed: amber, \"If you've reopened, update it\"; open: nothing; archived: Restore", () => {
    const temp = render(<ClosedListingBanner businessId="b1" status="CLOSED_TEMPORARILY" archived={false} />);
    expect(temp).toContain('data-testid="closed-banner-temporary"');
    expect(text(temp)).toContain("Google shows you as temporarily closed. If you've reopened, update it.");
    expect(temp).not.toContain("Yes, we");
    expect(render(<ClosedListingBanner businessId="b1" status="OPERATIONAL" archived={false} />)).toBe("");
    const archived = render(<ClosedListingBanner businessId="b1" status="CLOSED_PERMANENTLY" archived />);
    expect(text(archived)).toContain("This business is archived. Re-scans, monthly reports and PostAI are paused.");
    expect(text(archived)).toContain("Restore");
  });

  test("the banner comes first on the Overview (above the score), Free and paid", () => {
    const view = fs.readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
    expect(view.match(/<ClosedListingBanner businessId=\{businessId\} status=\{business.business_status\} archived=\{archived\} \/>/g)).toHaveLength(2);
    for (const block of view.split("<ClosedListingBanner").slice(1)) expect(block.indexOf("<ScoreBand")).toBeGreaterThan(block.indexOf("{header}"));
  });

  test("score card: \"On hold\", never a normal score or grade, while permanently closed", () => {
    const props = { businessId: "b1", score: 64, grade: "D" as const, history: [], projectedScore: 70, projectedGrade: "C" as const, biggestBoost: null };
    const held = render(<ScoreBand {...props} onHold />);
    expect(held).toContain('data-testid="score-on-hold"');
    expect(text(held)).toContain("Your score is on hold while Google shows your business as permanently closed.");
    expect(text(held)).not.toContain("64");
    expect(held).not.toMatch(/>D</);
    expect(text(render(<ScoreBand {...props} onHold />, "es"))).toContain("En pausa");
    expect(render(<ScoreBand {...props} />)).not.toContain("score-on-hold");
    expect(fs.readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8").match(/onHold=\{scoreOnHold\(business.business_status\)\}/g)).toHaveLength(2);
  });
});

describe("Growth: \"Mark your business as open on Google\" is the only step", () => {
  test("the step: links, no points, never \"I did this\"", () => {
    const step = buildMarkOpenStep("en");
    expect(step.checkId).toBe(MARK_OPEN_STEP_ID);
    expect(step.links!.map((l) => l.href)).toEqual([GOOGLE_LINKS.businessProfile, GOOGLE_LINKS.closedStatusHelp]);
    const html = render(<TaskCard task={step} businessId="b1" context="weekly" step={1} />);
    expect(html).toMatch(/<h3[^>]*>Mark your business as open on Google<\/h3>/);
    expect(html).not.toContain("I did this");
    expect(html).not.toContain("pts");
    expect(html).toContain(`href="${GOOGLE_LINKS.closedStatusHelp}"`);
    expect(buildMarkOpenStep("es").title).toBe("Marque su negocio como abierto en Google");
  });
  test("getActionPlan: permanently closed → only that step, no other tasks", () => {
    const src = fs.readFileSync("app/actions/actionPlan.ts", "utf8");
    expect(src).toContain("if (scoreOnHold(input.businessStatus)) {");
    expect(src).toContain("weeklyTasks: [buildMarkOpenStep(locale)],\n      laterTasks: [],");
  });
});

describe("PostAI leads with the status", () => {
  const facts = (s: string) => factsBlockText(buildPostaiFacts(scoreBusiness({ ...scoringInput(), businessStatus: s }), { rating: 4.5, reviewCount: 40, hasWebsite: true, rank: null, nearbyReviewAverage: null, businessStatus: s }));
  test("permanent: the first fact, score on hold; temporary: first too; open: nothing", () => {
    const lines = facts("CLOSED_PERMANENTLY").split("\n");
    expect(lines[1]).toContain("PERMANENTLY CLOSED");
    expect(lines[1]).toContain("ON HOLD");
    expect(facts("CLOSED_TEMPORARILY").split("\n")[1]).toContain("TEMPORARILY CLOSED");
    expect(facts("OPERATIONAL")).not.toContain("LISTING STATUS");
  });
});

describe("monthly report", () => {
  test("leads with the closed alert (and the inbox preview too); never sent once the owner archived it", () => {
    expect(buildReportExtras({ ...scoringInput(), businessStatus: "CLOSED_PERMANENTLY" }, scoreBusiness(scoringInput())).closure).toBe("permanent");
    expect(buildReportExtras(scoringInput(), scoreBusiness(scoringInput())).closure).toBeNull();
    expect(closedAlertText({ closure: "permanent" }, "Kung Fu Tea", "en")).toBe("Google shows Kung Fu Tea as permanently closed. If you're still open, mark it open in Google Business Profile now — customers are being told you're closed.");
    expect(closedAlertText({ closure: "temporary" }, "Kimmel", "es")).toContain("cerrado temporalmente");
    expect(closedAlertText({ closure: null }, "x", "en")).toBeNull();
    const email = fs.readFileSync("emails/MonthlyReportEmail.tsx", "utf8");
    expect(email.indexOf("<ClosedAlert")).toBeLessThan(email.indexOf("<SecurityAlert content"));
    expect(email).toContain("inboxPreviewText(closedAlertText(content, businessName, locale) ?? content.summary)");
    expect(fs.readFileSync("app/api/cron/monthly-reports/route.ts", "utf8")).toContain("if (await isBusinessArchived(supabase, businessId)) {");
  });
});

describe("archived: no re-scans, competitor scans, website re-checks or PostAI", () => {
  test("every path checks first", () => {
    expect(fs.readFileSync("app/actions/scoring.ts", "utf8")).toMatch(/const detailsKind = options.detailsKind \?\? "rescan";\n  \/\/ Archived[^\n]*\n  if \(await isBusinessArchived\(supabase, businessId\)\)/);
    expect(fs.readFileSync("app/actions/competitors.ts", "utf8")).toContain("if (await isBusinessArchived(supabase, businessId)) return");
    expect(fs.readFileSync("app/actions/websiteRecheck.ts", "utf8")).toContain("if (await isBusinessArchived(supabase, businessId)) {");
    expect(fs.readFileSync("app/actions/assistant.ts", "utf8")).toContain("if (await isBusinessArchived(createClient(), businessId)) return");
    expect(fs.readFileSync("scripts/rescan-all.ts", "utf8")).toContain("!(b as { archived_at?: string | null }).archived_at");
    expect(fs.readFileSync("supabase/business-archive.sql", "utf8")).toContain("add column if not exists archived_at timestamptz");
  });
});

describe("competitors", () => {
  const SUBJECT: CompetitorSourceBusiness = {
    placeId: "self", name: "Kung Fu Tea", address: "x", lat: 39.6619, lng: -75.7272, primaryType: "bubble_tea_store", categories: ["bubble_tea_store", "cafe", "food"], category: "Bubble tea store",
    rating: 4.2, review_count: 300, phone: "1", opening_hours: null, website: null, photo_count: 10, business_status: "OPERATIONAL", https_status: null, website_analysis_json: null, verified_website_url: null, website_trust_overrides_json: null,
  };
  const place = (id: string, status = "OPERATIONAL", lat = 39.665) => {
    const details = { placeId: id, name: id, formattedAddress: null, phone: "1", website: null, openingHours: null, openingHoursPeriods: null, rating: 4.4, userRatingCount: 120, categories: ["bubble_tea_store", "cafe"], primaryCategory: "Bubble tea store", primaryType: "bubble_tea_store", location: { lat, lng: -75.727 }, businessStatus: status, googleMapsUri: null, photoCount: 5, priceLevel: null };
    return { placeId: id, name: id, formattedAddress: null, types: details.categories, primaryType: "bubble_tea_store", primaryTypeDisplayName: null, businessStatus: status, location: details.location, priceLevel: null, details };
  };
  beforeEach(() => {
    nearby.results = [];
  });
  test("permanently closed: never ranked or listed; temporarily closed: \"Temporarily closed\" under Also nearby, never ranked", async () => {
    nearby.results = [place("open-1"), place("open-2"), place("open-3"), place("gone", "CLOSED_PERMANENTLY"), place("paused", "CLOSED_TEMPORARILY", 39.6625)];
    const result = await findAndScoreCompetitors(SUBJECT, "en");
    const ranked = result.ranked.filter((r) => !r.isSubject).map((r) => r.placeId);
    expect(ranked).not.toContain("gone");
    expect(ranked).not.toContain("paused");
    expect(ranked.sort()).toEqual(["open-1", "open-2", "open-3"]);
    expect(result.alsoNearby?.find((a) => a.placeId === "paused")).toMatchObject({ temporarilyClosed: true });
    expect(result.alsoNearby?.some((a) => a.placeId === "gone")).toBe(false);
  });
  test("the competitors page labels it \"Temporarily closed\" — EN + ES", () => {
    const src = fs.readFileSync("app/business/[id]/competitors/CompetitorsView.tsx", "utf8");
    expect(src).toContain('{l.temporarilyClosed ? (');
    expect(src).toContain('t(locale, "dashboard.competitors.temporarilyClosedTag")');
  });
});
