import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { hasPostStudio, POSTSTUDIO_OPTIONS, POSTSTUDIO_PRICES, postStudioOptionFor } from "./postStudio";
import { isAddon, PLANS } from "./plan";
import { messages, t } from "./i18n";
import { NO_FACTS, unlockLine } from "./upgradePromos";
import { ASSISTANT_SYSTEM_RULES } from "./assistant";

describe("PostStudio pricing: its own $30 option, or added to a plan", () => {
  test("PostStudio only = plan 'free' + addon 'poststudio'; Multi includes it; no add-on, no PostStudio", () => {
    expect(isAddon("poststudio")).toBe(true);
    expect(isAddon("studio")).toBe(false);
    expect(hasPostStudio("free", ["poststudio"])).toBe(true);
    expect(hasPostStudio("grow", ["poststudio"])).toBe(true);
    expect(hasPostStudio("premium", ["poststudio"])).toBe(true);
    expect(hasPostStudio("multi")).toBe(true);
    for (const plan of ["free", "grow", "premium"] as const) {
      expect(hasPostStudio(plan), plan).toBe(false);
      expect(hasPostStudio(plan, []), plan).toBe(false);
    }
  });

  test("the add-on alone doesn't unlock Grow or Premium tools (the plan stays Free)", async () => {
    const premium = readFileSync("lib/premium.ts", "utf8");
    // getPlan() still decides the plan; the add-on is read separately.
    expect(premium).toContain("export async function getAddons(): Promise<Addon[]>");
    expect(premium).toMatch(/getAddons\(\): Promise<Addon\[\]> \{\n {2}return \[\];/);
    expect(PLANS).toEqual(["free", "grow", "premium", "multi"]);
  });

  test("prices: $30 alone; Grow +$15 = $40; Premium +$8 = $58; Multi included", () => {
    expect(POSTSTUDIO_OPTIONS).toEqual(["solo", "grow", "premium", "multi"]);
    expect(POSTSTUDIO_PRICES).toEqual({ solo: { addOn: 30, total: 30 }, grow: { addOn: 15, total: 40 }, premium: { addOn: 8, total: 58 } });
    expect(postStudioOptionFor("free")).toBe("solo");
    expect(postStudioOptionFor("grow")).toBe("grow");
    expect(postStudioOptionFor("premium")).toBe("premium");
    expect(postStudioOptionFor("multi")).toBe("multi");
  });

  test("the copy everywhere names the $30 option and stays 'coming soon'; nothing says it can be bought today", () => {
    expect(t("en", "dashboard.free.tile.postStudioPrice")).toBe("$30/mo alone · +$15 on Grow · +$8 on Premium");
    expect(t("en", "dashboard.website.studioShowcase.price")).toBe("$30/mo on its own · +$15 on Grow · +$8 on Premium · included in Multi");
    expect(unlockLine("postStudio", NO_FACTS, "en")).toBe("A full website we build and host for you — $30/mo on its own, or add it to Grow or Premium. PostStudio, coming soon.");
    expect(unlockLine("postStudio", NO_FACTS, "es")).toContain("$30/mes por sí solo");
    expect(t("es", "dashboard.website.studioShowcase.price")).toContain("$30/mes por sí solo");
    for (const locale of ["en", "es"] as const)
      for (const [key, value] of Object.entries(messages[locale]))
        if (/postStudio|PostStudio/.test(key)) expect(value, key).not.toMatch(/buy now|available now|disponible ahora|compre ahora/i);
  });

  test("PostAI knows the $30 option, the totals, and that it's coming soon", () => {
    for (const s of ['"PostStudio only" for $30/mo', "Grow + PostStudio for $40/mo", "Premium + PostStudio for $58/mo", "included in Multi", "PostStudio is coming soon and there is nothing to buy yet"])
      expect(ASSISTANT_SYSTEM_RULES).toContain(s);
  });

  test("docs carry the $30 standalone option", () => {
    for (const f of ["docs/product-structure.md", "docs/day5-website-studio-plan.md"]) {
      const doc = readFileSync(f, "utf8");
      expect(doc, f).toContain("PostStudio only");
      expect(doc, f).toContain("$30/mo");
    }
  });
});
