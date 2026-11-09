import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/business/cyn" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// In-app notifications (Nov 9): urgent issues land in the Account menu
// instead of a red banner. In-app only — no emails or texts. The database
// is in memory; nothing calls Google.

const marked: Array<{ update: Record<string, unknown> | undefined; id: unknown }> = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
    from: () => {
      const q: { update?: Record<string, unknown>; id?: unknown } = {};
      const chain: Record<string, unknown> = {
        update: (u: Record<string, unknown>) => ((q.update = u), chain),
        is: () => chain,
        eq: (_c: string, id: unknown) => ((q.id = id), chain),
        then: (resolve: (v: unknown) => unknown) => (marked.push({ update: q.update, id: q.id }), resolve({ error: null })),
      };
      return chain;
    },
  }),
}));
let adminFor: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFor }));

import { badgeText, groupByBusiness, notificationView, unreadCount, urgentFixHref, urgentNotificationChanges, type NotificationRow } from "@/lib/notifications";
import { savedSyncDue, SAVED_SYNC_INTERVAL_MS, syncNotificationsForPage, syncNotificationsFromSavedRow, syncUrgentNotifications, urgentIssuesFromSavedRow } from "@/lib/notifications.server";
import { markNotificationRead } from "@/app/actions/notifications";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { LocaleProvider, type Locale } from "@/lib/i18n";

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

const n = (extra: Partial<NotificationRow> = {}): NotificationRow => ({
  id: "n1",
  business_id: "cyn",
  business_name: "Colorful Yun Nan",
  type: "urgent",
  key: "listing_link",
  severity: "urgent",
  payload: { parked: true },
  created_at: "2026-11-09T15:00:00Z",
  read_at: null,
  resolved_at: null,
  ...extra,
});
/** Colorful Yun Nan after its scan: the parked website link and the phone mismatch. */
const CYN = [n(), n({ id: "n2", key: "phone_mismatch", payload: {}, created_at: "2026-11-09T15:00:01Z" })];

/** The notifications table, in memory, for the server sync. */
function memAdmin() {
  const rows: Array<Record<string, unknown>> = [];
  let missing = false;
  let next = 1;
  const admin = {
    from: () => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const result = () => {
        if (missing) return { data: null, error: { code: "42P01" } };
        if (op === "insert") {
          // notifications_one_open: one open row per business/type/key.
          if (rows.some((r) => r.business_id === payload.business_id && r.type === payload.type && r.key === payload.key && r.resolved_at === null)) return { data: null, error: { code: "23505" } };
          rows.push({ id: `id${next++}`, read_at: null, resolved_at: null, ...payload });
          return { data: null, error: null };
        }
        const hits = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "update") hits.forEach((r) => Object.assign(r, payload));
        return { data: hits.map((r) => ({ ...r })), error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        insert: (p: Record<string, unknown>) => ((op = "insert"), (payload = p), chain),
        update: (p: Record<string, unknown>) => ((op = "update"), (payload = p), chain),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
        is: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), chain),
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      return chain;
    },
  };
  return { rows, admin: admin as never, setMissing: (m: boolean) => (missing = m) };
}

describe("lifecycle: created by a scan, never duplicated, resolved when fixed", () => {
  test("pure: what a scan changes", () => {
    expect(urgentNotificationChanges([], ["listing_link", "phone_mismatch"])).toEqual({ create: ["listing_link", "phone_mismatch"], resolve: [] });
    expect(urgentNotificationChanges([{ id: "a", key: "listing_link" }], ["listing_link"])).toEqual({ create: [], resolve: [] });
    expect(urgentNotificationChanges([{ id: "a", key: "listing_link" }, { id: "b", key: "phone_mismatch" }], ["listing_link"])).toEqual({ create: [], resolve: ["b"] });
  });

  test("Colorful Yun Nan's scans: 2 created, none duplicated, the fixed one resolved, a new one if it comes back", async () => {
    const { rows, admin } = memAdmin();
    expect(await syncUrgentNotifications(admin, "cyn", ["listing_link", "phone_mismatch"], { listingParked: true }, new Date("2026-11-09T15:00:00Z"))).toEqual({ created: 2, resolved: 0 });
    expect(rows.map((r) => [r.key, r.severity, r.type])).toEqual([["listing_link", "urgent", "urgent"], ["phone_mismatch", "urgent", "urgent"]]);
    expect(rows[0].payload).toEqual({ parked: true });
    // The next scan finds the same two: nothing new.
    expect(await syncUrgentNotifications(admin, "cyn", ["listing_link", "phone_mismatch"], { listingParked: true })).toEqual({ created: 0, resolved: 0 });
    // The phone is fixed (Nov 12): resolved, out of the count.
    expect(await syncUrgentNotifications(admin, "cyn", ["listing_link"], { listingParked: true }, new Date("2026-11-12T15:00:00Z"))).toEqual({ created: 0, resolved: 1 });
    expect(rows.find((r) => r.key === "phone_mismatch")?.resolved_at).toBe("2026-11-12T15:00:00.000Z");
    // It comes back later: a fresh notification, the resolved one stays resolved.
    expect(await syncUrgentNotifications(admin, "cyn", ["listing_link", "phone_mismatch"], { listingParked: true })).toEqual({ created: 1, resolved: 0 });
    expect(rows.filter((r) => r.key === "phone_mismatch")).toHaveLength(2);
  });

  test("a fixed one comes back unread — the good news counts until the owner clicks it", async () => {
    const { rows, admin } = memAdmin();
    await syncUrgentNotifications(admin, "cyn", ["phone_mismatch"], { listingParked: false });
    rows[0].read_at = "2026-11-10T00:00:00Z"; // the owner clicked it
    await syncUrgentNotifications(admin, "cyn", [], { listingParked: false }, new Date("2026-11-12T15:00:00Z"));
    expect(rows[0]).toMatchObject({ resolved_at: "2026-11-12T15:00:00.000Z", read_at: null });
  });

  test("only this business's notifications are touched", async () => {
    const { rows, admin } = memAdmin();
    await syncUrgentNotifications(admin, "a", ["no_hours"], { listingParked: false });
    await syncUrgentNotifications(admin, "b", [], { listingParked: false });
    expect(rows.find((r) => r.business_id === "a")?.resolved_at).toBeNull();
  });

  test("before supabase/notifications.sql: does nothing, never fails the scan", async () => {
    const { admin, setMissing } = memAdmin();
    setMissing(true);
    expect(await syncUrgentNotifications(admin, "cyn", ["listing_link"], { listingParked: true })).toEqual({ created: 0, resolved: 0 });
  });

  test("every saved scan syncs them (full scans, website re-checks, the monthly job)", () => {
    const src = readFileSync("app/actions/scoring.ts", "utf8");
    const save = src.slice(src.indexOf("export async function saveScoreSnapshotWithClient"), src.indexOf("export async function saveScoreSnapshotWithClient") + 3000);
    expect(save).toContain("await syncUrgentNotifications(createAdminClient(), businessId, issues,");
    expect(save).toContain("urgentIssues(input, scored.result.breakdown, { hasListing: !!scored.business.place_id })");
  });

  test("the SQL: owner-only reads, read_at the one column owners may change, one open per issue", () => {
    const sql = readFileSync("supabase/notifications.sql", "utf8");
    expect(sql).toContain("where resolved_at is null");
    expect(sql).toContain("grant update (read_at) on table public.notifications to authenticated;");
    expect(sql).toContain("revoke insert, update, delete on table public.notifications from anon, authenticated;");
    expect(sql).toContain("b.owner_id = auth.uid()");
  });
});

describe("the wording and the fix — the same as the Urgent helper", () => {
  test("each notification says what's wrong and goes straight to the fix", () => {
    expect(notificationView(n())).toEqual({ message: "dashboard.urgent.issue.listing_link_parked", fixLabel: "dashboard.urgent.fix.listing_link", fixHref: "/business/cyn#check-website_link" });
    expect(notificationView(n({ payload: {} }))?.message).toBe("dashboard.urgent.issue.listing_link_broken");
    expect(notificationView(n({ key: "phone_mismatch" }))?.fixHref).toBe("/business/cyn/website#check-info_consistency");
    expect(urgentFixHref("no_hours", "b")).toBe("/business/b#check-hours");
    // A kind this version doesn't know is skipped, never shown wrong.
    expect(notificationView(n({ type: "new_review" }))).toBeNull();
    expect(notificationView(n({ key: "something_else" }))).toBeNull();
  });

  test("the count: every unread one, fixed ones too, until clicked; hidden at 0, 9+ above 9", () => {
    expect(unreadCount(CYN)).toBe(2);
    expect(unreadCount([n({ read_at: "2026-11-09T16:00:00Z" }), n({ resolved_at: "2026-11-12T00:00:00Z" })])).toBe(1);
    expect(unreadCount([n({ read_at: "2026-11-09T16:00:00Z", resolved_at: "2026-11-12T00:00:00Z" })])).toBe(0);
    expect(badgeText(0)).toBeNull();
    expect(badgeText(2)).toBe("2");
    expect(badgeText(10)).toBe("9+");
  });

  test("newest first, open before resolved, grouped by business", () => {
    const groups = groupByBusiness([n({ id: "old", created_at: "2026-11-01T00:00:00Z" }), n({ id: "fixed", created_at: "2026-11-09T20:00:00Z", resolved_at: "2026-11-10T00:00:00Z" }), n({ id: "new" }), n({ id: "other", business_id: "hx", business_name: "Hair express", created_at: "2026-11-08T00:00:00Z" })]);
    expect(groups.map((g) => g.businessName)).toEqual(["Colorful Yun Nan", "Hair express"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["new", "old", "fixed"]);
  });
});

describe("what the owner sees", () => {
  test("the Account button: a red 2 for Colorful Yun Nan; nothing at 0", () => {
    const html = wrap(<AccountMenu business={null} userEmail="owner@example.com" initialNotifications={CYN} />);
    expect(html).toContain('data-testid="unread-badge"');
    expect(html).toMatch(/aria-label="2 unread notifications"[^>]*>2</);
    expect(wrap(<AccountMenu business={null} userEmail={null} initialNotifications={[]} />)).not.toContain("unread-badge");
    expect(wrap(<AccountMenu business={null} userEmail={null} initialNotifications={Array.from({ length: 12 }, (_, i) => n({ id: `x${i}`, key: `k${i}` }))} />)).toContain(">9+<");
  });

  test("the panel: pill, the sentence, the fix button, when it was found, the unread dot and bolder text (EN)", () => {
    const html = wrap(<NotificationsPanel items={CYN} loading={false} anchor={null} onClose={() => {}} onOpen={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-severity="urgent"');
    expect(html).toContain("Your Google listing&#x27;s website link goes to a page that isn&#x27;t yours — customers who tap Website won&#x27;t reach you.");
    expect(html).toContain('href="/business/cyn#check-website_link"');
    expect(html).toContain("Fix the website link");
    expect(html).toContain("Fix the phone number");
    expect(html).toContain("Found Nov 9");
    expect(html).not.toContain("Mark all as read");
    expect(html.match(/data-testid="unread-dot"/g)?.length).toBe(2);
    expect(html.match(/font-semibold text-ink"/g)?.length).toBeGreaterThanOrEqual(2);
    // The phone mismatch (newer) is listed first.
    expect(html.indexOf("phone number on Google")).toBeLessThan(html.indexOf("website link goes to"));
    // One business: no group headings.
    expect(html).not.toContain("<h3");
  });

  test("fixed: “Fixed ✓ Nov 12”, still unread until clicked, opens the related check; read ones are quieter but stay (ES too)", () => {
    const fixedUnread = wrap(<NotificationsPanel items={[n({ resolved_at: "2026-11-12T15:00:00Z" })]} loading={false} anchor={null} onClose={() => {}} onOpen={() => {}} />);
    expect(fixedUnread).toContain("Fixed ✓ Nov 12");
    expect(fixedUnread).toContain('data-testid="unread-dot"');
    expect(fixedUnread).toContain("See the check");
    expect(fixedUnread).toContain('href="/business/cyn#check-website_link"');
    expect(fixedUnread).not.toContain("Fix the website link");
    const fixed = [n({ resolved_at: "2026-11-12T15:00:00Z", read_at: "2026-11-09T16:00:00Z" })];
    const en = wrap(<NotificationsPanel items={fixed} loading={false} anchor={null} onClose={() => {}} onOpen={() => {}} />);
    expect(en).toContain("Fixed ✓ Nov 12");
    expect(en).not.toContain("unread-dot");
    expect(en).toContain("opacity-75");
    const es = wrap(<NotificationsPanel items={CYN} loading={false} anchor={null} onClose={() => {}} onOpen={() => {}} />, "es");
    expect(es).toContain("Notificaciones");
    expect(es).toContain("Urgente");
    expect(es).toContain("Corregir el enlace");
    expect(es).toContain("Detectado el");
  });

  test("several businesses: grouped under their names; nothing yet: a calm empty state", () => {
    const html = wrap(<NotificationsPanel items={[...CYN, n({ id: "h", business_id: "hx", business_name: "Hair express", key: "no_hours", payload: {} })]} loading={false} anchor={null} onClose={() => {}} onOpen={() => {}} />);
    expect(html).toContain(">Colorful Yun Nan</h3>");
    expect(html).toContain(">Hair express</h3>");
    expect(wrap(<NotificationsPanel items={[]} loading={false} anchor={null} onClose={() => {}} onOpen={() => {}} />)).toContain("You&#x27;re all caught up.");
  });

  test("clicking one marks just that one read (read_at only); opening the panel marks nothing", async () => {
    marked.length = 0;
    expect(await markNotificationRead("n1")).toEqual({ status: "ok" });
    expect(marked).toHaveLength(1);
    expect(marked[0].id).toBe("n1");
    expect(Object.keys(marked[0].update!)).toEqual(["read_at"]);
    expect(await markNotificationRead("")).toEqual({ status: "error" });
    const menu = readFileSync("components/layout/AccountMenu.tsx", "utf8");
    const openPanel = menu.slice(menu.indexOf("function openPanel()"), menu.indexOf("const closePanel"));
    expect(openPanel).not.toContain("markNotificationRead");
    expect(menu).not.toContain("markAllRead");
  });

  test("each notification is one link: clicking it goes to the fix and calls onOpen with that one", () => {
    const src = readFileSync("components/layout/NotificationsPanel.tsx", "utf8");
    expect(src).toContain("onClick={() => onOpen?.(row)}");
    expect(src).toContain("href={view.fixHref}");
  });

  test("Notifications sits above Settings and Log out; the red banner is gone from the Overview", () => {
    const menu = readFileSync("components/layout/AccountMenu.tsx", "utf8");
    expect(menu.indexOf('data-testid="notifications-item"')).toBeLessThan(menu.indexOf('"dashboard.nav.settings"'));
    expect(menu.indexOf('"dashboard.nav.settings"')).toBeLessThan(menu.indexOf('"dashboard.nav.logOut"'));
    expect(readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8")).not.toContain("UrgentAlert");
  });
});

describe("sync from saved data — no wait for a new scan", () => {
  /** Colorful Yun Nan's saved row: the listing links to a parked domain,
   * its graded site's phone differs from Google's. */
  const CYN_ROW = {
    id: "cyn", place_id: "ChIJ-cyn", listing_mode: "google", name: "Colorful Yun Nan", rating: 4.1, review_count: 40, phone: "+1 302-318-6743", address: "59 E Main St, Newark, DE 19711, USA",
    opening_hours: ["Monday: 11:00 AM – 9:00 PM"], website: "https://www.colorfulyunnanorder.com/", https_status: "https", categories: ["chinese_restaurant"], category: "Chinese Restaurant", primary_type: "chinese_restaurant",
    photo_count: 30, business_status: "OPERATIONAL", verified_website_url: "https://newarkcolorfulyunnan.com/",
    website_analysis_json: {
      content: { hasTitle: true, hasMetaDescription: true, hasViewportTag: true, headingCount: 3, visibleTextLength: 900, hasPhoneLink: true, hasEmailLink: false, hasCtaText: true, isLikelyClientRenderedShell: false, renderedContentSignals: null },
      mobilePerformance: null, mobilePerformanceFailureReason: null, contentFetchFailureReason: null, httpsUnreachableReason: null, screenshotUrl: null, additionalPages: [], lastScreenshotRefreshAt: null,
      aboutPresence: null, servicesPresence: null, checkedAt: "2026-11-09T06:39:50.243Z",
      websiteTrust: {
        spamSignals: [], safeBrowsingThreat: null, safeBrowsingChecked: true, staleNotices: [], abandonedSignals: { newestDateFound: "2026-10-01", templateLeftovers: [], looksAbandoned: false }, websiteKind: "independent",
        listingLinkBroken: true, listingLinkParked: true, listingLinkErrorPageUrl: "https://www.colorfulyunnanorder.com/", checkedAt: "2026-11-09T06:39:50.243Z",
        infoConflicts: [
          { field: "phone", siteValue: "302-894-1998", comparison: "conflicts", googleValue: "+1 302-318-6743" },
          { field: "address", siteValue: "59 e main st, newark, de 19711", comparison: "matches", googleValue: "59 E Main St, Newark, DE 19711, USA" },
        ],
      },
    },
  } as never;

  test("Colorful Yun Nan's saved data: the parked website link and the phone mismatch", () => {
    expect(urgentIssuesFromSavedRow(CYN_ROW)).toEqual({ issues: ["listing_link", "phone_mismatch"], listingParked: true });
  });

  test("a page load creates the missing ones from saved data — reading the row through the owner's session first", async () => {
    const { rows, admin } = memAdmin();
    adminFor = admin;
    const owner = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: CYN_ROW, error: null }) }) }) }) } as never;
    await syncNotificationsForPage(owner, "cyn", new Date("2026-11-09T15:00:00Z"), new Map());
    expect(rows.map((r) => r.key)).toEqual(["listing_link", "phone_mismatch"]);
  });

  test("not their business (RLS returns nothing): nothing is written", async () => {
    const { rows, admin } = memAdmin();
    adminFor = admin;
    const stranger = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } as never;
    await syncNotificationsForPage(stranger, "cyn", new Date(), new Map());
    expect(rows).toEqual([]);
  });

  test("at most once per business per hour", () => {
    const seen = new Map<string, number>();
    const t0 = Date.parse("2026-11-09T15:00:00Z");
    expect(savedSyncDue(seen, "cyn", t0)).toBe(true);
    expect(savedSyncDue(seen, "cyn", t0 + 59 * 60 * 1000)).toBe(false);
    expect(savedSyncDue(seen, "hx", t0 + 1000)).toBe(true);
    expect(savedSyncDue(seen, "cyn", t0 + SAVED_SYNC_INTERVAL_MS)).toBe(true);
  });

  test("a dry run reports and writes nothing", async () => {
    const { rows, admin } = memAdmin();
    const r = await syncNotificationsFromSavedRow(admin, CYN_ROW, new Date(), true);
    expect(r.plan).toEqual({ create: ["listing_link", "phone_mismatch"], resolve: [] });
    expect(rows).toEqual([]);
  });

  test("every business page runs it; the backfill script uses the same rules, no Google, --dry-run", () => {
    expect(readFileSync("app/business/[id]/layout.tsx", "utf8")).toContain("await syncNotificationsForPage(createClient(), params.id);");
    const script = readFileSync("scripts/backfill-notifications.ts", "utf8");
    expect(script).toContain("syncNotificationsFromSavedRow(admin, row, new Date(), dryRun)");
    expect(script).toContain('process.argv.includes("--dry-run")');
    expect(script).not.toMatch(/googleapis|places|fetchWebsiteHtml/i);
  });
});
