import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const liveRead = vi.fn();
const cachedRead = vi.fn();
const niche = vi.hoisted(() => ({ loadBusinessNiche: vi.fn(async () => null as unknown) }));
vi.mock("@/lib/businessNiche.server", () => niche);
vi.mock("@/lib/ownerListing.server", () => ({ liveListingForRow: (...args: unknown[]) => liveRead(...args), cachedOwnerListing: (...args: unknown[]) => cachedRead(...args) }));

import { LocaleProvider } from "@/lib/i18n";
import { ownerDetailsPrefill, ownerHoursInput, ownerHoursLines, ownerHoursSummary, sameOwnerDetails, sanitizeOwnerDetails, usuallyByAppointment, withOwnerDetails, type OwnerDetails } from "./ownerDetails";
import { closedWeek, type WeeklyHours } from "./gbpProfileEdits";
import { emptyListingColumns } from "./listingScoringRow";
import { gbpAddressLine, liveValuesFromBusinessProfile, liveValuesFromPlaces, type LiveListingValues } from "./ownerListing";
import { withOwnerDetailsFor } from "./ownerDetails.server";
import { getOwnerDetailsCardWithClient, saveOwnerDetailsWithClient, type OwnerDetailsCard as CardData } from "@/app/actions/ownerDetails";
import { OwnerDetailsCard } from "@/components/settings/OwnerDetailsCard";
import type { PlaceDetails } from "./google/places";
import type { SupabaseClient } from "@supabase/supabase-js";

// Day 23 2d-3: the owner's own name, address, phone and hours — pre-filled
// from a live read, saved only when the owner confirms, as "provided by you".

const src = (f: string) => readFileSync(f, "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const LIVE: LiveListingValues = {
  name: "Centered Clay Studio",
  address: "12 Main St, Springfield, NJ 07081, USA",
  rating: 4.9,
  reviewCount: 80,
  phone: "+1 973-555-0100",
  website: null,
  openingHours: ["Monday: 10:00 AM – 6:00 PM", "Tuesday: Closed"],
  openingHoursPeriods: [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }],
  businessStatus: "OPERATIONAL",
  photoCount: 20,
  googleMapsUri: "https://maps.google.com/?cid=9",
};

/** Monday 10–6 (Google's day numbers: 0 = Sunday), the rest closed. */
const MON_10_6: WeeklyHours = closedWeek().map((d, day) => (day === 1 ? { mode: "open" as const, ranges: [{ open: 600, close: 1080 }] } : d));
const CONFIRMED: OwnerDetails = { name: "Centered Clay", address: "12 Main Street, Springfield", phone: "973-555-0199", hours: { kind: "regular", week: MON_10_6 } };

/** A businesses table with one row; records every update. */
function db(row: Record<string, unknown> | null, opts: { updateError?: { code: string; message: string } } = {}) {
  const updates: unknown[] = [];
  const chain = (result: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: result(), error: null });
    c.then = (resolve: (v: unknown) => void) => resolve({ data: row ? [row] : [], error: null });
    return c;
  };
  const client = {
    from: () => ({
      select: () => chain(() => row),
      update: (values: unknown) => {
        updates.push(values);
        const c = { eq: () => c, select: async () => (opts.updateError ? { data: null, error: opts.updateError } : { data: row ? [{ id: row.id }] : [], error: null }) };
        return c;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, updates };
}

beforeEach(() => {
  liveRead.mockReset();
  cachedRead.mockReset();
});

describe("owner-confirmed business details (Day 23 2d-3)", () => {
  test("clean, capped, name required; hours saved structured, never as text", () => {
    expect(sanitizeOwnerDetails({ name: "  ", address: "x" })).toBeNull();
    expect(sanitizeOwnerDetails({ name: " Centered\u0000Clay ", address: "a".repeat(300), phone: " 973 ", hours: { kind: "regular", week: MON_10_6 } })).toEqual({
      name: "Centered Clay",
      address: "a".repeat(200),
      phone: "973",
      hours: { kind: "regular", week: MON_10_6 },
    });
    expect(ownerHoursInput({ kind: "appointment", week: MON_10_6 })).toEqual({ kind: "appointment" });
    expect(ownerHoursInput({ kind: "none" })).toEqual({ kind: "none" });
    // Text, a short week, overlapping or empty days: not hours.
    expect(ownerHoursInput("Mon: 10–6")).toBeNull();
    expect(ownerHoursInput({ kind: "regular", week: MON_10_6.slice(0, 6) })).toBeNull();
    const overlap = MON_10_6.map((d, day) => (day === 1 ? { mode: "open" as const, ranges: [{ open: 540, close: 720 }, { open: 660, close: 1020 }] } : d));
    expect(ownerHoursInput({ kind: "regular", week: overlap })).toBeNull();
    expect(ownerHoursInput({ kind: "regular", week: MON_10_6.map((d, day) => (day === 1 ? { mode: "open" as const, ranges: [] } : d)) })).toBeNull();
    expect(sanitizeOwnerDetails({ name: "A", hours: "Mon: 1" })?.hours).toEqual({ kind: "none" });
    expect(sameOwnerDetails(CONFIRMED, JSON.parse(JSON.stringify(CONFIRMED)))).toBe(true);
    expect(sameOwnerDetails(CONFIRMED, { ...CONFIRMED, hours: { kind: "appointment" } })).toBe(false);
    expect(sameOwnerDetails(CONFIRMED, { ...CONFIRMED, phone: "" })).toBe(false);
  });

  test("pre-fill: Google's hours as the rows; none on Google → by appointment for appointment types, else every day Closed", () => {
    expect(ownerDetailsPrefill(LIVE)).toEqual({ name: "Centered Clay Studio", address: "12 Main St, Springfield, NJ 07081, USA", phone: "+1 973-555-0100", hours: { kind: "regular", week: MON_10_6 } });
    expect(ownerDetailsPrefill({ ...LIVE, openingHoursPeriods: null }, { byAppointment: true }).hours).toEqual({ kind: "appointment" });
    expect(ownerDetailsPrefill({ ...LIVE, openingHoursPeriods: [] }, { byAppointment: false }).hours).toEqual({ kind: "regular", week: closedWeek() });
    expect(ownerDetailsPrefill(null)).toEqual({ name: "", address: "", phone: "", hours: { kind: "regular", week: closedWeek() } });
    expect(usuallyByAppointment("salon")).toBe(true);
    expect(usuallyByAppointment("practitioner")).toBe(true);
    expect(usuallyByAppointment("restaurant")).toBe(false);
    expect(usuallyByAppointment(null)).toBe(false);
    // Classes and workshops by niche, whatever the top-level type.
    for (const n of ["art_classes", "music_lessons", "music_school", "language_school", "learning_center", "test_prep", "coding_stem", "driving_school", "personal_training", "dog_training"]) expect(usuallyByAppointment("default", n)).toBe(true);
    expect(usuallyByAppointment("restaurant", "pizza")).toBe(false);
  });

  test("the one-line hours summary: days in a row with the same hours together; by appointment; none", () => {
    const week: WeeklyHours = closedWeek().map((d, day) => (day >= 1 && day <= 5 ? { mode: "open" as const, ranges: [{ open: 540, close: 1020 }] } : day === 6 ? { mode: "open" as const, ranges: [{ open: 600, close: 840 }] } : d));
    expect(ownerHoursSummary({ kind: "regular", week }, "en")).toBe("Mon–Fri 9:00 AM – 5:00 PM · Sat 10:00 AM – 2:00 PM · Sun Closed");
    expect(ownerHoursSummary({ kind: "regular", week }, "es")).toMatch(/^lun–vie 9:00 a\.\s?m\. – 5:00 p\.\s?m\. · sáb 10:00 a\.\s?m\. – 2:00 p\.\s?m\. · dom Cerrado$/);
    expect(ownerHoursSummary({ kind: "appointment" }, "en")).toBe("By appointment only");
    expect(ownerHoursSummary({ kind: "appointment" }, "es")).toBe("Solo con cita");
    expect(ownerHoursSummary({ kind: "none" }, "en")).toBe("No hours");
    expect(ownerHoursSummary({ kind: "none" }, "es")).toBe("Sin horario");
  });

  test("printed and emailed hours, per language: split shifts, overnight, closed, 24 hours, by appointment", () => {
    const week: WeeklyHours = closedWeek().map((d, day) =>
      day === 1 ? { mode: "open" as const, ranges: [{ open: 780, close: 1020 }, { open: 540, close: 720 }] } : day === 5 ? { mode: "open" as const, ranges: [{ open: 1080, close: 120 }] } : day === 6 ? { mode: "open24" as const } : d
    );
    const en = ownerHoursLines({ kind: "regular", week }, "en")!;
    expect(en[0]).toBe("Monday: 9:00 AM – 12:00 PM, 1:00 PM – 5:00 PM");
    expect(en[4]).toBe("Friday: 6:00 PM – 2:00 AM (next day)");
    expect(en[5]).toBe("Saturday: Open 24 hours");
    expect(en[6]).toBe("Sunday: Closed");
    const es = ownerHoursLines({ kind: "regular", week }, "es")!;
    expect(es[0]).toMatch(/^lunes: 9:00/);
    expect(es[4]).toContain("(día siguiente)");
    expect(es[6]).toBe("domingo: Cerrado");
    expect(ownerHoursLines({ kind: "appointment" }, "en")).toEqual(["By appointment only"]);
    expect(ownerHoursLines({ kind: "appointment" }, "es")).toEqual(["Solo con cita"]);
    expect(ownerHoursLines({ kind: "none" }, "en")).toBeNull();
  });

  test("the live read carries the listing's name and address: Places and Business Profile", () => {
    const place = { placeId: "p", name: "Hair Express", formattedAddress: "1 Broadway, Bayonne, NJ 07002, USA" } as unknown as PlaceDetails;
    expect(liveValuesFromPlaces(place)).toMatchObject({ name: "Hair Express", address: "1 Broadway, Bayonne, NJ 07002, USA" });
    expect(gbpAddressLine({ addressLines: ["1 Broadway", "Suite 2"], locality: "Bayonne", administrativeArea: "NJ", postalCode: "07002" })).toBe("1 Broadway, Suite 2, Bayonne, NJ 07002");
    expect(gbpAddressLine(undefined)).toBeNull();
    expect(liveValuesFromBusinessProfile({ location: { title: " Hair Express ", storefrontAddress: { addressLines: ["1 Broadway"], locality: "Bayonne" } }, reviews: null, photoCount: null })).toMatchObject({
      name: "Hair Express",
      address: "1 Broadway, Bayonne",
    });
    // Day 23 2d-4: the visit read asks for everything a scan does (names and addresses included).
    expect(src("lib/google/places.ts")).toContain("export const OWNER_LISTING_FIELD_MASK = DETAILS_FIELD_MASK;");
    expect(src("lib/google/places.ts")).toMatch(/const DETAILS_FIELD_MASK = \[\n  "id",\n  "displayName",\n  "formattedAddress",/);
  });

  test("name and address shown: the owner's once confirmed; before, the visit's live read; none when Google couldn't be read (never the saved row — Day 23 2d-5)", () => {
    const row = { id: "b1", name: "Saved Name", address: "Saved St", phone: "+1 973-555-0100" };
    const ok = { status: "ok" as const, source: "places" as const, values: LIVE, columns: emptyListingColumns() };
    expect(withOwnerDetails(row, CONFIRMED, ok)).toEqual({ ...row, name: "Centered Clay", address: "12 Main Street, Springfield" });
    expect(withOwnerDetails(row, null, ok)).toEqual({ ...row, name: "Centered Clay Studio", address: "12 Main St, Springfield, NJ 07081, USA" });
    // Google has no address (a service-area listing): none shown, never the saved one.
    expect(withOwnerDetails(row, null, { ...ok, values: { ...LIVE, address: null } }).address).toBeNull();
    expect(withOwnerDetails(row, null, { status: "unavailable" })).toEqual({ ...row, name: null, address: null });
    expect(withOwnerDetails(row, null, null)).toEqual({ ...row, name: null, address: null });
    // An address the owner left empty shows none.
    expect(withOwnerDetails(row, { ...CONFIRMED, address: "" }).address).toBeNull();
  });

  test("how each page reads them: confirmed → no Google call; live → the visit's read; cached → only a read already made; false → none", async () => {
    const unconfirmed = { id: "b1", place_id: "p1", listing_mode: "google", owner_details: null, owner_details_confirmed_at: null };
    const row = { name: "Saved Name", address: "Saved St" };
    const confirmed = db({ ...unconfirmed, owner_details: CONFIRMED, owner_details_confirmed_at: "2026-11-17T17:00:00Z" });
    for (const live of [true, "cached", false] as const) expect((await withOwnerDetailsFor(confirmed.client, "b1", row, { live })).name).toBe("Centered Clay");
    expect(liveRead).not.toHaveBeenCalled();
    expect(cachedRead).not.toHaveBeenCalled();

    liveRead.mockResolvedValueOnce({ status: "ok", source: "places", values: LIVE });
    expect(await withOwnerDetailsFor(db(unconfirmed).client, "b1", row)).toEqual({ name: "Centered Clay Studio", address: "12 Main St, Springfield, NJ 07081, USA" });
    expect(liveRead).toHaveBeenCalledWith(expect.anything(), "b1", { ...unconfirmed });

    cachedRead.mockReturnValueOnce(null);
    expect(await withOwnerDetailsFor(db(unconfirmed).client, "b1", row, { live: "cached" })).toEqual({ name: null, address: null });
    expect(await withOwnerDetailsFor(db(unconfirmed).client, "b1", row, { live: false })).toEqual({ name: null, address: null });
    expect(liveRead).toHaveBeenCalledTimes(1);
  });

  test("saving: only what the owner confirms, hours structured, with when; no name or bad hours → nothing saved; before the SQL → not enabled", async () => {
    const now = new Date("2026-11-17T17:00:00Z");
    const ok = db({ id: "b1" });
    const input = { name: "Centered Clay", address: "12 Main St", phone: "", hours: { kind: "regular", week: MON_10_6 } };
    const saved = { name: "Centered Clay", address: "12 Main St", phone: "", hours: { kind: "regular", week: MON_10_6 } };
    expect(await saveOwnerDetailsWithClient(ok.client, "b1", input, now)).toEqual({ status: "ok", details: saved, confirmedAt: now.toISOString() });
    expect(ok.updates).toEqual([{ owner_details: saved, owner_details_confirmed_at: now.toISOString() }]);
    const appt = db({ id: "b1" });
    expect(await saveOwnerDetailsWithClient(appt.client, "b1", { ...input, hours: { kind: "appointment" } }, now)).toMatchObject({ status: "ok", details: { hours: { kind: "appointment" } } });
    const none = db({ id: "b1" });
    expect(await saveOwnerDetailsWithClient(none.client, "b1", { name: " " })).toEqual({ status: "invalid" });
    const overlap = MON_10_6.map((d, day) => (day === 1 ? { mode: "open" as const, ranges: [{ open: 540, close: 720 }, { open: 660, close: 1020 }] } : d));
    expect(await saveOwnerDetailsWithClient(none.client, "b1", { ...input, hours: { kind: "regular", week: overlap } })).toEqual({ status: "invalid_hours" });
    expect(await saveOwnerDetailsWithClient(none.client, "b1", { ...input, hours: "Mon: 10–6" })).toEqual({ status: "invalid_hours" });
    expect(none.updates).toEqual([]);
    // Exactly one row: a save that changed no row (or more than one) is a failure, never "Confirmed".
    const noRow = db(null);
    expect((await saveOwnerDetailsWithClient(noRow.client, "b1", input)).status).toBe("error");
    const twoRows = db({ id: "b1" });
    (twoRows.client as unknown as { from: () => { update: () => unknown } }).from = () => ({ update: () => { const c = { eq: () => c, select: async () => ({ data: [{ id: "b1" }, { id: "b2" }], error: null }) }; return c; } });
    expect((await saveOwnerDetailsWithClient(twoRows.client, "b1", input)).status).toBe("error");
    expect(src("app/actions/ownerDetails.ts")).toContain("if (error || !data || data.length !== 1) {");
    const missing = db({ id: "b1" }, { updateError: { code: "42703", message: 'column "owner_details" does not exist' } });
    expect((await saveOwnerDetailsWithClient(missing.client, "b1", { ...input, name: "A" })).status).toBe("not_enabled");
  });

  test("the card: confirmed → the owner's own, no Google call; not confirmed → Google's week; none on Google → by appointment or Closed + the note; can't read → empty + the fallback", async () => {
    const base = { id: "b1", place_id: "p1", listing_mode: "google", language: "en", owner_details: null, owner_details_confirmed_at: null };
    const confirmed = db({ ...base, owner_details: CONFIRMED, owner_details_confirmed_at: "2026-11-17T17:00:00Z" });
    const a = await getOwnerDetailsCardWithClient(confirmed.client, "b1");
    expect(a).toEqual({ status: "ok", card: { details: CONFIRMED, confirmedAt: "2026-11-17T17:00:00Z", liveUnavailable: false, noListing: false, noGoogleHours: false } });
    expect(liveRead).not.toHaveBeenCalled();

    liveRead.mockResolvedValueOnce({ status: "ok", source: "places", values: LIVE });
    const fromGoogle = await getOwnerDetailsCardWithClient(db(base).client, "b1");
    expect(fromGoogle.status === "ok" && fromGoogle.card).toMatchObject({ confirmedAt: null, liveUnavailable: false, noGoogleHours: false, details: { name: "Centered Clay Studio", phone: "+1 973-555-0100", hours: { kind: "regular", week: MON_10_6 } } });

    // No hours on Google: a salon starts on "By appointment only"; a restaurant on every day Closed.
    liveRead.mockResolvedValueOnce({ status: "ok", source: "places", values: { ...LIVE, openingHoursPeriods: null } });
    const salon = await getOwnerDetailsCardWithClient(db({ ...base, biz_type_resolved: "salon" }).client, "b1");
    expect(salon.status === "ok" && salon.card).toMatchObject({ noGoogleHours: true, details: { hours: { kind: "appointment" } } });
    // Centered Clay: an art & pottery classes niche → "By appointment only".
    niche.loadBusinessNiche.mockResolvedValueOnce({ resolved: { nicheId: "art_classes" } });
    liveRead.mockResolvedValueOnce({ status: "ok", source: "places", values: { ...LIVE, openingHoursPeriods: null } });
    const clay = await getOwnerDetailsCardWithClient(db({ ...base, name: "Centered Clay Studio", category: "Tutoring service", primary_type: "tutoring_service" }).client, "b1");
    expect(clay.status === "ok" && clay.card).toMatchObject({ noGoogleHours: true, details: { hours: { kind: "appointment" } } });
    liveRead.mockResolvedValueOnce({ status: "ok", source: "places", values: { ...LIVE, openingHoursPeriods: [] } });
    const food = await getOwnerDetailsCardWithClient(db({ ...base, biz_type_resolved: "restaurant" }).client, "b1");
    expect(food.status === "ok" && food.card).toMatchObject({ noGoogleHours: true, details: { hours: { kind: "regular", week: closedWeek() } } });

    liveRead.mockResolvedValueOnce({ status: "unavailable" });
    const down = await getOwnerDetailsCardWithClient(db(base).client, "b1");
    expect(down).toEqual({ status: "ok", card: { details: { name: "", address: "", phone: "", hours: { kind: "regular", week: closedWeek() } }, confirmedAt: null, liveUnavailable: true, noListing: false, noGoogleHours: false } });

    // Website only: nothing to read.
    const site = await getOwnerDetailsCardWithClient(db({ ...base, place_id: null, listing_mode: "website_only" }).client, "b1");
    expect(site.status === "ok" && site.card.noListing).toBe(true);
    expect(liveRead).toHaveBeenCalledTimes(5);
  });

  const card = (data: Omit<CardData, "noGoogleHours"> & { noGoogleHours?: boolean }, locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <OwnerDetailsCard businessId="b1" card={{ noGoogleHours: false, ...data }} />
      </LocaleProvider>
    );

  test("Settings → Your business details, EN + ES: pre-filled and attributed until confirmed, then 'provided by you'", () => {
    const prefilled = card({ details: ownerDetailsPrefill(LIVE), confirmedAt: null, liveUnavailable: false, noListing: false });
    expect(prefilled).toContain('value="Centered Clay Studio"');
    expect(prefilled).toContain('data-testid="owner-details-attribution"');
    expect(text(prefilled)).toContain("Filled in from your Google listing as it shows right now.");
    expect(text(prefilled)).toContain("Not confirmed yet");
    expect(text(prefilled)).toContain("Confirm details");

    const confirmed = card({ details: CONFIRMED, confirmedAt: "2026-11-17T17:00:00Z", liveUnavailable: false, noListing: false });
    expect(confirmed).not.toContain("owner-details-attribution");
    expect(text(confirmed)).toContain("Confirmed · provided by you");

    const down = card({ details: ownerDetailsPrefill(null), confirmedAt: null, liveUnavailable: true, noListing: false });
    expect(down).toContain('data-testid="live-unavailable"');
    expect(down).not.toContain("owner-details-attribution");

    // Confirmed: the short summary, EN + ES.
    expect(text(confirmed)).toContain("Centered Clay 973-555-0199 · 12 Main Street, Springfield Mon 10:00 AM – 6:00 PM · Tue–Sun Closed Confirmed · provided by you Edit details");
    const es = text(card({ details: CONFIRMED, confirmedAt: "2026-11-17T17:00:00Z", liveUnavailable: false, noListing: false }, "es"));
    expect(es).toMatch(/lun 10:00 a\.\s?m\. – 6:00 p\.\s?m\. · mar–dom Cerrado/);
    expect(es).toContain("Confirmados · proporcionados por usted");
    expect(es).toContain("Editar datos");
    // Not confirmed: the form, in Spanish.
    expect(text(card({ details: CONFIRMED, confirmedAt: null, liveUnavailable: false, noListing: false }, "es"))).toContain("Nombre del negocio");
    expect(text(card({ details: ownerDetailsPrefill(LIVE), confirmedAt: null, liveUnavailable: false, noListing: false }, "es"))).toContain("Solo guardamos lo que usted confirma.");
  });

  test("the card's hours: Regular / By appointment only / No hours; the week editor for regular; the notes, EN + ES", () => {
    const regular = card({ details: CONFIRMED, confirmedAt: null, liveUnavailable: false, noListing: false });
    expect(text(regular)).toContain("Regular hours By appointment only No hours");
    expect(regular).toMatch(/data-testid="hours-mode-regular"[^>]*checked|checked[^>]*data-testid="hours-mode-regular"/);
    expect(regular).toContain('data-testid="hours-editor"');
    expect(regular).not.toContain("appointment-note");

    const appt = card({ details: { ...CONFIRMED, hours: { kind: "appointment" } }, confirmedAt: null, liveUnavailable: false, noListing: false, noGoogleHours: true });
    expect(appt).not.toContain('data-testid="hours-editor"');
    expect(text(appt)).toContain("Customers book a time with you.");
    expect(text(appt)).toContain("Google doesn't show hours for you yet.");
    const apptEs = text(card({ details: { ...CONFIRMED, hours: { kind: "appointment" } }, confirmedAt: null, liveUnavailable: false, noListing: false, noGoogleHours: true }, "es"));
    expect(apptEs).toContain("Horario regular Solo con cita Sin horario");
    expect(apptEs).toContain("Sus clientes reservan una hora con usted.");
    expect(apptEs).toContain("Google aún no muestra un horario para su negocio.");

    const none = card({ details: { ...CONFIRMED, hours: { kind: "none" } }, confirmedAt: null, liveUnavailable: false, noListing: false });
    expect(none).not.toContain('data-testid="hours-editor"');
    expect(none).not.toContain("appointment-note");
    // Once confirmed, the Google note is gone.
    expect(card({ details: CONFIRMED, confirmedAt: "2026-11-17T17:00:00Z", liveUnavailable: false, noListing: false, noGoogleHours: true })).not.toContain("no-google-hours");
  });

  test("the Overview's card until confirmed (Day 23 2d-5 — lib/confirmDetailsCard.test.tsx has its rules)", () => {
    const overview = src("app/business/[id]/page.tsx");
    expect(overview).toContain("const confirmCard = await getConfirmDetailsCardWithClient(createClient(), params.id);");
    expect(overview).toContain("{confirmCard.shown && (");
    // Only the listing Overview: the website-only one returns before it.
    expect(overview.indexOf('listingMode === "website_only"')).toBeLessThan(overview.indexOf("<ConfirmDetailsCard"));
  });

  test("where they show: header (every page's record), switcher, emails, Print studio and the starter site; Free's showroom makes no Google call", () => {
    expect(src("app/actions/businesses.ts")).toContain("const shown = await withOwnerDetailsFor(supabase, businessId, rest, options);");
    expect(src("app/actions/businesses.ts")).toContain("const names = await shownNamesFor(supabase, data.map((row) => row.id), { live: namesLiveFor(data.length) });");
    expect(src("app/actions/scoring.ts")).toContain("const business = withOwnerDetails(scored.business,");
    // The score itself never reads them.
    expect(src("app/actions/scoring.ts")).toContain("const scoringBusiness = scored.business;");
    expect(src("lib/scoring.ts")).not.toContain("owner_details");
    expect(src("app/actions/website.ts")).toContain("businessName: shownName.name,");
    expect(src("app/business/[id]/website/page.tsx")).toContain("phone={data.ownerPhone ?? data.phone}");
    expect(src("app/actions/reviews.ts")).toContain("businessName: owner.name,");
    expect(src("app/actions/competitors.ts")).toContain("businessName: owner.name,");
    expect(src("lib/weekly/weeklyData.server.ts")).toContain("withOwnerDetailsFor(supabase, businessId,");
    const print = src("app/actions/printStudio.ts");
    expect(print).toContain("businessName: shown.name ?? null,");
    expect(print).toContain("ownerDetails.hours");
    expect(src("app/business/[id]/campaigns/page.tsx")).toContain("businessPhone={printPhone}");
    expect(src("components/plan/freeShowroom.tsx")).toContain("getPrintStudioData(businessId, { live: false })");
    expect(src("components/plan/freeShowroom.tsx")).toContain("ownerPrintPhone(createClient(), businessId, { live: false })");
    // Before confirming: the visit's live read (the switcher too, Day 23 2d-5); the monthly email only a read already made.
    expect(src("app/actions/scoring.ts")).toContain("?.details ?? null, scored.liveListing ?? null);");
    expect(src("app/actions/businesses.ts")).toContain("await shownNamesFor(supabase, data.map((row) => row.id), { live: namesLiveFor(data.length) });");
    expect(src("app/api/cron/monthly-reports/route.ts")).toContain('{ live: "cached" }');
    // Free's locked tabs: no Google call, the header's name included (decision 3).
    expect(src("components/plan/freeShowroom.tsx")).toContain("getBusinessSummary(businessId, { live: false })");
    expect(src("components/plan/freeShowroom.tsx")).toContain("getReviewsPageData(businessId, { live: false })");
    expect(src("app/actions/reviews.ts")).toContain("? { ...data, ...emptyListingColumns(), live_unavailable: false }");
    // Settings once confirmed: 0 Places calls — the card and header read the owner's own,
    // the monthly email toggle and the visit check make no Google call.
    expect(src("app/business/[id]/settings/page.tsx")).toContain("getReportsData(params.id, { live: false })");
    expect(src("lib/weekly/weeklyData.server.ts")).toContain("const business = await loadBusiness(supabase, businessId, { live: false });");
    expect(src("supabase/owner-details.sql")).toMatch(/owner_details jsonb[\s\S]*owner_details_confirmed_at timestamptz[\s\S]*notify pgrst, 'reload schema';\s*$/);
  });
});
