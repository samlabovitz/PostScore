import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("@/app/actions/businesses", () => ({ recheckWebsiteOnlyBusiness: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { WebsiteOnlyOverview, GOOGLE_BUSINESS_PROFILE_URL } from "./WebsiteOnlyOverview";
import { NeedsGoogleListing, type ListingOnlyPage } from "@/components/scoring/NeedsGoogleListing";
import { generateSuggestions, scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

// A website-only business: the website facts are real, every Google
// listing fact is missing (there is no listing).
const INPUT = {
  ...scoringInput(),
  rating: null,
  reviewCount: null,
  phone: null,
  address: null,
  openingHours: null,
  categories: null,
  primaryCategory: null,
  photoCount: null,
  businessStatus: null,
};
const BREAKDOWN = scoreBusiness(INPUT);
const WEBSITE = BREAKDOWN.categories.find((c) => c.id === "website")!;

function renderOverview(locale: "en" | "es" = "en") {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <WebsiteOnlyOverview
        businessId="b1"
        businessName="Jane's English Tutoring"
        website="https://janeenglish.com/"
        websiteCategory={WEBSITE}
        websiteFixes={generateSuggestions(BREAKDOWN).filter((s) => s.category === "website")}
        checkedAt="2026-10-16T15:00:00Z"
      />
    </LocaleProvider>
  ).replace(/&#x27;/g, "'");
}

describe("Website score — no Google listing", () => {
  test("labeled as a website score, never a PostScore, no grade, no competitor rank", () => {
    const html = renderOverview();
    expect(html).toContain("Website score — no Google listing");
    expect(html).toContain(`${Math.round(WEBSITE.relativeScore!)}<span class="text-lg text-ink-mute">/100</span>`);
    expect(html).toContain("This isn't a PostScore.");
    expect(html).not.toMatch(/>\s*[A-F]\s*</); // no grade badge
    expect(html).not.toMatch(/#\d+ of \d+/); // no competitor rank
    expect(html).not.toContain(String(BREAKDOWN.total) + "<"); // never the (meaningless) full total
  });

  test("the first fix is creating a Google Business Profile, with a link to Google and a way to link a listing later", () => {
    const html = renderOverview();
    const firstFix = html.indexOf("Your first fix");
    const websiteFixes = html.indexOf("Website fixes");
    expect(firstFix).toBeGreaterThan(-1);
    expect(firstFix).toBeLessThan(websiteFixes);
    expect(html).toContain("Create your Google Business Profile");
    expect(html).toContain(`href="${GOOGLE_BUSINESS_PROFILE_URL}"`);
    expect(html).toContain('href="/business/new?attach=b1"');
    expect(html).toContain("No storefront?");
  });

  test("Spanish", () => {
    const html = renderOverview("es");
    expect(html).toContain("Puntuación del sitio web — sin ficha de Google");
    expect(html).toContain("Cree su Perfil de Negocio de Google");
    expect(html).toContain("Esto no es un PostScore.");
    expect(html).not.toContain("Your first fix");
  });
});

describe("pages that need a Google listing", () => {
  const pages: ListingOnlyPage[] = ["growth", "reviews", "competitors", "pricing", "reports"];
  for (const page of pages) {
    test(`${page}: an honest reason in EN and ES, pointing to the first fix`, () => {
      for (const locale of ["en", "es"] as const) {
        const html = renderToStaticMarkup(
          <LocaleProvider locale={locale}>
            <NeedsGoogleListing businessId="b1" page={page} />
          </LocaleProvider>
        );
        expect(html).toContain(locale === "en" ? "This page needs a Google listing" : "Esta página necesita una ficha de Google");
        expect(html).toContain('href="/business/b1#create-google-profile"');
        expect(html).toContain('href="/business/b1/website"');
      }
    });
  }
});

describe("the website checks with no Google listing", () => {
  test('"Matches your Google listing" says there is no listing to compare — excluded, never a 0', () => {
    const noListing = {
      ...INPUT,
      websiteAnalysis: {
        ...INPUT.websiteAnalysis!,
        websiteTrust: {
          spamSignals: [],
          safeBrowsingThreat: null,
          safeBrowsingChecked: false,
          infoConflicts: [],
          staleNotices: [],
          abandonedSignals: { newestDateFound: null, templateLeftovers: [], looksAbandoned: false },
          websiteKind: "independent" as const,
          listingLinkBroken: false,
          checkedAt: "2026-10-16T00:00:00Z",
        },
      },
    };
    for (const locale of ["en", "es"] as const) {
      const check = scoreBusiness(noListing, locale).checks.find((c) => c.id === "website.info_consistency")!;
      expect(check.earnedPoints).toBeNull();
      expect(check.explanation).toContain(locale === "en" ? "There's no Google listing to compare" : "No hay una ficha de Google");
    }
  });
});
