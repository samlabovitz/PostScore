import { describe, expect, test, vi } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/upgradePromos", () => ({ hidePromo: vi.fn(async () => ({ status: "ok" })) }));

import { LocaleProvider } from "@/lib/i18n";
import { cardPromoKey, NO_FACTS, promoCardsFor, SHOWCASE_PAGES, type PromoFacts, type ShowcasePage } from "@/lib/upgradePromos";
import type { Plan } from "@/lib/plan";
import type { UpgradeContextData } from "@/lib/upgradePromos.server";
import { UpgradeProvider } from "./UpgradeContext";
import { PromoCards } from "./PromoCards";
import { UpgradeButton, UpgradeTrigger } from "./UpgradeTrigger";

const FACTS: PromoFacts = { ...NO_FACTS, businessName: "Test Salon", score: 37, fixPoints: 18 };

function ctx(plan: Plan, page: ShowcasePage | null, hiddenUntil: Record<string, string> = {}, facts = FACTS): UpgradeContextData {
  const cards = page ? promoCardsFor(plan).map((kind) => ({ kind, page, key: cardPromoKey(kind, page), hiddenUntil: hiddenUntil[kind] ?? null })) : [];
  return { businessId: "b1", plan, facts, cards };
}
const render = (value: UpgradeContextData | null, node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <UpgradeProvider value={value}>{node}</UpgradeProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the promo cards at the bottom of every main page", () => {
  test("Free: Grow AND Premium side by side, Premium always shown with 'Best value'", () => {
    for (const page of SHOWCASE_PAGES) {
      const html = render(ctx("free", page), <PromoCards />);
      expect(html, page).toContain('data-kinds="grow,premium"');
      expect(html.match(/data-testid="best-value"/g), page).toHaveLength(1);
      expect(html, page).toContain("md:grid-cols-2");
    }
    const t = text(render(ctx("free", "overview"), <PromoCards />));
    expect(t).toContain("Fix it yourself, step by step");
    expect(t).toContain("We do the work for you");
    expect(t).toContain("18 points of fixes waiting for Test Salon");
  });

  test("Grow: the Premium card only; 3 page-relevant chips; no box until clicked", () => {
    for (const page of SHOWCASE_PAGES) {
      const html = render(ctx("grow", page), <PromoCards />);
      expect(html, page).toContain('data-kinds="premium"');
      expect(html.match(/<li /g), page).toHaveLength(3);
      expect(html, page).not.toContain('data-testid="promo-box"');
    }
    expect(text(render(ctx("grow", "reviews"), <PromoCards />))).toContain("AI-drafted review replies soon");
    expect(text(render(ctx("free", "pricing"), <PromoCards />))).toContain("Price check tools");
  });

  test("Premium and Multi: no promo cards on any page (on Website, PostStudio's one mention is its card)", () => {
    for (const page of SHOWCASE_PAGES) {
      expect(render(ctx("premium", page), <PromoCards />), page).toBe("");
      expect(render(ctx("multi", page), <PromoCards />), page).toBe("");
    }
  });
;

  test("each card hides on its own for 14 days", () => {
    const soon = new Date(Date.now() + 13 * 24 * 3600 * 1000).toISOString();
    const html = render(ctx("free", "campaigns", { grow: soon }), <PromoCards />);
    expect(html).toContain('data-kinds="premium"');
    expect(render(ctx("free", "campaigns", { grow: soon, premium: soon }), <PromoCards />)).toBe("");
    const past = new Date(Date.now() - 1000).toISOString();
    expect(render(ctx("free", "campaigns", { grow: past }), <PromoCards />)).toContain('data-kinds="grow,premium"');
  });

  test("no data → no numbers; nothing without upgrade data; Spanish", () => {
    expect(text(render(ctx("free", "overview", {}, NO_FACTS), <PromoCards />))).not.toMatch(/points of fixes/);
    expect(render(null, <PromoCards />)).toBe("");
    const es = text(render(ctx("free", "website"), <PromoCards />, "es"));
    expect(es).toContain("Nosotros hacemos el trabajo por usted");
    expect(es).toContain("Mejor valor");
  });
});

describe("locked-feature triggers", () => {
  test("small by default: a plan lock chip and a 'See plans' link, closed; the box only opens on a click", () => {
    const free = render(ctx("free", null), <UpgradeTrigger feature="designs" />);
    expect(free).toContain('data-testid="upgrade-trigger"');
    expect(free).toContain('data-variant="link"');
    expect(free).toContain('aria-expanded="false"');
    expect(text(free).trim()).toBe("Premium See plans");
    expect(free).not.toContain("promo-box");
    expect(free).not.toContain("unlock-grow-button");
    expect(text(render(ctx("free", null), <UpgradeTrigger feature="reviewSign" />)).trim()).toBe("Grow See plans");
    expect(text(render(ctx("free", null), <UpgradeTrigger feature="postStudio" />)).trim()).toBe("Add-on See plans");
    // A block that already names its plan drops the chip.
    expect(text(render(ctx("free", null), <UpgradeTrigger feature="designs" plain />)).trim()).toBe("See plans");
    expect(text(render(ctx("free", null), <UpgradeTrigger feature="designs" />, "es")).trim()).toBe("Premium Ver planes");
  });

  test("the one full comparison per page: two big buttons; Premium-only reads 'Not included in Grow'", () => {
    const grow = render(ctx("free", null), <UpgradeTrigger feature="grow" variant="pair" />);
    expect(grow).toContain('data-testid="unlock-grow-button"');
    expect(grow).toContain('data-testid="unlock-premium-button"');
    expect(text(grow).trim()).toBe("Unlock with Grow Unlock with Premium Best value");
    expect(text(render(ctx("free", null), <UpgradeTrigger feature="campaignHub" variant="pair" />))).toContain("Not included in Grow");
  });

  test("big pairs only where the spec allows them (showroom top card, More customers)", () => {
    const hits = execSync(`grep -rln 'variant="pair"' app components --include='*.tsx' || true`, { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !f.includes(".test.") && !f.endsWith("UpgradeTrigger.tsx"))
      .sort();
    expect(hits).toEqual(["components/overview/GrowMoreCustomers.tsx", "components/plan/TabShowroom.tsx"]);
  });

  test("UpgradeButton: a locked action that opens the box; disabled without upgrade data", () => {
    const html = render(ctx("free", null), <UpgradeButton feature="print">Print</UpgradeButton>);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("disabled");
    expect(render(null, <UpgradeButton feature="print">Print</UpgradeButton>)).toContain("disabled");
  });

  test("nothing for a plan that already has it, for Premium/Multi, or without upgrade data", () => {
    expect(render(ctx("grow", null), <UpgradeTrigger feature="print" />)).toBe("");
    for (const plan of ["premium", "multi"] as Plan[]) expect(render(ctx(plan, null), <UpgradeTrigger feature="googleProfile" />)).toBe("");
    expect(render(null, <UpgradeTrigger feature="designs" />)).toBe("");
  });
});

describe("no fake checkout, no pop-ups", () => {
  const files = ["PromoBox.tsx", "UpgradeTrigger.tsx", "PromoCards.tsx", "UpgradeContext.tsx"].map((f) => [f, readFileSync(`components/upgrade/${f}`, "utf8")] as const);

  test("nothing charges or pretends to: 'See plans' only opens Settings → Compare plans", () => {
    // Code only (comments say what it doesn't do).
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const [f, src] of files) expect(code(src), f).not.toMatch(/stripe|\/api\/(billing|checkout)|\bfetch\(|purchase|countdown|% off/i);
    expect(files.find(([f]) => f === "PromoBox.tsx")![1]).toContain("/settings#compare-plans");
  });

  test("the box isn't modal and never opens by itself (only from a click handler)", () => {
    const box = files.find(([f]) => f === "PromoBox.tsx")![1];
    expect(box).toContain('aria-modal="false"');
    expect(box).not.toMatch(/overflow\s*=\s*"hidden"|backdrop-|inset-0 bg-/);
    for (const [f, src] of files) expect(src, f).not.toMatch(/useState\(\s*\{\s*open:\s*true|lockedClick"[^}]*\}\s*\)\s*;?\s*\}\s*,\s*\[/);
  });
});
