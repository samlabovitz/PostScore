// Day 23 2d-5: the names lists show (home list, Settings → Businesses,
// notifications) and the unsubscribe page — never a saved Google value.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
const liveRead = vi.fn();
const cached = vi.fn((id: string): unknown => (id ? null : null));
vi.mock("@/lib/ownerListing.server", () => ({ ownerListingLive: (...args: unknown[]) => liveRead(...args), cachedOwnerListing: (id: string) => cached(id), liveListingForRow: async () => ({ status: "unavailable" }) }));

import { LIVE_NAMES_MAX_BUSINESSES, namesLiveFor, shownNamesFor } from "./ownerDetails.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const src = (p: string) => readFileSync(p, "utf8");

describe("the names lists show (home list, switcher, notifications)", () => {
  const CONFIRMED = { name: "Centered Clay", address: "12 Main Street", phone: "", hours: { kind: "none" } };
  function namesDb(rows: Array<Record<string, unknown>>, connected: string[] = []) {
    const table = (name: string) => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.in = async () => ({ data: name === "gbp_connections" ? connected.map((id) => ({ business_id: id, status: "connected", google_location_id: "locations/1" })) : rows, error: null });
      return c;
    };
    return { from: table } as unknown as SupabaseClient;
  }
  beforeEach(() => liveRead.mockReset());

  test("confirmed → the owner's, no Google call; otherwise the listing read now; unknown → none, flagged — never a saved value", async () => {
    const rows = [
      { id: "a", place_id: "pa", listing_mode: "google", owner_details: CONFIRMED, owner_details_confirmed_at: "2026-11-17T00:00:00Z", name: "Saved A" },
      { id: "b", place_id: "pb", listing_mode: "google", owner_details: null, owner_details_confirmed_at: null, name: "Saved B" },
      { id: "c", place_id: "pc", listing_mode: "google", owner_details: null, owner_details_confirmed_at: null, name: "Saved C" },
    ];
    liveRead.mockImplementation(async (id: string) => (id === "b" ? { status: "ok", source: "places", values: { name: "Live B", address: "1 Live St" }, columns: {} } : { status: "unavailable" }));
    const names = await shownNamesFor(namesDb(rows, ["c"]), ["a", "b", "c"]);
    expect(names.get("a")).toEqual({ name: "Centered Clay", address: "12 Main Street", unavailable: false });
    expect(names.get("b")).toEqual({ name: "Live B", address: "1 Live St", unavailable: false });
    expect(names.get("c")).toEqual({ name: null, address: null, unavailable: true });
    expect(liveRead).toHaveBeenCalledTimes(2);
    // Connected: read from Business Profile (0 Places calls).
    expect(liveRead).toHaveBeenCalledWith("c", { placeId: "pc", websiteOnly: false, connected: true });
    // live: false — no Google call at all.
    liveRead.mockClear();
    expect((await shownNamesFor(namesDb(rows), ["b"], { live: false })).get("b")).toEqual({ name: null, address: null, unavailable: false, notRead: true });
    expect(liveRead).not.toHaveBeenCalled();
  });

  test("lists read live only for an account with 5 or fewer businesses; above that only the cache, the rest marked to load when seen", async () => {
    expect(LIVE_NAMES_MAX_BUSINESSES).toBe(5);
    expect(namesLiveFor(5)).toBe(true);
    expect(namesLiveFor(6)).toBe("cached");
    expect(namesLiveFor(70)).toBe("cached");
    const rows = [
      { id: "b", place_id: "pb", listing_mode: "google", owner_details: null, owner_details_confirmed_at: null },
      { id: "d", place_id: "pd", listing_mode: "google", owner_details: null, owner_details_confirmed_at: null },
    ];
    cached.mockImplementation((id: string) => (id === "b" ? { status: "ok", source: "places", values: { name: "Cached B", address: "2 Cache St" }, columns: {} } : null));
    const names = await shownNamesFor(namesDb(rows), ["b", "d"], { live: "cached" });
    expect(names.get("b")).toEqual({ name: "Cached B", address: "2 Cache St", unavailable: false });
    expect(names.get("d")).toEqual({ name: null, address: null, unavailable: false, notRead: true });
    expect(liveRead).not.toHaveBeenCalled();
    cached.mockReset();
    expect(src("app/actions/businesses.ts")).toContain("await shownNamesFor(supabase, data.map((row) => row.id), { live: namesLiveFor(data.length) });");
    expect(src("app/actions/notifications.ts")).toContain("{ live: namesLiveFor(count ?? ids.length) }");
    // Both lists load the rest as rows scroll into view (lib/lazyNames.ts).
    for (const page of ["app/page.tsx", "app/business/[id]/settings/page.tsx"]) {
      expect(src(page), page).toContain("<LazyNamesProvider>");
      expect(src(page), page).toContain("notRead: ");
    }
  });

  test("the unsubscribe page: the owner's confirmed name, else “this business” — no Google call from a public link", () => {
    const page = src("app/unsubscribe/page.tsx");
    expect(page).toContain("const ownerName = (await loadOwnerDetails(supabase, business.id))?.details.name ?? null;");
    expect(page).toContain('name: ownerName ?? t(locale, "dashboard.unsubscribe.thisBusinessFallback"),');
    expect(page).not.toMatch(/ownerListing|placesLive|withOwnerDetailsFor/);
  });

  test("the unsubscribe message, EN + ES: the owner's name, or the neutral fallback", async () => {
    const { t } = await import("@/lib/i18n");
    expect(t("en", "dashboard.unsubscribe.successMessage", { name: "Centered Clay" })).toBe("Monthly email reports are now off for Centered Clay. You can turn them back on anytime from its Reports page.");
    expect(t("en", "dashboard.unsubscribe.successMessage", { name: t("en", "dashboard.unsubscribe.thisBusinessFallback") })).toContain("are now off for this business.");
    expect(t("es", "dashboard.unsubscribe.successMessage", { name: t("es", "dashboard.unsubscribe.thisBusinessFallback") })).toContain("ahora están desactivados para este negocio.");
  });
});
