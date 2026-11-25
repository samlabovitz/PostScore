// Day 25B step 4: the two-tab sidebar (spec §1), the new-design preview
// switch (localhost:3001 only) and the Overview's Growth line and compact
// listing row (spec §2a).
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("next/navigation", () => ({ usePathname: () => "/business/b1", useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { ShellDataProvider, type ShellData } from "@/components/layout/ShellData";
import { GrowthLine } from "@/components/overview/TopRecommendations";
import { GoogleListingRow } from "@/components/overview/GoogleListingRow";
import { NEW_PAGES_LIVE, newDesignPreview, redirectToBuilt } from "@/lib/routes";
import { isDevTestAccount } from "@/lib/shellData.server";
import { reportDotVisible } from "@/lib/reportDot";

vi.mock("server-only", () => ({}));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const PAID: ShellData = { presence: { score: 78, grade: "C" }, plan: "premium", testAccount: true };
const FREE: ShellData = { presence: { score: 78, grade: "C" }, plan: "free", testAccount: false };
describe("the preview switch", () => {
  test("on only for the new-design preview, never in production; off on :3000 and in tests", () => {
    expect(newDesignPreview({ NODE_ENV: "development", NEXT_PUBLIC_NEW_DESIGN_PREVIEW: "true" })).toBe(true);
    expect(newDesignPreview({ NODE_ENV: "development" })).toBe(false);
    expect(newDesignPreview({ NODE_ENV: "production", NEXT_PUBLIC_NEW_DESIGN_PREVIEW: "true" })).toBe(false);
    expect(NEW_PAGES_LIVE).toBe(false);
  });
  test("npm run dev:new: port 3001, its own build folder; npm run dev unchanged", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toBe("next dev");
    expect(pkg.scripts["dev:new"]).toBe("NEXT_PUBLIC_NEW_DESIGN_PREVIEW=true NEXT_DIST_DIR=.next-new next dev -p 3001");
    expect(readFileSync("next.config.mjs", "utf8")).toContain('distDir: process.env.NEXT_DIST_DIR || ".next"');
    expect(readFileSync(".gitignore", "utf8")).toContain("/.next-*/");
  });
  test("redirects only to pages already built (steps 2–5); the rest stay on today's pages", () => {
    expect(redirectToBuilt("/business/b1/google-results#searches")).toBe("/business/b1/google-results#searches");
    expect(redirectToBuilt("/business/b1/fix-plan#weekly-plan")).toBe("/business/b1/fix-plan#weekly-plan");
    expect(redirectToBuilt("/business/b1/offers?tab=coupons")).toBe("/business/b1/offers?tab=coupons");
    expect(redirectToBuilt("/business/b1/get-reviews#get-more-reviews")).toBe("/business/b1/get-reviews#get-more-reviews");
    expect(redirectToBuilt("/business/b1/growth#this-week")).toBeNull();
    expect(redirectToBuilt(null)).toBeNull();
  });
  test("the 'Test account' tag: only the dev test login, only under next dev", () => {
    expect(isDevTestAccount({ NODE_ENV: "development", DEV_TEST_LOGIN_EMAIL: "dev@example.com" }, "Dev@Example.com")).toBe(true);
    expect(isDevTestAccount({ NODE_ENV: "production", DEV_TEST_LOGIN_EMAIL: "dev@example.com" }, "dev@example.com")).toBe(false);
    expect(isDevTestAccount({ NODE_ENV: "development", DEV_TEST_LOGIN_EMAIL: "dev@example.com" }, "owner@example.com")).toBe(false);
  });
  test("the shell shows the new sidebar only on the preview; today's sidebar otherwise", () => {
    const shell = readFileSync("components/layout/DashboardShell.tsx", "utf8");
    expect(shell).toContain("{NEW_PAGES_LIVE ? (\n            <TabbedSidebar");
    expect(shell).toContain("<Sidebar\n            business={business}");
  });
});

describe("Overview on the preview", () => {
  const line = (shell: ShellData, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}><ShellDataProvider value={shell}><GrowthLine businessId="b1" /></ShellDataProvider></LocaleProvider>);
  test("the Growth line in place of 'Start here', to the Growth plan (EN + ES); Free: '? Locked'", () => {
    expect(text(line(PAID))).toBe("Growth · Tier 1 Starting out · Open your Growth plan");
    expect(line(PAID)).toContain('href="/business/b1/growth"');
    expect(text(line(PAID, "es"))).toBe("Crecimiento · Nivel 1 Comenzando · Abra su plan de crecimiento");
    expect(text(line(FREE))).toBe("Growth · ? Locked · See what your Growth score would measure");
    expect(text(line(FREE, "es"))).toBe("Crecimiento · ? Bloqueado · Vea lo que mediría su puntuación de crecimiento");
  });

  const row = (props: Partial<Parameters<typeof GoogleListingRow>[0]>, locale: Locale = "en") =>
    renderToStaticMarkup(<LocaleProvider locale={locale}><GoogleListingRow businessId="b1" connected={false} needsReconnect={false} canStart hoursMismatch={false} data={null} {...props} /></LocaleProvider>);
  test("Your Google listing, compact: never connected / disconnected (red, Reconnect) (EN + ES)", () => {
    expect(row({})).toContain('data-state="not-connected"');
    expect(text(row({}))).toContain("Connect Google to check your listing every day Connect");
    const lost = row({ needsReconnect: true });
    expect(lost).toContain('data-state="disconnected"');
    expect(text(lost)).toContain("Disconnected: reconnect to keep your listing checked Reconnect");
    expect(text(row({ needsReconnect: true }, "es"))).toContain("Desconectado: vuelva a conectar para que sigamos revisando su ficha Volver a conectar");
    expect(text(row({}, "es"))).toContain("Conecte Google para revisar su ficha todos los días");
  });

  test("connected: the same counts as the Google listing page (a website hours mismatch is 'to improve'), one link to it", () => {
    const pass = (id: string) => ({ id, earnedPoints: 4, maxPoints: 4, status: "pass", explanation: "" });
    const checks = ["completeness.phone", "completeness.hours", "completeness.website_link", "completeness.categories", "completeness.photos"].map(pass);
    const input = { businessId: "b1", checks, phone: "+1 908-555-0100", website: "https://x.example", category: "Hair salon", openingHours: ["Monday: 9 AM–5 PM"], photoCount: 20, rating: 4.7, reviewCount: 30, messagingOn: true, replies: null, booking: null, media: null, extras: null };
    const plain = row({ connected: true, data: { input: input as never, saved: null, syncedAt: null } });
    const mismatch = row({ connected: true, hoursMismatch: true, data: { input: input as never, saved: null, syncedAt: null } });
    const counts = (html: string) => text(html).match(/\d+ OK · \d+ to fix · \d+ to improve/)![0];
    expect(plain).toContain('data-state="connected"');
    expect(counts(plain)).not.toBe(counts(mismatch));
    expect(Number(counts(mismatch).match(/(\d+) to improve/)![1])).toBe(Number(counts(plain).match(/(\d+) to improve/)![1]) + 1);
    expect(mismatch).toContain('href="/business/b1/growth?tab=google"');
    expect(mismatch).not.toContain("google-listing-row-");
  });

  test("the PostStudio card leaves the Overview on the preview; More customers stays", () => {
    const view = readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
    expect(view).toContain("{!NEW_PAGES_LIVE && <StudioComingSoon businessId={businessId} />}");
    expect(view).toContain("<GrowMoreCustomers");
  });
});

describe("the Reports 'New' dot (rule)", () => {
  const base = { plan: "premium" as const, live: true, dev: false, newestAt: "2026-11-01T06:00:00Z", openedAt: null };
  test("shows until Reports is opened after the newest report; never on Free; none without a report", () => {
    expect(reportDotVisible(base)).toBe(true);
    expect(reportDotVisible({ ...base, openedAt: "2026-11-02T10:00:00Z" })).toBe(false);
    expect(reportDotVisible({ ...base, openedAt: "2026-10-20T10:00:00Z" })).toBe(true);
    expect(reportDotVisible({ ...base, plan: "free" })).toBe(false);
    expect(reportDotVisible({ ...base, newestAt: null })).toBe(false);
  });
  test("while MONTHLY_REPORTS_LIVE isn't 'true': test reports only, only under next dev — never to owners", () => {
    expect(reportDotVisible({ ...base, live: false, dev: true })).toBe(true);
    expect(reportDotVisible({ ...base, live: false, dev: false })).toBe(false);
    const src = readFileSync("lib/shellData.server.ts", "utf8");
    expect(src).toContain('from("monthly_report_test_runs").select("created_at").contains("business_ids", [businessId])');
    expect(src).toContain('if (plan === "free" || (!live && !dev)) return false;');
  });
  test("opening Reports clears it (report_opens, the owner's own row)", () => {
    expect(readFileSync("app/business/[id]/reports/page.tsx", "utf8")).toContain('if (NEW_PAGES_LIVE) await (await import("@/lib/shellData.server")).markReportsOpened(params.id);');
    expect(readFileSync("lib/shellData.server.ts", "utf8")).toContain('from("report_opens").upsert({ user_id: data.user.id, business_id: businessId, opened_at: new Date().toISOString() }, { onConflict: "user_id,business_id" })');
  });
});

describe("Free: the compact listing row", () => {
  const free = (locale: Locale = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <GoogleListingRow businessId="b1" connected={false} needsReconnect={false} canStart={false} hoursMismatch free data={{ input: { businessId: "b1", checks: [], phone: "+1 908-555-0100", website: null, category: "Hair salon", openingHours: ["Monday: 9 AM–5 PM"], photoCount: 3, rating: 4.7, reviewCount: 30, messagingOn: null, replies: null, booking: null, media: null, extras: null } as never, saved: null, syncedAt: null }} />
      </LocaleProvider>
    );
  test("the scan's counts, 'Open your Google listing →', and 'Connect Google with Grow →' in place of the connection (EN + ES)", () => {
    const html = free();
    expect(html).toContain('data-state="free"');
    expect(html).toContain('data-testid="google-listing-counts"');
    expect(text(html)).toMatch(/\d+ OK · \d+ to fix · \d+ to improve/);
    expect(text(html)).toContain("Connect Google with Grow →");
    expect(text(html)).toContain("Open your Google listing");
    expect(html).not.toMatch(/Connected|synced/);
    expect(html).toContain('href="/business/b1/settings#compare-plans"');
    expect(text(free("es"))).toContain("Conecte Google con Grow →");
    const page = readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(page).toContain('NEW_PAGES_LIVE && upgrade.plan === "free"');
  });
});
