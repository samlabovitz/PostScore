import { describe, expect, test, vi } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/upgradePromos", () => ({ hidePromo: vi.fn(async () => ({ status: "ok" })) }));

import { LocaleProvider, t, type MessageKey } from "@/lib/i18n";
import { cardPromoKey, NO_FACTS, promoCardsFor, SHOWCASE_PAGES, type PromoFacts, type ShowcasePage } from "@/lib/upgradePromos";
import type { Plan } from "@/lib/plan";
import type { UpgradeContextData } from "@/lib/upgradePromos.server";
import { UpgradeProvider } from "./UpgradeContext";
import { PromoCards } from "./PromoCards";
import { UpgradeButton, UpgradeTrigger } from "./UpgradeTrigger";
import { PostStudioBody } from "./PromoBox";

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

describe("the PostStudio box (its own, not Grow vs Premium)", () => {
  const body = (plan: Plan, locale: "en" | "es" = "en") => {
    const value = ctx(plan, null);
    return render(value, <PostStudioBody up={value} businessId="b1" onClose={() => {}} />, locale);
  };

  test("three compact tiles — Website, Menu & catalog, Logo Studio (each coming soon) — then the ways to get it; no page outlines", () => {
    const html = body("free");
    const t = text(html);
    expect(html.match(/<li [^>]*data-feature="(\w+)"/g)!.map((m) => m.match(/data-feature="(\w+)"/)![1])).toEqual(["website", "menu", "logo"]);
    expect(t).toContain("Website Coming soon A multi-page site, hosted for you on your own domain, updated after every scan.");
    expect(t).toContain("Menu & catalog Coming soon Your menu or product list, always up to date, with a QR code that never changes.");
    expect(t).toContain("Logo Studio Coming soon Upload your logo or make a simple one, used across your site and printouts.");
    expect(html).not.toMatch(/outline|The 4 pages/i);
    expect(html.indexOf('data-testid="poststudio-features"')).toBeLessThan(html.indexOf('data-testid="poststudio-options"'));
    expect(t).toContain("PostStudio only $30/mo");
    expect(t).toContain("Grow + PostStudio $40/mo");
    expect(t).toContain("Premium + PostStudio $58/mo");
    expect(t).toContain("Best value");
    expect(t).toContain("Included in Multi");
    expect(html).not.toContain('data-testid="promo-plan"');
    expect(html.indexOf('data-option="solo"')).toBeLessThan(html.indexOf('data-option="grow"'));
    expect(html.indexOf('data-option="grow"')).toBeLessThan(html.indexOf('data-option="premium"'));
    expect(html.indexOf('data-option="premium"')).toBeLessThan(html.indexOf('data-option="multi"'));
  });

  test("the plan they're on is highlighted (Free → PostStudio only)", () => {
    const on = (plan: Plan) => body(plan).match(/data-option="(\w+)" data-highlighted="true"/g);
    expect(on("free")).toEqual(['data-option="solo" data-highlighted="true"']);
    expect(on("grow")).toEqual(['data-option="grow" data-highlighted="true"']);
    expect(on("premium")).toEqual(['data-option="premium" data-highlighted="true"']);
    expect(text(body("grow"))).toContain("Your plan");
  });

  test("the box: PostStudio's own title, Coming soon, its footer; every PostStudio lock opens it", () => {
    const box = readFileSync("components/upgrade/PromoBox.tsx", "utf8");
    expect(box).toContain('const studio = feature === "postStudio";');
    expect(box).toContain('studio ? "dashboard.postStudioPlans.footer" : "dashboard.upgrade.box.noCheckout"');
    expect(box).toContain("<PostStudioBody up={up}");
    expect(box).not.toContain("pageOutlines");
    const tr = (k: string, l: "en" | "es" = "en") => text(render(null, <>{t(l, k as MessageKey)}</>, l)).trim();
    expect(tr("dashboard.postStudioPlans.footer")).toBe("Coming soon — nothing is charged today.");
    expect(tr("dashboard.postStudioPlans.box.title")).toBe("PostStudio: your website, menu and logo");
    expect(readFileSync("app/business/[id]/website/PostStudioShowcase.tsx", "utf8")).toContain('<UpgradeButton feature="postStudio" testId="poststudio-add"');
    expect(readFileSync("components/overview/FreeOverview.tsx", "utf8")).toContain('feature="postStudio"');
  });

  test("Spanish (usted)", () => {
    const t = text(body("premium", "es"));
    for (const s of ["Sitio web", "Menú y catálogo", "Logo Studio", "un código QR que nunca cambia", "Suba su logo", "Solo PostStudio", "$30/mes", "Grow + PostStudio", "$40/mes", "Premium + PostStudio", "$58/mes", "Mejor valor", "Incluido en Multi", "Su plan", "Próximamente"]) expect(t).toContain(s);
  });
});

describe("every promo box is never cut off", () => {
  const box = readFileSync("components/upgrade/PromoBox.tsx", "utf8");

  test("fixed and fully on screen: a bottom sheet on a phone, centered from md — never anchored where it could overflow", () => {
    expect(box).toContain("inset-x-0 bottom-0 max-h-[calc(100dvh-1rem)] rounded-t-2xl");
    expect(box).toContain("md:left-1/2 md:top-1/2");
    expect(box).toContain("md:-translate-x-1/2 md:-translate-y-1/2");
    expect(box).toContain("md:w-[min(620px,calc(100vw-2rem))] md:max-h-[calc(100dvh-2rem)]");
    expect(box).not.toMatch(/getBoundingClientRect|useLayoutEffect|style=\{/);
  });

  test("the header (title + ×) and footer stay visible; only the middle scrolls", () => {
    expect(box).toMatch(/flex flex-col overflow-hidden/);
    expect(box).toMatch(/"flex shrink-0 [^"]*" data-testid="promo-box-header"/);
    expect(box).toMatch(/"flex min-h-0 flex-1 flex-col [^"]*overflow-y-auto[^"]*" data-testid="promo-box-body"/);
    expect(box).toMatch(/"flex shrink-0 [^"]*" data-testid="promo-box-footer"/);
    const header = box.slice(box.indexOf('data-testid="promo-box-header"'), box.indexOf('data-testid="promo-box-body"'));
    expect(header).toContain("<h2 id={titleId}");
    expect(header).toContain('onClose("x")');
    // One box component serves every lock in the app.
    expect(execSync("grep -rl 'role=\"dialog\"' components app --include=*.tsx | grep -i promo || true").toString().trim()).toBe("components/upgrade/PromoBox.tsx");
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
