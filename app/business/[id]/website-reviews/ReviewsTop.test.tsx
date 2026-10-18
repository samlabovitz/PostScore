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

  test("the dev-only plan switch shows only when the page asks for it (local dev)", () => {
    expect(render()).not.toContain("dev-plan-switch");
    const html = render({ dev: true, plan: "grow" });
    expect(html).toContain("dev-plan-switch");
    expect(html).toContain("/api/dev/plan?plan=premium&amp;back=%2Fbusiness%2Fb1%2Fwebsite-reviews");
    expect(html).toMatch(/aria-current="true"[^>]*>Grow</);
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
  function renderStudio(access: "basic" | "studio", locale: "en" | "es" = "en", over: Partial<typeof content> = {}) {
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
        />
      </LocaleProvider>
    );
  }
  const radios = (html: string, name: string) => Array.from(html.matchAll(new RegExp(`<input type="radio" name="${name}"[^>]*>`, "g"))).map((m) => m[0]);

  test("Grow gets exactly 2 options — Style (Classic, Clean) and Size (tent, full page); everything else is a locked Premium preview", () => {
    const html = renderStudio("basic");
    const style = radios(html, "grow-theme");
    const size = radios(html, "grow-size");
    expect(style.filter((r) => !r.includes("data-locked"))).toHaveLength(2);
    expect(size.filter((r) => !r.includes("data-locked"))).toHaveLength(2);
    expect(text(html)).toContain("Pick a style and a size. More designs come with Premium.");
    // Every other option is behind the lock.
    for (const name of ["layout", "qrDots", "qrCorners", "qrCenter", "border", "background", "radius", "textSize", "language"]) {
      const group = radios(html, name);
      expect(group.length, name).toBeGreaterThan(0);
      expect(group.every((r) => r.includes("data-locked")), name).toBe(true);
    }
    expect(text(html).match(/Premium/g)!.length).toBeGreaterThanOrEqual(8);
    // No logo upload for Grow, and no Reset (nothing to reset).
    expect(text(html)).not.toContain("Add a logo");
    expect(text(html)).not.toContain("Reset to default");
  });

  test("Premium: the full Sign Studio, preview first, all sections, no locks, Reset", () => {
    const html = renderStudio("studio");
    const t = text(html);
    expect(html.indexOf('data-testid="sign-preview"')).toBeLessThan(html.indexOf("Layout"));
    for (const s of ["Layout", "Size", "Colors", "Font", "Text", "Logo", "QR style", "Extras", "Reset to default", "Add a logo", "Download PDF", "Print", "Download QR (PNG)"]) expect(t).toContain(s);
    for (const s of ["Centered classic", "Split", "Minimal", "Bold banner", "Framed", "4 cards per page", "Playfair Display", "DM Serif Display", "Oswald"]) expect(t).toContain(s);
    expect(html).not.toContain("data-locked");
    expect(html).toMatch(/<details[^>]*open=""[^>]*>\s*<summary[^>]*>[\s\S]*?Layout/);
    // Follow us offers only verified profiles — a list, never a text box.
    expect(html).toMatch(/<option value="instagram.com\/modernliquors">Instagram: instagram.com\/modernliquors<\/option>/);
  });

  test("Follow us explains when there's no verified profile; rating only for 4.0★+", () => {
    expect(text(renderStudio("studio", "en", { verifiedSocials: [] }))).toContain("No verified social profiles yet");
    expect(ratingOption(content, "en")).toEqual({ allowed: true, hint: "Your real Google rating: 4.5★" });
    expect(ratingOption({ ...content, rating: 3.9 }, "en").allowed).toBe(false);
    expect(renderStudio("studio", "en", { rating: 3.9 })).toMatch(/type="checkbox" disabled=""[^>]*\/>[\s\S]{0,200}Show star rating/);
  });

  test("Spanish", () => {
    const t = text(renderStudio("studio", "es"));
    expect(t).toContain("Diseñe su cartel de reseñas");
    expect(t).toContain("Restablecer diseño");
    expect(t).toContain("¿Le gustó su visita? ¡Déjenos una reseña!");
    expect(text(renderStudio("basic", "es"))).toContain("Elija un estilo y un tamaño.");
  });
});
