import { beforeEach, describe, expect, test, vi } from "vitest";

// Day 2b — website-only businesses. Everything paid is replaced with a
// spy: the website analysis, and the Google Places lookup (which must
// never run for these businesses).
const analysisSpy = vi.fn();
const placesSpy = vi.fn();
vi.mock("@/lib/websiteAnalysis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/websiteAnalysis")>("@/lib/websiteAnalysis");
  return { ...actual, collectWebsiteAnalysis: (...args: unknown[]) => analysisSpy(...args) };
});
vi.mock("@/lib/websiteHttps", () => ({ checkWebsiteHttps: async () => ({ status: "https", reason: null }) }));
vi.mock("@/lib/screenshotBudgetServer", () => ({
  loadScreenshotCallsThisMonth: async () => 0,
  loadBrowserRendersThisMonth: async () => 0,
}));
vi.mock("@/lib/websiteScreenshotUpload", () => ({ uploadWebsiteScreenshots: async () => ({ screenshotUrl: null, additionalPages: [] }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/google/places", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/places")>("@/lib/google/places");
  return { ...actual, lookupBusinessByPlaceId: (...args: unknown[]) => placesSpy(...args) };
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { recheckWebsiteOnlyBusinessWithClient, saveWebsiteOnlyBusinessWithClient } from "./businesses";
import { rescanBusinessWithClient } from "./scoring";
import { getListingMode, isMissingColumnError, parseListingMode } from "@/lib/listingMode";

const ANALYSIS = {
  content: { hasTitle: true, hasMetaDescription: true, hasViewportTag: true, headingCount: 3, visibleTextLength: 600, hasPhoneLink: true, hasEmailLink: false, hasCtaText: true, isLikelyClientRenderedShell: false, renderedContentSignals: null },
  mobilePerformance: { method: "lab", fieldCategory: null, labScore: 88 },
  mobilePerformanceFailureReason: null,
  contentFetchFailureReason: null,
  aboutPresence: { state: "found", url: null, locatedOnHomepage: true, reason: null, note: null },
  servicesPresence: { state: "found", url: null, locatedOnHomepage: true, reason: null, note: null },
  websiteTrust: { spamSignals: [], safeBrowsingThreat: null, safeBrowsingChecked: false, infoConflicts: [], staleNotices: [], abandonedSignals: { newestDateFound: null, templateLeftovers: [], looksAbandoned: false }, websiteKind: "independent", listingLinkBroken: false, checkedAt: "2026-10-16T00:00:00Z" },
  readViaBrowserChecks: [],
  browserRenders: 0,
  screenshotBytes: null,
  additionalPages: [],
};

type Row = Record<string, unknown>;
/** A tiny stand-in for the Supabase query builder. */
function fakeSupabase(opts: { rows?: Row[]; columnMissing?: boolean }) {
  const inserted: Row[] = [];
  const updated: Row[] = [];
  const missing = { code: "42703", message: 'column businesses.listing_mode does not exist' };
  const client = {
    from() {
      let selected = "";
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string) => {
        selected = cols ?? "";
        return chain;
      };
      for (const m of ["eq", "limit", "order"]) chain[m] = () => chain;
      chain.insert = (payload: Row) => {
        inserted.push(payload);
        return chain;
      };
      chain.update = (payload: Row) => {
        updated.push(payload);
        return chain;
      };
      const result = () =>
        opts.columnMissing && selected.includes("listing_mode")
          ? { data: null, error: missing }
          : inserted.length > 0 && selected === "id"
            ? { data: { id: "new-biz" }, error: null }
            : { data: opts.rows?.[0] ?? null, error: null };
      chain.single = async () => result();
      chain.maybeSingle = async () => result();
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(opts.columnMissing && selected.includes("listing_mode") ? { data: null, error: missing } : { data: opts.rows ?? [], error: null });
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, inserted, updated };
}

beforeEach(() => {
  analysisSpy.mockReset();
  analysisSpy.mockResolvedValue(ANALYSIS);
  placesSpy.mockReset();
});

describe("saving a website-only business", () => {
  test("analyzes only the website, saves listing_mode website_only with no place id — never a Google call", async () => {
    const { client, inserted } = fakeSupabase({});
    const result = await saveWebsiteOnlyBusinessWithClient(
      client,
      "owner-1",
      { name: "Jane's English Tutoring", location: "Dobbs Ferry, NY", websiteUrl: "janeenglish.com", language: "es" },
      true
    );
    expect(result).toEqual({ status: "saved", businessId: "new-biz" });
    expect(analysisSpy).toHaveBeenCalledTimes(1);
    expect(analysisSpy.mock.calls[0][0]).toBe("https://janeenglish.com/");
    expect(placesSpy).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({
      owner_id: "owner-1",
      place_id: null,
      listing_mode: "website_only",
      name: "Jane's English Tutoring",
      address: "Dobbs Ferry, NY",
      website: "https://janeenglish.com/",
      language: "es",
    });
    // No listing facts are ever invented for it.
    for (const field of ["rating", "review_count", "photo_count", "opening_hours", "category"]) {
      expect(inserted[0]).not.toHaveProperty(field);
    }
  });

  test("before the database update: nothing analyzed or saved, an honest not_enabled", async () => {
    const { client, inserted } = fakeSupabase({ columnMissing: true });
    const result = await saveWebsiteOnlyBusinessWithClient(client, "owner-1", { name: "X", location: "Y", websiteUrl: "x.com" });
    expect(result).toEqual({ status: "not_enabled" });
    expect(analysisSpy).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  test("an unsafe or invalid address is refused before anything runs", async () => {
    const { client } = fakeSupabase({});
    for (const bad of ["http://localhost", "http://192.168.1.1", "not a url"]) {
      expect(await saveWebsiteOnlyBusinessWithClient(client, "o", { name: "X", location: "Y", websiteUrl: bad })).toEqual({ status: "invalid_url" });
    }
    expect(analysisSpy).not.toHaveBeenCalled();
  });
});

describe("re-checking and re-scanning", () => {
  test("re-check: the website again, no Google call; refused within the cooldown", async () => {
    const old = { id: "b1", name: "X", website: "https://x.com/", listing_mode: "website_only", website_analysis_json: null, website_analysis_checked_at: "2026-01-01T00:00:00Z", business_type_override: null };
    const { client, updated } = fakeSupabase({ rows: [old] });
    expect(await recheckWebsiteOnlyBusinessWithClient(client, "b1", true)).toEqual({ status: "ok" });
    expect(analysisSpy).toHaveBeenCalledTimes(1);
    expect(placesSpy).not.toHaveBeenCalled();
    expect(updated[0]).toHaveProperty("website_analysis_json");

    const recent = fakeSupabase({ rows: [{ ...old, website_analysis_checked_at: new Date().toISOString() }] });
    expect(await recheckWebsiteOnlyBusinessWithClient(recent.client, "b1")).toEqual({ status: "too_soon" });
  });

  test("the Google re-scan refuses a business with no place id — no Places call", async () => {
    const { client } = fakeSupabase({ rows: [{ owner_id: "o", place_id: null, language: "en" }] });
    const result = await rescanBusinessWithClient(client, "b1");
    expect(result.status).toBe("error");
    expect(placesSpy).not.toHaveBeenCalled();
  });
});

describe("listing mode", () => {
  test("reads website_only; anything else, an error, or a missing column is 'google'", async () => {
    expect(parseListingMode("website_only")).toBe("website_only");
    expect(parseListingMode(null)).toBe("google");
    expect(await getListingMode(fakeSupabase({ rows: [{ listing_mode: "website_only" }] }).client, "b")).toBe("website_only");
    expect(await getListingMode(fakeSupabase({ columnMissing: true }).client, "b")).toBe("google");
    expect(isMissingColumnError({ code: "42703" })).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate" })).toBe(false);
  });
});
