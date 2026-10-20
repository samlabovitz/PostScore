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
  test("plan card: the current plan, what's included, Compare plans", () => {
    const html = wrap(<PlanCard plan="free" />);
    expect(html).toContain('data-testid="plan-card"');
    expect(text(html)).toContain("Free");
    expect(text(html)).toContain("Compare plans");
    expect(text(wrap(<PlanCard plan="premium" />))).toContain("Premium");
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
