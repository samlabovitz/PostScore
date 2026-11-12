import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Google disconnected → the Overview's banner; connected → the note with
// the score before → after; and one score everywhere: the ring (scored
// live from the saved data) always equals the latest saved snapshot that
// "Since last scan", its card and Reports read. No test calls Google.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
function table(name: string) {
  const filters: Row = {};
  let inserted: Row | null = null;
  const rows = () => (db[name] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
  const sorted = () => [...rows()].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const b = {
    select: () => b,
    eq: (k: string, v: unknown) => ((filters[k] = v), b),
    is: () => b,
    in: () => b,
    gte: () => b,
    order: () => b,
    limit: () => b,
    single: async () => (inserted ? { data: inserted, error: null } : rows()[0] ? { data: rows()[0], error: null } : { data: null, error: { code: "PGRST116" } }),
    maybeSingle: async () => ({ data: sorted()[0] ?? null, error: null }),
    insert: (row: Row) => {
      inserted = { id: `row-${(db[name] ?? []).length + 1}`, created_at: new Date(Date.now() + (db[name] ?? []).length).toISOString(), ...row };
      db[name] = [...(db[name] ?? []), inserted];
      return b;
    },
    update: () => b,
    delete: () => b,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: sorted(), error: null }),
  };
  return b;
}
const client = { auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from: table };
vi.mock("@/lib/supabase/server", () => ({ createClient: () => client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client }));

import { syncScoreSnapshotWithClient, scoreBusinessWithClient } from "@/app/actions/scoring";
import { scoreChangeSinceLastScan } from "@/lib/overviewTiles";
import { isFullScanKind } from "@/lib/websiteRecheckPolicy";
import { GoogleConnectedNote, GoogleDisconnectedBanner } from "@/components/gbp/GoogleConnectionNotices";
import { connectedScoreChange } from "@/lib/gbpConnectedNote";
import { LocaleProvider, type Locale } from "@/lib/i18n";

const BIZ = "hair";
const HAIR: Row = {
  id: BIZ,
  place_id: "ChIJ-hair",
  name: "Hair express on Broadway",
  address: "9 S Broadway, Tarrytown, NY",
  phone: "(914) 555-0100",
  website: "https://hairexpressbroadway.com",
  rating: 4.6,
  review_count: 30,
  category: "Hair salon",
  primary_type: "hair_salon",
  photo_count: 12,
  business_status: "OPERATIONAL",
  language: "en",
  opening_hours: ["Monday: 9 AM–6 PM"],
};

async function liveTotal(): Promise<number> {
  const r = await scoreBusinessWithClient(client as never, BIZ, "business");
  if (r.status !== "ok") throw new Error("not scored");
  return r.result.breakdown.total;
}
const snapshot = (total: number, version: string, at: string, scanKind?: string): Row => ({
  id: `s-${at}`,
  business_id: BIZ,
  total,
  grade: "B",
  scoring_version: version,
  created_at: at,
  breakdown_json: scanKind ? { scanKind } : {},
});
const history = () =>
  [...(db.scores ?? [])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r) => ({ total: r.total as number, scoring_version: r.scoring_version as string, scan_kind: ((r.breakdown_json as Row | null)?.scanKind as string | undefined) ?? null }));

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.businesses = [{ ...HAIR }];
});

describe("one score everywhere: the ring and Since last scan always match", () => {
  test("the data changed since the last snapshot (Google, an owner answer): a snapshot is saved with the live total", async () => {
    const live = await liveTotal();
    const version = ((await scoreBusinessWithClient(client as never, BIZ, "business")) as { result: { breakdown: { scoringVersion: string } } }).result.breakdown.scoringVersion;
    db.scores = [snapshot(79, version, "2026-11-10T00:00:00Z"), snapshot(live + 6, version, "2026-11-11T15:41:00Z")];
    expect(await syncScoreSnapshotWithClient(client as never, BIZ, "data_update", Date.parse("2026-11-11T16:00:00Z"))).toEqual({ saved: true, before: live + 6, after: live });
    // The ring (live) = the newest snapshot = what "Since last scan" starts from.
    expect(history()[0].total).toBe(live);
    expect(scoreChangeSinceLastScan(history())).toEqual({ kind: "delta", delta: -6 });
    // Nothing changed since: nothing more is saved.
    expect(await syncScoreSnapshotWithClient(client as never, BIZ, "data_update", Date.parse("2026-11-11T17:00:00Z"))).toMatchObject({ saved: false });
    expect(db.scores).toHaveLength(3);
  });

  test("a new scoring version is saved as a scoring update (no delta), and nothing before the first snapshot", async () => {
    expect(await syncScoreSnapshotWithClient(client as never, BIZ)).toMatchObject({ saved: false });
    expect(db.scores ?? []).toEqual([]);
    db.scores = [snapshot(70, "0.0.1", "2026-11-10T00:00:00Z")];
    await syncScoreSnapshotWithClient(client as never, BIZ, "data_update", Date.now() + 60_000);
    expect(history()[0].scan_kind).toBe("scoring_update");
    expect(scoreChangeSinceLastScan(history())).toEqual({ kind: "scoring_updated" });
  });

  test("connecting Google: its own labeled snapshot with the real +/− (even +0), unlike a scoring update", async () => {
    const live = await liveTotal();
    const version = ((await scoreBusinessWithClient(client as never, BIZ, "business")) as { result: { breakdown: { scoringVersion: string } } }).result.breakdown.scoringVersion;
    db.scores = [snapshot(live + 6, version, "2026-11-11T15:41:00Z")];
    expect(await syncScoreSnapshotWithClient(client as never, BIZ, "google_connected", Date.now() + 120_000)).toEqual({ saved: true, before: live + 6, after: live });
    expect(history()[0]).toMatchObject({ total: live, scan_kind: "google_connected" });
    expect(scoreChangeSinceLastScan(history())).toEqual({ kind: "delta", delta: -6, google: true });
    // Even at +0 it's saved, so the note can say "didn't change".
    await syncScoreSnapshotWithClient(client as never, BIZ, "google_connected", Date.now() + 240_000);
    expect(scoreChangeSinceLastScan(history())).toEqual({ kind: "delta", delta: 0, google: true });
  });

  test("Google connected and catch-up snapshots aren't scans: the re-scan limit and 'last scan' ignore them", () => {
    expect(isFullScanKind("google_connected")).toBe(false);
    expect(isFullScanKind("data_update")).toBe(false);
    expect(isFullScanKind(null)).toBe(true);
  });

  test("the Overview and Reports save the catch-up snapshot before reading the history; the callback before and after connecting", () => {
    const overview = fs.readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(overview.indexOf("await syncScoreSnapshot(params.id);")).toBeGreaterThan(-1);
    expect(overview.indexOf("await syncScoreSnapshot(params.id);")).toBeLessThan(overview.indexOf("getScoreHistory(params.id),"));
    const reports = fs.readFileSync("app/business/[id]/reports/page.tsx", "utf8");
    expect(reports.indexOf("await syncScoreSnapshot(params.id);")).toBeLessThan(reports.indexOf("getReportsData(params.id)"));
    const callback = fs.readFileSync("app/api/gbp/callback/route.ts", "utf8");
    const before = callback.indexOf("await syncScoreSnapshotWithClient(supabase, businessId);");
    const save = callback.indexOf("await saveGbpConnection(");
    const after = callback.indexOf('await syncScoreSnapshotWithClient(supabase, businessId, "google_connected");');
    expect(before).toBeGreaterThan(-1);
    expect(before).toBeLessThan(save);
    expect(after).toBeGreaterThan(callback.indexOf("await runGbpReplyCheck(businessId);"));
  });
});

const html = (node: React.ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

describe("Google disconnected: the Overview's amber banner", () => {
  test("what happened, what stops updating, the date of the Google data the score keeps, and Reconnect (EN)", () => {
    const out = html(<GoogleDisconnectedBanner businessId={BIZ} premium dataFrom="2026-11-04T15:00:00Z" />);
    expect(out).toContain("Google disconnected — reconnect to keep your score and edits up to date.");
    expect(out).toContain("Until you reconnect, these stop updating: Google insights, your reviews inbox and Edit on Google.");
    expect(out).toContain("Your score keeps your Google data from Nov 4, 2026.");
    expect(out).toContain(`href="/api/gbp/connect?businessId=${BIZ}&amp;from=overview"`);
    expect(out).toContain("Reconnect Google");
  });

  test("Spanish, Free/Grow wording, and no date known", () => {
    const es = html(<GoogleDisconnectedBanner businessId={BIZ} premium dataFrom="2026-11-04T15:00:00Z" />, "es");
    expect(es).toContain("Google se desconectó");
    expect(es).toContain("Su puntuación conserva sus datos de Google del");
    expect(es).toContain("Volver a conectar Google");
    const basic = html(<GoogleDisconnectedBanner businessId={BIZ} premium={false} dataFrom={null} />);
    expect(basic).toContain("your “Replying to reviews” check stops updating");
    expect(basic).toContain("Your score keeps your last Google data until you reconnect.");
  });

  test("shown on the Overview while Google needs reconnecting", () => {
    const overview = fs.readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(overview).toContain('gbpStatus.status === "ok" && gbpStatus.needsReconnect && (');
    expect(overview).toContain("<GoogleDisconnectedBanner businessId={params.id} premium={isPremiumPlan(upgrade.plan)} dataFrom={gbpStatus.dataFrom ?? null} />");
  });
});

describe("Google connected: back on the Overview with the score before → after", () => {
  const now = Date.parse("2026-11-11T15:43:00Z");
  test("the note's numbers come from the connect's own snapshot and the one before it", () => {
    const snaps = [
      { total: 78, created_at: "2026-11-11T15:42:30Z", breakdown_json: { scanKind: "google_connected" } },
      { total: 84, created_at: "2026-11-11T15:41:37Z", breakdown_json: {} },
    ];
    expect(connectedScoreChange(snaps, now)).toEqual({ from: 84, to: 78 });
    // Not the connect's snapshot, or an old one: no numbers.
    expect(connectedScoreChange([{ ...snaps[0], breakdown_json: {} }, snaps[1]], now)).toEqual({ from: null, to: null });
    expect(connectedScoreChange(snaps, now + 60 * 60 * 1000)).toEqual({ from: null, to: null });
  });

  test("EN + ES: changed, didn't change, or just connected", () => {
    expect(html(<GoogleConnectedNote from={78} to={84} />)).toContain("Google connected ✓ — your score updated: 78 → 84");
    expect(html(<GoogleConnectedNote from={84} to={84} />)).toContain("Google connected ✓ — your score didn&#x27;t change.");
    expect(html(<GoogleConnectedNote from={null} to={null} />)).toContain("Google connected ✓");
    expect(html(<GoogleConnectedNote from={78} to={84} />, "es")).toContain("Google conectado ✓: su puntuación se actualizó: 78 → 84");
    expect(html(<GoogleConnectedNote from={84} to={84} />, "es")).toContain("Google conectado ✓: su puntuación no cambió.");
  });

  test("the Overview shows it for ?gbp=connected; Since last scan, its card, the history and Reports label it 'Google connected'", () => {
    expect(fs.readFileSync("app/business/[id]/page.tsx", "utf8")).toContain('searchParams.gbp === "connected" && gbpStatus.status === "ok" && gbpStatus.connected && (');
    expect(fs.readFileSync("components/overview/ScoreBand.tsx", "utf8")).toContain('change.kind === "delta" && change.google');
    expect(fs.readFileSync("components/overview/SinceLastScanCard.tsx", "utf8")).toContain('?.scanKind === "google_connected"');
    expect(fs.readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8")).toContain('row.scan_kind === "google_connected"');
    expect(fs.readFileSync("components/reports/ScoreHistoryChart.tsx", "utf8")).toContain('row.scanKind === "google_connected"');
  });
});
