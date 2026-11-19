import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const liveRead = vi.fn();
const cached = vi.fn((id: string): unknown => (id ? null : null));
vi.mock("@/lib/ownerListing.server", () => ({ ownerListingLive: (...args: unknown[]) => liveRead(...args), cachedOwnerListing: (id: string) => cached(id), liveListingForRow: async () => ({ status: "unavailable" }) }));

import { LocaleProvider } from "@/lib/i18n";
import { CONFIRM_DETAILS_NOT_NOW_1, CONFIRM_DETAILS_NOT_NOW_2, confirmDetailsCardShown, confirmDetailsNotNowKey } from "./confirmDetailsCard";
import { ConfirmDetailsCard } from "@/components/overview/ConfirmDetailsCard";
import { dismissConfirmDetailsWithClient, type OwnerDetailsCard } from "@/app/actions/ownerDetails";
import { LIVE_NAMES_MAX_BUSINESSES, namesLiveFor, shownNamesFor } from "./ownerDetails.server";
import { closedWeek } from "./gbpProfileEdits";
import type { SupabaseClient } from "@supabase/supabase-js";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const src = (p: string) => readFileSync(p, "utf8");

const SCAN = "2026-11-18T10:00:00Z";
const base = { confirmed: false, noListing: false, firstNotNowAt: null, secondNotNow: false, lastScanAt: SCAN };

describe("when the card shows", () => {
  test("after the first scan, until confirmed; never before a scan or for a website-only business", () => {
    expect(confirmDetailsCardShown(base)).toBe(true);
    expect(confirmDetailsCardShown({ ...base, lastScanAt: null })).toBe(false);
    expect(confirmDetailsCardShown({ ...base, confirmed: true })).toBe(false);
    expect(confirmDetailsCardShown({ ...base, noListing: true })).toBe(false);
  });

  test("“Not now” hides it until the next scan, once; the second time for good", () => {
    expect(confirmDetailsNotNowKey(null)).toBe(CONFIRM_DETAILS_NOT_NOW_1);
    const first = { ...base, firstNotNowAt: "2026-11-18T11:00:00Z" };
    expect(confirmDetailsCardShown(first)).toBe(false);
    expect(confirmDetailsCardShown({ ...first, lastScanAt: "2026-11-25T09:00:00Z" })).toBe(true);
    expect(confirmDetailsNotNowKey(first.firstNotNowAt)).toBe(CONFIRM_DETAILS_NOT_NOW_2);
    expect(confirmDetailsCardShown({ ...first, lastScanAt: "2026-12-25T09:00:00Z", secondNotNow: true })).toBe(false);
  });

  test("“Not now” is saved per owner and business: first when it was pressed, then for good", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ in: async () => ({ data: rows, error: null }) }) }),
        upsert: async (row: Record<string, unknown>) => {
          rows.push(row);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    const now = new Date("2026-11-18T11:00:00Z");
    expect(await dismissConfirmDetailsWithClient(client, "u1", "b1", now)).toEqual({ status: "ok" });
    expect(rows[0]).toEqual({ user_id: "u1", business_id: "b1", promo_key: CONFIRM_DETAILS_NOT_NOW_1, hidden_until: now.toISOString() });
    await dismissConfirmDetailsWithClient(client, "u1", "b1", now);
    expect(rows[1]).toMatchObject({ promo_key: CONFIRM_DETAILS_NOT_NOW_2, hidden_until: "2100-01-01T00:00:00Z" });
  });

  test("the Overview reads it with the visit's own live read; a scoring update isn't a scan", () => {
    const actions = src("app/actions/ownerDetails.ts");
    expect(actions).toContain('.find((r) => r.scan_kind !== "scoring_update")');
    expect(actions).toContain("const card = await getOwnerDetailsCardWithClient(supabase, businessId);");
  });
});

const CARD: OwnerDetailsCard = {
  details: { name: "Centered Clay Studio", address: "12 Main St, Springfield, NJ", phone: "+1 973-555-0100", hours: { kind: "regular", week: closedWeek() } },
  confirmedAt: null,
  liveUnavailable: false,
  noListing: false,
  noGoogleHours: false,
};

const render = (card: OwnerDetailsCard, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <ConfirmDetailsCard businessId="b1" card={card} />
    </LocaleProvider>
  );

describe("the card", () => {
  test("EN: the pre-filled details from Google (attributed), Confirm / Edit / Not now, and why — honest about the score", () => {
    const html = render(CARD);
    const words = text(html);
    expect(words).toContain("Confirm your business details");
    expect(words).toContain("PostScore will show these details in your account and emails, even when Google can't be reached. Your score still comes from your Google listing.");
    expect(words).toContain("Centered Clay Studio");
    expect(words).toContain("+1 973-555-0100 · 12 Main St, Springfield, NJ");
    expect(words).toContain("Filled in from your Google listing as it shows right now.");
    expect(html).toContain('data-testid="confirm-details-attribution"');
    for (const id of ["confirm-details-confirm", "confirm-details-edit", "confirm-details-not-now"]) expect(html).toContain(`data-testid="${id}"`);
    expect(words).toContain("Not now");
  });

  test("ES, formal", () => {
    const words = text(render(CARD, "es"));
    expect(words).toContain("Confirme los datos de su negocio");
    expect(words).toContain("PostScore mostrará estos datos en su cuenta y en sus correos, incluso cuando no se pueda acceder a Google. Su puntuación sigue basándose en su ficha de Google.");
    expect(words).toContain("Completados con su ficha de Google tal como aparece ahora.");
    for (const w of ["Confirmar", "Editar", "Ahora no"]) expect(words).toContain(w);
  });

  test("Google couldn't be read: the fields open empty to fill in, no Google attribution, Not now still there", () => {
    const html = render({ ...CARD, details: { ...CARD.details, name: "", address: "", phone: "" }, liveUnavailable: true });
    expect(html).toContain('data-testid="owner-details"');
    expect(html).toContain('data-testid="live-unavailable"');
    expect(html).not.toContain('data-testid="confirm-details-attribution"');
    expect(html).toContain('data-testid="confirm-details-not-now"');
  });
});

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

  test("lists read live only for an account with 5 or fewer businesses; above that only the cache — the cached name or “Your business”, no Google line", async () => {
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
    // The home list: "Your business" and no line about Google when nothing was read; Settings the same name.
    expect(src("app/page.tsx")).toContain("{!(business.nameNotRead && !business.address) && (");
    expect(src("app/business/[id]/settings/page.tsx")).toContain('{b.name ?? t(locale, "dashboard.home.untitledBusiness")}');
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
