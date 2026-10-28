import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/uiPreferences", () => ({ setUiPreference: vi.fn(), getUiPreference: vi.fn() }));
import { LocaleProvider, type Locale } from "@/lib/i18n";
import { PlanBlurb } from "@/app/business/[id]/growth/GrowthView";
import { orderWeeklySteps } from "@/lib/actionPlan";
import { COLOR_SWATCHES, ColorField, colorHintText } from "@/components/studio/StudioControls";
import { colorHint } from "@/lib/signStudio/design";
import { UI_PREFERENCE_KEYS } from "@/lib/uiPreferences";

// Day 21 UX: the Growth blurb, step order, studio color swatches, and
// per-account collapse choices.

const render = (node: React.ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("Growth: what the plan is for", () => {
  test("with things losing points — the real count, EN + ES, singular too", () => {
    expect(text(render(<PlanBlurb count={7} />))).toBe(
      "We checked your Google listing, reviews and website and found 7 things holding your score back. Do the steps below in order — each one is worth points, and the first ones matter most."
    );
    expect(text(render(<PlanBlurb count={1} />))).toContain("found 1 thing holding your score back");
    expect(text(render(<PlanBlurb count={3} />, "es"))).toContain("encontramos 3 cosas que frenan su puntuación. Siga los pasos de abajo en orden");
  });
  test("nothing losing points", () => {
    expect(text(render(<PlanBlurb count={0} />))).toBe("Nothing is holding your score back right now — keep up your weekly routine below.");
    expect(text(render(<PlanBlurb count={0} />, "es"))).toBe("Nada está frenando su puntuación en este momento — mantenga su rutina semanal de abajo.");
  });
  test("\"in order\" is true: highest points first, setup steps last", () => {
    const t = (id: string, weightedPoints: number, effort: "quick_win" | "setup" = "quick_win") => ({ id, weightedPoints, effort });
    expect(orderWeeklySteps([t("a", 1), t("connect", 0, "setup"), t("b", 6), t("c", 4), t("d", 4)]).map((x) => x.id)).toEqual(["b", "c", "d", "a", "connect"]);
  });
  test("the blurb sits right under the score card on Free and paid", async () => {
    const fs = await import("node:fs");
    const view = fs.readFileSync("app/business/[id]/growth/GrowthView.tsx", "utf8");
    expect(view.match(/<PlanBlurb count=\{issueCount\} \/>/g)).toHaveLength(2);
    expect(view).toContain("const issueCount = generateSuggestions(breakdown, locale).length;");
    expect(fs.readFileSync("app/actions/actionPlan.ts", "utf8")).toContain("const weeklyTasks = orderWeeklySteps(");
  });
});

describe("studio color fields: swatches, Custom color, selected ring + hex", () => {
  const field = (value: string, extra: Partial<React.ComponentProps<typeof ColorField>> = {}, locale: Locale = "en") =>
    render(<ColorField label="Text" value={value} onChange={() => {}} {...extra} />, locale);

  test("8 tap-sized swatches under the label, then a labeled Custom color that opens the full picker", () => {
    const html = field("#14243f");
    expect(COLOR_SWATCHES).toHaveLength(8);
    expect(html.match(/role="radio"/g)).toHaveLength(8);
    expect(html).toContain("h-9 w-9");
    expect(html).toMatch(/Custom color<input type="color"[^>]*value="#14243f"/);
    expect(html.indexOf(">Text")).toBeLessThan(html.indexOf('role="radio"'));
    expect(field("#14243f", {}, "es")).toContain("Color personalizado");
  });

  test("the selected color: ring + check + its hex; a color off the row rings Custom color", () => {
    const html = field("#14243f");
    expect(html).toMatch(/aria-checked="true" aria-label="Use #14243f"[^>]*class="[^"]*ring-2/);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="color-hex">#14243f');
    expect(html).toContain("<svg");
    const custom = field("#7a3fbc");
    expect(custom).not.toContain('aria-checked="true"');
    expect(custom).toMatch(/<label class="[^"]*ring-2[^"]*">/);
    expect(custom).toContain('data-testid="color-hex">#7a3fbc');
  });

  test("Grow on a Premium field: the Premium chip, and every swatch still picks (preview), never a dead click", () => {
    const html = field("#14243f", { locked: true });
    expect(html).toContain('data-testid="premium-chip"');
    expect(html).not.toContain("disabled");
    expect(html.match(/data-locked="true"/g)!.length).toBe(9);
    expect(field("#14243f")).not.toContain('data-testid="premium-chip"');
  });

  test("hard to read: a hint that says which way to go — EN + ES", () => {
    const light = { background: "#ffffff", text: "#cccccc", accent: "#14243f" };
    const dark = { background: "#14243f", text: "#333333", accent: "#20304f" };
    expect(colorHint("text", light)).toBe("darker");
    expect(colorHint("text", dark)).toBe("lighter");
    expect(colorHint("accent", dark)).toBe("accent");
    expect(colorHint("text", { background: "#ffffff", text: "#14243f", accent: "#14243f" })).toBeNull();
    expect(colorHintText("darker", "en")).toBe("Hard to read — try a darker text color");
    expect(colorHintText("lighter", "es")).toBe("Difícil de leer — pruebe un color de texto más claro");
    expect(field("#cccccc", { hint: colorHintText("darker", "en") })).toContain('data-testid="color-hint"');
    expect(field("#14243f")).not.toContain('data-testid="color-hint"');
  });

  test("used for Text, Background, Accent (sign + card) and the gradient color", async () => {
    const fs = await import("node:fs");
    for (const file of ["app/business/[id]/website-reviews/SignStudio.tsx", "app/business/[id]/campaigns/CardDesigner.tsx"]) {
      const src = fs.readFileSync(file, "utf8");
      expect(src).toContain("<ColorField");
      expect(src).not.toContain('type="color"');
    }
    expect(fs.readFileSync("app/business/[id]/campaigns/CardDesigner.tsx", "utf8")).toContain('testId="color-gradient"');
  });
});

describe("collapse choices are remembered per account", () => {
  test("only known keys; the SQL keeps rows to their owner", async () => {
    const fs = await import("node:fs");
    expect(UI_PREFERENCE_KEYS).toEqual(["overview.breakdownCollapsed", "free.planListCollapsed"]);
    const sql = fs.readFileSync("supabase/ui-preferences.sql", "utf8");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("auth.uid() = user_id");
    const page = fs.readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(page).toContain('getUiPreference("overview.breakdownCollapsed")');
    expect(page).toContain('getUiPreference("free.planListCollapsed")');
  });
});
