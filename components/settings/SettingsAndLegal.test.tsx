import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/businesses", () => ({ unsubscribeFromAllEmails: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

import { LocaleProvider } from "@/lib/i18n";
import { CancelPlanButton, PlanCard, SettingsNav, UnsubscribeAllButton } from "./SettingsParts";
import RefundPolicyPage from "@/app/refund-policy/page";
import TermsPage from "@/app/terms/page";
import { LegalLinks } from "@/components/legal/LegalPage";
import { REFUND_POLICY } from "@/lib/legal/policies";
import { CHECKOUT_REQUIREMENTS, CONSENT_RETENTION_YEARS, MAX_CANCEL_CLICKS, PRICE_CHANGE_NOTICE_DAYS } from "@/lib/billing/compliance";

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Settings pieces", () => {
  test("plan card: the current plan's promise and bullets (exact copy), then Compare plans", () => {
    const html = wrap(<PlanCard plan="free" />);
    expect(html).toContain('data-testid="plan-card"');
    const t = text(html);
    expect(t).toContain("Your free digital audit");
    expect(t).toContain("See exactly what's costing you customers.");
    for (const s of ["Your PostScore and grade, with a free re-scan every week", "Every problem on your Google listing, reviews and website", "How you rank against nearby competitors", "Your review gap compared to businesses near you"]) expect(t).toContain(s);
    expect(t).toContain("Compare plans");
    expect(html).toContain('id="compare-plans"');
    // The outdated Free lines are gone.
    expect(t).not.toContain("Weekly action plan and routine");
    expect(t).not.toContain("with a +1 tally you keep");
  });

  test("Compare plans: four plans, Premium highlighted as Best value, the owner's plan marked, every row", () => {
    const html = wrap(<PlanCard plan="grow" />);
    const t = text(html);
    for (const s of ["$0", "$25/mo", "$50/mo", "$150/mo", "Fix it yourself, step by step", "We do the work for you", "Premium for every location"]) expect(t).toContain(s);
    expect(t).toContain("Connect Google and PostScore fixes things for you.");
    expect(t).toContain("Everything in Premium for up to 5 locations (+$25 each extra)");
    expect(html.match(/data-testid="best-value"/g)).toHaveLength(1);
    expect(html).toMatch(/data-plan="premium"[^>]*class="[^"]*border-brass/);
    expect(html.match(/<th[^>]*scope="col"/g)).toHaveLength(5);
    expect(html.match(/data-highlight="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-plan="grow" data-current="true"[^>]*order-first/);
    for (const s of [
      "See what's wrong + your score",
      "Rank vs. nearby competitors",
      "Step-by-step fixes + weekly plan",
      "Instant website re-checks",
      "Review signs, coupons, referral cards",
      "Campaign hub (every coupon and referral, with +1)",
      "Email, text & social campaigns",
      "Track every coupon and referral in one place",
      "Fixes done for you (Google connect)",
      "Basic",
      "Full, no branding",
      "Starter + PostStudio discount",
      "Monthly limit",
      "Unlimited",
      "Monthly email",
      "Weekly recap",
      "Weekly + PDF",
      "+$15/mo",
      "+$8/mo",
      "Coming soon",
      "Preview",
      "Not included",
    ])
      expect(t).toContain(s);
  });

  test("plan wording only: Free has no working tools; nothing not built is claimed as working", async () => {
    const { COMPARE_ROWS } = await import("@/lib/planComparison");
    const freeYes = COMPARE_ROWS.filter((r) => r.cells.free.kind === "yes").map((r) => r.key.split(".").pop());
    expect(freeYes).toEqual(["whatsWrong", "rank"]);
    expect(COMPARE_ROWS.find((r) => r.key.endsWith(".doneForYou"))!.cells.premium).toEqual({ kind: "soon" });
    // The campaign hub (every coupon and referral, +1) is Grow and up; email, text and social are Premium, coming soon.
    const hub = COMPARE_ROWS.find((r) => r.key.endsWith(".hub"))!.cells;
    expect([hub.free, hub.grow, hub.premium, hub.multi]).toEqual([{ kind: "preview" }, { kind: "yes" }, { kind: "yes" }, { kind: "yes" }]);
    const channels = COMPARE_ROWS.find((r) => r.key.endsWith(".channels"))!.cells;
    expect([channels.free, channels.grow, channels.premium, channels.multi]).toEqual([{ kind: "no" }, { kind: "no" }, { kind: "soon" }, { kind: "soon" }]);
    const studio = COMPARE_ROWS.find((r) => r.key.endsWith(".postStudio"))!.cells;
    expect([studio.free, studio.grow, studio.premium, studio.multi]).toEqual([
      { kind: "text", key: "dashboard.settings.plans.value.alone30" },
      { kind: "text", key: "dashboard.settings.plans.value.plus15" },
      { kind: "text", key: "dashboard.settings.plans.value.plus8" },
      { kind: "text", key: "dashboard.settings.plans.value.included", check: true },
    ]);
  });

  test("Compare plans: a PostStudio section under the four plan cards — what it is, the ways to get it, coming soon; the table row", () => {
    const html = wrap(<PlanCard plan="free" />);
    const t = text(html);
    const section = html.indexOf('data-testid="plan-poststudio"');
    expect(section).toBeGreaterThan(html.lastIndexOf('data-plan="multi"'));
    expect(section).toBeLessThan(html.indexOf("<table"));
    for (const s of [
      "PostStudio — your full website",
      "Coming soon",
      "A multi-page website: Home, About, Services (or Menu) and Contact",
      "Hosted for you — nothing to set up",
      "Your own domain (yourbusiness.com)",
      "Your rating and hours update after every scan",
      "Built to pass every website check",
      "PostStudio only $30/mo The free audit + PostStudio",
      "Grow + PostStudio $40/mo Grow + $15/mo for PostStudio",
      "Premium + PostStudio $58/mo Premium + $8/mo for PostStudio",
      "Included in Multi",
      "Coming soon — nothing is charged today.",
      "PostStudio — your full website, built and hosted for you (coming soon)",
      "$30/mo on its own",
    ])
      expect(t).toContain(s);
    // Free's own option (PostStudio only) is highlighted; nothing to buy.
    expect(html).toMatch(/data-option="solo" data-highlighted="true"/);
    expect(html).not.toMatch(/data-option="(grow|premium)" data-highlighted/);
    expect(t).not.toMatch(/Buy|Checkout|Subscribe/i);
    expect(wrap(<PlanCard plan="premium" />)).toMatch(/data-option="premium" data-highlighted="true"/);
    const es = text(wrap(<PlanCard plan="grow" />, "es"));
    for (const s of ["PostStudio: su sitio web completo", "Solo PostStudio", "$30/mes", "Grow + PostStudio", "$40/mes", "$58/mes", "Incluido en Multi", "Próximamente: hoy no se cobra nada.", "$30/mes por sí solo", "Su plan"]) expect(es).toContain(s);
  });

  test("plan card in Spanish (usted)", () => {
    const t = text(wrap(<PlanCard plan="premium" />, "es"));
    expect(t).toContain("Comparar planes");
    expect(t).toContain("Nosotros hacemos el trabajo por usted");
    expect(t).toContain("Conecte Google y PostScore se encarga de los arreglos por usted.");
    expect(t).toContain("$50/mes");
    expect(t).toContain("Mejor valor");
  });

  test("cancel button: one click opens the confirm (2 clicks total)", () => {
    const html = wrap(<CancelPlanButton onConfirm={async () => {}} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(text(html)).toContain("Cancel subscription");
  });

  test("unsubscribe from all emails", () => {
    expect(text(wrap(<UnsubscribeAllButton />))).toContain("Unsubscribe from all PostScore emails");
  });

  test("mini-nav links each section", () => {
    const html = wrap(<SettingsNav sections={[{ id: "profile", label: "Profile", icon: "user" }]} />);
    expect(html).toContain('href="#profile"');
  });
});

describe("refund & cancellation policy", () => {
  test("EN page: the exact policy text and the EU/UK section", () => {
    const html = text(renderToStaticMarkup(RefundPolicyPage({ searchParams: {} })));
    expect(html).toContain(REFUND_POLICY.en.summary);
    expect(html).toContain("Plans renew automatically each month until you cancel.");
    expect(html).toContain("EU/UK customers");
    expect(html).toContain("14-day right to withdraw");
  });

  test("ES page (usted)", () => {
    const html = text(renderToStaticMarkup(RefundPolicyPage({ searchParams: { lang: "es" } })));
    expect(html).toContain("Política de reembolsos y cancelación");
    expect(html).toContain("Clientes de la UE/Reino Unido");
    expect(html).not.toMatch(/\btú\b/);
  });

  test("terms: a service for businesses, linking the refund policy", () => {
    const html = renderToStaticMarkup(TermsPage({ searchParams: {} }));
    expect(text(html)).toContain("A service for businesses");
    expect(html).toContain('href="/refund-policy"');
    expect(renderToStaticMarkup(TermsPage({ searchParams: { lang: "es" } }))).toContain('href="/refund-policy?lang=es"');
  });

  test("footer/Settings links: Terms · Refund policy", () => {
    const html = renderToStaticMarkup(<LegalLinks locale="en" />);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/refund-policy"');
  });

  test("checkout compliance constants", () => {
    expect([CONSENT_RETENTION_YEARS, MAX_CANCEL_CLICKS, PRICE_CHANGE_NOTICE_DAYS]).toEqual([3, 2, 30]);
    expect(CHECKOUT_REQUIREMENTS.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Server → Client props stay serializable (no functions)", () => {
  test("the Settings page names its icons with strings, and every key maps to an icon", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile("app/business/[id]/settings/page.tsx", "utf8");
    expect(src).not.toMatch(/icon[=:]\s*\{?\s*Icon[A-Z]/);
    const { SETTINGS_ICONS } = await import("./SettingsParts");
    for (const key of Array.from(src.matchAll(/icon[=:]\s*"([a-z]+)"/g)).map((m) => m[1])) expect(SETTINGS_ICONS, key).toHaveProperty(key);
  });

  test("no new server page passes an Icon component as a prop", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const f of ["app/business/[id]/settings/page.tsx", "app/business/[id]/reports/page.tsx", "app/business/[id]/pricing/page.tsx", "app/business/[id]/growth/page.tsx", "app/business/[id]/website-reviews/page.tsx", "app/refund-policy/page.tsx", "app/terms/page.tsx"]) {
      const src = await readFile(f, "utf8");
      expect(src.startsWith('"use client"'), f).toBe(false);
      expect(src, f).not.toMatch(/=\{Icon[A-Z]\w*\}|:\s*Icon[A-Z]\w*\s*[,}]/);
    }
  });
});
