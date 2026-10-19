import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { buildStarterSiteHtml } from "@/lib/starterSite";
import { StarterSiteBuilder } from "./StarterSiteBuilder";

const PROPS = {
  businessId: "b1",
  businessName: "Modern Liquors",
  businessLanguage: "en",
  category: "Liquor store",
  phone: "+1 302-800-5116",
  address: "246 E Delaware Ave, Newark, DE 19711, USA",
  openingHours: ["Monday: 11:00 AM – 10:00 PM"],
  openingHoursPeriods: [{ open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }],
  timeZone: "America/New_York",
  rating: 4.5,
  reviewCount: 15,
  googleMapsUri: "https://maps.google.com/?cid=5",
  priceLevel: "PRICE_LEVEL_INEXPENSIVE",
  socialLinks: [{ platform: "Instagram", url: "instagram.com/modernliquors" }],
  year: 2026,
  profileId: "liquor_store",
  builderOfferReason: "no_website" as const,
};

const render = (locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <StarterSiteBuilder {...PROPS} />
    </LocaleProvider>
  );

const unescapeAttr = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

describe("starter site builder", () => {
  test("the live preview is exactly the downloaded file", () => {
    const srcDoc = unescapeAttr(render().match(/srcDoc="([^"]*)"/i)![1]);
    const download = buildStarterSiteHtml({
      locale: "en",
      businessName: PROPS.businessName,
      category: PROPS.category,
      tagline: "",
      taglineFontId: "classic",
      taglineColor: null,
      taglineSize: "medium",
      taglinePlacement: "below",
      phone: PROPS.phone,
      address: PROPS.address,
      openingHours: PROPS.openingHours,
      openingHoursPeriods: PROPS.openingHoursPeriods,
      ownerHours: null,
      timeZone: PROPS.timeZone,
      rating: PROPS.rating,
      reviewCount: PROPS.reviewCount,
      googleMapsUri: PROPS.googleMapsUri,
      priceLevel: PROPS.priceLevel,
      socialLinks: PROPS.socialLinks,
      year: 2026,
      profileId: PROPS.profileId,
      themeId: "ink",
      customAccent: null,
      fontId: "classic",
      accentStyle: "dots",
      show: { address: true, phone: true, hours: true, rating: true },
      heroImage: null,
      contentImages: [],
    });
    expect(srcDoc).toBe(download);
    expect(download).toContain("© 2026 Modern Liquors");
    expect(download).toContain('href="https://instagram.com/modernliquors"');
  });

  test("themes grouped Classic · Bold · Light · Earthy, all 18; Style accents with 4 options + None", () => {
    const html = render();
    const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    const groups = ["Classic", "Bold", "Light", "Earthy"].map((g) => text.indexOf(` ${g} `));
    expect(groups.every((i) => i > 0)).toBe(true);
    expect([...groups].sort((a, b) => a - b)).toEqual(groups);
    expect(html.match(/aria-label="[^"]+" aria-pressed="(?:true|false)" class="flex h-10 w-10/g)).toHaveLength(18);
    for (const label of ["Sage & Cream", "Blush & Charcoal", "Sky & Navy", "Sand & Terracotta"]) expect(html).toContain(`aria-label="${label.replace("&", "&amp;")}"`);
    expect(text).toContain("Style accents");
    for (const label of ["Dots & curves", "Fine lines & angles", "Soft waves", "Playful shapes", "None"]) expect(text).toContain(label);
  });

  test("Spanish dashboard labels", () => {
    const text = render("es").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("Detalles de estilo");
    expect(text).toContain("Claros");
    expect(text).toContain("Ondas suaves");
  });
});
