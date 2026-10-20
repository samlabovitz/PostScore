import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/upgradePromos", () => ({ hidePromo: vi.fn(async () => ({ status: "ok" })) }));

import { LocaleProvider } from "@/lib/i18n";
import { NO_FACTS, SHOWCASE_PAGES, stripAudience, type PromoFacts, type ShowcasePage } from "@/lib/upgradePromos";
import type { Plan } from "@/lib/plan";
import type { UpgradeContextData } from "@/lib/upgradePromos.server";
import { UpgradeProvider } from "./UpgradeContext";
import { ShowcaseStrip } from "./ShowcaseStrip";
import { UpgradeTrigger } from "./UpgradeTrigger";

const FACTS: PromoFacts = { ...NO_FACTS, businessName: "Test Salon", score: 37, fixPoints: 18 };

function ctx(plan: Plan, page: ShowcasePage | null, hiddenUntil: string | null = null, facts = FACTS): UpgradeContextData {
  const audience = page ? stripAudience(plan, page) : null;
  return { businessId: "b1", plan, facts, strip: page && audience ? { page, audience, hiddenUntil } : null };
}
const render = (value: UpgradeContextData | null, node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <UpgradeProvider value={value}>{node}</UpgradeProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the showcase strip", () => {
  test("Free: Grow on the Overview and Growth (with their real fix points), Premium on the other main pages", () => {
    const overview = render(ctx("free", "overview"), <ShowcaseStrip />);
    expect(overview).toContain('data-audience="grow"');
    expect(text(overview)).toContain("Grow: fix it yourself, step by step");
    expect(text(overview)).toContain("18 points of fixes waiting for Test Salon");
    expect(text(overview)).toContain("See what's included");
    const reviews = render(ctx("free", "reviews"), <ShowcaseStrip />);
    expect(reviews).toContain('data-audience="premium"');
    expect(text(reviews)).toContain("Premium: we do the work for you");
    expect(text(reviews)).toContain("AI-drafted review replies soon");
  });

  test("Grow: Premium on every main page, 3 chips at a time, no box until clicked", () => {
    for (const page of SHOWCASE_PAGES) {
      const html = render(ctx("grow", page), <ShowcaseStrip />);
      expect(html, page).toContain('data-audience="premium"');
      expect(html.match(/<li /g), page).toHaveLength(3);
      expect(html, page).not.toContain('data-testid="promo-box"');
    }
  });

  test("Premium sees only the PostStudio line on the Website page; Multi sees nothing", () => {
    for (const page of SHOWCASE_PAGES) {
      const premium = render(ctx("premium", page), <ShowcaseStrip />);
      if (page === "website") expect(text(premium)).toContain("PostStudio: a full website we build and host — +$8/mo on Premium (coming soon)");
      else expect(premium, page).toBe("");
      expect(render(ctx("multi", page), <ShowcaseStrip />), page).toBe("");
    }
  });

  test("collapsed: stays hidden until the 14 days are up", () => {
    const soon = new Date(Date.now() + 13 * 24 * 3600 * 1000).toISOString();
    expect(render(ctx("grow", "campaigns", soon), <ShowcaseStrip />)).toBe("");
    const past = new Date(Date.now() - 1000).toISOString();
    expect(render(ctx("grow", "campaigns", past), <ShowcaseStrip />)).toContain('data-testid="showcase-strip"');
  });

  test("no data → no numbers, and nothing without an upgrade context", () => {
    const html = text(render(ctx("free", "overview", null, NO_FACTS), <ShowcaseStrip />));
    expect(html).not.toMatch(/points of fixes/);
    expect(render(null, <ShowcaseStrip />)).toBe("");
  });

  test("Spanish (usted)", () => {
    const html = text(render(ctx("grow", "website"), <ShowcaseStrip />, "es"));
    expect(html).toContain("Premium: nosotros hacemos el trabajo por usted");
    expect(html).toContain("Vea qué incluye");
    expect(html).toContain("PostStudio con descuento");
  });
});

describe("locked-feature triggers", () => {
  test("Free and Grow see the trigger, closed; the box only opens on a click", () => {
    const free = render(ctx("free", null), <UpgradeTrigger feature="designs" />);
    expect(free).toContain('data-testid="upgrade-trigger"');
    expect(free).toContain('aria-expanded="false"');
    expect(text(free)).toContain("What's in Premium?");
    expect(free).not.toContain("promo-box");
    expect(text(render(ctx("free", null), <UpgradeTrigger feature="reviewSign" />))).toContain("What's in Grow?");
  });

  test("nothing for a plan that already has it, for Premium/Multi, or without upgrade data", () => {
    expect(render(ctx("grow", null), <UpgradeTrigger feature="print" />)).toBe("");
    for (const plan of ["premium", "multi"] as Plan[]) expect(render(ctx(plan, null), <UpgradeTrigger feature="googleProfile" />)).toBe("");
    expect(render(null, <UpgradeTrigger feature="designs" />)).toBe("");
  });
});

describe("no fake checkout, no pop-ups", () => {
  const files = ["PromoBox.tsx", "UpgradeTrigger.tsx", "ShowcaseStrip.tsx", "UpgradeContext.tsx"].map((f) => [f, readFileSync(`components/upgrade/${f}`, "utf8")] as const);

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
