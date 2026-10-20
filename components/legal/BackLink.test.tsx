import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import TermsPage from "@/app/terms/page";
import RefundPolicyPage from "@/app/refund-policy/page";
import UnsubscribePage from "@/app/unsubscribe/page";
import { BackLink } from "./BackLink";
import { backLabel, canGoBack } from "@/lib/backLink";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("← Back on the legal pages", () => {
  test.each([
    ["terms", TermsPage],
    ["refund policy", RefundPolicyPage],
  ] as const)("%s: '← Back' at the top left, above the title; 'Volver' in Spanish", (_name, Page) => {
    const en = html(Page({ searchParams: {} }));
    expect(en).toMatch(/data-testid="back-link"[^>]*>.*tabler-icon-arrow-left.*Back<\/a>/);
    expect(en.indexOf('data-testid="back-link"')).toBeLessThan(en.indexOf("<h1"));
    const es = html(Page({ searchParams: { lang: "es" } }));
    expect(es).toMatch(/data-testid="back-link"[^>]*>.*Volver<\/a>/);
    expect(es).not.toMatch(/>Back<\/a>/);
  });

  test("a real link to the dashboard when there's nothing to go back to (email link, new tab)", () => {
    const link = html(<BackLink label={backLabel("en")} />);
    expect(link).toMatch(/<a href="\/"/);
    expect(canGoBack(1)).toBe(false);
    expect(canGoBack(2)).toBe(true);
    expect(backLabel("es")).toBe("Volver");
  });

  test("the unsubscribe page (opened from an email) has it too", async () => {
    const page = html((await UnsubscribePage({ searchParams: {} })) as React.ReactElement);
    expect(page).toMatch(/data-testid="back-link"[^>]*>.*Back<\/a>/);
    expect(page).toContain('href="/"');
  });
});
