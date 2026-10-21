import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { Plan } from "@/lib/plan";

const state = vi.hoisted(() => ({
  plan: "free" as Plan,
  query: "",
  promos: { status: "ok", promos: [] as unknown[] } as { status: string; promos?: unknown[] },
  referral: { status: "ok", referral: null as unknown } as { status: string; referral?: unknown },
  website: {} as Record<string, unknown>,
}));

vi.mock("@/app/actions/websiteScreenshots", () => ({ refreshWebsiteScreenshots: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.query),
  usePathname: () => "/business/b1/campaigns",
}));
vi.mock("@/components/layout/DashboardShell", () => ({ DashboardShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/premium", () => ({ getPlan: () => state.plan }));
vi.mock("@/app/actions/businesses", () => ({
  getBusinessSummary: async () => ({
    status: "ok",
    business: { id: "b1", name: "Hudson Shears", address: "20 W Main St #1, Irvington, NY 10533, USA", phone: "+1 914-591-3737", category: "Beauty salon", primary_type: null, categories: null, business_type_override: null, language: "en", time_zone: "America/New_York" },
  }),
}));
vi.mock("@/app/actions/promos", () => ({ listActivePromos: async () => state.promos, incrementPromoRedemption: vi.fn(), endPromo: vi.fn(), startPromo: vi.fn() }));
vi.mock("@/app/actions/referrals", () => ({ getActiveReferral: async () => state.referral, incrementReferralRedemption: vi.fn(), endReferral: vi.fn(), startReferral: vi.fn() }));
vi.mock("@/app/actions/printStudio", () => ({ getPrintStudioData: async () => ({ status: "ok", business: { businessName: "Hudson Shears", placeId: "p", googleMapsUri: null, website: null, address: null, hours: null, icon: "star" } }) }));
vi.mock("@/app/actions/website", () => ({ getWebsitePageData: async () => ({ status: "ok", data: state.website }) }));

import CampaignsPage from "./campaigns/page";
import { CampaignsView } from "./campaigns/CampaignsView";
import { AllCampaigns } from "./campaigns/AllCampaigns";
import GoogleProfilePage from "./google-profile/page";
import SearchDemandPage from "./search-demand/page";
import PostStudioPage from "./studio/page";
import { LocaleProvider } from "@/lib/i18n";
import { bizProfileById } from "@/config/bizProfiles";
import { campaignsTabFromParam } from "@/lib/campaignsTabs";
import { redemptionLabel } from "@/lib/promos";
import { hasPostStudio, leaveHref, siteChecklist } from "@/lib/postStudio";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );

const PROMO = { id: "p1", business_id: "b1", type: "pct_off", offer: "20% off your next cut", code: "HUD20", instructions: null, terms: null, expiry: null, redemptions: 7, active: true, created_at: "2026-10-01T12:00:00Z" };
const REFERRAL = { id: "r1", business_id: "b1", referrer_reward: "a free trim", friend_reward: "$10 off", code: "FRIEND", redemptions: 2, active: true, created_at: "2026-10-02T12:00:00Z" };
const SALON = bizProfileById("salon", "en")!;

const WEBSITE = {
  businessName: "Hudson Shears",
  address: "20 W Main St #1, Irvington, NY 10533, USA",
  category: "Beauty salon",
  categories: null,
  primaryType: null,
  businessTypeOverride: null,
  language: "en",
  phone: "+1 914-591-3737",
  openingHours: null,
  openingHoursPeriods: null,
  starterSiteHours: null,
  timeZone: "America/New_York",
  rating: 4.7,
  reviewCount: 10,
  googleMapsUri: "https://maps.google.com/?cid=1",
  priceLevel: null,
  verifiedSocialLinks: [],
  storefront: true,
  placeId: "ChIJ_hudson",
};

beforeEach(() => {
  state.plan = "free";
  state.query = "";
  state.promos = { status: "ok", promos: [PROMO] };
  state.referral = { status: "ok", referral: REFERRAL };
  state.website = { ...WEBSITE };
});

describe("Campaigns: coupons + referrals moved off Growth", () => {
  test("Free gets the Campaigns showroom (no rows loaded); Grow+ get the existing rows untouched — tallies keep their counts — and the plan", async () => {
    state.plan = "free";
    const showroom = (await CampaignsPage({ params: { id: "b1" } })) as ReactElement;
    const room = (showroom.props as { children: ReactElement }).children;
    expect((room.props as { tab: string }).tab).toBe("campaigns");
    for (const plan of ["grow", "premium"] as const) {
      state.plan = plan;
      const page = (await CampaignsPage({ params: { id: "b1" } })) as ReactElement;
      const view = (page.props as { children: ReactElement }).children;
      const props = view.props as { initialPromos: unknown[]; initialReferral: unknown; plan: Plan };
      expect(props.initialPromos).toEqual([PROMO]);
      expect(props.initialReferral).toEqual(REFERRAL);
      expect(props.plan).toBe(plan);
    }
  });

  test("All campaigns lists the real running coupon and referral card with code, times used and +1 — no create buttons or + icons", () => {
    const html = wrap(<AllCampaigns businessName="Hudson Shears" businessPhone={null} couponsOk referralOk promos={[PROMO]} onPromosChange={() => undefined} onReferralChange={() => undefined} referral={REFERRAL} />);
    const t = text(html);
    expect(t).toContain("20% off your next cut");
    expect(t).toContain("HUD20");
    expect(t).toContain("FRIEND");
    expect(t).toContain(redemptionLabel(7, "en"));
    expect(t).toContain(redemptionLabel(2, "en"));
    expect(t).toContain("+1 Redeemed");
    expect(t).toContain("+1 Referral");
    expect(t).not.toMatch(/Create a (coupon|referral card)/);
    expect(html).not.toContain("tabler-icon-plus");
  });

  test("nothing running: one empty state pointing to the design tabs (EN + ES)", () => {
    const en = text(wrap(<AllCampaigns businessName="Hudson Shears" businessPhone={null} couponsOk referralOk promos={[]} onPromosChange={() => undefined} onReferralChange={() => undefined} referral={null} />));
    expect(en.trim()).toBe("No campaigns running yet — design one on the Coupons or Referrals tab and save it to start tracking.");
    const es = text(wrap(<AllCampaigns businessName="Hudson Shears" businessPhone={null} couponsOk referralOk promos={[]} onPromosChange={() => undefined} onReferralChange={() => undefined} referral={null} />, "es"));
    expect(es.trim()).toBe("Todavía no hay campañas en curso: diseñe una en la pestaña Cupones o Referidos y guárdela para empezar a contar.");
  });

  test("only a coupon running: the coupon list, no empty referral box", () => {
    const t = text(wrap(<AllCampaigns businessName="Hudson Shears" businessPhone={null} couponsOk referralOk promos={[PROMO]} onPromosChange={() => undefined} onReferralChange={() => undefined} referral={null} />));
    expect(t).toContain("20% off your next cut");
    expect(t).not.toContain("Active referrals");
    expect(t).not.toContain("No campaigns running yet");
  });

  test("tabs come from the URL: Grow and Premium open on All campaigns (the tracking home); old ?tab=referral still works", () => {
    expect(campaignsTabFromParam(null, SALON)).toBe("all");
    expect(campaignsTabFromParam("coupons", SALON)).toBe("coupons");
    expect(campaignsTabFromParam("referrals", SALON)).toBe("referrals");
    expect(campaignsTabFromParam("referral", SALON)).toBe("referrals");
    expect(campaignsTabFromParam("referrals", { couponsOk: true, referralOk: false })).toBe("all");
    expect(campaignsTabFromParam("nonsense", SALON)).toBe("all");
    const view = (query: string, plan: "grow" | "premium" = "grow") => {
      state.query = query;
      return wrap(<CampaignsView businessId="b1" businessName="Hudson Shears" businessPhone={null} profile={SALON} initialPromos={[]} initialReferral={null} plan={plan} printBusiness={null} />);
    };
    for (const plan of ["grow", "premium"] as const) {
      const all = view("", plan);
      expect(all, plan).toMatch(/role="tab" aria-selected="true"[^>]*>All campaigns</);
      expect(all, plan).not.toContain("locked-preview");
      // Email, text and social: Premium — a lock + "Premium" chip on Grow, "Coming soon" on Premium.
      if (plan === "grow") {
        expect(all.match(/data-testid="channel-premium"/g)).toHaveLength(3);
        expect(text(all)).not.toContain("Coming soon");
      } else {
        expect(text(all).match(/Coming soon/g)).toHaveLength(3);
        expect(all).not.toContain("channel-premium");
      }
    }
    expect(view("tab=coupons")).toMatch(/role="tab" aria-selected="true"[^>]*>Coupons</);
    expect(view("tab=referrals")).toMatch(/role="tab" aria-selected="true"[^>]*>Referrals</);
    state.query = "";
  });

  test("Spanish tabs", () => {
    state.query = "";
    const es = wrap(<CampaignsView businessId="b1" businessName="Hudson Shears" businessPhone={null} profile={bizProfileById("salon", "es")!} initialPromos={[]} initialReferral={null} plan="premium" printBusiness={null} />, "es");
    for (const label of ["Todas las campañas", "Cupones", "Referidos", "Próximamente"]) expect(es).toContain(label);
  });
});

describe("Old URLs redirect to the new homes", () => {
  test("/google-profile → Growth's Google Profile tab; /search-demand → the same tab's search demand", () => {
    expect(() => GoogleProfilePage({ params: { id: "b1" } })).toThrow("REDIRECT /business/b1/growth?tab=google-profile");
    expect(() => SearchDemandPage({ params: { id: "b1" } })).toThrow("REDIRECT /business/b1/growth?tab=google-profile#search-demand");
  });

  test("Growth's old ?tab=coupons / ?tab=referral → the Campaigns tabs", async () => {
    const { default: GrowthPage } = await import("./growth/page");
    await expect(GrowthPage({ params: { id: "b1" }, searchParams: { tab: "coupons" } })).rejects.toThrow("REDIRECT /business/b1/campaigns?tab=coupons");
    await expect(GrowthPage({ params: { id: "b1" }, searchParams: { tab: "referral" } })).rejects.toThrow("REDIRECT /business/b1/campaigns?tab=referrals");
  });
});

describe("PostStudio: full-screen page", () => {
  const render = async (from?: string) => renderToStaticMarkup((await PostStudioPage({ params: { id: "b1" }, searchParams: from ? { from } : {} })) as ReactElement);

  test("no sidebar; a slim top bar with PostStudio, the business name and Leave (back to where they came from)", async () => {
    const html = await render("/business/b1/website");
    expect(html).not.toContain("<aside");
    expect(text(html)).toContain("PostStudio Hudson Shears");
    expect(html).toMatch(/href="\/business\/b1\/website"[^>]*>.*Leave PostStudio/);
    expect(await render()).toMatch(/href="\/business\/b1"[^>]*>.*Leave PostStudio/);
    expect(leaveHref("b1", "https://evil.example")).toBe("/business/b1");
    expect(leaveHref("b1", "/business/other")).toBe("/business/b1");
    expect(leaveHref("b1", "/business/b1/studio")).toBe("/business/b1");
    expect(leaveHref("b1", "/business/b1/growth?tab=google-profile")).toBe("/business/b1/growth?tab=google-profile");
  });

  test("checklist from real data: ✓ from the listing, ○ the owner adds; outlines clearly not a real site; no starter-site preview", async () => {
    const html = await render();
    const items = Array.from(html.matchAll(/data-ready="(true|false)"[\s\S]*?<span class="text-sm font-medium text-ink">([^<]+)</g)).map((m) => [m[2].replace(/&amp;/g, "&"), m[1] === "true"]);
    expect(items).toEqual([
      ["Business name", true],
      ["Category", true],
      ["Phone number and Call button", true],
      ["Address, directions and map", true],
      ["Hours", false],
      ["Google rating and review count, updated after every scan", true],
      ["Social media links", false],
      ["Your photos", false],
      ["Your story (About page)", false],
      ["Your services and prices", false],
      ["Logo and colors", false],
    ]);
    expect(text(html)).toContain("Page outlines — not your real site yet.");
    for (const page of ["Home", "About", "Services", "Contact"]) expect(html).toContain(`aria-label="${page}"`);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("srcDoc");
  });

  test("without PostStudio: price for the plan, not open yet, comparison, starter link; with Multi: building tools coming soon", async () => {
    const price = async (plan: Plan) => {
      state.plan = plan;
      const html = await render();
      return text(html.match(/data-testid="studio-price">([^<]+)</)?.[1] ?? "");
    };
    expect(await price("free")).toBe("Needs Grow ($25/mo) plus the PostStudio add-on (+$15/mo).");
    expect(await price("grow")).toBe("Add PostStudio to Grow for +$15/mo.");
    expect(await price("premium")).toBe("PostStudio at a discount: +$8/mo on Premium.");
    state.plan = "grow";
    const t = text(await render());
    expect(t).toContain("PostStudio isn't open yet — there's nothing to buy today.");
    expect(t).toContain("Starter website vs PostStudio");
    expect(t).toContain("Want something now? Use the free starter website →");
    state.plan = "multi";
    const multi = await render();
    expect(hasPostStudio("multi")).toBe(true);
    expect(multi).toContain('data-testid="studio-included"');
    expect(text(multi)).toContain("Building tools coming soon");
    expect(multi).not.toContain('data-testid="studio-price"');
    expect(multi).not.toContain("Starter website vs PostStudio");
  });

  test("a service-area business: the area instead of the address; a café gets a Menu page", () => {
    const facts = { businessName: "X", category: "Cafe", phone: null, address: "Irvington, NY, USA", storefront: false, city: "Irvington, NY", hasHours: true, rating: null, verifiedSocialCount: 1, profileId: "cafe" };
    const keys = siteChecklist(facts).map((i) => [i.key.replace("dashboard.postStudio.", ""), i.ready]);
    expect(keys).toContainEqual(["itemArea", true]);
    expect(keys).toContainEqual(["itemMenu", false]);
    expect(keys).toContainEqual(["itemSocial", true]);
    expect(keys).toContainEqual(["itemPhone", false]);
  });

  test("Spanish", async () => {
    state.website = { ...WEBSITE, language: "es" };
    const t = text(await render());
    for (const s of ["Salir de PostStudio", "La lista de su sitio", "Listo con su ficha", "Usted lo agregará", "Esquemas de las páginas — todavía no es su sitio real."]) expect(t).toContain(s);
  });
});
