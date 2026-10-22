import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { StarterSiteBuilder } from "./StarterSiteBuilder";
import { saveStarterSiteDetailsWithClient } from "@/app/actions/starterSiteDetails";
import { designerSectionKey } from "./DesignerSection";
import { readRememberedOpen, rememberOpen } from "@/lib/rememberedToggle";
import { sameDetails, sanitizeDetailFields, sanitizeStarterSiteDetails, type StarterSiteDetails } from "@/lib/starterSiteDetails";
import type { SupabaseClient } from "@supabase/supabase-js";

// The starter site's name, type, address and phone: pre-filled from Google
// as editable inputs; only what the owner confirms goes on their website,
// saved as "provided by you".

const builder = (over: Partial<Parameters<typeof StarterSiteBuilder>[0]> = {}, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <StarterSiteBuilder
        businessId="b1"
        businessName="Hudson Shears"
        businessLanguage="en"
        category="Hair salon"
        phone="(914) 555-0100"
        address="1 Main St, Hudson, NY 12534, USA"
        openingHoursPeriods={null}
        profileId="salon"
        builderOfferReason="no_website"
        {...over}
      />
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const input = (html: string, field: string) => html.match(new RegExp(`<input[^>]*data-testid="detail-${field}"[^>]*>`))?.[0] ?? "";

const SAVED: StarterSiteDetails = { name: "Hudson Shears & Co", category: "Barber", address: "1 Main St, Hudson, NY 12534, USA", phone: "(914) 555-0199", confirmedAt: "2026-10-21T15:00:00Z" };

describe("Your business details", () => {
  test("not confirmed: Google's values as editable inputs, the Google Maps attribution, Confirm — and no download yet", () => {
    const html = builder();
    for (const [field, value] of [["name", "Hudson Shears"], ["category", "Hair salon"], ["address", "1 Main St, Hudson, NY 12534, USA"], ["phone", "(914) 555-0100"]]) {
      expect(input(html, field)).toContain(`value="${value}"`);
      expect(input(html, field)).not.toContain("disabled");
    }
    expect(input(html, "phone")).toContain('type="tel"');
    const t = text(html);
    expect(t).toContain("Your business details");
    expect(t).toContain("Filled in from your Google listing. Check or edit them, then confirm — your website uses only details you confirm.");
    expect(html).toContain('data-testid="confirm-details"');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="confirm-details"/);
    expect(text(html)).toContain("Not confirmed yet");
    expect(html).toContain('alt="Google Maps"');
    // The attribution is a footnote under the helper text, not on the Confirm row.
    expect(html.indexOf('data-testid="details-attribution"')).toBeLessThan(html.indexOf('data-testid="detail-name"'));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="starter-download"|<button[^>]*data-testid="starter-download"[^>]*disabled=""/);
    expect(t).toContain("Confirm your business details above to download.");
  });

  test("confirmed: “✓ Confirmed”, “Provided by you”, no attribution, the download works, and the site uses the owner's values", () => {
    const html = builder({ starterSiteDetails: SAVED });
    expect(text(html)).toContain("Provided by you — these go on your website.");
    expect(html).toMatch(/data-testid="details-confirmed"[^>]*>(?:(?!<\/span>)[\s\S])*Confirmed<\/span>/);
    expect(html).not.toContain('data-testid="details-not-confirmed"');
    // Confirm stays in its place, disabled until something changes.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="confirm-details"/);
    expect(html).not.toContain('alt="Google Maps"');
    expect(html).not.toContain('data-testid="confirm-details-first"');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="starter-download"/);
    expect(input(html, "name")).toContain('value="Hudson Shears &amp; Co"');
    const srcDoc = html.match(/srcDoc="([^"]*)"/)![1];
    expect(srcDoc).toContain("Hudson Shears &amp;amp; Co");
    expect(srcDoc).toContain("(914) 555-0199");
    expect(srcDoc).not.toContain("(914) 555-0100");
    expect(srcDoc).toContain("Barber");
  });

  test("Free: the locked download stays as it was", () => {
    const html = builder({ free: true });
    expect(html).toContain('data-testid="starter-download-locked"');
    expect(html).not.toContain('data-testid="confirm-details-first"');
  });

  test("Spanish (usted)", () => {
    const t = text(builder({}, "es"));
    for (const s of ["Datos de su negocio", "Nombre del negocio", "Tipo de negocio", "Dirección", "Teléfono", "Confirmar datos", "Aún sin confirmar", "Idioma", "Apariencia", "Confirme los datos de su negocio arriba para descargar."]) expect(t).toContain(s);
    expect(t).toContain("Tomados de su ficha de Google.");
    expect(text(builder({ starterSiteDetails: SAVED }, "es"))).toContain("Proporcionados por usted");
    expect(text(builder({ starterSiteDetails: SAVED }, "es"))).toContain("Confirmados");
  });
});

describe("designer order", () => {
  test("site language, then your business details, then what to include (with hours), then tagline, color, font — on every plan, Free too", () => {
    for (const over of [{}, { free: true }]) {
      const html = builder(over);
      const at = (needle: string) => {
        const i = html.indexOf(needle);
        expect(i, needle).toBeGreaterThan(-1);
        return i;
      };
      const order = ['data-testid="starter-heading"', "Site language", 'data-testid="starter-details"', "What to include", 'data-testid="starter-include"', 'data-testid="hours-row"', "Tagline", "Color theme", ">Font<"].map(at);
      expect(order).toEqual([...order].sort((x, y) => x - y));
    }
  });
});

describe("designer section cards", () => {
  const SECTIONS = [
    ["language", "Language", true],
    ["details", "Your business details", true],
    ["include", "What to include", false],
    ["look", "Look & feel", false],
    ["photos", "Photos", false],
  ] as const;

  test("five numbered cards in order; Language and Business details open, the rest closed; each header is one button", () => {
    for (const over of [{}, { free: true }]) {
      const html = builder(over);
      let last = -1;
      SECTIONS.forEach(([id, title, open], i) => {
        const at = html.indexOf(`data-testid="designer-section-${id}"`);
        expect(at, id).toBeGreaterThan(last);
        last = at;
        const button = html.match(new RegExp(`<button[^>]*data-testid="designer-toggle-${id}"[^>]*>[\\s\\S]*?</button>`))![0];
        expect(button).toContain(`aria-expanded="${open}"`);
        expect(text(button)).toContain(`${i + 1} ${title}`);
        const controls = button.match(/aria-controls="([^"]+)"/)![1];
        const content = html.match(new RegExp(`<div id="${controls}"[^>]*>`))![0];
        expect(content.includes('hidden=""'), id).toBe(!open);
      });
      // Every option is still there (closed sections stay in the page, hidden).
      for (const s of ["Color theme", ">Font<", "Tagline", "Hero photo"]) expect(html, s).toContain(s);
    }
  });

  test("open/closed remembered per device and per section; blocked storage falls back to the default", () => {
    const store = new Map<string, string>();
    const fake = () => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    expect(readRememberedOpen(designerSectionKey("look"), false, fake)).toBe(false);
    rememberOpen(designerSectionKey("look"), true, fake);
    rememberOpen(designerSectionKey("details"), false, fake);
    expect(readRememberedOpen(designerSectionKey("look"), false, fake)).toBe(true);
    expect(readRememberedOpen(designerSectionKey("details"), true, fake)).toBe(false);
    expect(readRememberedOpen(designerSectionKey("photos"), false, fake)).toBe(false);
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(readRememberedOpen(designerSectionKey("details"), true, blocked)).toBe(true);
    expect(() => rememberOpen(designerSectionKey("details"), false, blocked)).not.toThrow();
  });

  test("What to include: every row is checkbox · icon · label", () => {
    const html = builder({ starterSiteHours: null });
    const include = html.slice(html.indexOf('data-testid="starter-include"'), html.indexOf('data-testid="designer-section-look"'));
    expect(include.match(/<input type="checkbox"/g)).toHaveLength(3);
    expect(include.match(/<label[^>]*><input type="checkbox"[^>]*\/><svg/g)).toHaveLength(3);
  });
});

describe("saving the details", () => {
  const db = (result: { data?: unknown; error?: unknown }, seen: unknown[] = []) =>
    ({ from: () => ({ update: (v: unknown) => (seen.push(v), { eq: () => ({ select: async () => result }) }) }) }) as unknown as SupabaseClient;

  test("trimmed, capped and stamped with when the owner confirmed", async () => {
    const seen: unknown[] = [];
    const now = new Date("2026-10-21T16:00:00Z");
    const result = await saveStarterSiteDetailsWithClient(db({ data: [{ id: "b1" }], error: null }, seen), "b1", { name: "  Hudson Shears ", category: "x".repeat(200), address: "1 Main St", phone: "555", extra: "no" }, now);
    expect(result.status).toBe("ok");
    expect(seen[0]).toEqual({ starter_site_details: { name: "Hudson Shears", category: "x".repeat(60), address: "1 Main St", phone: "555", confirmedAt: "2026-10-21T16:00:00.000Z" } });
  });

  test("a name is required; before supabase/starter-site-details.sql: not_enabled, not a crash", async () => {
    expect(await saveStarterSiteDetailsWithClient(db({ data: [], error: null }), "b1", { name: "  ", category: "", address: "", phone: "" })).toEqual({ status: "invalid" });
    const missing = { code: "PGRST204", message: "Could not find the 'starter_site_details' column of 'businesses' in the schema cache" };
    expect(await saveStarterSiteDetailsWithClient(db({ data: null, error: missing }), "b1", SAVED)).toEqual({ status: "not_enabled", reason: "column starter_site_details missing — run supabase/starter-site-details.sql" });
  });

  test("stored rows are read back only when well-formed", () => {
    expect(sanitizeStarterSiteDetails(SAVED)).toEqual(SAVED);
    expect(sanitizeStarterSiteDetails({ ...SAVED, confirmedAt: "never" })).toBeNull();
    expect(sanitizeStarterSiteDetails(null)).toBeNull();
    expect(sanitizeDetailFields({ name: "A\u0000B" })).toEqual({ name: "A B", category: "", address: "", phone: "" });
    expect(sameDetails(SAVED, { ...SAVED, phone: " (914) 555-0199 " })).toBe(true);
    expect(sameDetails(SAVED, { ...SAVED, phone: "555" })).toBe(false);
  });

  test("hours and details: a missing column is not_enabled (run the SQL), not an error", async () => {
    const { saveStarterSiteHoursWithClient } = await import("@/app/actions/starterSiteHours");
    const missing = { code: "42703", message: "column businesses.starter_site_hours does not exist" };
    expect(await saveStarterSiteHoursWithClient(db({ data: null, error: missing }), "b1", null)).toEqual({ status: "not_enabled", reason: "column starter_site_hours missing — run supabase/hours.sql" });
    expect(await saveStarterSiteHoursWithClient(db({ data: [{ id: "b1" }], error: null }), "b1", null)).toEqual({ status: "ok" });
  });

  test("the SQL adds the column; scoring never reads it", () => {
    const sql = readFileSync("supabase/starter-site-details.sql", "utf8");
    expect(sql).toContain("add column if not exists starter_site_details jsonb");
    expect(readFileSync("lib/scoring.ts", "utf8")).not.toContain("starter_site_details");
  });
});
