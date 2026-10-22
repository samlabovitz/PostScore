import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { StarterSiteBuilder } from "./StarterSiteBuilder";
import { StarterHoursEditor } from "./StarterHoursEditor";
import { defaultOwnerHours } from "@/lib/ownerHours";
import { saveStarterSiteHoursWithClient } from "@/app/actions/starterSiteHours";
import type { SupabaseClient } from "@supabase/supabase-js";

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
/** The Hours row: from its marker to the preview (it's the last row). */
const hoursRow = (html: string) => {
  const start = html.indexOf('data-testid="hours-row"');
  return html.slice(start, html.indexOf('data-testid="starter-preview-column"', start));
};

const builder = (over: Partial<Parameters<typeof StarterSiteBuilder>[0]> = {}) =>
  wrap(
    <StarterSiteBuilder
      businessId="b1"
      businessName="Hudson Shears"
      businessLanguage="en"
      category="Hair salon"
      phone="(914) 555-0100"
      address="1 Main St, Hudson, NY"
      openingHoursPeriods={null}
      profileId="salon"
      builderOfferReason="no_website"
      {...over}
    />
  );

describe("Hours in “What to include”", () => {
  test("Hudson Shears (no Google hours): the same row as the others — a checkbox (off, until hours exist) and the “Add your hours” link", () => {
    const row = hoursRow(builder());
    expect(text(row)).toContain("Add your hours");
    expect(row).toMatch(/<input type="checkbox"[^>]*disabled=""/);
    expect(row).not.toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect(text(row)).not.toContain("Not on file");
  });

  test("Google has hours: still “Add your hours” — Google's hours never go on the site", () => {
    const html = builder({ openingHoursPeriods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }] });
    const row = hoursRow(html);
    expect(text(row)).toContain("Add your hours");
    expect(row).toMatch(/<input type="checkbox"[^>]*disabled=""/);
    expect(text(row)).not.toContain("From your Google listing.");
    expect(html).not.toContain("Monday&lt;/th&gt;");
    expect(html).not.toContain('id=&quot;hours&quot;');
  });

  test("saved owner hours: the checkbox (on), “Your hours for the website.” and “Edit your hours”", () => {
    const row = hoursRow(builder({ starterSiteHours: defaultOwnerHours() }));
    expect(row).toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect(text(row)).toContain("Your hours for the website.");
    expect(text(row)).toContain("Edit your hours");
  });

  test("saved owner hours that differ from Google: the conflict note, and the hours are on the site preview", () => {
    const html = builder({
      openingHoursPeriods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
      starterSiteHours: defaultOwnerHours(),
    });
    expect(text(html)).toContain("Your hours for the website.");
    expect(text(html)).toContain("These differ from your Google listing — customers may see conflicting hours. Update Google too.");
    // The preview is the generated page in the iframe's srcDoc (escaped).
    expect(html).toContain("Friday&lt;/th&gt;&lt;td&gt;9:00 AM – 5:00 PM");
  });

  test("owner hours with no Google hours: the tip linking to the Action plan step", () => {
    const html = builder({ starterSiteHours: defaultOwnerHours() });
    expect(text(html)).toContain("Tip: add these to your Google Business Profile too — that's where most customers check hours, and it counts toward your score.");
    expect(html).toContain('href="/business/b1/growth#task-completeness-hours"');
  });
});

describe("the hours editor", () => {
  const editor = (locale: "en" | "es" = "en", canRemove = false) =>
    wrap(<StarterHoursEditor businessId="b1" initial={defaultOwnerHours()} googleHours={null} canRemove={canRemove} onApply={() => {}} onClose={() => {}} />, locale);

  test("saved hours can be taken off the website; never “Use my Google hours”", () => {
    expect(text(editor("en", true))).toContain("Take hours off the website");
    expect(text(editor("es", true))).toContain("Quitar el horario del sitio web");
    expect(text(editor())).not.toContain("Take hours off the website");
    expect(text(editor("en", true))).not.toMatch(/Google hours instead/);
  });

  test("7 days with Open/Closed, 24 hours, 15-minute times, a second range, quick fills, a note (max 80)", () => {
    const html = editor();
    expect(html.match(/data-testid="hours-day"/g)).toHaveLength(7);
    const t = text(html);
    for (const s of ["Set opening hours", "By appointment only", "Same every weekday", "Copy Monday to all", "Open 24 hours", "Add a second time", "Closed"]) expect(t).toContain(s);
    expect(html).toContain('<option value="09:15">9:15 AM</option>');
    expect(html).not.toContain('value="09:10"');
    expect(html).toContain('maxLength="80"');
    expect(t).toContain("These hours go on your website only. They don't change your Google listing or your PostScore.");
    expect(html).toContain('href="/business/b1/growth#task-completeness-hours"');
  });

  test("Spanish (usted)", () => {
    const t = text(editor("es"));
    expect(t).toContain("Igual todos los días de semana");
    expect(t).toContain("Miércoles");
    expect(t).toContain("Guardar horario");
  });
});

describe("saving", () => {
  const db = (result: { data?: unknown; error?: unknown }) =>
    ({ from: () => ({ update: () => ({ eq: () => ({ select: async () => result }) }) }) }) as unknown as SupabaseClient;

  test("valid hours save; invalid ones never reach the database", async () => {
    expect(await saveStarterSiteHoursWithClient(db({ data: [{ id: "b1" }], error: null }), "b1", defaultOwnerHours())).toEqual({ status: "ok" });
    const bad = { ...defaultOwnerHours(), days: defaultOwnerHours().days.map((d) => ({ ...d, ranges: [{ open: "09:00", close: "09:00" }] })) };
    expect(await saveStarterSiteHoursWithClient(db({ data: [], error: null }), "b1", bad)).toEqual({ status: "invalid" });
  });

  test("before supabase/hours.sql has been run: not_enabled, not a crash", async () => {
    const missing = { code: "PGRST204", message: "Could not find the 'starter_site_hours' column of 'businesses' in the schema cache" };
    expect(await saveStarterSiteHoursWithClient(db({ data: null, error: missing }), "b1", null)).toEqual({ status: "not_enabled", reason: "column starter_site_hours missing — run supabase/hours.sql" });
  });
});
