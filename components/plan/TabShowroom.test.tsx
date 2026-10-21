import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/websiteScreenshots", () => ({ refreshWebsiteScreenshots: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/business/b1/growth", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/layout/AccountMenu", () => ({ AccountMenu: () => null }));

import { LocaleProvider } from "@/lib/i18n";
import { NO_FACTS, type PromoFacts } from "@/lib/upgradePromos";
import { navLocked, SHOWROOM_TABS, tabLocked, type ShowroomTab } from "@/lib/freeTabs";
import type { Plan } from "@/lib/plan";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";
import { TabShowroom } from "./TabShowroom";
import { Sidebar, NAV_ITEMS } from "@/components/layout/Sidebar";

const FACTS: PromoFacts = { ...NO_FACTS, businessName: "Test Salon", issueCount: 5, fixPoints: 18, websiteFailed: 4, builderName: "Wix", reviewCount: 10, reviewAvg: 57, competitorNoun: "salons" };
const render = (tab: ShowroomTab, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <UpgradeProvider value={{ businessId: "b1", plan: "free", facts: FACTS, cards: [] }}>
        <TabShowroom
          tab={tab}
          businessId="b1"
          businessName="Test Salon"
        />
      </UpgradeProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Free: Overview, Competitors, Website and Settings are open", () => {
  test("the five other tabs are locked on Free, and on no other plan", () => {
    for (const tab of SHOWROOM_TABS) {
      expect(tabLocked("free", tab), tab).toBe(true);
      for (const plan of ["grow", "premium", "multi"] as Plan[]) expect(tabLocked(plan, tab)).toBe(false);
    }
    expect(navLocked("free", "dashboard.nav.overview")).toBe(false);
    expect(navLocked("free", "dashboard.nav.competitors")).toBe(false);
    expect(navLocked("free", "dashboard.nav.website")).toBe(false);
    expect(SHOWROOM_TABS).toEqual(["growth", "campaigns", "reviews", "pricing", "reports"]);
    expect(NAV_ITEMS.filter((i) => navLocked("free", i.labelKey))).toHaveLength(5);
  });

  test("the sidebar shows a small lock on those tabs on Free — none on Grow", () => {
    const business = { id: "b1", name: "Test Salon", address: "1 Main St" } as never;
    const free = renderToStaticMarkup(<LocaleProvider locale="en"><Sidebar business={business} plan="free" /></LocaleProvider>);
    expect(free.match(/data-testid="nav-lock"/g)).toHaveLength(5);
    const grow = renderToStaticMarkup(<LocaleProvider locale="en"><Sidebar business={business} plan="grow" /></LocaleProvider>);
    expect(grow).not.toContain("nav-lock");
  });

  test("each locked page returns its showroom FIRST — before any of its own data loads (deep links land there)", () => {
    const files: Record<ShowroomTab, string> = {
      growth: "growth/page.tsx",
      campaigns: "campaigns/page.tsx",
      reviews: "website-reviews/page.tsx",
      pricing: "pricing/page.tsx",
      reports: "reports/page.tsx",
    };
    for (const [tab, f] of Object.entries(files)) {
      const src = readFileSync(`app/business/[id]/${f}`, "utf8");
      const call = src.indexOf(`await freeShowroom(params.id, "${tab}")`);
      expect(call, f).toBeGreaterThan(0);
      const firstLoad = Math.min(...["await Promise.all(", "await getBusinessSummary(", "await getWebsitePageData("].map((x) => (src.indexOf(x) === -1 ? Infinity : src.indexOf(x))));
      expect(call, f).toBeLessThan(firstLoad);
    }
    // The Website page is open on Free — no showroom there.
    expect(readFileSync("app/business/[id]/website/page.tsx", "utf8")).not.toContain("freeShowroom");
  });

  test("showroom pages carry no bottom promo cards (the top card is their one plan comparison)", () => {
    expect(readFileSync("components/plan/freeShowroom.tsx", "utf8")).toContain("upgrade={upgrade && { ...upgrade, cards: [] }}");
  });
});

describe("the showrooms", () => {
  test("each: the tab name, 'Grow · more with Premium', With Grow | Premium adds with the ONE big button pair, and fully hidden sections", () => {
    for (const tab of SHOWROOM_TABS) {
      const html = render(tab);
      const t = text(html);
      expect(html, tab).toContain(`data-tab="${tab}"`);
      expect(t, tab).toContain("Grow · more with Premium");
      expect(t, tab).toContain("With Grow");
      expect(t, tab).toContain("Premium adds");
      expect(t, tab).toContain("Best value");
      const grow = html.slice(html.indexOf('data-testid="showroom-grow"'), html.indexOf('data-testid="showroom-premium"'));
      expect(grow.match(/<li /g), tab).toHaveLength(tab === "campaigns" ? 4 : 3);
      // Exactly one big pair on the page — in the top card; every locked block below gets the small "See plans".
      expect(html.match(/data-testid="unlock-grow-button"/g), tab).toHaveLength(1);
      expect(html.indexOf("unlock-grow-button"), tab).toBeLessThan(html.indexOf('data-testid="locked-preview"'));
      const locked = (html.match(/data-testid="locked-preview"/g) ?? []).length;
      expect(locked, tab).toBeGreaterThan(0);
      expect((html.match(/data-testid="see-plans-link"/g) ?? []).length, tab).toBe(locked);
    }
    expect(text(render("growth"))).toContain("5 fixes · 18 pts");
  });

  test("Campaigns: the hub first, then the locked 'How to run it' guide (step headings only); Grow bullet for the guides", () => {
    const html = render("campaigns");
    const t = text(html);
    expect(t).toContain("Step-by-step guides to run, share, print and track your program");
    expect(t.indexOf("All campaigns")).toBeLessThan(t.indexOf("How to run it"));
    for (const step of ["Pick an offer that fits your business", "Design and print it", "Share it", "Redeem and track it", "End it or refresh it"]) expect(t).toContain(step);
    // The guide's details never ship to Free.
    expect(t).not.toContain("cardstock");
    expect(t).not.toContain("Never reward reviews");
  });

  test("one unlock line per section, never repeated on a page", () => {
    for (const tab of SHOWROOM_TABS) {
      const html = render(tab);
      const lines = Array.from(html.matchAll(/<p data-testid="unlock-line"[^>]*>([^<]+)<\/p>/g), (m) => m[1]);
      expect(lines.length, tab).toBeGreaterThan(0);
      expect(new Set(lines).size, `${tab}: ${lines.join(" | ")}`).toBe(lines.length);
    }
  });

  test("Reviews points to the free review link & QR on the Overview; no guide details in the page", () => {
    const html = render("reviews");
    expect(html).toContain('href="/business/b1#free-reviews"');
    expect(text(html)).toContain("When to ask");
    expect(text(html)).not.toContain("Right after the visit");
  });

  test("Spanish", () => {
    const t = text(render("campaigns", "es"));
    expect(t).toContain("Grow · más con Premium");
    expect(t).toContain("Cómo hacerlo funcionar");
    expect(t).toContain("Ver planes");
  });
});

describe("no paid calls on Free, anywhere", () => {
  test("PostAI, Re-check, the price check, competitor refresh and the niche re-scan all refuse on Free server-side", () => {
    const guard = (file: string, fn: string, before: string) => {
      const src = readFileSync(file, "utf8");
      const body = src.slice(src.indexOf(`export async function ${fn}(`));
      const g = body.indexOf('(await getPlan()) === "free"');
      expect(g, `${fn} guard`).toBeGreaterThan(0);
      expect(g, `${fn} before ${before}`).toBeLessThan(body.indexOf(before));
    };
    guard("app/actions/assistant.ts", "sendAssistantMessage", "callAnthropicChat(");
    guard("app/actions/websiteRecheck.ts", "recheckWebsite", "recheckWebsiteWithClient");
    guard("app/actions/pricing.ts", "assessPricing", "callAnthropicMessage(");
    guard("app/actions/competitors.ts", "refreshCompetitors", "runAndSaveCompetitorScanWithClient(");
    guard("app/actions/niches.ts", "updateCompetitorsForNiche", "runAndSaveCompetitorScanWithClient(");
  });
});

describe("showroom order", () => {
  test("Growth: the locked Google Profile block (Premium, coming soon) comes first, right under the plans card", () => {
    const html = render("growth");
    const t = text(html);
    const plansEnd = html.indexOf('data-testid="showroom-plans"');
    const firstLocked = html.indexOf('data-testid="locked-preview"', plansEnd);
    expect(text(html.slice(firstLocked, html.indexOf("</section>", firstLocked)))).toContain("Google Profile");
    expect(t.indexOf("Google Profile")).toBeLessThan(t.indexOf("Your action plan"));
  });

  test("Campaigns: All campaigns (tracking) is Grow; only email, text and social are Premium (coming soon)", () => {
    const html = render("campaigns");
    const blocks = html.split('data-testid="locked-preview"').slice(1).map((b) => text(b.slice(0, b.indexOf("</section>"))));
    const all = blocks.find((b) => b.includes("All campaigns"))!;
    expect(all).toContain("Grow");
    expect(all).toContain("Track every coupon and referral card in one place, with +1 for each one used — with Grow.");
    const channels = blocks.find((b) => b.includes("Email, text and social campaigns"))!;
    expect(channels).toContain("Premium");
    expect(channels).toContain("Coming soon");
    expect(text(html)).not.toContain("The campaign hub");
  });
});

describe("designer previews in the showrooms", () => {
  test("a clear heading (icon, name, one line) with the Preview chip OUTSIDE the blurred area", async () => {
    const { DesignerPreview } = await import("./DesignerPreview");
    const { IconTicket } = await import("@tabler/icons-react");
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <UpgradeProvider value={{ businessId: "b1", plan: "free", facts: FACTS, cards: [] }}>
          <DesignerPreview icon={IconTicket} title="Coupon designer" description="Bring people back with a simple offer">
            <p>DESIGNER</p>
          </DesignerPreview>
        </UpgradeProvider>
      </LocaleProvider>
    );
    const heading = html.slice(html.indexOf('data-testid="designer-preview-heading"'), html.indexOf('data-testid="designer-preview-content"'));
    expect(heading).toContain("Coupon designer");
    expect(heading).toContain("Bring people back with a simple offer");
    expect(heading).toContain('data-testid="preview-chip"');
    expect(heading).not.toContain("blur-");
    expect(html.indexOf("preview-chip")).toBeLessThan(html.indexOf("designer-preview-content"));
  });
  test("each designer is named; sections are ≥32px apart with a thin rule between them", () => {
    const src = readFileSync("components/plan/TabShowroom.tsx", "utf8");
    for (const k of ["dashboard.free.designer.coupon", "dashboard.free.designer.referral", "dashboard.free.designer.sign"]) expect(src).toContain(k);
    expect(src).toContain("gap-6 divide-y divide-paper-line [&>*+*]:pt-6");
  });
});
