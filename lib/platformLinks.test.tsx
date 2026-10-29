import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { LocaleProvider, type Locale } from "@/lib/i18n";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Ordering, delivery, booking, review and link-in-bio pages are NOT a
// website (the real Lulu's Tacos case: a DoorDash store page in the
// website field) — for owners and competitors. Plus "Order online"
// awareness on Google (Place Actions API, mocked here — never called).

import { placeActionTypeFor, platformPage } from "@/lib/socialLinkCheck";
import { businessWebsiteUrl } from "@/lib/businessWebsite";
import { isRealWebsite, scoreBusiness, type BusinessScoringInput } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { existingLinkFor, websitePlatform } from "@/lib/gbpPlaceActions";
import { addPlatformLink, removeAddedLink } from "@/lib/gbpPlaceActions.server";
import type { GbpChangeRow } from "@/lib/gbpAttributes";
import type { GbpChangeStore } from "@/lib/gbpAttributes.server";
import { PlatformLinkCard, platformButtonLabel } from "@/components/gbp/PlatformLinkCard";
import { buildStarterSiteHtml } from "@/lib/starterSite";

const LULU = "https://www.doordash.com/store/36532653";

describe("which links are platform pages", () => {
  test("ordering, booking, review and link-in-bio pages — with their kind", () => {
    expect(platformPage(LULU)).toEqual({ name: "DoorDash", kind: "ordering" });
    expect(platformPage("https://www.ubereats.com/store/lulus-tacos/abc")).toEqual({ name: "Uber Eats", kind: "ordering" });
    expect(platformPage("https://www.yelp.com/biz/lulus-tacos-newark")).toEqual({ name: "Yelp", kind: "directory" });
    expect(platformPage("https://linktr.ee/lulustacos")).toEqual({ name: "Linktree", kind: "link_in_bio" });
    expect(platformPage("http://www.vagaro.com/vincephillipsalon")).toEqual({ name: "Vagaro", kind: "appointments" });
    expect(platformPage("https://www.opentable.com/r/lulus")).toEqual({ name: "OpenTable", kind: "reservations" });
    expect(platformPage("https://ordering.chownow.com/order/1234/locations")).toEqual({ name: "ChowNow", kind: "ordering" });
    expect(platformPage("https://www.instagram.com/lulustacos")).toEqual({ name: "Instagram", kind: "social" });
  });

  test("real websites are never flagged: a restaurant's own domain (built on Toast, BentoBox, ChowNow, Wix) and Square Online sites", () => {
    for (const site of ["https://www.lulustacos.com/", "https://lulustacos.com/menu", "https://thecutbakes.square.site/", "http://atexquitanewark.square.site/", "https://www.joespizza.com/order"]) {
      expect(platformPage(site), site).toBeNull();
      expect(isRealWebsite(site), site).toBe(true);
    }
  });

  test("Google's section for each kind", () => {
    expect(placeActionTypeFor("ordering")).toBe("FOOD_ORDERING");
    expect(placeActionTypeFor("reservations")).toBe("DINING_RESERVATION");
    expect(placeActionTypeFor("appointments")).toBe("APPOINTMENT");
    expect(placeActionTypeFor("directory")).toBeNull();
  });
});

function check(input: BusinessScoringInput, id: string, locale: Locale = "en") {
  return scoreBusiness(input, locale).checks.find((c) => c.id === id)!;
}

describe("scoring: not a website (owners and competitors)", () => {
  for (const [url, name] of [
    [LULU, "DoorDash"],
    ["https://www.ubereats.com/store/x", "Uber Eats"],
    ["https://www.yelp.com/biz/x", "Yelp"],
    ["https://linktr.ee/x", "Linktree"],
    ["http://www.vagaro.com/x", "Vagaro"],
  ] as const) {
    test(`${name}: Has a website 0, Website link 0, the plain sentence (EN + ES), never crawled`, () => {
      const input = scoringInput({ website: url, websiteAnalysis: null, verifiedElsewhereUrl: null });
      expect(check(input, "website.has_website").earnedPoints).toBe(0);
      const link = check(input, "completeness.website_link");
      expect(link.earnedPoints).toBe(0);
      expect(link.explanation).toBe(`Your Google listing's website link goes to your ${name} page, not a website.`);
      expect(check(input, "completeness.website_link", "es").explanation).toBe(`El enlace de sitio web de su ficha de Google lleva a su página de ${name}, no a un sitio web.`);
      // Never crawled, screenshotted or speed-tested: no website to analyze.
      expect(businessWebsiteUrl({ website: url })).toBeNull();
    });
  }

  test("an ordering page is not a social profile (the real Lulu's Tacos 'Social links' bug); Facebook still is", () => {
    const lulu = check(scoringInput({ website: LULU, websiteAnalysis: null, verifiedElsewhereUrl: null }), "website.social_links");
    expect(lulu.explanation).not.toMatch(/counts as your social profile/);
    const fb = check(scoringInput({ website: "https://www.facebook.com/lulus", websiteAnalysis: null, verifiedElsewhereUrl: null }), "website.social_links");
    expect(fb.explanation).toMatch(/Facebook/);
  });
});

// ---------------------------------------------------------------------------
// "Order online" awareness
// ---------------------------------------------------------------------------
const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
const DD = websitePlatform(LULU)!;

describe("the card: one action per plan", () => {
  test("already in 'Order online': a clear success note", () => {
    const html = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium connected initialStatus={{ status: "ok", platform: DD, alreadyOnGoogle: true, canAdd: true, undo: null }} />);
    expect(html).toContain("Your Google listing&#x27;s website link goes to your DoorDash page, not a website.");
    expect(html).toContain('data-testid="platform-already"');
    expect(html).toContain("DoorDash is already in your “Order online” section — customers see it on Google. No need to use it as your website.");
    expect(html).not.toContain("Add to “Order online” on Google");
  });

  test("only in the website spot, Premium + connected: the value card and 'Add to Order online on Google'", () => {
    const html = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium connected initialStatus={{ status: "ok", platform: DD, alreadyOnGoogle: false, canAdd: true, undo: null }} />);
    expect(html).toContain("Your DoorDash page is in your website spot. Move it to Google&#x27;s “Order online” button, where customers expect it, and put a real website in the website spot.");
    expect(html).toContain("Add to “Order online” on Google");
  });

  test("only in the website spot, Free/Grow: the steps with Google's own help article", () => {
    const html = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium={false} connected initialStatus={{ status: "ok", platform: DD, alreadyOnGoogle: false, canAdd: false, undo: null }} />);
    expect(html).toContain('data-testid="platform-how-to"');
    expect(html).toContain("https://support.google.com/business/answer/6218037");
    expect(html).not.toContain("Add to “Order online” on Google");
  });

  test("not connected: never a guess — connect, or check it yourself (EN + ES)", () => {
    const html = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium={false} connected={false} />);
    expect(html).toContain("We can&#x27;t see your “Order online” links without connecting Google.");
    expect(html).toContain("/business/b1/connect-gbp");
    expect(html).not.toContain("already in your");
    expect(wrap(<PlatformLinkCard businessId="b1" website={LULU} premium connected={false} />)).toContain("Connect Google to do this from PostScore");
    const es = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium={false} connected={false} />, "es");
    expect(es).toContain("No podemos ver sus enlaces de “Pedir en línea” sin conectar Google.");
    expect(es).toContain("?hl=es");
  });

  test("everyone: why a real website helps (no ranking promises) and 'Get a website' with the button prebuilt", () => {
    const html = wrap(<PlatformLinkCard businessId="b1" website={LULU} premium={false} connected={false} />);
    expect(html).toContain("A real website gives customers your menu, hours, story and photos in one place, adds points to your PostScore, and gives Google more to show when people search for you.");
    expect(html).toContain('href="/business/b1/website"');
    expect(html).toContain("Order on DoorDash");
    expect(html).not.toMatch(/rank/i);
  });

  test("Yelp / Linktree: no 'Order online' section — just the website advice; a real website: nothing at all", () => {
    const yelp = wrap(<PlatformLinkCard businessId="b1" website="https://www.yelp.com/biz/x" premium connected={false} />);
    expect(yelp).toContain("Your Google listing&#x27;s website link goes to your Yelp page, not a website.");
    expect(yelp).not.toContain('data-testid="platform-link-google"');
    expect(wrap(<PlatformLinkCard businessId="b1" website="https://www.lulustacos.com" premium connected />)).toBe("");
    expect(platformButtonLabel({ name: "Vagaro", kind: "appointments" }, "en")).toBe("Book on Vagaro");
    expect(platformButtonLabel({ name: "Yelp", kind: "directory" }, "es")).toBe("Véanos en Yelp");
  });
});

describe("Google: read, add, undo (mocked — never calls Google)", () => {
  const target = { businessId: "b1", userId: "u1", locationName: "locations/9", accessToken: "tok", locale: "en" };
  function google(links: Array<Record<string, unknown>>, opts: { create?: number; disabled?: boolean } = {}) {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    let current = [...links];
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (opts.disabled) return json(403, { error: { status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } });
      if (method === "GET") return json(200, { placeActionLinks: current });
      if (method === "POST") {
        if (opts.create) return json(opts.create, { error: { status: "INVALID_ARGUMENT" } });
        const link = { name: "locations/9/placeActionLinks/new1", ...(JSON.parse(String(init!.body)) as object) };
        current.push(link);
        return json(200, link);
      }
      if (method === "DELETE") {
        current = current.filter((l) => !url.endsWith(String(l.name)));
        return json(200, {});
      }
      throw new Error("unexpected");
    }) as typeof fetch;
    return { calls, fetchImpl };
  }
  function store() {
    const rows: Array<GbpChangeRow & Record<string, unknown>> = [];
    const s: GbpChangeStore = {
      approvalsSince: async () => [],
      rowsSince: async () => rows,
      insert: async (r) => (rows.push(...r.map((x) => ({ undo_of: null, undone_at: null, ...x }) as never)), true),
      markUndone: async (id, at) => (rows.forEach((r) => r.batch_id === id && (r.undone_at = at)), true),
    };
    return { rows, s };
  }

  test("already there (any DoorDash link in Order online): no change sent", async () => {
    const g = google([{ name: "locations/9/placeActionLinks/a", uri: "https://www.doordash.com/store/36532653?utm=x", placeActionType: "FOOD_DELIVERY" }]);
    expect(existingLinkFor(DD, [{ uri: "https://doordash.com/store/1", placeActionType: "FOOD_TAKEOUT" }])).not.toBeNull();
    expect(await addPlatformLink(target, DD, store().s, g.fetchImpl)).toEqual({ status: "already" });
    expect(g.calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  test("only in the website spot: ONE create with the link as Food ordering, logged; the website link is never touched", async () => {
    const g = google([]);
    const { rows, s } = store();
    const r = await addPlatformLink(target, DD, s, g.fetchImpl);
    expect(r).toMatchObject({ status: "sent" });
    const post = g.calls.filter((c) => c.method === "POST");
    expect(post).toHaveLength(1);
    expect(post[0].url).toBe("https://mybusinessplaceactions.googleapis.com/v1/locations/9/placeActionLinks");
    expect(post[0].body).toEqual({ uri: LULU, placeActionType: "FOOD_ORDERING" });
    expect(rows[0]).toMatchObject({ kind: "place_action", field: "locations/9/placeActionLinks/new1", after_value: LULU, status: "sent" });
    expect(g.calls.some((c) => c.url.includes("mybusinessbusinessinformation"))).toBe(false);
  });

  test("Undo deletes only the link PostScore added, only if it's still there", async () => {
    const g = google([]);
    const { s } = store();
    const added = await addPlatformLink(target, DD, s, g.fetchImpl);
    if (added.status !== "sent") throw new Error("not sent");
    expect(await removeAddedLink(target, "locations/9/placeActionLinks/new1", added.batchId, s, g.fetchImpl)).toEqual({ status: "sent" });
    expect(g.calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["https://mybusinessplaceactions.googleapis.com/v1/locations/9/placeActionLinks/new1"]);
    // Gone already (removed on Google): nothing deleted.
    expect(await removeAddedLink(target, "locations/9/placeActionLinks/new1", added.batchId, s, g.fetchImpl)).toEqual({ status: "error", error: "changed_since" });
    // Never another location's link.
    expect(await removeAddedLink(target, "locations/8/placeActionLinks/x", added.batchId, s, g.fetchImpl)).toEqual({ status: "error", error: "rejected" });
  });

  test("the API isn't enabled on our Google Cloud project: said plainly, nothing sent", async () => {
    const g = google([], { disabled: true });
    expect(await addPlatformLink(target, DD, store().s, g.fetchImpl)).toEqual({ status: "error", error: "not_enabled_google" });
    expect(g.calls.filter((c) => c.method === "POST")).toEqual([]);
  });
});

describe("starter site: the big button", () => {
  const BASE = {
    locale: "en" as const, businessName: "Lulu's Tacos", category: "Taco restaurant", tagline: "", taglineFontId: "classic", taglineColor: null, taglineSize: "medium" as const, taglinePlacement: "below" as const,
    phone: "555", address: "1 Main St, Newark, DE", ownerHours: null, placeId: "p1", profileId: "restaurant", themeId: "ink", customAccent: null, fontId: "classic",
    show: { address: true, phone: true, hours: false }, heroImage: null, contentImages: [],
  };

  test("the link becomes the first hero button ('Order on DoorDash'); Call now moves to second", () => {
    const html = buildStarterSiteHtml({ ...BASE, actionLink: LULU } as never);
    const btn = html.indexOf("data-action-link");
    expect(btn).toBeGreaterThan(-1);
    expect(html).toMatch(/<a class="btn btn-primary btn-action" data-action-link href="https:\/\/www\.doordash\.com\/store\/36532653" target="_blank" rel="noopener noreferrer">Order on DoorDash<\/a>/);
    expect(html.indexOf("Call now")).toBeGreaterThan(btn);
    expect(buildStarterSiteHtml({ ...BASE, locale: "es", actionLink: "http://www.vagaro.com/x" } as never)).toContain(">Reservar cita en Vagaro<");
    expect(buildStarterSiteHtml({ ...BASE, actionLink: "https://order.lulus.com" } as never)).toContain(">Order or book online<");
  });

  test("no link, or not a web address: no button", () => {
    expect(buildStarterSiteHtml({ ...BASE } as never)).not.toContain("data-action-link");
    expect(buildStarterSiteHtml({ ...BASE, actionLink: "javascript:alert(1)" } as never)).not.toContain("data-action-link");
  });
});
