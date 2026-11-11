import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// "Update website on Google" (Nov 9). Every Google response is mocked —
// no test calls Google, and nothing is ever written to it.

import { applyWebsiteLink, checkWebsiteLink, getWebsiteLinkUndo, undoWebsiteLink } from "@/lib/gbpWebsiteLink.server";
import { latestWebsiteLinkUndo, sameWebsiteLink, websiteLinkInput, WEBSITE_LINK_KIND } from "@/lib/gbpWebsiteLink";
import type { GbpChangeStore, GbpEditTarget } from "@/lib/gbpAttributes.server";
import type { GbpChangeRow } from "@/lib/gbpAttributes";
import { resetGbpQuota } from "@/lib/gbpQuota";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { WebsiteLinkFix } from "@/components/gbp/WebsiteLinkFix";
import { LocaleProvider, type Locale } from "@/lib/i18n";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import { businessRowToScoringInput, scoreBusiness, type BusinessScoringRow } from "@/lib/scoring";

const LOC = "locations/456";
const NOW = Date.parse("2026-11-09T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const PARKED = "https://www.colorfulyunnanorder.com/";
const REAL = "https://newarkcolorfulyunnan.com/";
const target: GbpEditTarget = { businessId: "cyn", userId: "owner", locationName: LOC, accessToken: "ya29.TEST", locale: "en" };
const okCheck = async (raw: unknown) => ({ status: "ok" as const, url: websiteLinkInput(raw)! });

/** Google's location: its websiteUri, and whether it reports pending edits
 * (while pending, a read still shows the old link). */
function google(opts: { uri?: string | null; pending?: boolean; patch?: number } = {}) {
  const calls: Array<{ method: string; url: URL; body: unknown }> = [];
  let uri = opts.uri === undefined ? PARKED : opts.uri;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
    expect(url.hostname).toBe("mybusinessbusinessinformation.googleapis.com");
    expect(url.pathname).toBe(`/v1/${LOC}`);
    if (method === "PATCH") {
      if (opts.patch) return json(opts.patch, { error: { status: "INVALID_ARGUMENT" } });
      expect(url.searchParams.get("updateMask")).toBe("websiteUri");
      if (!opts.pending) uri = (JSON.parse(String(init!.body)) as { websiteUri?: string }).websiteUri ?? null;
      return json(200, {});
    }
    if (url.searchParams.get("readMask") === "websiteUri") return json(200, uri ? { websiteUri: uri } : {});
    if (url.searchParams.get("readMask") === "metadata") return json(200, { metadata: { hasPendingEdits: opts.pending === true } });
    throw new Error(`Unexpected Google call: ${method} ${url}`);
  }) as typeof fetch;
  return { calls, fetchImpl, patches: () => calls.filter((c) => c.method === "PATCH"), setUri: (v: string | null) => (uri = v) };
}

function memStore() {
  const rows: Array<GbpChangeRow & Record<string, unknown>> = [];
  const store: GbpChangeStore = {
    approvalsSince: async () => [],
    rowsSince: async (businessId, since, kind = "attributes") => rows.filter((r) => r.business_id === businessId && r.kind === kind && r.approved_at >= since),
    insert: async (r) => (rows.push(...r.map((x) => ({ undo_of: null, undone_at: null, ...x }) as GbpChangeRow & Record<string, unknown>)), true),
    markUndone: async (id, at) => (rows.forEach((r) => r.batch_id === id && (r.undone_at = at)), true),
  };
  return { rows, store };
}

beforeEach(() => resetGbpQuota());

describe("the address the owner puts on Google", () => {
  test("only a real public http(s) site", () => {
    expect(websiteLinkInput("newarkcolorfulyunnan.com")).toBe(REAL);
    expect(websiteLinkInput("http://shop.example.co/menu")).toBe("http://shop.example.co/menu");
    for (const bad of ["", "not a url", "ftp://x.com", "javascript:alert(1)", "https://localhost/x", "http://127.0.0.1", "https://user:pw@x.com", "https://intranet", "https://printer.local"]) {
      expect(websiteLinkInput(bad)).toBeNull();
    }
  });

  test("same link: case, www., trailing slash and scheme don't matter", () => {
    expect(sameWebsiteLink("http://www.NewarkColorfulYunnan.com", REAL)).toBe(true);
    expect(sameWebsiteLink(PARKED, REAL)).toBe(false);
    expect(sameWebsiteLink(null, null)).toBe(true);
  });

  test("checked before Approve: loads, and isn't a parked page (a plain fetch — never Google)", async () => {
    const page = (html: string | null, status = 200) => (async () => (html === null ? Promise.reject(new Error("down")) : new Response(html, { status, headers: { "content-type": "text/html" } }))) as unknown as typeof fetch;
    const real = "<html><head><title>Home | Colorful Yun Nan</title></head><body><h1>Welcome To Colorful Yun Nan</h1>" + "<p>Best food, good food. Order online.</p>".repeat(30) + "</body></html>";
    expect(await checkWebsiteLink(REAL, page(real))).toEqual({ status: "ok", url: REAL });
    expect(await checkWebsiteLink(PARKED, page('<html><head><title>colorfulyunnanorder.com</title></head><body>This domain is for sale. Parked free, courtesy of NameBright.com</body></html>'))).toEqual({ status: "parked" });
    expect(await checkWebsiteLink(REAL, page(null))).toEqual({ status: "down" });
    expect(await checkWebsiteLink("nope", page(real))).toEqual({ status: "invalid" });
  });
});

describe("apply: one PATCH, websiteUri only, read back, logged with the location", () => {
  test("sent and verified; Google's own 'before' is logged; undo offered for 7 days", async () => {
    const g = google();
    const { rows, store } = memStore();
    expect(await applyWebsiteLink(target, REAL, store, g.fetchImpl, NOW, okCheck)).toEqual({ status: "sent", verified: true, logged: true, before: PARKED });
    expect(g.patches()).toHaveLength(1);
    expect(g.patches()[0].body).toEqual({ websiteUri: REAL });
    expect(rows[0]).toMatchObject({ kind: WEBSITE_LINK_KIND, field: "websiteUri", before_value: PARKED, after_value: REAL, location_name: LOC, status: "sent", approved_by: "owner" });
    expect(await getWebsiteLinkUndo(store, "cyn", LOC, NOW + DAY)).toMatchObject({ before: PARKED, after: REAL, status: "sent", undoUntil: new Date(NOW + 7 * DAY).toISOString() });
    expect(await getWebsiteLinkUndo(store, "cyn", LOC, NOW + 7 * DAY + 1)).toBeNull();
  });

  test("Google is reviewing: 'pending_review', said so, still undoable", async () => {
    const g = google({ pending: true });
    const { rows, store } = memStore();
    expect(await applyWebsiteLink(target, REAL, store, g.fetchImpl, NOW, okCheck)).toMatchObject({ status: "pending_review" });
    expect(rows[0].status).toBe("pending_review");
  });

  test("never sends an address that doesn't load or is parked (checked again on the server)", async () => {
    const g = google();
    const { rows, store } = memStore();
    expect(await applyWebsiteLink(target, PARKED, store, g.fetchImpl, NOW, async () => ({ status: "parked" }))).toEqual({ status: "error", error: "parked" });
    expect(await applyWebsiteLink(target, "x", store, g.fetchImpl, NOW, async () => ({ status: "invalid" }))).toEqual({ status: "error", error: "invalid" });
    expect(g.calls).toEqual([]);
    expect(rows).toEqual([]);
  });

  test("already on Google: nothing sent", async () => {
    const g = google({ uri: "http://www.newarkcolorfulyunnan.com" });
    expect(await applyWebsiteLink(target, REAL, memStore().store, g.fetchImpl, NOW, okCheck)).toEqual({ status: "no_change" });
    expect(g.patches()).toEqual([]);
  });

  test("Google rejects: logged as failed, no undo", async () => {
    const g = google({ patch: 400 });
    const { rows, store } = memStore();
    expect(await applyWebsiteLink(target, REAL, store, g.fetchImpl, NOW, okCheck)).toEqual({ status: "error", error: "rejected" });
    expect(rows[0].status).toBe("failed");
    expect(await getWebsiteLinkUndo(store, "cyn", LOC, NOW)).toBeNull();
  });

  test("before the log table exists: nothing is sent", async () => {
    const g = google();
    const store: GbpChangeStore = { ...memStore().store, approvalsSince: async () => null };
    expect(await applyWebsiteLink(target, REAL, store, g.fetchImpl, NOW, okCheck)).toEqual({ status: "error", error: "not_enabled" });
    expect(g.calls).toEqual([]);
  });
});

describe("undo: the old link back, only where it was changed", () => {
  test("restores the old link, read back, then no more undo", async () => {
    const g = google();
    const { rows, store } = memStore();
    await applyWebsiteLink(target, REAL, store, g.fetchImpl, NOW, okCheck);
    const undo = (await getWebsiteLinkUndo(store, "cyn", LOC, NOW + DAY))!;
    expect(await undoWebsiteLink(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "sent" });
    expect(g.patches()[1].body).toEqual({ websiteUri: PARKED });
    expect(rows.find((r) => r.undo_of === undo.batchId)).toMatchObject({ before_value: REAL, after_value: PARKED, status: "sent", location_name: LOC });
    expect(await getWebsiteLinkUndo(store, "cyn", LOC, NOW + DAY)).toBeNull();
  });

  test("changed on Google since: refuses, sends nothing", async () => {
    const g = google();
    const { store } = memStore();
    await applyWebsiteLink(target, REAL, store, g.fetchImpl, NOW, okCheck);
    g.setUri("https://someone-else.example.com/");
    const undo = (await getWebsiteLinkUndo(store, "cyn", LOC, NOW + DAY))!;
    expect(await undoWebsiteLink(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "error", error: "changed_since" });
    expect(g.patches()).toHaveLength(1);
  });

  test("approved while Google was reviewing: the restore is always sent, and 'Google is reviewing' if it still is", async () => {
    const g = google({ pending: true });
    const { store } = memStore();
    await applyWebsiteLink(target, REAL, store, g.fetchImpl, NOW, okCheck);
    const undo = (await getWebsiteLinkUndo(store, "cyn", LOC, NOW + DAY))!;
    // Google still reads the old link — but our edit may apply later.
    expect(await undoWebsiteLink(target, undo.batchId, store, g.fetchImpl, NOW + DAY)).toEqual({ status: "sent", pending: true });
    expect(g.patches()).toHaveLength(2);
  });

  test("never on another location", async () => {
    const g = google();
    const { store } = memStore();
    await applyWebsiteLink(target, REAL, store, g.fetchImpl, NOW, okCheck);
    const batchId = (await getWebsiteLinkUndo(store, "cyn", LOC, NOW))!.batchId;
    const other = google();
    expect(await undoWebsiteLink({ ...target, locationName: "locations/789" }, batchId, store, other.fetchImpl, NOW)).toEqual({ status: "error", error: "undo_expired" });
    expect(other.calls).toEqual([]);
  });

  test("pure: keeps the URLs (not yes/no values)", () => {
    const row = (extra: Partial<GbpChangeRow> = {}): GbpChangeRow => ({ batch_id: "a", field: "websiteUri", before_value: null, after_value: REAL, approved_at: new Date(NOW).toISOString(), status: "sent", undo_of: null, undone_at: null, location_name: LOC, ...extra });
    expect(latestWebsiteLinkUndo([row()], NOW, LOC)).toMatchObject({ before: null, after: REAL });
    expect(latestWebsiteLinkUndo([row({ undo_closed_at: new Date(NOW).toISOString() })], NOW, LOC)).toBeNull();
  });
});

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
const provider = (premium: boolean, connected: boolean, node: ReactNode) => <GbpEditProvider value={{ premium, connected, undo: null }}>{node}</GbpEditProvider>;

describe("what each plan sees", () => {
  test("Premium + connected: 'Update website on Google' (nothing sent until Approve)", () => {
    const html = wrap(provider(true, true, <WebsiteLinkFix businessId="cyn" suggested={REAL} />));
    expect(html).toContain('data-testid="website-link-fix"');
    expect(html).toContain("Update website on Google");
  });

  test("Premium, not connected: the steps with the real site to paste, and Connect Google", () => {
    const html = wrap(provider(true, false, <WebsiteLinkFix businessId="cyn" suggested={REAL} />));
    expect(html).toContain("Fix it on Google yourself (about 2 minutes)");
    expect(html).toContain(`In Website, replace the address with: ${REAL}`);
    expect(html).toContain("Connect Google to fix this in one click");
    expect(html).toContain("support.google.com/business/answer/3039617");
  });

  test("Free/Grow: the steps and the Premium preview (EN + ES)", () => {
    expect(wrap(provider(false, false, <WebsiteLinkFix businessId="cyn" suggested={null} />))).toContain("Premium fixes this in one click");
    const es = wrap(provider(false, false, <WebsiteLinkFix businessId="cyn" suggested={null} />), "es");
    expect(es).toContain("Corríjalo usted mismo en Google (unos 2 minutos)");
    expect(es).toContain("Premium lo corrige con un clic");
  });

  test("an undo strip on later visits (from the page's provider)", () => {
    const undo = { batchId: "a", approvedAt: "2026-11-09T15:00:00Z", undoUntil: "2026-11-16T15:00:00Z", status: "sent" as const, before: PARKED, after: REAL };
    const html = wrap(<GbpEditProvider value={{ premium: true, connected: true, undo: null, websiteUndo: undo }}><WebsiteLinkFix businessId="cyn" suggested={REAL} /></GbpEditProvider>);
    expect(html).toContain('data-testid="website-link-undo"');
    expect(html).toContain("You changed your Google website link on");
  });
});

describe("the Website link check: change the link any time on Premium + Google connected", () => {
  // A working listing link (the check scores full points), like Hair Express.
  const working = { rating: 5, review_count: 30, phone: "1", address: "9 S Broadway", opening_hours: ["Mon: 9–5"], website: "https://hair.example", https_status: "https", categories: ["hair_salon"], category: "Hair Salon", photo_count: 20, business_status: "OPERATIONAL", primary_type: "hair_salon", name: "Hair express on Broadway" } as unknown as BusinessScoringRow;
  function linkRow(row: BusinessScoringRow, state: { premium: boolean; connected: boolean }, locale: Locale = "en") {
    const category = scoreBusiness(businessRowToScoringInput(row)).categories.find((c) => c.id === "completeness")!;
    const only = { ...category, checks: category.checks.filter((c) => c.id === "completeness.website_link") };
    return wrap(<GbpEditProvider value={{ ...state, undo: null }}><CategoryCard category={only} embedded fixLinks={{}} businessId="hair" /></GbpEditProvider>, locale);
  }

  test("a working link (Done): no 'Update website on Google' here — it's on the Google Profile tab instead", () => {
    const html = linkRow(working, { premium: true, connected: true });
    expect(html).not.toContain("Update website on Google");
    expect(html).not.toContain('data-testid="website-link-fix"');
    expect(linkRow(working, { premium: true, connected: true }, "es")).not.toContain("Actualizar el sitio web en Google");
  });

  test("a working link: nothing on other plans, or when Google isn't connected", () => {
    expect(linkRow(working, { premium: true, connected: false })).not.toContain("website-link-fix");
    expect(linkRow(working, { premium: false, connected: false })).not.toContain("website-link-fix");
  });

  test("a missing link: the steps on every plan, the one-click fix on Premium + connected", () => {
    const missing = { ...working, website: null } as unknown as BusinessScoringRow;
    expect(linkRow(missing, { premium: false, connected: false })).toContain("Fix it on Google yourself (about 2 minutes)");
    expect(linkRow(missing, { premium: true, connected: true })).toContain("Update website on Google");
  });

  test("opening it on a working link starts from today's link, to edit (same checks, preview, approve, read-back and undo)", () => {
    expect(readFileSync("components/gbp/WebsiteLinkFix.tsx", "utf8")).toContain("url: r.suggested ?? suggested ?? r.current ?? \"\"");
  });
});
