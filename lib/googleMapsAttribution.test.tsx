import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

import { GOOGLE_MAPS_LOGO_HEIGHT, GOOGLE_MAPS_LOGO_SRC, GOOGLE_MAPS_LOGO_WIDTH, GoogleMapsAttribution, GoogleMapsLogo } from "@/components/google/GoogleMapsAttribution";
import { GOOGLE_MAPS_LOGO_PNG_BASE64, GOOGLE_MAPS_LOGO_RATIO } from "@/lib/google/mapsLogoPng";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { renderPdf } from "@/lib/signStudio/pdf";
import { renderPageSvg } from "@/lib/signStudio/svg";
import { FONT_ROLES, type FontRole } from "@/lib/signStudio/elements";
import { LETTER, layoutReport, type ReportData } from "@/lib/reports/reportPdf";
import { MonthlyReportEmail } from "@/emails/MonthlyReportEmail";
import { SAMPLE_REAL_DELTAS } from "@/emails/sampleMonthlyReportContent";

// Google Maps attribution, per
// https://developers.google.com/maps/documentation/places/web-service/policies

const pngSize = (bytes: Uint8Array) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
};

describe("Google's official logo, unmodified", () => {
  test("the Gray non-outlined logo (plain backgrounds): #5E5E5E, 98×18; the 2x PNG for email, the 4x PNG embedded for PDFs", () => {
    const svg = readFileSync("public/google/GoogleMaps_Logo_Gray.svg", "utf8");
    expect(svg).toContain('viewBox="0 0 98 18"');
    expect(svg).toContain('fill="#5E5E5E"');
    expect(svg).not.toMatch(/<script|onload|foreignObject/i);
    expect(pngSize(new Uint8Array(readFileSync("public/google/GoogleMaps_Logo_Gray_2x.png")))).toEqual([196, 36]);
    expect(pngSize(new Uint8Array(Buffer.from(GOOGLE_MAPS_LOGO_PNG_BASE64, "base64")))).toEqual([392, 72]);
    expect(GOOGLE_MAPS_LOGO_RATIO).toBeCloseTo(98 / 18);
  });

  test("the web attribution: 16px tall (Google's minimum), aspect ratio kept, 10px clear space, alt 'Google Maps', never translated", () => {
    const html = renderToStaticMarkup(<GoogleMapsAttribution />);
    expect(GOOGLE_MAPS_LOGO_SRC).toBe("/google/GoogleMaps_Logo_Gray.svg");
    expect(GOOGLE_MAPS_LOGO_HEIGHT).toBe(16);
    expect(GOOGLE_MAPS_LOGO_WIDTH).toBe(Math.round((98 / 18) * 16));
    expect(html).toContain('translate="no"');
    expect(html).toContain('alt="Google Maps"');
    expect(html).toContain(`src="${GOOGLE_MAPS_LOGO_SRC}"`);
    expect(html).toContain("h-4 w-auto");
    // A quiet footnote: right-aligned, 10px above and around it.
    expect(html).toMatch(/class="mt-2.5 flex flex-wrap items-center justify-end gap-x-2.5 gap-y-2.5"/);
    // Small text shares the line, on the left.
    const shared = renderToStaticMarkup(<GoogleMapsAttribution><span>Footnote</span></GoogleMapsAttribution>);
    expect(shared).toMatch(/<div class="mr-auto min-w-0"><span>Footnote<\/span><\/div><img/);
    // The inline logo, for a line of text.
    expect(renderToStaticMarkup(<GoogleMapsLogo />)).toMatch(/^<img src="\/google\/GoogleMaps_Logo_Gray.svg" alt="Google Maps" translate="no"[^>]*class="inline-block h-4 w-auto max-w-none shrink-0 align-middle"/);
  });
});

describe("placed next to Places data shown without a map", () => {
  const src = (f: string) => readFileSync(f, "utf8");
  const uses = (f: string) => (src(f).match(/<GoogleMapsAttribution\b/g) ?? []).length;

  test("Overview, Competitors, Website, Reviews, Reports, Growth, Since your last visit", () => {
    // Overview header: the chip row as before; the logo ends the scan line
    // (ListingPhoto). Then the Free rank card and the paid "At a glance".
    expect(uses("app/business/[id]/BusinessScoreView.tsx")).toBe(2);
    expect(src("app/business/[id]/BusinessScoreView.tsx")).toContain("chips={<ListingChips business={business} now={now} />}");
    expect(src("components/overview/ListingPhoto.tsx").match(/<GoogleMapsLogo \/>/g)).toHaveLength(2);
    expect(uses("components/overview/FreeOverview.tsx")).toBe(1);
    expect(uses("components/overview/GrowMoreCustomers.tsx")).toBe(1);
    // Competitors: the bottom of the hero card and under the ranked list.
    expect(uses("app/business/[id]/competitors/CompetitorsView.tsx")).toBe(2);
    // Website: under the details pre-filled from Google, until the owner
    // confirms them (the site itself never carries Google content).
    expect(src("app/business/[id]/website/StarterSiteDetailsForm.tsx")).toMatch(/\{prefilled && \(\s*<div className="pt-0\.5" data-testid="details-attribution">\s*<GoogleMapsLogo \/>/);
    expect(uses("app/business/[id]/website/StarterSiteBuilder.tsx")).toBe(0);
    expect(uses("app/business/[id]/website-reviews/ReviewsView.tsx")).toBe(1);
    expect(uses("components/reports/WeeklyRecapCard.tsx")).toBe(1);
    // Growth: the listing tasks and the Google profile panel.
    expect(src("app/business/[id]/ActionPlanSection.tsx")).toContain("{tasks.some(showsListingData) ? (");
    expect(uses("components/gbp/GoogleProfilePanel.tsx")).toBe(1);
    expect(src("components/visits/SinceLastVisit.tsx")).toContain('{(data.rank || data.reviews.countChange !== null) && <GoogleMapsAttribution className="mt-0" />}');
  });

  test("never squeezed: no negative margins eating the clear space", () => {
    for (const f of ["app/business/[id]/BusinessScoreView.tsx", "components/overview/FreeOverview.tsx", "components/overview/GrowMoreCustomers.tsx", "app/business/[id]/competitors/CompetitorsView.tsx", "app/business/[id]/website/StarterSiteDetailsForm.tsx", "app/business/[id]/website-reviews/ReviewsView.tsx", "components/reports/WeeklyRecapCard.tsx", "app/business/[id]/ActionPlanSection.tsx", "components/gbp/GoogleProfilePanel.tsx", "components/visits/SinceLastVisit.tsx"])
      expect(src(f), f).not.toMatch(/<GoogleMapsAttribution[^>]*className="[^"]*-m/);
  });
});

describe("the report PDF (monthly and weekly)", () => {
  const read = async (f: string) => new Uint8Array(await readFile(path.join(process.cwd(), "public", "sign-fonts", f)));
  const DATA: ReportData = {
    locale: "en",
    timeZone: "America/New_York",
    generatedAt: "2026-10-19T15:00:00Z",
    business: { name: "A Very Long Business Name That Keeps Going On And On For Two Lines", address: "2134 Broadway, New York, NY 10023" },
    score: { total: 71, grade: "B" },
    period: null,
    categories: [],
    rank: { rank: 3, of: 10, noun: "liquor stores", previousRank: 4 },
    changes: { listing: [], listingUnavailable: false, fixesConfirmed: 0 },
    nextSteps: [],
    reviews: { rating: 4.6, count: 219, countChange: 7, nearbyAverage: 184 },
  };

  test("the logo sits top right of the header, 12pt (16px, Google's minimum) tall; the name and address keep ≥10pt clear of it", async () => {
    const fonts = await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, read);
    const m = createMeasurer(fonts);
    const page = layoutReport(DATA, m);
    const els = page.panels[0].elements;
    const logo = els.find((e) => e.kind === "googleMapsLogo");
    expect(logo).toMatchObject({ kind: "googleMapsLogo", h: 12 });
    if (logo?.kind !== "googleMapsLogo") throw new Error("no logo");
    const logoW = logo.h * GOOGLE_MAPS_LOGO_RATIO;
    expect(logo.x + logoW).toBeCloseTo(LETTER.width - 48);
    for (const e of els) {
      if (e.kind !== "text" || e.y < logo.y - 10 || e.y - e.size > logo.y + logo.h + 10) continue;
      if (e.y <= 45) continue; // the "Generated" line above, ≥10pt away
      expect(e.x + m.width(e.text, e.role, e.size, e.letterSpacing ?? 0), e.text).toBeLessThanOrEqual(logo.x - 10);
    }

    // The PDF embeds Google's PNG as an image.
    const { bytes } = await renderPdf([page], { qrs: {}, fontBytes: fonts, title: "Report" });
    const doc = await PDFDocument.load(bytes);
    const images = doc.context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
    expect(images.length).toBeGreaterThanOrEqual(1);
    // The SVG preview shows the same logo.
    expect(renderPageSvg(page, { qrs: {}, fontFiles: Object.fromEntries(FONT_ROLES.map((r) => [r, "Inter.ttf"])) as Record<FontRole, string> })).toContain('<image href="/google/GoogleMaps_Logo_Gray.svg"');
  });
});

describe("the monthly email", () => {
  const render = (url?: string) =>
    renderToStaticMarkup(
      <MonthlyReportEmail {...SAMPLE_REAL_DELTAS} googleMapsLogoUrl={url} />
    );

  test("Google's logo (hosted, absolute URL) under the Google data, 16px tall with clear space; text 'Google Maps' without a URL", () => {
    const html = render("https://postscore.app/google/GoogleMaps_Logo_Gray_2x.png");
    expect(html).toMatch(/<img[^>]*alt="Google Maps"[^>]*src="https:\/\/postscore.app\/google\/GoogleMaps_Logo_Gray_2x.png"|<img[^>]*src="https:\/\/postscore.app\/google\/GoogleMaps_Logo_Gray_2x.png"[^>]*alt="Google Maps"/);
    expect(html).toMatch(/height="16"/);
    expect(html).toContain("padding:10px 10px 5px");
    const text = render();
    expect(text).toContain('translate="no"');
    expect(text).toContain(">Google Maps<");
    expect(text).toContain("color:#5E5E5E");
    expect(text).toContain("white-space:nowrap");
  });

  test("the cron sends the hosted logo URL", () => {
    expect(readFileSync("app/api/cron/monthly-reports/route.ts", "utf8").match(/googleMapsLogoUrl: `\$\{siteUrl\}\/google\/GoogleMaps_Logo_Gray_2x.png`/g)).toHaveLength(2);
  });
});
