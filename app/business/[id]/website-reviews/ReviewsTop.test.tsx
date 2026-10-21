import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/business/b1/website-reviews",
}));

import { LocaleProvider } from "@/lib/i18n";
import { ReviewsView } from "./ReviewsView";
import { SignStudio, ratingOption } from "./SignStudio";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { buildGoogleReviewUrl, shortReviewLink } from "@/lib/reviews";
import { defaultBasicChoices, defaultDesign } from "@/lib/signStudio/design";
import { Raster, scanRaster } from "@/lib/qrRaster.testUtil";
import type { Plan } from "@/lib/plan";
import type { ReviewsPageData } from "@/app/actions/reviews";

const PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const URL = buildGoogleReviewUrl(PLACE_ID);
const visibility = scoreBusiness(scoringInput()).categories.find((c) => c.id === "visibility")!;

function data(over: Partial<ReviewsPageData> = {}): ReviewsPageData {
  return {
    businessName: "Modern Liquors",
    address: null,
    category: null,
    primaryType: null,
    language: "en",
    timeZone: "America/New_York",
    placeId: PLACE_ID,
    rating: 4.5,
    reviewCount: 15,
    visibilityCategory: visibility,
    gbpConnected: false,
    verifiedSocials: [{ platform: "Instagram", url: "instagram.com/modernliquors" }],
    ...over,
  };
}

function render(opts: { locale?: "en" | "es"; plan?: Plan; dev?: boolean; data?: Partial<ReviewsPageData> } = {}) {
  return renderToStaticMarkup(
    <LocaleProvider locale={opts.locale ?? "en"} timeZone="America/New_York">
      <ReviewsView businessId="b1" reviews={data(opts.data)} plan={opts.plan ?? "free"} devPlanSwitch={opts.dev ?? false} />
    </LocaleProvider>
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

/** Paints the on-screen QR tile's SVG paths and scans them. */
function scanTile(html: string): string | null {
  const tile = html.match(/data-review-qr="[^"]*"[^>]*>(<svg[\s\S]*?<\/svg>)/)?.[1];
  if (!tile) return null;
  const scale = Number(tile.match(/scale\(([\d.]+)\)/)![1]) * 3; // 168px tile, painted at 3×
  const side = 168 * 3 + 40;
  const raster = new Raster(side, side);
  for (const [, d, fill] of Array.from(tile.matchAll(/<path d="([^"]+)" fill="([^"]+)"\/>/g))) raster.fillPath(d, fill, scale, 20, 20);
  return scanRaster(raster);
}

describe("Reviews page top section", () => {
  test("one header, the review link panel, and the on-screen QR — the exact copied link", () => {
    const html = render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(text(html)).toContain("Get more reviews and keep up with replies.");
    expect(shortReviewLink(URL)).toBe("search.google.com/local/writereview…");
    expect(html).toContain(`data-testid="review-link-display">search.google.com/local/writereview…<`);
    expect(text(html)).toContain("Copy link");
    expect(html).toContain(`data-review-qr="${URL.replace(/&/g, "&amp;")}"`);
    expect(scanTile(html)).toBe(URL);
    expect(text(html)).toContain("Scan to leave a review");
  });

  test("social proof: the review target is scoring's 150", () => {
    const t = text(render());
    expect(t).toContain("4.5★ of 5");
    expect(t).toContain("15 of 150");
  });
});

describe("plan tiers on the page", () => {
  test("Free: review link + plain QR PNG only, a small locked card, and no way to open the designer", () => {
    const html = render({ plan: "free" });
    const t = text(html);
    expect(t).toContain("Download QR (PNG)");
    expect(html).toContain('data-testid="sign-locked"');
    expect(t).toContain("Print a review sign for your counter — Grow and up");
    expect(t).not.toContain("Design your review sign");
    expect(t).not.toContain("Download sign (PDF)");
  });

  test.each(["grow", "premium", "multi"] as Plan[])("%s: download the sign and open the designer; plain QR PNG too", (plan) => {
    const html = render({ plan });
    const t = text(html);
    expect(t).toContain("Download sign (PDF)");
    expect(t).toContain("Design your review sign");
    expect(t).toContain("Download QR (PNG)");
    expect(html).not.toContain('data-testid="sign-locked"');
  });

  test("no per-page plan switch any more — the one dev-only pill lives in the root layout", () => {
    expect(render({ dev: true })).not.toContain("dev-plan-switch");
  });

  test("Spanish", () => {
    const t = text(render({ locale: "es", plan: "free" }));
    expect(t).toContain("Escanee para dejar una reseña");
    expect(t).toContain("Imprima un cartel de reseñas para su mostrador — desde el plan Grow");
    expect(text(render({ locale: "es", plan: "premium" }))).toContain("Diseñe su cartel de reseñas");
  });
});

describe("Design your review sign", () => {
  const content = { businessName: "Modern Liquors", rating: 4.5, reviewCount: 15, verifiedSocials: [{ platform: "Instagram", url: "instagram.com/modernliquors" }] };
  function renderStudio(access: "basic" | "studio", locale: "en" | "es" = "en", over: Partial<typeof content> = {}, initialTab?: string) {
    return renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <SignStudio
          access={access}
          businessId="b1"
          reviewUrl={URL}
          content={{ ...content, ...over }}
          basic={defaultBasicChoices()}
          onBasicChange={() => {}}
          design={defaultDesign(locale)}
          onDesignChange={() => {}}
          logo={null}
          onLogoFile={() => {}}
          logoNote={null}
          onClose={() => {}}
          initialTab={initialTab}
        />
      </LocaleProvider>
    );
  }
  const radios = (html: string, name: string) => Array.from(html.matchAll(new RegExp(`<input type="radio" name="${name}"[^>]*>`, "g"))).map((m) => m[0]);
  const lockedTabs = (html: string) => Array.from(html.matchAll(/data-tab="(\w+)" data-locked="true"/g)).map((m) => m[1]);

  test("the same compact tabbed panel: Template · Size · Text · Colors · QR · Extras", () => {
    const html = renderStudio("studio");
    expect(Array.from(html.matchAll(/data-tab="(\w+)"/g)).map((m) => m[1])).toEqual(["template", "size", "text", "colors", "qr", "extras"]);
    expect(html).not.toContain("<details");
  });

  test("Grow: only Style + Size active; the rest carry the Premium lock", () => {
    expect(lockedTabs(renderStudio("basic"))).toEqual(["template", "text", "qr", "extras"]);
    expect(radios(renderStudio("basic", "en", {}, "size"), "grow-size").filter((r) => !r.includes("data-locked"))).toHaveLength(2);
    expect(radios(renderStudio("basic", "en", {}, "colors"), "grow-theme").filter((r) => !r.includes("data-locked"))).toHaveLength(2);
    expect(radios(renderStudio("basic"), "layout").every((r) => r.includes("data-locked"))).toBe(true);
    expect(text(renderStudio("basic"))).toContain("Pick a style and a size. More designs come with Premium.");
    expect(text(renderStudio("basic"))).not.toContain("Reset to default");
  });

  test("Premium: preview first, no locks, Reset inside the panel", () => {
    const html = renderStudio("studio");
    expect(html.indexOf('data-testid="sign-preview"')).toBeLessThan(html.indexOf('data-tab="template"'));
    expect(lockedTabs(html)).toEqual([]);
    expect(html).not.toContain("data-locked");
    for (const s of ["Centered classic", "Split", "Minimal", "Bold banner", "Framed", "Reset to default", "Download PDF", "Print", "Download QR (PNG)"]) expect(text(html)).toContain(s);
    // Follow us offers only verified profiles — a list, never a text box.
    expect(renderStudio("studio", "en", {}, "text")).toMatch(/<option value="instagram.com\/modernliquors">Instagram: instagram.com\/modernliquors<\/option>/);
  });

  test("Follow us explains when there's no verified profile; rating only for 4.0★+", () => {
    expect(text(renderStudio("studio", "en", { verifiedSocials: [] }, "text"))).toContain("No verified social profiles yet");
    expect(ratingOption(content, "en")).toEqual({ allowed: true, hint: "Your real Google rating: 4.5★" });
    expect(ratingOption({ ...content, rating: 3.9 }, "en").allowed).toBe(false);
    expect(renderStudio("studio", "en", { rating: 3.9 }, "text")).toMatch(/type="checkbox" disabled=""[^>]*\/>[\s\S]{0,200}Show star rating/);
  });

  test("Spanish", () => {
    const t = text(renderStudio("studio", "es"));
    expect(t).toContain("Diseñe su cartel de reseñas");
    expect(t).toContain("Restablecer diseño");
    expect(t).toContain("Plantilla");
    expect(text(renderStudio("studio", "es", {}, "text"))).toContain("¿Le gustó su visita? ¡Déjenos una reseña!");
    expect(text(renderStudio("basic", "es"))).toContain("Elija un estilo y un tamaño.");
  });
});

describe("review sign designer: Ask PostAI", () => {
  test("'Confused? Ask PostAI →' opens PostAI with the review-sign question", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <SignStudio access="studio" businessId="b1" reviewUrl={URL} content={{ businessName: "M", rating: 4.5, reviewCount: 15, verifiedSocials: [] }} basic={defaultBasicChoices()} onBasicChange={() => {}} design={defaultDesign("en")} onDesignChange={() => {}} logo={null} onLogoFile={() => {}} logoNote={null} onClose={() => {}} />
      </LocaleProvider>
    );
    expect(html).toMatch(/href="\/business\/b1\?ask=review_sign"[^>]*>Confused\? Ask PostAI →/);
  });
});
