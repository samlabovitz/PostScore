import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { AssistantBusinessProfile } from "@/lib/assistant";
import { BusinessMemoryPanel, OwnerRow } from "./BusinessMemoryPanel";

// BusinessMemoryPanel.tsx imports updateBusinessProfile/
// updateBusinessTypeOverride from app/actions/businesses.ts for its
// (unexercised in this static-render test) edit flow — that module
// transitively imports lib/websiteScreenshotUpload.ts's
// `import "server-only"` guard, which hard-throws outside Next's own
// build pipeline. Stubbed here since this test only renders the
// read-only confirmed-fixed list, never clicks "Edit" or saves.
// Vitest hoists vi.mock calls above the imports above at run time, so
// the static import of BusinessMemoryPanel still resolves against this
// mock despite appearing first in source.
vi.mock("@/app/actions/businesses", () => ({
  updateBusinessProfile: vi.fn(),
  updateBusinessTypeOverride: vi.fn(),
  updateBusinessDifferentiator: vi.fn(),
}));

const PROFILE: AssistantBusinessProfile = {
  businessType: "Restaurant & Food Service",
  businessTypeId: "restaurant",
  autoDetectedBusinessType: "Restaurant & Food Service",
  autoDetectedBusinessTypeId: "restaurant",
  businessTypeOverridden: false,
  referralOk: true,
  couponPresets: [],
  referralPresets: [],
  location: "123 River St, Springfield",
  services: [],
  avgJobValueLow: null,
  avgJobValueHigh: null,
  scoreHistory: [],
  fixedItems: [
    // The exact kind of value lib/actionPlan.ts's points math can
    // produce from ordinary binary floating-point error — never a
    // real, intentional fraction.
    { label: "Photos on listing", pointsGained: 14.399999999999999, verifiedAt: "1/15/2026" },
    { label: "Uses HTTPS", pointsGained: 5.999999999999999, verifiedAt: null },
  ],
};

describe("BusinessMemoryPanel — confirmed-fixed points rendering", () => {
  test("rounds pointsGained to one decimal, with a verified date, never a raw floating-point artifact", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <BusinessMemoryPanel businessId="biz-1" profile={PROFILE} />
      </LocaleProvider>
    );

    expect(html).not.toContain("14.399999999999999");
    expect(html).toContain("+14.4 pts");
  });

  test("rounds pointsGained to one decimal with no date too, never a raw floating-point artifact", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <BusinessMemoryPanel businessId="biz-1" profile={PROFILE} />
      </LocaleProvider>
    );

    expect(html).not.toContain("5.999999999999999");
    expect(html).toContain("+6.0 pts");
  });
});

describe("BusinessMemoryPanel — a collapsed row in the Ask PostAI panel", () => {
  const render = (locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <BusinessMemoryPanel businessId="b1" profile={PROFILE} />
      </LocaleProvider>
    );

  test("starts collapsed: one row that opens in place (EN + ES)", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="postai-memory-body"[^>]*data-testid="postai-memory-toggle"/);
    expect(html).toContain("What PostAI knows about your business");
    expect(html).toMatch(/<div id="postai-memory-body" hidden=""/);
    expect(render("es")).toContain("Lo que PostAI sabe de su negocio");
  });

  test("fields stack vertically — no side-by-side columns — and no card inside the panel", () => {
    const html = render();
    expect(html).not.toMatch(/grid-cols-2/);
    expect(html).not.toContain("shadow-card");
    // Location still there, under the business type.
    expect(html.indexOf("123 River St, Springfield")).toBeGreaterThan(html.indexOf("Restaurant &amp; Food Service"));
  });
});

describe("BusinessMemoryPanel — opened, a layer over the chat", () => {
  test("its own scroll, at most 60% of the height, a 'Done' to close (EN + ES) — never pushing the conversation down", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <BusinessMemoryPanel businessId="b1" profile={PROFILE} />
      </LocaleProvider>
    );
    expect(html).toMatch(/data-testid="postai-memory-layer" class="absolute inset-x-0 top-full z-20 max-h-\[60vh\] overflow-y-auto overscroll-contain/);
    expect(html).toMatch(/data-testid="postai-memory-done"[^>]*>Done</);
    const es = renderToStaticMarkup(
      <LocaleProvider locale="es">
        <BusinessMemoryPanel businessId="b1" profile={PROFILE} />
      </LocaleProvider>
    );
    expect(es).toMatch(/data-testid="postai-memory-done"[^>]*>Listo</);
  });

  test("collapsed every time the panel opens (the panel's contents mount fresh on open)", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <BusinessMemoryPanel businessId="b1" profile={PROFILE} />
      </LocaleProvider>
    );
    expect(html).toMatch(/aria-expanded="false"/);
    const dock = readFileSync("components/assistant/PostAIDock.tsx", "utf8");
    expect(dock).toContain("{visible && (");
  });
});

describe("BusinessMemoryPanel — read mode, sources, and inline edit", () => {
  const render = (profile: AssistantBusinessProfile, locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <BusinessMemoryPanel businessId="b1" profile={profile} />
      </LocaleProvider>
    );
  const section = (html: string, id: string) => {
    const start = html.indexOf(`data-testid="${id}"`);
    const end = html.indexOf("</section>", start);
    return html.slice(start, end);
  };
  const FILLED: AssistantBusinessProfile = {
    ...PROFILE,
    businessType: "Specialty Store",
    businessTypeId: "specialty_store",
    services: ["Snowboards", "Burton", "Skate shoes"],
    avgJobValueLow: 40,
    avgJobValueHigh: 120,
    differentiator: "Family-owned since 1998, free board waxing",
    scoreHistory: [
      { date: "Oct 16", total: 86, grade: "B" },
      { date: "Oct 23", total: 87, grade: "B" },
    ],
  };

  test("three sections in order: From your Google listing · Added by you · Your progress (EN + ES)", () => {
    const html = render(FILLED);
    const order = ["memory-from-google", "memory-added-by-you", "memory-progress"].map((id) => html.indexOf(`data-testid="${id}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const words of ["From your Google listing", "Added by you", "Your progress"]) expect(html).toContain(words);
    const es = render(FILLED, "es");
    for (const words of ["De su ficha de Google", "Agregado por usted", "Su progreso"]) expect(es).toContain(words);
  });

  test("From Google: the business type dropdown with its source line, and the address", () => {
    const google = section(render(FILLED), "memory-from-google");
    expect(google).toContain("<select");
    expect(google).toContain("Auto-detected from your Google listing.");
    expect(google).toContain("Address");
    expect(google).toContain("123 River St, Springfield");
  });

  test("Added by you (read mode): chips, “$40–$120”, one line — no form fields; labels follow the type", () => {
    const added = section(render(FILLED), "memory-added-by-you");
    expect(added).toContain("Products &amp; brands");
    expect(added).toContain("Typical purchase");
    for (const chip of ["Snowboards", "Burton", "Skate shoes"]) expect(added).toContain(`>${chip}</span>`);
    expect(added).toContain("$40–$120");
    expect(added).toContain("Family-owned since 1998, free board waxing");
    expect(added).not.toContain("<input");
    expect(added.match(/data-mode="read"/g)).toHaveLength(3);
  });

  test("empty sections show one friendly prompt with “Add” — not empty form fields (restaurant wording)", () => {
    const added = section(render(PROFILE), "memory-added-by-you");
    expect(added.match(/data-mode="empty"/g)).toHaveLength(3);
    expect(added).toContain("Add your menu favorites so PostAI&#x27;s ideas fit your place");
    expect(added).toContain("Add a typical price range so PostAI can show what a fix is worth");
    expect(added).toContain("Add what makes you different so PostAI&#x27;s ideas sound like you");
    expect(added.match(/>Add<\/button>/g)).toHaveLength(3);
    expect(added).not.toContain("<input");
  });

  test("Your progress: the score trend in one line and what's fixed — compact", () => {
    const progress = section(render(FILLED), "memory-progress");
    expect(progress).toContain("86 → 87 since Oct 16");
    expect(progress).toContain('data-testid="memory-fixed"');
    expect(render(FILLED, "es")).toContain("86 → 87 desde el Oct 16");
  });

  test("edit mode is per row: the editor with Save / Cancel; read and empty rows have none", () => {
    const row = (editing: boolean, empty: boolean) =>
      renderToStaticMarkup(
        <LocaleProvider locale="en">
          <OwnerRow testId="memory-offer" label="Services" prompt="Add the services you offer" empty={empty} editing={editing} onEdit={() => {}} onSave={() => {}} onCancel={() => {}} saving={false} error={null} editor={<input data-testid="the-editor" />}>
            <span>Balayage</span>
          </OwnerRow>
        </LocaleProvider>
      );
    const edit = row(true, false);
    expect(edit).toContain('data-mode="edit"');
    expect(edit).toContain('data-testid="the-editor"');
    expect(edit).toMatch(/>Save<\/button>/);
    expect(edit).toMatch(/>Cancel<\/button>/);
    for (const html of [row(false, false), row(false, true)]) {
      expect(html).not.toContain('data-testid="the-editor"');
      expect(html).not.toMatch(/>Save<\/button>/);
    }
    expect(row(false, false)).toContain("Balayage");
    expect(row(false, false)).toContain('aria-label="Edit Services"');
  });

  test("chips: added with Enter or “Add”, removable with × (the chip editor)", () => {
    const src = readFileSync("components/assistant/BusinessMemoryPanel.tsx", "utf8");
    expect(src).toContain('if (e.key === "Enter") {');
    expect(src).toContain("onClick={addFromDraft}");
    expect(src).toContain("onClick={() => onChange(services.filter((x) => x !== s))}");
    // The editor's placeholder is the type's own example.
    expect(src).toContain("placeholder={words.offerExample}");
  });

  test("saved services and typical value from before show unchanged (nothing lost)", () => {
    const before: AssistantBusinessProfile = { ...PROFILE, businessTypeId: "salon", services: ["Haircuts", "Color"], avgJobValueLow: 35, avgJobValueHigh: 180 };
    const added = section(render(before), "memory-added-by-you");
    expect(added).toContain(">Haircuts</span>");
    expect(added).toContain(">Color</span>");
    expect(added).toContain("$35–$180");
    expect(added).toContain("Typical price per service");
  });
});
