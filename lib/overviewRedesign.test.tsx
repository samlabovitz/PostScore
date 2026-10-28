import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, type Locale } from "@/lib/i18n";

vi.mock("@/app/actions/scoring", () => ({ rescanBusiness: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import {
  categoryOutcomeCounts,
  recommendationPriority,
  reviewCountChange,
  scoreChangeSinceLastScan,
  topRecommendations,
  weightedCategoryPoints,
  wholeCategoryPoints,
} from "./overviewTiles";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import type { ActionPlanTask } from "@/lib/actionPlan";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import { boostPoints, ScoreBand, SinceLastScanControl } from "@/components/overview/ScoreBand";
import { AnimatedScoreRing } from "@/components/overview/AnimatedScoreRing";
import { ListingPhoto } from "@/components/overview/ListingPhoto";
import { SinceLastScanCard } from "@/components/overview/SinceLastScanCard";
import { firstPhotoRef } from "@/lib/google/places";
import { canLoadPlacePhoto, placePhotoMonthlyCap, utcMonthStart } from "@/lib/placePhotoBudget";
import type { ScoreSnapshot } from "@/app/actions/scoring";
import { StudioComingSoon } from "@/components/overview/StudioComingSoon";
import { breakdownFixLinks, categoryBarShares, ScoreBreakdownPanel } from "@/components/overview/ScoreBreakdownPanel";
import { TopRecommendations } from "@/components/overview/TopRecommendations";

const NY = "America/New_York";
const render = (node: React.ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone={NY}>
      {node}
    </LocaleProvider>
  );

const breakdown = scoreBusiness(scoringInput());
const cat = (id: string) => breakdown.categories.find((c) => c.id === id)!;

function task(partial: Partial<ActionPlanTask>): ActionPlanTask {
  return {
    checkId: "completeness.photos",
    category: "completeness",
    label: "Photos",
    problem: "",
    why: "",
    action: "Add 5 more photos",
    fix: "",
    ownerActionOnGoogle: true,
    promisedPoints: 3,
    status: "open",
    markedDoneAt: null,
    markedPromisedPoints: null,
    markedMetricValue: null,
    effort: "quick_win",
    weeklyTarget: null,
    weightedPoints: 3,
    weightedPointsHigh: null,
    ...partial,
  } as ActionPlanTask;
}

describe("score card: change since last scan, honestly", () => {
  const row = (total: number, v = "1.11.0") => ({ total, scoring_version: v });
  test("delta, first scan, and a scoring-version change", () => {
    expect(scoreChangeSinceLastScan([row(87), row(81)])).toEqual({ kind: "delta", delta: 6 });
    expect(scoreChangeSinceLastScan([row(87)])).toEqual({ kind: "first" });
    expect(scoreChangeSinceLastScan([row(87, "1.11.0"), row(80, "1.10.0")])).toEqual({ kind: "scoring_updated" });
  });

  const h = (total: number, v = "1.11.0", i = 0) => ({ id: `s${i}`, total, grade: "B", scoring_version: v, created_at: `2026-10-${15 - i}T15:00:00Z` });
  const band = (history: ReturnType<typeof h>[], locale: Locale = "en", boost: number | null = null) =>
    render(
      <ScoreBand
        businessId="b"
        score={87}
        grade="B"
        history={history}
        projectedScore={100}
        projectedGrade="A"
        biggestBoost={boost === null ? null : ({ promisedPoints: boost, label: "Photos" } as never)}
      />,
      locale
    );

  test("ring has a quiet 'Score breakdown ↓' text link (no pill) to the breakdown — EN + ES", () => {
    const en = band([h(87)]);
    const link = en.slice(en.indexOf('<a href="#score-breakdown"'), en.indexOf("</a>", en.indexOf('<a href="#score-breakdown"')));
    expect(link).toContain("Score breakdown ↓");
    expect(link).not.toContain("rounded-full");
    expect(link).not.toContain("border");
    expect(band([h(87)], "es")).toContain("Desglose ↓");
  });

  test("Since last scan: '2 points' with an up arrow, an expand arrow, no sparkline", () => {
    const html = band([h(87), h(85, "1.11.0", 1)]);
    expect(html).toContain("Since last scan");
    expect(html).toContain("2 points");
    expect(html).toContain("bg-green");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<path d=\"M0");
    expect(render(<SinceLastScanControl history={[h(87), h(86, "1.11.0", 1)]} />)).toContain("1 point");
    expect(render(<SinceLastScanControl history={[h(87), h(87, "1.11.0", 1)]} />)).toContain("No change");
    expect(render(<SinceLastScanControl history={[h(87), h(85, "1.11.0", 1)]} />, "es")).toContain("2 puntos");
  });

  test("a version change says so instead of a delta; one scan says tracking starts now", () => {
    const html = render(<SinceLastScanControl history={[h(87), h(80, "1.10.0", 1)]} />);
    expect(html).toContain("PostScore updated how it scores");
    expect(html).not.toContain("7 points");
    expect(render(<SinceLastScanControl history={[h(87)]} />)).toContain("Tracking starts now");
  });

  test("middle card: original label, '100 / 100 · A', action plan link, whole-point boost", () => {
    const html = band([h(87)], "en", 4.6);
    expect(html).toContain("Projected if all suggestions completed");
    expect(html).toContain(">100<");
    expect(html).toContain("/ 100 · A");
    expect(html).toContain("See your action plan →");
    expect(html).toContain("Biggest boost: up to +5 pts · Photos");
    expect(boostPoints(4.6)).toBe("5");
    expect(boostPoints(0.4)).toBe("0.4");
  });

  test("the grade shows once; labels on navy use real CSS (color-mix), not Tailwind's no-op '/70'", () => {
    const html = band([h(87)]);
    expect(html.match(/>B</g)?.length).toBe(1);
    expect(html).not.toMatch(/text-paper\/\d|bg-paper\/|border-paper\/|bg-brass\/\d/);
  });

  test("ring: '/ 100' under the score, smaller and lighter", () => {
    const html = renderToStaticMarkup(<AnimatedScoreRing score={87} businessId="b" />);
    expect(html).toMatch(/text-\[52px\][^>]*>87<\/div><div class="mt-1 text-\[13px\] text-\[color:color-mix\(in_srgb,var\(--color-paper\)_70%,transparent\)\]">\/ 100</);
  });
});

describe("Google listing photo — Google's rules, cheapest option", () => {
  const photos = [
    {
      name: "places/abc/photos/xyz",
      authorAttributions: [{ displayName: "Jane D.", uri: "https://maps.google.com/maps/contrib/1" }],
      googleMapsUri: "https://maps.google.com/photo/1",
    },
    { name: "places/abc/photos/second" },
  ];

  test("the listing's FIRST photo, with its author credit and Maps link", () => {
    expect(firstPhotoRef(photos)).toEqual({
      name: "places/abc/photos/xyz",
      attributions: [{ displayName: "Jane D.", uri: "https://maps.google.com/maps/contrib/1" }],
      googleMapsUri: "https://maps.google.com/photo/1",
    });
  });

  test("no photos (or a malformed name) → no image at all", () => {
    expect(firstPhotoRef([])).toBeNull();
    expect(firstPhotoRef(undefined)).toBeNull();
    expect(firstPhotoRef([{ name: "../../evil" }])).toBeNull();
  });

  test("monthly cap stays under Google's 1,000 free; an unreadable log fails closed", () => {
    expect(placePhotoMonthlyCap({})).toBe(900);
    expect(placePhotoMonthlyCap({ PLACE_PHOTO_MONTHLY_CAP: "0" })).toBe(0);
    expect(canLoadPlacePhoto(899, 900)).toBe(true);
    expect(canLoadPlacePhoto(900, 900)).toBe(false);
    expect(canLoadPlacePhoto(null, 900)).toBe(false);
    expect(utcMonthStart(new Date("2026-10-16T18:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });

  test("server HTML has no image or placeholder (it loads after, only if there is one)", () => {
    const html = render(
      <ListingPhoto businessId="b" businessName="Switch Skate & Snow">
        <h1>Switch Skate &amp; Snow</h1>
      </ListingPhoto>
    );
    expect(html).toContain("<h1>Switch Skate &amp; Snow</h1>");
    // Only Google's logo (the name and address are Google Maps data).
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toMatch(/<img src="\/google\/GoogleMaps_Logo_Gray.svg" alt="Google Maps"/);
  });

  test("the photo credit is ONE small line under the header row — never squeezed under the photo", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("components/overview/ListingPhoto.tsx", "utf8");
    expect(src).toContain('<figcaption className="flex min-w-0 max-w-full items-center gap-2.5 text-[11px] leading-tight text-ink-mute">');
    expect(src).not.toContain("max-w-[76px]");
    // The credit comes after the row (photo + name block), not inside the photo column.
    expect(src.indexOf("{children}")).toBeLessThan(src.indexOf("<figcaption"));
  });

  test("the credit line: author · the Google Maps logo (never the plain text), centered on the scan line; the logo even before the photo loads", async () => {
    const { ListingPhotoView } = await import("@/components/overview/ListingPhoto");
    const photo = { uri: "https://example.com/p.jpg", googleMapsUri: null, attributions: [{ displayName: "Hair express on Broadway", uri: null }] } as never;
    const line = (loaded: boolean) => {
      const html = render(<ListingPhotoView businessName="Hair Express" photo={photo} loaded={loaded} footer={<span>Last scanned</span>}><h1>Hair Express</h1></ListingPhotoView>);
      return html.slice(html.indexOf("<figcaption"), html.indexOf("</figcaption>"));
    };
    expect(line(true)).toMatch(/Hair express on Broadway ·<\/span><img src="\/google\/GoogleMaps_Logo_Gray.svg" alt="Google Maps" translate="no"/);
    expect(line(true)).not.toMatch(/>Google Maps</);
    expect(line(false)).not.toContain("Hair express");
    expect(line(false)).toContain('alt="Google Maps"');
  });

  test("the browser code never holds the API key", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("components/overview/ListingPhoto.tsx", "utf8");
    expect(source).not.toMatch(/GOOGLE_PLACES_API_KEY|places\.googleapis\.com/);
    expect(source).toContain("/listing-photo");
  });
});

describe("category points and review change (now in the breakdown and At a glance)", () => {
  test("each category's real share of the score — the three add up to the total", () => {
    const sum = breakdown.categories.reduce((s, c) => s + (weightedCategoryPoints(c) ?? 0), 0);
    expect(Math.round(sum)).toBe(breakdown.total);
    // Whole points (as shown) still add up to the total.
    expect(wholeCategoryPoints(breakdown.categories).reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(breakdown.total);
    expect(wholeCategoryPoints([{ relativeScore: 36.75, weight: 40 }, { relativeScore: 73, weight: 30 }, { relativeScore: 0, weight: 30 }])).toEqual([15, 22, 0]);
    expect(categoryOutcomeCounts(cat("completeness")).needsWork).toBe(0);
  });

  test("the Website column carries the fix count / No website / Nothing to fix", () => {
    const panel = (over: { hasWebsite?: boolean; websiteFixCount?: number }, locale: Locale = "en") =>
      render(<ScoreBreakdownPanel businessId="b" categories={[cat("website")]} hasWebsite={over.hasWebsite ?? true} scoreBasis={100} websiteFixCount={over.websiteFixCount ?? 6} />, locale);
    expect(panel({})).toContain("6 fixes");
    expect(panel({})).toContain('href="/business/b/website"');
    expect(panel({ websiteFixCount: 0 })).toContain("Nothing to fix");
    expect(panel({ hasWebsite: false })).toContain("No website");
    expect(panel({}, "es")).toContain("6 arreglos");
  });

  test("review change: only when both scans recorded a count", () => {
    const snap = (reviewCount: number | null) => ({ profile_snapshot_json: { reviewCount } as ProfileSnapshot });
    expect(reviewCountChange([snap(58), snap(56)])).toBe(2);
    expect(reviewCountChange([snap(58), snap(58)])).toBe(0);
    expect(reviewCountChange([snap(58), { profile_snapshot_json: null }])).toBeNull();
    expect(reviewCountChange([snap(58)])).toBeNull();
  });
});

describe("top recommendations: the action plan, prioritized by real points", () => {
  test("High 5+, Medium 2+, smaller items get no pill", () => {
    expect(recommendationPriority(6.2)).toBe("high");
    expect(recommendationPriority(5)).toBe("high");
    expect(recommendationPriority(2.4)).toBe("medium");
    expect(recommendationPriority(1.9)).toBeNull();
  });

  test("open items only, biggest first, each with PostAI's fix link", () => {
    const recs = topRecommendations(
      [
        task({ checkId: "completeness.photos", weightedPoints: 2.5 }),
        task({ checkId: "visibility.reviews_merged", category: "visibility", label: "Reviews", weightedPoints: 7 }),
        task({ checkId: "completeness.hours", weightedPoints: 9, status: "pending_verification" }),
        task({ checkId: "setup.connect_gbp", effort: "setup", weightedPoints: 0 }),
      ],
      { kind: "improve", score: 72, improvements: 3, points: 4.1 },
      "b"
    );
    expect(recs.map((r) => [r.key, r.priority])).toEqual([
      ["visibility.reviews_merged", "high"],
      ["website", "medium"],
      ["completeness.photos", "medium"],
    ]);
    expect(recs[0].href).toBe("/business/b/website-reviews#get-more-reviews");
    expect(recs[1].href).toBe("/business/b/website");
    // A listing check's fix row lives on the Overview itself.
    expect(recs[2].href).toBe("/business/b#check-photos");
    expect(recs[2].linkLabel).toBeNull();
  });

  test("renders pills, points and 'View all' → Growth", () => {
    const recs = topRecommendations([task({ weightedPoints: 6 })], null, "b");
    const html = render(<TopRecommendations businessId="b" recommendations={recs} />);
    expect(html).toContain("High priority");
    expect(html).toContain("+6 pts");
    expect(html).toContain('href="/business/b/growth"');
    expect(html).toContain("See this check →");
    expect(render(<TopRecommendations businessId="b" recommendations={recs} />, "es")).toContain("Prioridad alta");
  });
});

describe("score breakdown panel", () => {
  test("collapsed (saved per account): three categories with their bars; fix links only on rows that need work", () => {
    const html = render(<ScoreBreakdownPanel businessId="b" categories={breakdown.categories} hasWebsite scoreBasis={100} accountCollapsed />);
    expect(html).toContain("Score breakdown");
    for (const c of breakdown.categories) expect(html).toContain(c.label.replace("&", "&amp;"));
    expect(html).toContain("4 done · 3 need work · 5 couldn&#x27;t check");
    expect(html).toContain('aria-expanded="false"');
    const links = breakdownFixLinks(breakdown.categories, "b", "en");
    for (const id of Object.keys(links)) {
      const check = breakdown.checks.find((c) => c.id === id)!;
      expect(check.earnedPoints! < check.maxPoints).toBe(true);
      // Never a link back to the same Overview row.
      expect(links[id].href.startsWith("/business/b#")).toBe(false);
    }
  });
});

describe("Studio", () => {
  test("PostStudio: one clear card that opens the full-screen page (from the Overview); no price, no buy button", () => {
    const html = render(<StudioComingSoon businessId="b1" />);
    expect(html).toContain("PostStudio — build your full website");
    expect(html).toContain('href="/business/b1/studio?from=%2Fbusiness%2Fb1"');
    expect(html).toContain("Open PostStudio");
    expect(html).not.toMatch(/<button|upgrade|buy|\$|price/i);
    const es = render(<StudioComingSoon businessId="b1" />, "es");
    expect(es).toContain("PostStudio — construya su sitio web completo");
    expect(es).toContain("Abrir PostStudio");
  });
});

describe("an 'Excellent' rating is never the category's top issue", () => {
  test("Hair express on Broadway (5.0★, 30 reviews)", () => {
    const visibility = scoreBusiness({ ...scoringInput(), rating: 5.0, reviewCount: 30 }).categories.find((c) => c.id === "visibility")!;
    const html = render(<ScoreBreakdownPanel businessId="b" categories={[visibility]} hasWebsite scoreBasis={100} />);
    expect(html).not.toContain("Top issue: Star rating");
  });
});

describe("since your last scan (replaces the two change sections)", () => {
  const snap = (over: Partial<ScoreSnapshot>): ScoreSnapshot => ({
    id: "s",
    total: 87,
    grade: "B",
    scoring_version: "1.11.0",
    created_at: "2026-10-15T15:00:00Z",
    breakdown_json: breakdown,
    profile_snapshot_json: { phone: "1", website: "w", openingHours: null, categories: null, photoCount: 10, rating: 4.8, reviewCount: 58, businessStatus: "OPERATIONAL" },
    ...over,
  });
  const card = (snapshots: ScoreSnapshot[], locale: Locale = "en") =>
    render(<SinceLastScanCard businessId="b" snapshots={snapshots} liveBreakdown={breakdown} />, locale);

  test("before → after with the real delta, listing chips, and a Reports link", () => {
    const prev = snap({ total: 81, created_at: "2026-10-08T15:00:00Z", profile_snapshot_json: { phone: "1", website: "w", openingHours: null, categories: null, photoCount: 10, rating: 4.8, reviewCount: 56, businessStatus: "OPERATIONAL" } });
    const html = card([snap({}), prev]);
    expect(html).toContain(">81<");
    expect(html).toContain(">87<");
    expect(html).toContain("+6");
    expect(html).toMatch(/review/i);
    expect(html).toContain("See full history on Reports");
    expect(html).toContain('href="/business/b/reports"');
  });

  test("a scoring-version change: both real scores, the honest note, no delta, no check deltas", () => {
    const html = card([snap({}), snap({ total: 80, scoring_version: "1.10.0" })]);
    expect(html).toContain(">80<");
    expect(html).not.toContain("+7");
    // One honest note only; the checks section is hidden, not repeated.
    expect(html.split("PostScore updated how it scores").length - 1).toBe(1);
    expect(html).not.toContain("Checks that went up or down");
    expect(html).not.toContain("aren&#x27;t compared across a scoring update");
  });

  test("nothing changed / first scan / Spanish", () => {
    const same = card([snap({}), snap({})]);
    expect(same).toContain("Nothing changed on your listing since your last scan.");
    expect(same).toContain("Nothing changed since your last scan.");
    expect(card([snap({})])).toContain("No prior scan to compare yet");
    expect(card([snap({}), snap({})], "es")).toContain("Desde su último análisis");
  });
});

describe("breakdown bars, Start here, wording", () => {
  test("one bar: earned + missing + a hatched end only when points couldn't be checked", () => {
    const website = cat("website");
    const shares = categoryBarShares(website);
    expect(shares.earned + shares.missing + shares.unchecked).toBeCloseTo(1, 6);
    expect(shares.unchecked).toBeGreaterThan(0);
    expect(categoryBarShares(cat("completeness")).unchecked).toBe(0);
    const html = render(<ScoreBreakdownPanel businessId="b" categories={[cat("completeness")]} hasWebsite scoreBasis={100} />);
    expect(html).toContain("ps-bar-grow");
    expect(html).not.toContain("repeating-linear-gradient(135deg, var(--color-paper-deep) 0 3px, rgba(107,120,144,.35) 3px 5px)\"></div></div>");
  });

  test("counts read naturally: '1 needs work', '3 need work'", () => {
    const visibility = cat("visibility");
    const html = render(<ScoreBreakdownPanel businessId="b" categories={[visibility]} hasWebsite scoreBasis={100} />);
    // v1.12.0: recency and replies both couldn't be checked here.
    expect(html).toContain("1 done · 1 needs work · 2 couldn&#x27;t check");
  });

  test("Top recommendations starts with the weekly plan on Growth", () => {
    const html = render(<TopRecommendations businessId="b" recommendations={[]} />);
    expect(html).toContain('href="/business/b/growth#weekly-plan"');
    expect(html).toContain("Start here:");
    expect(html).toContain("your weekly plan on Growth");
  });

  test("'up to about +5 pts' (no '~+')", () => {
    const recs = topRecommendations([], { kind: "improve", score: 72, improvements: 3, points: 5 }, "b");
    const html = render(<TopRecommendations businessId="b" recommendations={recs} />);
    expect(html).toContain("up to about +5 pts");
    expect(html).not.toContain("~+");
  });
});

describe("connect card and business listing (tweaks)", () => {
  test("Premium card: compact, new copy, opens the original connect page — EN + ES", async () => {
    const { LiveListingSection } = await import("@/components/gbp/LiveListingSection");
    const en = render(<LiveListingSection businessId="b1" connected={false} />);
    expect(en).toContain("Connect your Google Business Profile");
    expect(en).toContain("Let PostScore do the heavy lifting for you. Track your calls, views and reviews in one place, and get replies to reviews written for you.");
    expect(en).not.toContain("<button");
    expect(en).toContain("text-[12.5px]");
    expect(en).toContain("PostScore Premium");
    expect(en).toContain("See what&#x27;s included →");
    expect(en).toContain('href="/business/b1/connect-gbp"');
    expect(en).not.toContain("Profile-completeness checklist");
    expect(en).not.toMatch(/\$\d/);
    const es = render(<LiveListingSection businessId="b1" connected={false} />, "es");
    expect(es).toContain("Conecte su Perfil de Negocio de Google");
    expect(es).toContain("reciba respuestas a sus reseñas ya redactadas");
    expect(es).toContain("Ver qué incluye →");
    expect(es).toContain("PostScore Premium");
  });

  test("the Premium card shows on the Overview (honest coming-soon); the listing lives in the header chips — no separate card", async () => {
    const fs = await import("node:fs");
    const view = fs.readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
    expect(view).not.toContain("gbpConnectPublic");
    expect(view).not.toContain("ListingCard");
    expect(view).not.toContain("businessListingHeading");
    expect(view.indexOf("<ListingChips business={business} now={now} />")).toBeLessThan(view.indexOf('"dashboard.overview.atAGlanceHeading"'));
    // The connect page is viewable (read-only until GBP_CONNECT_PUBLIC);
    // the real OAuth start stays behind the flag.
    const connectPage = fs.readFileSync("app/business/[id]/connect-gbp/page.tsx", "utf8");
    expect(connectPage).toContain("connectOpen={canConnectGbp()}");
    expect(connectPage).not.toContain("google-premium");
    const connectRoute = fs.readFileSync("app/api/gbp/connect/route.ts", "utf8");
    expect(connectRoute.indexOf("if (!canConnectGbp())")).toBeGreaterThan(-1);
    expect(connectRoute.indexOf("if (!canConnectGbp())")).toBeLessThan(connectRoute.indexOf("buildGbpAuthUrl({"));
  });
});

describe("same-page jump + highlight", () => {
  test("highlight classes use color-mix (no no-op /NN shorthand) and the jump honors reduce-motion", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("components/layout/AnchorHighlight.tsx", "utf8");
    const classes = src.slice(src.indexOf("HIGHLIGHT_CLASSES = ["), src.indexOf("];", src.indexOf("HIGHLIGHT_CLASSES = [")));
    expect(classes).not.toMatch(/brass\/\d/);
    expect(classes).toContain("color-mix");
    expect(src).toContain("prefers-reduced-motion: reduce");
    expect(src).not.toContain('behavior: "smooth"');
    expect(fs.readFileSync("components/overview/ScoreBreakdownPanel.tsx", "utf8")).not.toContain('behavior: "smooth"');
  });

  test("jumpToAnchor sets the hash without navigating and fires the highlight event", async () => {
    const { jumpToAnchor, ANCHOR_HIGHLIGHT_EVENT } = await import("@/components/layout/AnchorHighlight");
    const replaceState = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { history: { state: null, replaceState }, dispatchEvent });
    try {
      jumpToAnchor("score-breakdown");
      expect(replaceState).toHaveBeenCalledWith(null, "", "#score-breakdown");
      expect(dispatchEvent.mock.calls[0][0].type).toBe(ANCHOR_HIGHLIGHT_EVENT);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Overview layout and scan history (GBP card tweaks)", () => {
  test("recs + since-last-scan: equal height, side by side, stacked on mobile; PostStudio on its own row; no Version column", async () => {
    const fs = await import("node:fs");
    const view = fs.readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
    expect(view).toContain(`<div className="grid grid-cols-1 gap-4 nav:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <TopRecommendations businessId={businessId} recommendations={recommendations} />
        <SinceLastScanCard businessId={businessId} snapshots={recentSnapshots} liveBreakdown={breakdown} />
      </div>
      <StudioComingSoon businessId={businessId} />`);
    expect(view).not.toContain("versionColumn");
    expect(view).toContain('"dashboard.overview.scoringUpdatedVersionTip", { version: row.scoring_version }');
  });

  test("the version tooltip names the version, EN + ES", async () => {
    const { t } = await import("@/lib/i18n");
    expect(t("en", "dashboard.overview.scoringUpdatedVersionTip", { version: "1.11.0" })).toContain("version 1.11.0");
    expect(t("es", "dashboard.overview.scoringUpdatedVersionTip", { version: "1.11.0" })).toContain("versión 1.11.0");
  });
});

describe("whole-number point ranges and the connect page", () => {
  test("ranges round to whole points and collapse when equal", async () => {
    const { wholePointRange, websiteRangeText, recRangeText } = await import("@/lib/pointRange");
    expect(wholePointRange(29.2, 31.4)).toEqual({ low: 29, high: 31 });
    expect(wholePointRange(4.6, 4.9)).toEqual({ low: 5, high: null });
    expect(wholePointRange(0.3, null)).toEqual({ low: 1, high: null });
    expect(websiteRangeText("en", 29.2, 31.4)).toContain("about +29–31 pts");
    expect(websiteRangeText("es", 29.2, 31.4)).toContain("unos +29–31 pts");
    expect(recRangeText("en", 29.2, 31.4)).toBe("about +29–31 pts");
    expect(recRangeText("en", 4.6, 4.9)).toBe("about +5 pts");
  });

  test("connect page: disabled button + 'coming soon' line until GBP_CONNECT_PUBLIC; otherwise exactly as before", async () => {
    vi.doMock("@/app/actions/gbp", () => ({ disconnectGbp: vi.fn() }));
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
    const { ConnectGbpView } = await import("@/app/business/[id]/connect-gbp/ConnectGbpView");
    const props = { businessId: "b1", businessName: "Shop", connected: false, connectedAt: null, justConnected: false, error: null, oauthConfigured: true };
    const closed = render(<ConnectGbpView {...props} connectOpen={false} />);
    expect(closed).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Connect Google Business Profile<\/button>/);
    expect(closed).toContain("Available with PostScore Premium — coming soon");
    expect(closed).not.toContain("/api/gbp/connect");
    expect(closed).not.toMatch(/\$\d/);
    expect(render(<ConnectGbpView {...props} connectOpen={false} />, "es")).toContain("Disponible con PostScore Premium — próximamente");
    // Nine cards (Search demand makes three rows of three), light icon tiles, Premium pill.
    expect(closed.match(/rounded-lg ps-icon-tile/g)?.length).toBe(9);
    expect(closed).toContain("Search terms");
    expect(closed).toContain("See the exact words people typed on Google to find you.");
    expect(closed).toContain("PostScore Premium");
    expect(closed).toContain("Skip for now");
    expect(closed).toContain("motion-reduce:hover:translate-y-0");
    expect(render(<ConnectGbpView {...props} connectOpen={false} />, "es")).toContain("Términos de búsqueda");
    const open = render(<ConnectGbpView {...props} connectOpen />);
    expect(open).toContain('href="/api/gbp/connect?businessId=b1&amp;from=connect"');
    expect(open).not.toContain("coming soon");
  });
});

describe("the real Google connect: GBP_CONNECT_PUBLIC is the one switch", () => {
  test("on for every plan when GBP_CONNECT_PUBLIC=true; off for everyone otherwise", async () => {
    const { canConnectGbp } = await import("@/lib/premium");
    expect(canConnectGbp({ GBP_CONNECT_PUBLIC: "true", NODE_ENV: "production" })).toBe(true);
    expect(canConnectGbp({ NODE_ENV: "production" })).toBe(false);
    expect(canConnectGbp({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("icon squares, app-wide", () => {
  test("one light style (ps-icon-tile): no navy icon squares, no no-op bg-brass/10 tints", async () => {
    const fs = await import("node:fs");
    const { execSync } = await import("node:child_process");
    const files = execSync("git ls-files -co --exclude-standard app components", { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) && fs.existsSync(f));
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/justify-center rounded-(?:lg|xl|full|md) bg-ink text-brass/);
      expect(src, f).not.toMatch(/justify-center rounded-(?:lg|xl|full|md) bg-brass\/1[05] text-brass/);
    }
    const css = fs.readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.ps-icon-tile \{[\s\S]*?color-mix\(in srgb, var\(--color-brass\) 8%, white\)/);
  });

  test("the website recommendation's estimate is whole points, like its 'about +4' line", () => {
    const recs = topRecommendations([], { kind: "improve", score: 72, improvements: 3, points: 4.1 }, "b");
    const html = render(<TopRecommendations businessId="b" recommendations={recs} />);
    expect(html).toContain("about +4 pts");
    expect(html).not.toContain("+4.1");
  });
});

describe("small Overview fixes (link pill, empty since card, whole points)", () => {
  test("Google card's 'See what's included →' uses the in-app link-pill style, not a solid gold button", async () => {
    const { LiveListingSection } = await import("@/components/gbp/LiveListingSection");
    const { LINK_PILL_CLASS } = await import("@/components/ui/linkPill");
    const html = render(<LiveListingSection businessId="b1" connected={false} />);
    const link = html.slice(html.lastIndexOf("<a ", html.indexOf("See what&#x27;s included")), html.indexOf("See what&#x27;s included"));
    expect(link).toContain(LINK_PILL_CLASS.split(" ").find((c) => c.startsWith("border-["))!);
    expect(link).toContain("rounded-full");
    expect(link).not.toContain("bg-brass ");
  });

  test("no prior scan: message and Reports link together in one centered block", () => {
    const html = render(<SinceLastScanCard businessId="b" snapshots={[]} liveBreakdown={breakdown} />);
    const block = html.slice(html.indexOf('<div class="flex flex-1 flex-col justify-center gap-3">'));
    expect(block.indexOf("No prior scan to compare yet")).toBeGreaterThan(-1);
    expect(block.indexOf("See full history on Reports")).toBeGreaterThan(block.indexOf("No prior scan to compare yet"));
    expect(block.indexOf("See full history on Reports")).toBeLessThan(block.indexOf("</div>"));
  });

  test("every recommendation's points are whole, with pill + points stacked top-right", () => {
    const recs = topRecommendations(
      [
        task({ checkId: "visibility.reviews_merged", category: "visibility", label: "Reviews", weightedPoints: 18.6 }),
        task({ checkId: "completeness.photos", weightedPoints: 2.5 }),
        task({ checkId: "completeness.hours", label: "Hours", weightedPoints: 0.4 }),
      ],
      { kind: "get_website", low: 29.2, high: 31.4 },
      "b"
    );
    const html = render(<TopRecommendations businessId="b" recommendations={recs} />);
    expect(html).toContain("+19 pts");
    expect(html).toContain("+3 pts");
    expect(html).toContain("about +29–31 pts");
    expect(html).not.toMatch(/\+\d+\.\d+ pts/);
    expect(html.match(/flex shrink-0 flex-col items-end gap-1/g)?.length).toBe(recs.length);
  });
});


describe("listing photo survives React's dev double-run", () => {
  test("one request, and its answer is never discarded by the first run's cleanup", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("components/overview/ListingPhoto.tsx", "utf8");
    expect(src).toContain("if (!requested.current) {");
    expect(src).toContain("if (mounted.current && body.photo) setPhoto(body.photo);");
    expect(src).not.toMatch(/let cancelled = false/);
  });
});
