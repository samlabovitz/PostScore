import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// One site, everywhere (Nov 9): PostScore grades, screenshots and shows
// the SAME website — the owner's confirmed site, else a verified one, else
// the Google listing's link — and never opens a parked or broken listing
// link. "Wrong site?" lets the owner correct it. No Google calls, ever;
// ScreenshotOne and every page fetch are mocked.

// ---- mocks for the server pieces -----------------------------------------
const fetched: string[] = [];
let pageHtml: Record<string, string | null> = {};
vi.mock("@/lib/websiteAnalysis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/websiteAnalysis")>("@/lib/websiteAnalysis");
  return {
    ...actual,
    fetchWebsiteHtml: async (url: string) => {
      fetched.push(url);
      const html = pageHtml[url] ?? null;
      return html ? { html, failureReason: null } : { html: null, failureReason: "down", missingPageStatus: url.includes("404") ? 404 : null };
    },
    captureWebsiteScreenshots: vi.fn(async () => ({ screenshotBytes: new Uint8Array([1]), additionalPages: [], screenshotHttpStatus: 200, calls: 3 })),
  };
});
vi.mock("@/lib/websiteScreenshotUpload", () => ({ uploadWebsiteScreenshots: vi.fn(async () => ({ screenshotUrl: "https://storage/shot.png", additionalPages: [] })) }));
let monthCalls = 0;
vi.mock("@/lib/screenshotBudgetServer", () => ({ loadScreenshotCallsThisMonth: async () => monthCalls, loadBrowserRendersThisMonth: async () => 0 }));

/** A tiny RLS-shaped client over one businesses row. */
let row: Record<string, unknown> = {};
let ownerColumns = true;
const updates: Array<Record<string, unknown>> = [];
function client() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
    from: () => {
      let cols = "";
      let pending: Record<string, unknown> | null = null;
      const result = () => {
        if (pending) {
          updates.push(pending);
          Object.assign(row, pending);
          return { data: null, error: null };
        }
        if (!ownerColumns && /owner_website/.test(cols)) return { data: null, error: { code: "42703", message: "column does not exist" } };
        return { data: { ...row }, error: null };
      };
      const chain: Record<string, unknown> = {
        select: (c: string) => ((cols = c), chain),
        update: (u: Record<string, unknown>) => ((pending = u), chain),
        eq: () => chain,
        maybeSingle: async () => result(),
        single: async () => result(),
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      return chain;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: () => client() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client() }));
const rechecks: unknown[] = [];
vi.mock("@/lib/websiteRecheck.server", () => ({ recheckWebsiteWithClient: async (...args: unknown[]) => (rechecks.push(args[2]), { status: "ok" }) }));

import { businessWebsiteUrl, gradedWebsite, shownWebsite, shownWebsiteUrl } from "@/lib/businessWebsite";
import { realWebsite } from "@/lib/printStudio/website";
import { pageMentionsBusiness, siteHost } from "@/lib/ownerWebsite";
import { probeListingLink, withListingLinkState } from "@/lib/websiteAnalysisForSave";
import { captureScreenshotsWithClient } from "@/lib/websiteScreenshotRefresh.server";
import { getWebsiteChoice, saveOwnerWebsite, undoOwnerWebsite } from "@/app/actions/ownerWebsite";
import { ListingChips } from "@/components/overview/ListingChips";
import { ScanningLine } from "@/components/website/ScanningLine";
import { BrokenListingCard } from "@/components/website/BrokenListingCard";
import { afterLines, mentionsText } from "@/components/website/WrongSite";
import { LocaleProvider, t, type Locale } from "@/lib/i18n";
import type { WebsiteAnalysis } from "@/lib/scoring";

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

const PARKED = "https://www.colorfulyunnanorder.com/";
const REAL = "https://newarkcolorfulyunnan.com/";
const parkedAnalysis = { websiteTrust: { listingLinkBroken: true, listingLinkParked: true, listingLinkErrorPageUrl: PARKED } };
const CYN = { website: PARKED, verified_website_url: REAL, website_analysis_json: parkedAnalysis };
const REAL_PAGE = "<html><head><title>Home | Colorful Yun Nan</title></head><body><h1>Welcome To Colorful Yun Nan</h1><p>59 E Main St, Newark, DE 19711</p><a href='tel:3023186743'>(302) 318-6743</a>" + "<p>Best food, good food.</p>".repeat(30) + "</body></html>";
const PARKED_PAGE = "<html><head><title>colorfulyunnanorder.com</title></head><body>This domain is for sale. Parked free, courtesy of NameBright.com</body></html>";

beforeEach(() => {
  fetched.length = 0;
  pageHtml = { [REAL]: REAL_PAGE, [PARKED]: PARKED_PAGE };
  row = { id: "cyn", name: "Colorful Yun Nan", phone: "+1 302-318-6743", address: "59 E Main St, Newark, DE 19711, USA", website: PARKED, verified_website_url: REAL, website_analysis_json: parkedAnalysis, owner_website_url: null, owner_website_confirmed_at: null, owner_website_previous_url: null, owner_website_previous_at: null };
  ownerColumns = true;
  updates.length = 0;
  rechecks.length = 0;
  monthCalls = 0;
});

describe("one source of truth: owner-confirmed > verified > listing", () => {
  test("the order, and where each came from", () => {
    expect(gradedWebsite({ website: PARKED, verified_website_url: REAL, owner_website_url: "https://mine.example.com" })).toEqual({ url: "https://mine.example.com", source: "owner" });
    expect(gradedWebsite({ website: PARKED, verified_website_url: REAL })).toEqual({ url: REAL, source: "verified" });
    expect(gradedWebsite({ website: "https://listing.example.com" })).toEqual({ url: "https://listing.example.com", source: "listing" });
    expect(gradedWebsite({ website: "https://www.facebook.com/x" })).toBeNull();
    expect(businessWebsiteUrl(CYN)).toBe(REAL);
  });

  test("Colorful Yun Nan: View live site, the chip and the print kit all open newarkcolorfulyunnan.com", () => {
    expect(shownWebsite(CYN)).toEqual({ kind: "site", url: REAL, source: "verified", listingDiffers: true });
    expect(shownWebsiteUrl(CYN)).toBe(REAL);
    expect(realWebsite(CYN)).toBe(REAL);
  });

  test("a parked or broken listing link and no other site: never opened, never guessed", () => {
    const dead = { website: PARKED, website_analysis_json: parkedAnalysis };
    expect(shownWebsite(dead)).toEqual({ kind: "broken", listingUrl: PARKED });
    expect(shownWebsiteUrl(dead)).toBeNull();
    expect(realWebsite(dead)).toBeNull();
    // A screenshot of the listing link that came back 404: broken too.
    // Our fetch read a page, but the screenshot of the same listing link got a 404: broken.
    const shot = (status: number, of = "http://www.x.example.com") => ({ website: "https://x.example.com/", website_analysis_json: { websiteTrust: { listingLinkBroken: false }, screenshotSiteUrl: of, screenshotHttpStatus: status } });
    expect(shownWebsite(shot(404)).kind).toBe("broken");
    expect(shownWebsite(shot(200)).kind).toBe("site");
    // A 404 screenshot of ANOTHER site says nothing about the listing link.
    expect(shownWebsite(shot(404, "https://other.example.com")).kind).toBe("site");
  });

  test("the header chip: the real site, the note, the fix — never the parked link (EN + ES)", () => {
    const chips = (b: object, locale: Locale = "en") =>
      wrap(<ListingChips businessId="cyn" now="2026-11-09T15:00:00Z" business={{ phone: "+1 302-318-6743", opening_hours: null, opening_hours_periods: null, google_maps_uri: null, ...CYN, ...b }} />, locale);
    const en = chips({});
    expect(en).toContain(`href="${REAL}"`);
    expect(en).not.toContain(`href="${PARKED}"`);
    expect(en).toContain("Your Google listing links to a different address");
    expect(en).toContain('href="/business/cyn#check-website_link"');
    expect(en).toContain("Wrong site?");
    expect(chips({}, "es")).toContain("Su Perfil de Empresa en Google enlaza a otra dirección");
    const dead = chips({ verified_website_url: null });
    expect(dead).toContain("Website link broken");
    expect(dead).not.toContain(`href="${PARKED}"`);
  });

  test("every display place reads the one helper (source check)", () => {
    const src = (p: string) => readFileSync(p, "utf8");
    expect(src("app/business/[id]/BusinessScoreView.tsx")).toContain("const liveSiteUrl = shownWebsiteUrl(business);");
    expect(src("components/overview/ListingChips.tsx")).toContain("const shown = shownWebsite(business);");
    expect(src("app/business/[id]/website/page.tsx")).toContain("siteUrl={data.gradedSite?.url ?? null}");
    expect(src("lib/printStudio/website.ts")).toContain("shownWebsiteUrl(row)");
    expect(src("app/actions/assistant.ts")).toContain("shownWebsiteUrl: shownWebsiteUrl(scored.business)");
    expect(src("lib/websiteRecheck.server.ts")).toContain("gradedWebsite(row)?.url");
    expect(src("lib/websiteScreenshotRefresh.server.ts")).toContain("businessWebsiteUrl(await withOwnerWebsite(supabase, businessId, row))");
    // The scan grades the chosen site once — never a second full analysis.
    expect(src("app/actions/businesses.ts")).not.toContain("const real = await analyze(verifiedWebsiteUrl)");
  });
});

describe("the Website page", () => {
  test("Scanning: the domain, its source, and Wrong site? (EN + ES)", () => {
    const en = wrap(<ScanningLine businessId="cyn" site={{ url: REAL, source: "verified" }} />);
    expect(en).toContain("Scanning:");
    expect(en).toContain("newarkcolorfulyunnan.com");
    expect(en).toContain("Verified by PostScore");
    expect(en).toContain('src="https://newarkcolorfulyunnan.com/favicon.ico"');
    expect(en).toContain("Wrong site?");
    const es = wrap(<ScanningLine businessId="cyn" site={{ url: "https://mine.example.com", source: "owner" }} />, "es");
    expect(es).toContain("Analizando:");
    expect(es).toContain("Confirmado por usted");
    expect(wrap(<ScanningLine businessId="cyn" site={{ url: PARKED, source: "listing" }} />)).toContain("From your Google listing");
  });

  test("the warning card for a parked listing link, with the fix", () => {
    const html = wrap(<BrokenListingCard businessId="cyn" listingUrl={PARKED} suggested={REAL} />);
    expect(html).toContain("This address doesn&#x27;t go to your website");
    expect(html).toContain(PARKED);
    expect(html).toContain(`In Website, replace the address with: ${REAL}`);
  });

  test("the screenshot section is relabelled", () => {
    expect(readFileSync("app/business/[id]/website/WebsiteVisualAnalysis.tsx", "utf8")).toContain('"dashboard.website.gradedSiteHeading"');
  });
});

describe("the scan: grade the chosen site, and a plain look at the listing link", () => {
  test("the listing link is parked: one plain fetch says so — no PageSpeed, no screenshot", async () => {
    expect(await probeListingLink(PARKED)).toEqual({ broken: true, parked: true });
    expect(await probeListingLink(REAL)).toEqual({ broken: false, parked: false });
    expect(await probeListingLink("https://gone.example.com/404")).toEqual({ broken: true, parked: false });
    // Down / blocked proves nothing.
    expect(await probeListingLink("https://blocked.example.com/")).toEqual({ broken: false, parked: false });
  });

  test("its state is kept on the graded site's analysis", () => {
    const a = { websiteTrust: { listingLinkBroken: false, infoConflicts: [] } } as unknown as WebsiteAnalysis;
    expect(withListingLinkState(a, PARKED, { broken: true, parked: true })?.websiteTrust).toMatchObject({ listingLinkBroken: true, listingLinkParked: true, listingLinkErrorPageUrl: PARKED });
    expect(withListingLinkState(a, PARKED, { broken: false, parked: false })?.websiteTrust).toMatchObject({ listingLinkBroken: false, listingLinkErrorPageUrl: null });
  });
});

describe("screenshots: always of the graded site", () => {
  const fresh = { lastScreenshotRefreshAt: "2026-11-01T00:00:00Z", checkedAt: "2026-11-01T00:00:00Z", screenshotCaptureLog: { at: "2026-11-01T00:00:00Z", calls: 5, source: "auto" } };

  test("Refresh: of the graded site, once per 30 days, and it records which site", async () => {
    row.website_analysis_json = { ...parkedAnalysis, ...fresh };
    expect(await captureScreenshotsWithClient(client() as never, "cyn", "refresh", new Date("2026-11-09T00:00:00Z"))).toMatchObject({ status: "too_soon" });
    row.website_analysis_json = { ...parkedAnalysis, ...fresh, lastScreenshotRefreshAt: "2026-09-01T00:00:00Z" };
    const r = await captureScreenshotsWithClient(client() as never, "cyn", "refresh", new Date("2026-11-09T00:00:00Z"), "grow");
    expect(r.status).toBe("ok");
    const saved = (updates.at(-1)!.website_analysis_json as WebsiteAnalysis);
    expect(saved.screenshotSiteUrl).toBe(REAL);
    // This month's earlier calls stay counted (5 + 3).
    expect(saved.screenshotCaptureLog).toMatchObject({ calls: 8, source: "manual" });
  });

  test("Refresh is capped by the month's ScreenshotOne limit too, with a friendly message (EN + ES)", async () => {
    row.website_analysis_json = { ...parkedAnalysis, ...fresh, lastScreenshotRefreshAt: "2026-09-01T00:00:00Z" };
    monthCalls = 76; // 76 + 5 (a capture's worst case) > 80
    const { captureWebsiteScreenshots } = await import("@/lib/websiteAnalysis");
    const before = vi.mocked(captureWebsiteScreenshots).mock.calls.length;
    expect(await captureScreenshotsWithClient(client() as never, "cyn", "refresh", new Date("2026-11-09T00:00:00Z"), "grow")).toEqual({ status: "capped" });
    expect(vi.mocked(captureWebsiteScreenshots).mock.calls.length).toBe(before);
    expect(updates).toEqual([]);
    monthCalls = 75;
    expect((await captureScreenshotsWithClient(client() as never, "cyn", "refresh", new Date("2026-11-09T00:00:00Z"), "grow")).status).toBe("ok");
    expect(readFileSync("app/business/[id]/website/WebsiteVisualAnalysis.tsx", "utf8")).toContain('result.status === "capped"');
    expect(t("en", "dashboard.website.screenshotsCapped")).toBe("This month's screenshot limit is reached. You can refresh them again next month — nothing was changed.");
    expect(t("es", "dashboard.website.screenshotsCapped")).toBe("Se alcanzó el límite de capturas de este mes. Podrá actualizarlas de nuevo el próximo mes; no se cambió nada.");
  });

  test("after a site change: allowed inside the 30 days — never over the month's cap", async () => {
    row.website_analysis_json = { ...parkedAnalysis, ...fresh };
    row.owner_website_url = "https://mine.example.com";
    expect(await captureScreenshotsWithClient(client() as never, "cyn", "site_change", new Date("2026-11-09T00:00:00Z"), "grow")).toMatchObject({ status: "ok" });
    expect((updates.at(-1)!.website_analysis_json as WebsiteAnalysis).screenshotSiteUrl).toBe("https://mine.example.com");
    row.website_analysis_json = { ...parkedAnalysis, ...fresh };
    monthCalls = 79;
    expect(await captureScreenshotsWithClient(client() as never, "cyn", "site_change", new Date("2026-11-09T00:00:00Z"), "grow")).toEqual({ status: "capped" });
  });
});

describe("each business's own monthly screenshot allowance, by plan", () => {
  const log = (calls: number, at = "2026-11-03T00:00:00Z") => ({ ...parkedAnalysis, lastScreenshotRefreshAt: "2026-09-01T00:00:00Z", checkedAt: "2026-09-01T00:00:00Z", screenshotUrl: "https://storage/old.png", screenshotCaptureLog: { at, calls, source: "auto" } });
  const NOV9 = new Date("2026-11-09T00:00:00Z");

  test("Free: one capture a month — the next Refresh is refused before ScreenshotOne, the old screenshot stays", async () => {
    row.website_analysis_json = log(3);
    const { captureWebsiteScreenshots } = await import("@/lib/websiteAnalysis");
    const before = vi.mocked(captureWebsiteScreenshots).mock.calls.length;
    expect(await captureScreenshotsWithClient(client() as never, "cyn", "refresh", NOV9, "free")).toEqual({ status: "business_limit", nextAvailableAt: "2026-12-01T00:00:00.000Z" });
    expect(vi.mocked(captureWebsiteScreenshots).mock.calls.length).toBe(before);
    expect(updates).toEqual([]);
    expect((row.website_analysis_json as { screenshotUrl: string }).screenshotUrl).toBe("https://storage/old.png");
  });

  test("Grow/Premium/Multi: about two — a second capture fits, a third doesn't", async () => {
    row.website_analysis_json = log(5);
    expect((await captureScreenshotsWithClient(client() as never, "cyn", "refresh", NOV9, "premium")).status).toBe("ok");
    // 5 + 3 calls this month now, logged together.
    expect((row.website_analysis_json as WebsiteAnalysis).screenshotCaptureLog).toMatchObject({ calls: 8 });
    row.website_analysis_json = { ...(row.website_analysis_json as object), lastScreenshotRefreshAt: "2026-09-01T00:00:00Z" };
    expect((await captureScreenshotsWithClient(client() as never, "cyn", "refresh", NOV9, "multi")).status).toBe("business_limit");
  });

  test("“Wrong site?” counts too: the site change's capture is refused, and the owner is told when the next one is", async () => {
    row.website_analysis_json = log(5);
    expect(await captureScreenshotsWithClient(client() as never, "cyn", "site_change", NOV9, "free")).toEqual({ status: "business_limit", nextAvailableAt: "2026-12-01T00:00:00.000Z" });
    expect(afterLines({ recheck: "done", screenshot: "limit", screenshotNextAt: "2026-12-01T12:00:00.000Z" }, "en", "America/New_York")[1]).toMatch(/^You've used this month's screenshot refresh — the next one is available on Dec 1\b/);
    expect(afterLines({ recheck: "done", screenshot: "limit", screenshotNextAt: "2026-12-01T12:00:00.000Z" }, "es", "America/New_York")[1]).toMatch(/^Ya usó la actualización de capturas de este mes; la próxima estará disponible el /);
  });

  test("last month's captures don't count; the account-wide cap still applies on top", async () => {
    row.website_analysis_json = log(5, "2026-10-20T00:00:00Z");
    expect((await captureScreenshotsWithClient(client() as never, "cyn", "refresh", NOV9, "free")).status).toBe("ok");
    row.website_analysis_json = log(0, "2026-10-20T00:00:00Z");
    monthCalls = 79;
    expect(await captureScreenshotsWithClient(client() as never, "cyn", "refresh", NOV9, "premium")).toEqual({ status: "capped" });
  });

  test("the Refresh button shows the friendly message with the date (EN + ES)", () => {
    expect(readFileSync("app/business/[id]/website/WebsiteVisualAnalysis.tsx", "utf8")).toContain('t(locale, "dashboard.website.screenshotBusinessLimit", { date: formatShortDate(result.nextAvailableAt, locale, timeZone) })');
    expect(t("en", "dashboard.website.screenshotBusinessLimit", { date: "Dec 1" })).toBe("You've used this month's screenshot refresh — the next one is available on Dec 1.");
    expect(t("es", "dashboard.website.screenshotBusinessLimit", { date: "1 dic" })).toBe("Ya usó la actualización de capturas de este mes; la próxima estará disponible el 1 dic.");
  });
});

describe("Wrong site?", () => {
  test("the page mentions the business: name, phone, address", () => {
    expect(pageMentionsBusiness(REAL_PAGE, { name: "Colorful Yun Nan", phone: "+1 302-318-6743", address: "59 E Main St, Newark, DE 19711, USA" })).toEqual(["name", "phone", "address"]);
    expect(pageMentionsBusiness("<p>Some other shop. Call 555-0100.</p>", { name: "Colorful Yun Nan", phone: "+1 302-318-6743", address: "59 E Main St" })).toEqual([]);
    expect(mentionsText(["name", "phone"], "en")).toBe("name and phone number");
    expect(mentionsText(["name", "phone", "address"], "es")).toBe("el nombre, el teléfono y la dirección");
    expect(siteHost("https://www.Example.com/x")).toBe("example.com");
  });

  test("the choices: the current site and its source, the listing link (flagged), the verified site", async () => {
    const r = await getWebsiteChoice("cyn");
    expect(r).toMatchObject({ status: "ok", choice: { current: { url: REAL, source: "verified" }, listing: PARKED, listingBroken: true, verified: REAL, undoTo: null, enabled: true } });
  });

  test("save: checked on the server, stored as the owner's choice only, then re-checked and one fresh screenshot", async () => {
    pageHtml["https://mine.example.com/"] = REAL_PAGE;
    const r = await saveOwnerWebsite("cyn", "mine.example.com");
    expect(r).toMatchObject({ status: "saved", url: "https://mine.example.com/", mentions: ["name", "phone", "address"], recheck: "done", screenshot: "taken" });
    const write = updates.find((u) => "owner_website_url" in u)!;
    expect(write).toMatchObject({ owner_website_url: "https://mine.example.com/", owner_website_previous_url: null });
    // Never the verified site or any score input.
    expect(Object.keys(write).sort()).toEqual(["owner_website_confirmed_at", "owner_website_previous_at", "owner_website_previous_url", "owner_website_url"]);
    expect(rechecks).toEqual([{ siteChange: true }]);
  });

  test("a page that doesn't mention the business: asked first ('Use it anyway?'), saved only when the owner says so", async () => {
    pageHtml["https://other.example.com/"] = "<html><body>" + "<p>Totally different business.</p>".repeat(20) + "</body></html>";
    expect(await saveOwnerWebsite("cyn", "https://other.example.com/")).toEqual({ status: "unconfirmed", url: "https://other.example.com/" });
    expect(updates.filter((u) => "owner_website_url" in u)).toEqual([]);
    expect((await saveOwnerWebsite("cyn", "https://other.example.com/", true)).status).toBe("saved");
  });

  test("a parked page, a dead site or a non-website: refused, nothing stored", async () => {
    expect((await saveOwnerWebsite("cyn", PARKED, true)).status).toBe("parked");
    expect((await saveOwnerWebsite("cyn", "https://nothing.example.com/", true)).status).toBe("down");
    expect((await saveOwnerWebsite("cyn", "javascript:alert(1)", true)).status).toBe("invalid");
    expect(updates).toEqual([]);
  });

  test("Undo goes back to the previous site", async () => {
    pageHtml["https://mine.example.com/"] = REAL_PAGE;
    await saveOwnerWebsite("cyn", "https://mine.example.com/");
    expect((await getWebsiteChoice("cyn")).status === "ok" && (await getWebsiteChoice("cyn") as { choice: { undoTo: unknown } }).choice.undoTo).toBe("default");
    expect((await undoOwnerWebsite("cyn")).status).toBe("saved");
    expect(row.owner_website_url).toBeNull();
    expect(gradedWebsite(row as never)).toEqual({ url: REAL, source: "verified" });
  });

  test("before supabase/owner-website.sql: not switched on, nothing changed", async () => {
    ownerColumns = false;
    expect(await saveOwnerWebsite("cyn", REAL)).toEqual({ status: "not_enabled" });
    expect(updates).toEqual([]);
  });

  test("the SQL keeps every website column server-only", () => {
    const sql = readFileSync("supabase/owner-website.sql", "utf8");
    expect(sql).toContain("add column if not exists owner_website_url text");
    expect(sql).toContain("new.verified_website_url is distinct from old.verified_website_url");
    expect(sql).toContain("current_user in ('authenticated', 'anon')");
  });
});
