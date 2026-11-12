import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

// The Overview after reconnecting Google (/business/{id}?gbp=connected)
// crashed: "connectedScoreChange is not a function" — the page called a
// helper exported from a "use client" file, which on the server is only a
// client reference. Here the notices file is loaded the way the server
// sees it (components only), and the whole page renders. Every data load
// is stubbed; nothing calls Google or the database.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// As the server sees a "use client" file: its components, nothing else callable.
vi.mock("@/components/gbp/GoogleConnectionNotices", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.entries(real).filter(([name]) => /^[A-Z]/.test(name)));
});

const BIZ = "e011e16d-9747-4608-ad1a-bd9475f004f6";
const ROW = { id: BIZ, name: "Hair express on Broadway", address: "9 S Broadway, Tarrytown, NY", place_id: "ChIJ-hair", category: "Hair salon", primary_type: "hair_salon", language: "en", rating: 4.6, review_count: 30, website: null, business_status: "OPERATIONAL" };
const now = Date.now();
const snapshots = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
const gbp = vi.hoisted(() => ({ status: { status: "ok", connected: true, needsReconnect: false } as Record<string, unknown> }));

vi.mock("@/components/layout/DashboardShell", () => ({ DashboardShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./BusinessScoreView", () => ({ BusinessScoreView: () => <section data-testid="score-view" /> }));
vi.mock("./WebsiteOnlyOverview", () => ({ WebsiteOnlyOverview: () => null }));
vi.mock("@/components/niche/NicheBanner", () => ({ NicheBanner: () => null }));
vi.mock("@/components/scoring/websiteOnlyGuard", () => ({ getListingModeForPage: async () => "listing" }));
vi.mock("@/lib/upgradePromos.server", () => ({ loadUpgradeContext: async () => ({ plan: "premium", cards: [] }) }));
vi.mock("@/lib/premium", async (o) => ({ ...(await o<object>()), getPlan: async () => "premium" }));
vi.mock("@/lib/placesSearchBudget.server", () => ({ lastOwnerRescanAt: async () => null }));
vi.mock("@/app/actions/scoring", async () => {
  const { businessRowToScoringInput, getScoreWithSuggestions } = await import("@/lib/scoring");
  return {
    scoreBusinessById: async () => ({ status: "ok", business: ROW, result: getScoreWithSuggestions(businessRowToScoringInput(ROW as never), "en") }),
    getScoreHistory: async () => [],
    getRecentScoreSnapshots: async () => snapshots.rows,
    syncScoreSnapshot: async () => {},
  };
});
vi.mock("@/app/actions/businesses", () => ({ getBusinessSummary: async () => ({ status: "ok", business: ROW }) }));
vi.mock("@/app/actions/competitors", () => ({ getLocalBenchmark: async () => ({ status: "none" }) }));
vi.mock("@/app/actions/gbp", () => ({ getGbpConnectionStatus: async () => gbp.status }));
vi.mock("@/app/actions/gbpCustomerDetails", () => ({ getCustomerDetailsUndo: async () => null }));
vi.mock("@/app/actions/gbpWebsiteLink", () => ({ googleWritesPageState: async () => ({ practice: false, canEdit: false }), getWebsiteLinkUndoForPage: async () => null }));
vi.mock("@/app/actions/uiPreferences", () => ({ getUiPreference: async () => null }));
vi.mock("@/lib/businessArchive.server", () => ({ isBusinessArchived: async () => false }));
vi.mock("@/app/actions/oneTimeNotes", () => ({ oneTimeNoteDismissed: async () => true }));
vi.mock("@/lib/freeAiUsage.server", () => ({ freeAiAllowance: async () => null }));
vi.mock("@/app/actions/actionPlan", () => ({ getActionPlan: async () => ({ status: "error", message: "stub" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/businessNiche.server", () => ({ loadBusinessNiche: async () => null }));
vi.mock("@/app/actions/reviewReplies", () => ({ getReplyDraftStatus: async () => null }));
vi.mock("@/lib/serviceOptions.server", () => ({ readServiceOptions: async () => null }));

import BusinessPage from "./page";

async function render(search: Record<string, string>) {
  return renderToStaticMarkup(await BusinessPage({ params: { id: BIZ }, searchParams: search }));
}
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

describe("the Overview after connecting Google (?gbp=connected)", () => {
  test("renders, with “Google connected ✓ — your score updated: 84 → 78”", async () => {
    snapshots.rows = [
      { total: 78, grade: "C", created_at: at(1), breakdown_json: { scanKind: "google_connected" } },
      { total: 84, grade: "B", created_at: at(2), breakdown_json: {} },
    ];
    const out = await render({ gbp: "connected" });
    expect(out).toContain('data-testid="score-view"');
    expect(out).toContain('data-testid="google-connected-note"');
    expect(out).toContain("Google connected ✓ — your score updated: 84 → 78");
  });

  test("score unchanged, or no connect snapshot: the note still renders, honestly worded", async () => {
    snapshots.rows = [
      { total: 84, grade: "B", created_at: at(1), breakdown_json: { scanKind: "google_connected" } },
      { total: 84, grade: "B", created_at: at(2), breakdown_json: {} },
    ];
    expect(await render({ gbp: "connected" })).toContain("your score didn&#x27;t change.");
    snapshots.rows = [];
    const plain = await render({ gbp: "connected" });
    expect(plain).toContain("Google connected ✓");
    expect(plain).not.toContain("your score");
  });

  test("no note without ?gbp=connected; the amber banner while Google needs reconnecting", async () => {
    expect(await render({})).not.toContain("google-connected-note");
    gbp.status = { status: "ok", connected: false, needsReconnect: true, dataFrom: "2026-11-04T15:00:00Z" };
    const out = await render({ gbp: "connected" });
    expect(out).toContain('data-testid="google-disconnected-banner"');
    expect(out).toContain("Your score keeps your Google data from Nov 4, 2026.");
    expect(out).not.toContain("google-connected-note");
    gbp.status = { status: "ok", connected: true, needsReconnect: false };
  });
});
