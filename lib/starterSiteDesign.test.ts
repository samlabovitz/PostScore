import { describe, expect, test } from "vitest";
import {
  STARTER_SITE_THEMES,
  STARTER_SITE_THEME_GROUPS,
  buildStarterSiteHtml,
  cityFromAddress,
  hasStorefront,
  monthYear,
  starterSitePalette,
  type StarterSiteInput,
} from "./starterSite";
import { ACCENT_STYLES, businessIcon } from "./starterSiteArt";
import { hoursStatusAt, hoursSummary, scriptSchedule } from "./starterSiteHours";
import { contrastRatio } from "./color";
import { analyzeWebsiteHtml } from "./websiteContentAnalysis";
import { businessRowToScoringInput, scoreBusiness, type BusinessScoringRow } from "./scoring";
import { defaultOwnerHours, type OwnerHours } from "./ownerHours";

const WEEK: OwnerHours = {
  mode: "weekly",
  days: [
    { open: true, allDay: false, ranges: [{ open: "09:00", close: "17:00" }] },
    { open: true, allDay: false, ranges: [{ open: "09:00", close: "17:00" }] },
    { open: true, allDay: false, ranges: [{ open: "09:00", close: "17:00" }] },
    { open: true, allDay: false, ranges: [{ open: "09:00", close: "12:00" }, { open: "13:00", close: "19:00" }] },
    { open: true, allDay: false, ranges: [{ open: "18:00", close: "02:00" }] },
    { open: true, allDay: true, ranges: [{ open: "00:00", close: "00:00" }] },
    { open: false, allDay: false, ranges: [{ open: "09:00", close: "17:00" }] },
  ],
  note: "",
};

const photo = (i: number) => ({ dataUri: `data:image/jpeg;base64,AAA${i}`, alt: `Photo ${i}` });

const SALON: StarterSiteInput = {
  locale: "en",
  businessName: "Hudson Shears",
  category: "Beauty salon",
  tagline: "",
  taglineFontId: "classic",
  taglineColor: null,
  taglineSize: "medium",
  taglinePlacement: "below",
  phone: "+1 914-591-3737",
  address: "20 W Main St #1, Irvington, NY 10533, USA",
  openingHours: null,
  openingHoursPeriods: null,
  ownerHours: WEEK,
  timeZone: "America/New_York",
  rating: 4.7,
  reviewCount: 10,
  ratingAsOf: "2026-10-16T15:00:00Z",
  googleMapsUri: "https://maps.google.com/?cid=111",
  priceLevel: null,
  socialLinks: [],
  year: 2026,
  profileId: "salon",
  themeId: "ink",
  customAccent: null,
  fontId: "classic",
  accentStyle: "dots",
  show: { address: true, phone: true, hours: true, rating: true },
  heroImage: null,
  contentImages: [],
};

describe("color themes", () => {
  test("18 themes in four groups, with the four named light ones", () => {
    expect(STARTER_SITE_THEMES).toHaveLength(18);
    expect(STARTER_SITE_THEME_GROUPS).toEqual(["classic", "bold", "light", "earthy"]);
    for (const group of STARTER_SITE_THEME_GROUPS) expect(STARTER_SITE_THEMES.filter((t) => t.group === group).length).toBeGreaterThanOrEqual(4);
    expect(STARTER_SITE_THEMES.filter((t) => t.group === "light").map((t) => t.label)).toEqual(["Sage & Cream", "Blush & Charcoal", "Sky & Navy", "Sand & Terracotta"]);
  });

  test("every theme (with or without a hero photo, and with odd custom accents) reads at WCAG AA 4.5:1", () => {
    const accents = (theme: { accent: string }) => [theme.accent, "#ffff00", "#ff00aa", "#777777", "#0a0a0a"];
    for (const theme of STARTER_SITE_THEMES) {
      for (const accent of accents(theme)) {
        for (const photo of [false, true]) {
          const c = starterSitePalette(theme, accent, photo);
          const pairs: Array<[string, string, string]> = [];
          for (const bg of [c.surface, c.pageBg, c.altBg]) for (const fg of [c.ink, c.soft, c.mute, c.link]) pairs.push([fg, bg, "page"]);
          for (const fg of [c.heroText, c.heroSoft, c.heroAccent]) pairs.push([fg, c.heroSurface, "hero"]);
          pairs.push([c.onAccent, c.accent, "button"]);
          for (const fg of [c.footerText, c.footerMute, c.footerLink]) pairs.push([fg, c.footerBg, "footer"]);
          for (const [fg, bg, where] of pairs) {
            expect(contrastRatio(fg, bg), `${theme.id} ${accent} ${where} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });
});

describe("style accents", () => {
  test("4 options + None; None draws no pattern, divider or icons", () => {
    expect(ACCENT_STYLES).toEqual(["dots", "lines", "waves", "shapes", "none"]);
    const plain = buildStarterSiteHtml({ ...SALON, accentStyle: "none" });
    expect(plain).not.toContain('class="divider"');
    expect(plain).not.toContain('class="sec-ico"');
    expect(plain).not.toContain('class="type-badge"');
    expect(plain).not.toContain("radial-gradient");
    const htmls = ACCENT_STYLES.map((accentStyle) => buildStarterSiteHtml({ ...SALON, accentStyle }));
    expect(new Set(htmls).size).toBe(5);
  });

  test("the business-type icon follows the type; all inline, no image files", () => {
    expect(businessIcon("salon")).toBe("scissors");
    expect(businessIcon("barbershop")).toBe("scissors");
    expect(businessIcon("liquor_store")).toBe("bottle");
    expect(businessIcon("cafe")).toBe("cup");
    expect(businessIcon("something_new")).toBe("store");
    for (const accentStyle of ACCENT_STYLES) {
      const html = buildStarterSiteHtml({ ...SALON, accentStyle });
      expect(html).not.toMatch(/<img|\.png|\.svg"|\.jpg|<iframe/);
    }
  });
});

describe("open now (the exact script the page runs)", () => {
  const s = scriptSchedule(WEEK, "en");
  test.each([
    [0, 10 * 60, true, "until 5:00 PM"],
    [0, 8 * 60, false, "opens at 9:00 AM"],
    [0, 18 * 60, false, "opens tomorrow at 9:00 AM"],
    [3, 12 * 60 + 30, false, "opens at 1:00 PM"],
    [4, 23 * 60, true, "until 2:00 AM"],
    [5, 60, true, "until 2:00 AM"],
    [5, 15 * 60, true, "Open 24 hours"],
    [6, 12 * 60, false, "opens tomorrow at 9:00 AM"],
  ])("day %i minute %i → open %s, %s", (day, minute, open, detail) => {
    expect(hoursStatusAt(s, day, minute, "en")).toEqual([open, detail]);
  });

  test("a closed weekend: opens Monday", () => {
    expect(hoursStatusAt(scriptSchedule(defaultOwnerHours(), "en"), 5, 600, "en")).toEqual([false, "opens Monday at 9:00 AM"]);
  });

  test("Spanish", () => {
    expect(hoursStatusAt(scriptSchedule(defaultOwnerHours(), "es"), 5, 600, "es")).toEqual([false, "abre el lunes a las 9:00 a.m."]);
    expect(hoursStatusAt(scriptSchedule(WEEK, "es"), 0, 600, "es")).toEqual([true, "hasta las 5:00 p.m."]);
  });

  test("the tile stays hidden until the script fills it — never a guessed status in the file", () => {
    const html = buildStarterSiteHtml(SALON);
    expect(html).toContain('<div class="tile" id="today-tile" hidden>');
    expect(html).toContain('timeZone:"America/New_York"');
    expect(html).not.toMatch(/class="now-state">[^<]/);
  });

  test("footer summary groups days with the same hours", () => {
    expect(hoursSummary(defaultOwnerHours(), "en")).toEqual(["Mon–Fri 9:00 AM – 5:00 PM", "Sat–Sun Closed"]);
    expect(hoursSummary(defaultOwnerHours(), "es")).toEqual(["Lun–Vie 9:00 a.m. – 5:00 p.m.", "Sáb–Dom Cerrado"]);
  });
});

describe("only real data on the page", () => {
  test("hero: name, category + city, Call now, Get directions, rating badge only at 4.0+", () => {
    const html = buildStarterSiteHtml(SALON);
    expect(html).toContain("<h1>Hudson Shears</h1>");
    expect(html).toContain('<div class="category">Beauty salon in Irvington, NY</div>');
    expect(html).toContain('href="tel:+19145913737">');
    expect(html).toContain("Call now</a>");
    expect(html).toContain("Get directions</a>");
    expect(html).toContain('class="rating-badge"');
    expect(html).toContain("4.7 · 10 Google reviews · Oct 2026");
    const low = buildStarterSiteHtml({ ...SALON, rating: 3.9 });
    expect(low).not.toContain('class="rating-badge"');
    expect(low).toContain("3.9★ from 10 Google reviews · as of Oct 2026");
  });

  test("at a glance: area only from a recognizable address, price only when Google has one", () => {
    expect(cityFromAddress("20 W Main St #1, Irvington, NY 10533, USA")).toBe("Irvington, NY");
    expect(cityFromAddress("742 Evergreen Terrace, Springfield")).toBeNull();
    expect(cityFromAddress(null)).toBeNull();
    const none = buildStarterSiteHtml(SALON);
    expect(none).not.toContain("Prices</div>");
    const priced = buildStarterSiteHtml({ ...SALON, priceLevel: "PRICE_LEVEL_MODERATE" });
    expect(priced).toContain('Prices</div><div class="tile-value">$$</div>');
    expect(priced).toContain('"priceRange":"$$"');
    expect(buildStarterSiteHtml({ ...SALON, address: "Somewhere" })).not.toContain("Area</div>");
  });

  test("reviews: real rating, partial stars, count, link to Google — never quoted review text", () => {
    const html = buildStarterSiteHtml(SALON);
    expect(html).toContain('<span class="score">4.7</span>');
    expect(html).toContain('style="width:70%"');
    expect(html).toContain("Read our reviews on Google →");
    expect(html).not.toMatch(/<blockquote|“[^”]+”/);
    expect(html).not.toContain("aggregateRating");
  });

  test("location without a map key: address + Open in Google Maps, no iframe", () => {
    const html = buildStarterSiteHtml(SALON);
    expect(html).toContain("Open in Google Maps →");
    expect(html).toContain('href="https://maps.google.com/?cid=111"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("output=embed");
  });

  test("photo gallery: a layout for 1, 2, 3 and 4 photos", () => {
    for (const n of [1, 2, 3, 4]) {
      const html = buildStarterSiteHtml({ ...SALON, contentImages: Array.from({ length: n }, (_, i) => photo(i)) });
      expect(html).toContain(`<div class="gallery n${n}">`);
      expect(html.match(/<img /g)).toHaveLength(n);
    }
  });

  test("footer: name, address, phone, hours summary, verified socials only, copyright year", () => {
    const html = buildStarterSiteHtml({ ...SALON, socialLinks: [{ platform: "Instagram", url: "instagram.com/hudsonshears" }] });
    const footer = html.slice(html.indexOf('<footer class="site-footer">'));
    expect(footer).toContain("Hudson Shears");
    expect(footer).toContain("20 W Main St #1, Irvington, NY 10533, USA");
    expect(footer).toContain("+1 914-591-3737");
    expect(footer).toContain("Mon–Wed 9:00 AM – 5:00 PM");
    expect(footer).toContain('href="https://instagram.com/hudsonshears"');
    expect(footer).toContain("© 2026 Hudson Shears");
    expect(html).toContain('"sameAs":["https://instagram.com/hudsonshears"]');
    expect(buildStarterSiteHtml(SALON)).not.toContain("Follow us");
  });

  test("Spanish (usted)", () => {
    const html = buildStarterSiteHtml({ ...SALON, locale: "es" });
    expect(html).toContain("Llamar ahora");
    expect(html).toContain("Horario de hoy");
    expect(html).toContain("Abrir en Google Maps →");
    expect(html).toContain("Lea nuestras reseñas en Google →");
    expect(html).toContain("Lun–Mié 9:00 a.m. – 5:00 p.m.");
    expect(html).toContain("Beauty salon en Irvington, NY");
  });
});

describe("our own website checks on the generated page", () => {
  const ROW: BusinessScoringRow = {
    rating: 4.6,
    review_count: 40,
    phone: null,
    address: null,
    opening_hours: ["Monday: 9:00 AM – 5:00 PM"],
    website: "https://example.com",
    categories: null,
    category: null,
    photo_count: 6,
    business_status: "OPERATIONAL",
    https_status: "https",
    website_analysis_json: null,
  };
  const BUSINESSES: Array<[string, StarterSiteInput]> = [
    ["Hudson Shears (salon)", { ...SALON, contentImages: [photo(1), photo(2), photo(3)] }],
    [
      "Modern Liquors (liquor store)",
      {
        ...SALON,
        businessName: "Modern Liquors",
        category: "Liquor store",
        phone: "+1 302-800-5116",
        address: "246 E Delaware Ave, Newark, DE 19711, USA",
        rating: 4.5,
        reviewCount: 15,
        profileId: "liquor_store",
        priceLevel: "PRICE_LEVEL_INEXPENSIVE",
        themeId: "sky",
        accentStyle: "waves",
      },
    ],
    [
      "Café Luna (Spanish, light theme)",
      {
        ...SALON,
        locale: "es",
        businessName: "Café Luna",
        category: "Cafetería",
        phone: "+1 305-555-0142",
        address: "100 SW 8th St, Miami, FL 33130, USA",
        rating: 4.2,
        reviewCount: 88,
        profileId: "cafe",
        themeId: "sand",
        accentStyle: "shapes",
        ownerHours: defaultOwnerHours(),
        contentImages: [photo(1)],
      },
    ],
  ];

  test.each(BUSINESSES)("%s: viewport, HTTPS-ready, tap-to-call, title/meta, LocalBusiness with real hours, fast", (label, input) => {
    const html = buildStarterSiteHtml(input);
    const signals = analyzeWebsiteHtml(html);
    expect(signals.hasViewportTag).toBe(true);
    expect(signals.hasTitle).toBe(true);
    expect(signals.hasMetaDescription).toBe(true);
    expect(signals.hasPhoneLink).toBe(true);
    expect(signals.hasCtaText).toBe(true);
    expect(signals.headingCount).toBeGreaterThanOrEqual(4);
    expect(signals.isLikelyClientRenderedShell).toBe(false);
    // HTTPS-ready: nothing loads or links over plain http.
    expect(html).not.toMatch(/(?:src|href)="http:|url\(["']?http:/);
    // schema.org LocalBusiness with the real hours.
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld.telephone).toBe(input.phone);
    expect(ld.openingHoursSpecification.length).toBeGreaterThan(0);
    expect(ld.openingHoursSpecification[0]).toMatchObject({ dayOfWeek: "https://schema.org/Monday", opens: "09:00" });
    // Fast: one small file, no scripts loaded from elsewhere, no embeds.
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html.length).toBeLessThan(40_000);

    const breakdown = scoreBusiness(
      businessRowToScoringInput({
        ...ROW,
        phone: input.phone,
        address: input.address,
        website_analysis_json: { content: signals, mobilePerformance: null, screenshotUrl: null, checkedAt: "2026-10-19T12:00:00Z" },
      }),
      "en"
    );
    const website = breakdown.categories.find((c) => c.id === "website")!;
    const checked = website.checks.filter((c) => c.earnedPoints !== null);
    const earned = checked.reduce((sum, c) => sum + (c.earnedPoints ?? 0), 0);
    const possible = checked.reduce((sum, c) => sum + c.maxPoints, 0);
    console.log(
      `\n[website checks] ${label}: ${Math.round(earned * 10) / 10} / ${Math.round(possible * 10) / 10} of the checks we can run on a file (speed needs a live URL)\n` +
        website.checks.map((c) => `  ${c.earnedPoints === null ? "–" : c.earnedPoints >= c.maxPoints ? "✓" : "✗"} ${c.id} ${c.earnedPoints ?? "not checked"} / ${c.maxPoints}`).join("\n")
    );
    for (const id of ["website.has_website", "website.https", "website.content_depth", "website.contact_conversion"]) {
      const check = website.checks.find((c) => c.id === id)!;
      expect(check.earnedPoints, id).toBe(check.maxPoints);
    }
  });
});

describe("ratings can't go stale in a downloaded file", () => {
  test("toggle off (the default): no rating number anywhere — just a link to Google", () => {
    const html = buildStarterSiteHtml({ ...SALON, show: { ...SALON.show, rating: false } });
    expect(html).not.toMatch(/4\.7/);
    expect(html).not.toContain('class="rating-badge"');
    expect(html).not.toContain('class="score"');
    expect(html).not.toMatch(/\d+ Google reviews?/);
    expect(html).toContain("See what customers say on Google");
    expect(html).toContain("Read our reviews on Google →");
  });

  test("toggle on: the rating with its date, in the block and the hero badge", () => {
    const html = buildStarterSiteHtml(SALON);
    expect(html).toContain("4.7★ from 10 Google reviews · as of Oct 2026");
    expect(html).toContain("4.7 · 10 Google reviews · Oct 2026");
    const es = buildStarterSiteHtml({ ...SALON, locale: "es" });
    expect(es).toContain("4.7★ de 10 reseñas de Google · a octubre de 2026");
  });

  test("no date known: the number isn't printed at all", () => {
    const html = buildStarterSiteHtml({ ...SALON, ratingAsOf: null });
    expect(html).not.toMatch(/4\.7/);
    expect(html).toContain("See what customers say on Google");
  });

  test("the month is the business's own (a late-night scan stays in its month)", () => {
    expect(monthYear("2026-11-01T02:00:00Z", "en", "America/Los_Angeles")).toBe("Oct 2026");
    expect(monthYear("2026-11-01T02:00:00Z", "es", "America/New_York")).toBe("octubre de 2026");
  });

  test("schema.org: LocalBusiness with name, address, phone, hours — never aggregateRating or reviews", () => {
    for (const rating of [true, false]) {
      const html = buildStarterSiteHtml({ ...SALON, show: { ...SALON.show, rating } });
      const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
      expect(ld).toMatchObject({ "@type": "LocalBusiness", name: "Hudson Shears", telephone: SALON.phone, address: SALON.address });
      expect(ld.openingHoursSpecification.length).toBeGreaterThan(0);
      expect(html).not.toMatch(/aggregateRating|"review"|ratingValue|reviewCount/);
    }
  });
});

describe("the storefront map", () => {
  const KEY = { key: "test-embed-key", placeId: "ChIJ_test-Place_123" };

  test("storefront + key: an embedded map (place mode, loaded eagerly) with the address, Google Maps link and directions", () => {
    const html = buildStarterSiteHtml({ ...SALON, storefront: true, mapEmbed: KEY });
    expect(html).toContain('<iframe class="map" src="https://www.google.com/maps/embed/v1/place?key=test-embed-key&amp;q=place_id:ChIJ_test-Place_123" referrerpolicy="no-referrer-when-downgrade"');
    // Never lazy: a lazy map inside the preview frames (srcdoc) never loads.
    expect(html).not.toMatch(/<iframe class="map"[^>]*loading="lazy"/);
    const map = html.indexOf('<iframe class="map"');
    expect(html.indexOf("20 W Main St #1", map)).toBeGreaterThan(map);
    expect(html.indexOf("Open in Google Maps →", map)).toBeGreaterThan(map);
    expect(html.indexOf("https://www.google.com/maps/dir/?api=1", map)).toBeGreaterThan(map);
    expect(map).toBeLessThan(html.indexOf('<footer class="site-footer">'));
    expect(map).toBeGreaterThan(html.indexOf('id="reviews"'));
    // Still fast: the only outside resources are the fonts and the map.
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  test("no key: the address and link, no iframe at all", () => {
    for (const mapEmbed of [null, undefined, { key: "  ", placeId: "ChIJx" }]) {
      const html = buildStarterSiteHtml({ ...SALON, storefront: true, mapEmbed });
      expect(html).not.toContain("<iframe");
      expect(html).toContain("20 W Main St #1, Irvington, NY 10533, USA");
      expect(html).toContain("Open in Google Maps →");
    }
  });

  test("no storefront (service area / website only): no map, no street, no directions — just the city", () => {
    const html = buildStarterSiteHtml({ ...SALON, address: "Irvington, NY, USA", storefront: false, mapEmbed: KEY });
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Get directions");
    expect(html).not.toContain("maps/dir");
    expect(html).toContain("Based in Irvington, NY");
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    expect(ld.address).toBe("Irvington, NY");
    const hidden = buildStarterSiteHtml({ ...SALON, storefront: false, mapEmbed: KEY });
    expect(hidden).not.toContain("20 W Main St");
    expect(hidden).toContain("Based in Irvington, NY");
  });

  test("what counts as a storefront", () => {
    const place = "ChIJabc";
    expect(hasStorefront({ listingMode: "google", placeId: place, address: "20 W Main St #1, Irvington, NY 10533, USA" })).toBe(true);
    // Google hides a service-area business's street.
    expect(hasStorefront({ listingMode: "google", placeId: place, address: "Irvington, NY, USA" })).toBe(false);
    expect(hasStorefront({ listingMode: "google", placeId: place, address: "Irvington, NY 10533, USA" })).toBe(false);
    expect(hasStorefront({ listingMode: "website_only", placeId: null, address: "20 W Main St, Irvington, NY 10533" })).toBe(false);
    expect(hasStorefront({ listingMode: "google", placeId: "", address: "20 W Main St, Irvington, NY 10533, USA" })).toBe(false);
    expect(hasStorefront({ listingMode: "google", placeId: place, address: null })).toBe(false);
  });
});
