import { POSTSTUDIO_ON_SALE } from "@/lib/postStudio";
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { hasPostStudio, POSTSTUDIO_OPTIONS, POSTSTUDIO_PRICES, postStudioOptionFor } from "./postStudio";
import { isAddon, PLANS } from "./plan";
import { messages, t } from "./i18n";
import { NO_FACTS, unlockLine } from "./upgradePromos";
import { planFactsText } from "./planFacts";
import { featureMapFor } from "./postaiFeatureMap";
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

  test("prices: $30 alone; Grow +$15 = $40; Premium ($40 since Day 23D) +$10 = $50; Multi included", () => {
    expect(POSTSTUDIO_OPTIONS).toEqual(["solo", "grow", "premium", "multi"]);
    expect(POSTSTUDIO_PRICES).toEqual({ solo: { addOn: 30, total: 30 }, grow: { addOn: 15, total: 40 }, premium: { addOn: 10, total: 50 } });
    expect(postStudioOptionFor("free")).toBe("solo");
    expect(postStudioOptionFor("grow")).toBe("grow");
    expect(postStudioOptionFor("premium")).toBe("premium");
    expect(postStudioOptionFor("multi")).toBe("multi");
  });

  test("not on sale yet (Nov 22): the copy shown says 'coming soon' with no price; nothing says it can be bought today", () => {
    expect(POSTSTUDIO_ON_SALE).toBe(false);
    expect(unlockLine("postStudio", NO_FACTS, "en")).toBe("A full website we build and host for you. PostStudio, coming soon.");
    expect(unlockLine("postStudio", NO_FACTS, "es")).toBe("Un sitio web completo que construimos y alojamos por usted. PostStudio, próximamente.");
    expect(t("en", "dashboard.free.planList.postStudio.l")).not.toMatch(/\$/);
    expect(t("es", "dashboard.free.planList.postStudio.l")).not.toMatch(/\$/);
    // The prices stay in the code for launch (lib/postStudio.ts), shown only once on sale.
    expect(t("en", "dashboard.website.studioShowcase.price")).toBe("$30/mo on its own · +$15 on Grow · +$10 on Premium · included in Multi");
    for (const locale of ["en", "es"] as const)
      for (const [key, value] of Object.entries(messages[locale]))
        if (/postStudio|PostStudio/.test(key)) expect(value, key).not.toMatch(/buy now|available now|disponible ahora|compre ahora/i);
  });

  test("PostAI says only that PostStudio is coming later — never a price, add-on cost or discount (Nov 21)", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('Say only "PostStudio is coming later" — never a price, a discount, an add-on cost, or which plan includes it');
    expect(ASSISTANT_SYSTEM_RULES).not.toMatch(/\$(30|40|48|50|58)\/mo|\+\$(8|10|15)\b/);
    const facts = planFactsText();
    expect(facts).toContain("PostStudio — a full website built and hosted for you (coming later)");
    expect(facts).not.toMatch(/PostStudio[^;\n]*(\$\d|discount|included)/i);
    for (const plan of ["free", "grow", "premium", "multi"] as const) {
      const note = featureMapFor(plan, { couponsOk: true, referralOk: true, pricingOk: true, hasWebsite: true }).find((e) => e.id === "postStudio")?.note ?? "";
      expect(note).not.toMatch(/\$\d/);
    }
  });

  test("docs carry the $30 standalone option", () => {
    for (const f of ["docs/product-structure.md", "docs/day5-website-studio-plan.md"]) {
      const doc = readFileSync(f, "utf8");
      expect(doc, f).toContain("PostStudio only");
      expect(doc, f).toContain("$30/mo");
    }
  });
});
