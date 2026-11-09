import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/" }));

// Online ordering, step 1 (Nov 10): Google's takeout / delivery / curbside /
// dine-in, asked for and saved (no points), shown as information for food
// businesses; one shared ordering-platform list. Google is mocked — no
// real call.

import { SERVICE_OPTION_FIELDS, searchTextCompetitors, serviceOptionsFrom } from "@/lib/google/places";
import { FOOD_PROFILE_IDS, isFoodBusiness, parseServiceOptions, serviceOptionsLine } from "@/lib/serviceOptions";
import { ORDERING_PLATFORMS, isOrderingHost, isOwnOrderingSubdomain, orderingPlatformFor } from "@/lib/orderingPlatforms";
import { KNOWN_ORDERING_PLATFORM_HOSTS, isKnownOrderingPlatformHost } from "@/lib/pagePresenceDetection";
import { platformPage } from "@/lib/socialLinkCheck";
import { savedScanRow, type RankedCompetitor } from "@/lib/competitors";
import { foodRescanCalls, foodRescanTargets } from "../scripts/rescan-food";
import { ScoreBreakdownPanel } from "@/components/overview/ScoreBreakdownPanel";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { scoreBusiness } from "@/lib/scoring";
import { LocaleProvider, type Locale } from "@/lib/i18n";

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

afterEach(() => vi.unstubAllEnvs());

describe("asked for, and saved as Google states them", () => {
  test("Place Details and the competitor searches ask for the four fields", () => {
    expect(SERVICE_OPTION_FIELDS).toEqual(["takeout", "delivery", "curbsidePickup", "dineIn"]);
    const src = readFileSync("lib/google/places.ts", "utf8");
    const details = src.slice(src.indexOf("const DETAILS_FIELD_MASK"), src.indexOf("].join", src.indexOf("const DETAILS_FIELD_MASK")));
    expect(details).toContain("...SERVICE_OPTION_FIELDS,");
    const nearby = src.slice(src.indexOf("const NEARBY_SEARCH_FIELD_MASK"), src.indexOf("].join", src.indexOf("const NEARBY_SEARCH_FIELD_MASK")));
    expect(nearby).toContain("...SERVICE_OPTION_FIELDS.map((f) => `places.${f}`),");
  });

  test("missing = unknown, never “no”; Google's own false is kept", () => {
    expect(serviceOptionsFrom({ takeout: true, delivery: false })).toEqual({ takeout: true, delivery: false });
    expect(serviceOptionsFrom({})).toEqual({});
    expect(serviceOptionsFrom({ takeout: "yes" as unknown as boolean })).toEqual({});
    expect(parseServiceOptions(null)).toBeNull();
    expect(parseServiceOptions({ dineIn: true, junk: 1 })).toEqual({ dineIn: true });
  });

  test("a competitor search returns them from the same call (mocked), and the scan row saves them", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    let mask = "";
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      mask = (init?.headers as Record<string, string>)["X-Goog-FieldMask"];
      return new Response(JSON.stringify({ places: [{ id: "p1", displayName: { text: "Taco Place" }, takeout: true, curbsidePickup: false }] }), { status: 200 });
    }) as typeof fetch;
    const [hit] = await searchTextCompetitors({ textQuery: "tacos in Newark", lat: 39.68, lng: -75.75, radiusMeters: 5000 }, fetchImpl);
    expect(mask).toContain("places.takeout,places.delivery,places.curbsidePickup,places.dineIn");
    expect(hit.details.serviceOptions).toEqual({ takeout: true, curbsidePickup: false });
    const row = savedScanRow({ placeId: "p1", name: "Taco Place", isSubject: false, address: null, distanceMeters: 100, rating: null, reviewCount: null, hasWebsite: false, googleMapsUri: null, breakdown: scoreBusiness(scoringInput()), priceLevel: null, photoCount: 0, serviceOptions: hit.details.serviceOptions } as RankedCompetitor, "scan", "biz");
    expect(row.service_options).toEqual({ takeout: true, curbsidePickup: false });
  });

  test("the save never fails before supabase/service-options.sql is run", () => {
    const save = readFileSync("app/actions/businesses.ts", "utf8");
    expect(save).toContain("update({ google_service_options: place.serviceOptions })");
    const scans = readFileSync("app/actions/competitors.ts", "utf8");
    expect(scans).toContain('filter(([k]) => k !== "service_options")');
  });
});

describe("shown as information for food businesses — never “online ordering”", () => {
  test("food businesses: restaurant, café, bakery, dessert", () => {
    expect(FOOD_PROFILE_IDS).toEqual(["restaurant", "cafe", "bakery", "dessert_shop"]);
    expect(isFoodBusiness("cafe")).toBe(true);
    expect(isFoodBusiness("salon")).toBe(false);
    expect(isFoodBusiness(null)).toBe(false);
  });

  test("the line (EN + ES)", () => {
    const opts = { takeout: true, delivery: true, dineIn: false };
    expect(serviceOptionsLine(opts, "en")).toBe("Google shows: Takeout ✓ · Delivery ✓ · Curbside — not listed · Dine-in — no");
    expect(serviceOptionsLine(opts, "es")).toBe("Google muestra: Para llevar ✓ · Entrega a domicilio ✓ · Recogida en la acera: no aparece · Comer en el local: no");
    for (const locale of ["en", "es"] as const) expect(serviceOptionsLine({}, locale).toLowerCase()).not.toMatch(/online|en línea|order|pedido/);
  });

  test("on the Google Listing Completeness card only, with “not part of your score”", () => {
    const categories = scoreBusiness(scoringInput()).categories;
    const html = wrap(<ScoreBreakdownPanel businessId="b" categories={categories} hasWebsite scoreBasis={100} serviceOptions={{ takeout: true }} />);
    expect(html).toContain('data-testid="service-options"');
    expect(html.match(/data-testid="service-options"/g)).toHaveLength(1);
    expect(html).toContain("Google shows: Takeout ✓");
    expect(html).toContain("For your information — not part of your score.");
    expect(wrap(<ScoreBreakdownPanel businessId="b" categories={categories} hasWebsite scoreBasis={100} />)).not.toContain("service-options");
  });

  test("no points: scoring never reads them", () => {
    expect(readFileSync("lib/scoring.ts", "utf8")).not.toMatch(/serviceOptions|takeout|curbside/i);
  });
});

describe("one shared ordering-platform list", () => {
  test("every platform, from one place", () => {
    expect(ORDERING_PLATFORMS.map((p) => p.name)).toEqual(["Toast", "ChowNow", "Olo", "Square", "Clover", "Popmenu", "BentoBox", "DoorDash", "Uber Eats", "Grubhub", "Postmates", "Seamless", "Slice"]);
    expect(KNOWN_ORDERING_PLATFORM_HOSTS).toEqual(ORDERING_PLATFORMS.flatMap((p) => p.hosts));
    expect(isKnownOrderingPlatformHost("www.postmates.com")).toBe(true);
    expect(orderingPlatformFor("https://order.toasttab.com/online/x")?.name).toBe("Toast");
    expect(readFileSync("lib/websiteTrust.ts", "utf8")).toContain("...ORDERING_PLATFORM_HOSTS,");
  });

  test("a business's own order. subdomain — never a platform's, never someone's bare domain", () => {
    expect(isOwnOrderingSubdomain("https://order.qamariacoffee.com/order/qamaria")).toBe(true);
    expect(isOwnOrderingSubdomain("ordering.example-cafe.com")).toBe(true);
    expect(isOwnOrderingSubdomain("order.toasttab.com")).toBe(false);
    expect(isOwnOrderingSubdomain("https://www.order.com")).toBe(false);
    expect(isOwnOrderingSubdomain("https://qamariacoffee.com")).toBe(false);
    expect(isOrderingHost("order.qamariacoffee.com")).toBe(true);
  });

  test("no scoring change: a listing link is “not a website” exactly as before", () => {
    for (const host of ["doordash.com", "ubereats.com", "grubhub.com", "postmates.com", "seamless.com", "slicelife.com", "ordering.chownow.com"]) {
      expect(platformPage(`https://${host}/x`)?.kind).toBe("ordering");
    }
    // Website builders stay websites; a business's own ordering page stays its site.
    for (const url of ["https://order.toasttab.com/x", "https://x.square.site", "https://x.popmenu.com", "https://x.bentobox.com", "https://x.olo.com", "https://www.clover.com/online-ordering/x", "https://order.qamariacoffee.com/order"]) {
      expect(platformPage(url)).toBeNull();
    }
  });
});

describe("the food re-scan script", () => {
  const row = (name: string, extra: Record<string, unknown> = {}) => ({ id: name, name, category: null, primary_type: "restaurant", business_type_override: null, categories: ["restaurant"], website: "https://x.example.com", verified_website_url: null, listing_mode: "google", place_id: "p", ...extra });

  test("only food businesses with a Google listing, never archived or website-only", () => {
    const targets = foodRescanTargets([
      row("Tacos"),
      row("Salon", { primary_type: "hair_salon", categories: ["hair_salon"] }),
      row("Closed", { archived_at: "2026-11-01T00:00:00Z" }),
      row("Site only", { listing_mode: "website_only" }),
      row("No listing", { place_id: null }),
    ] as never);
    expect(targets.map((t) => t.name)).toEqual(["Tacos"]);
  });

  test("the calls it will make: 1 Details each (2 with a website retry), PageSpeed 1–6 per site, 1 Safe Browsing per site", () => {
    const calls = foodRescanCalls([row("A"), row("B", { website: null })] as never);
    expect(calls).toEqual({ details: { min: 2, max: 4 }, pageSpeed: { min: 1, max: 6 }, safeBrowsing: 1, sites: 1 });
  });

  test("no screenshots, no competitor scans; the app's own re-scan with its caps", () => {
    const src = readFileSync("scripts/rescan-food.ts", "utf8");
    expect(src).toContain('"--no-screenshots"');
    expect(src).toContain('"scripts/rescan-all.ts"');
    expect(src).not.toContain("--with-competitors");
  });
});
