// Competitor quality audit (Day 19): for every business, its saved
// competitors judged by lib/competitorQuality.ts — established (open, 5+
// reviews), few-review listings, department counters — and its rank.
// Stored data first: a business is re-searched only when its saved list
// would change under the new rules (fewer than 3 established, or any
// few-review / department entry, or no usable scan). Re-runs go through
// the app's own runAndSaveCompetitorScanWithClient — the same
// PLACES_SEARCH_MONTHLY_CAP check, call logging and scoring as "Refresh
// competitors". Used by scripts/competitor-audit.ts --quality.

import type { SupabaseClient } from "@supabase/supabase-js";
import { competitorScanBlocker } from "../lib/competitors";
import { ESTABLISHED_MIN_REVIEWS, isDepartmentListing, MIN_ESTABLISHED_COMPETITORS } from "../lib/competitorQuality";
import { MAX_CALLS_PER_SCAN, placesSearchMonthlyCap } from "../lib/placesSearchBudget";

interface ScanRow {
  scan_id: string;
  created_at: string;
  is_subject: boolean;
  name: string | null;
  total: number | null;
  review_count: number | null;
  business_status: string | null;
  categories: string[] | null;
  website_url: string | null;
  distance_meters: number | null;
}

export interface ListQuality {
  at: string;
  competitors: number;
  established: number;
  fewReviews: number;
  departments: number;
  rank: number;
  of: number;
  names: string[];
}

export interface QualityFinding {
  id: string;
  name: string;
  address: string | null;
  before: ListQuality | null;
  after: ListQuality | null;
  action: string;
  bigChange: boolean;
}

const COLUMNS = "scan_id, created_at, is_subject, name, total, review_count, business_status, categories, website_url, distance_meters";

export function listQuality(rows: ScanRow[]): ListQuality | null {
  if (rows.length === 0) return null;
  const others = rows.filter((r) => !r.is_subject);
  const isDept = (r: ScanRow) => isDepartmentListing({ name: r.name, primaryType: r.categories?.[0] ?? null, types: r.categories, details: { name: r.name, website: r.website_url } });
  const ranked = [...rows].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  return {
    at: rows[0].created_at,
    competitors: others.length,
    established: others.filter((r) => !isDept(r) && (r.review_count ?? 0) >= ESTABLISHED_MIN_REVIEWS && (r.business_status ?? "OPERATIONAL") === "OPERATIONAL").length,
    fewReviews: others.filter((r) => (r.review_count ?? 0) < ESTABLISHED_MIN_REVIEWS).length,
    departments: others.filter(isDept).length,
    rank: ranked.findIndex((r) => r.is_subject) + 1,
    of: rows.length,
    names: others.map((r) => `${r.name ?? "(unnamed)"} (${r.distance_meters !== null ? (r.distance_meters / 1609.34).toFixed(1) : "?"} mi, ${r.review_count ?? 0} reviews)`),
  };
}

/** Would the new rules pick a different list? Only then is a search needed. */
export function needsResearch(q: ListQuality | null): boolean {
  if (!q) return true;
  return q.competitors < MIN_ESTABLISHED_COMPETITORS || q.established < MIN_ESTABLISHED_COMPETITORS || q.fewReviews > 0 || q.departments > 0;
}

/** A big rank change: 3+ places, losing or gaining #1, or 30+ points of "ahead of" share. */
export function isBigChange(before: ListQuality | null, after: ListQuality | null): boolean {
  if (!before || !after) return false;
  const ahead = (q: ListQuality) => (q.of > 1 ? (q.of - q.rank) / (q.of - 1) : 1);
  return Math.abs(after.rank - before.rank) >= 3 || (before.rank === 1) !== (after.rank === 1) || Math.abs(ahead(after) - ahead(before)) >= 0.3;
}

/** A script exits when it's done, so each new scan's full scoring (the
 * competitors' websites, within the PageSpeed daily budget) runs to the
 * end here instead of in the background — otherwise the Competitors page
 * would keep showing the previous finished scan. */
async function scoreNow(db: SupabaseClient, scanId: string, businessId: string, competitorCount: number): Promise<void> {
  const [{ queueScoringJob, runCompetitorScoringJob }] = await Promise.all([import("../lib/competitorScoringJob")]);
  await queueScoringJob(db, scanId, businessId, "new_scan", competitorCount);
  for (let pass = 0; pass < 20; pass++) {
    const outcome = await runCompetitorScoringJob(db, scanId);
    if (outcome.status !== "running") return;
  }
}

export async function runQualityAudit(
  db: SupabaseClient,
  opts: {
    rerun: boolean;
    onlyIds?: string[];
    /** Already re-searched (e.g. earlier today): judge "before" by this
     * earlier scan and never search again. */
    beforeScanIds?: Record<string, string>;
    /** One line per business as it goes (long runs). */
    onProgress?: (line: string) => void;
  }
): Promise<QualityFinding[]> {
  const { data: rows, error } = await db.from("businesses").select("id, name, address, primary_type, categories, lat, lng, listing_mode").order("created_at");
  if (error || !rows) throw new Error(error?.message ?? "no businesses");
  const businesses = (rows as Array<{ id: string; name: string | null; address: string | null; primary_type: string | null; categories: string[] | null; lat: number | null; lng: number | null; listing_mode: string | null }>)
    .filter((b) => b.listing_mode !== "website_only")
    .filter((b) => !opts.onlyIds || opts.onlyIds.includes(b.id));

  const latest = async (id: string) => {
    const { data } = await db.from("competitor_scans").select("scan_id").eq("business_id", id).order("created_at", { ascending: false }).limit(1);
    const scanId = (data ?? [])[0]?.scan_id as string | undefined;
    if (!scanId) return null;
    const { data: scan } = await db.from("competitor_scans").select(COLUMNS).eq("scan_id", scanId);
    return listQuality((scan ?? []) as ScanRow[]);
  };

  const { runAndSaveCompetitorScanWithClient } = opts.rerun ? await import("../app/actions/competitors") : { runAndSaveCompetitorScanWithClient: null };
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const { data: used } = await db.from("places_calls").select("calls").eq("kind", "competitor_scan").gte("created_at", monthStart);
  let budget = placesSearchMonthlyCap() - (used ?? []).reduce((s, r: { calls: number }) => s + r.calls, 0);

  const scan = async (scanId: string) => {
    const { data } = await db.from("competitor_scans").select(COLUMNS).eq("scan_id", scanId);
    return listQuality((data ?? []) as ScanRow[]);
  };

  const findings: QualityFinding[] = [];
  for (const b of businesses) {
    const current = await latest(b.id);
    const earlier = opts.beforeScanIds?.[b.id];
    const before = earlier ? await scan(earlier) : current;
    let after: ListQuality | null = current;
    let action: string;
    const blocker = competitorScanBlocker({ lat: b.lat, lng: b.lng, primaryType: b.primary_type, categories: b.categories, fallbackPlaceTypes: [] });
    if (earlier) {
      action = "re-searched earlier today";
    } else if (!needsResearch(current)) {
      action = "kept — every saved competitor is already established (no search)";
    } else if (!opts.rerun || !runAndSaveCompetitorScanWithClient) {
      action = "would re-search";
    } else if (blocker === "no_location") {
      action = "can't search — no saved location";
    } else if (budget < MAX_CALLS_PER_SCAN) {
      action = "not re-run — this month's search cap would be exceeded";
    } else {
      const result = await runAndSaveCompetitorScanWithClient(db as never, b.id, {
        enforceCooldown: false,
        startScoring: (scanId, businessId, count) => scoreNow(db, scanId, businessId, count),
      });
      budget -= "placesCalls" in result && typeof result.placesCalls === "number" ? result.placesCalls : MAX_CALLS_PER_SCAN;
      after = await latest(b.id);
      action =
        result.status === "saved"
          ? `re-searched (${"placesCalls" in result ? result.placesCalls : "?"} calls)`
          : result.status === "no_data"
            ? "re-searched — still none comparable"
            : `re-search didn't complete: ${result.status}`;
    }
    findings.push({ id: b.id, name: b.name ?? "(unnamed)", address: b.address, before, after, action, bigChange: isBigChange(before, after) });
    opts.onProgress?.(`${b.name ?? b.id}: ${action}${before && after ? ` — #${before.rank}/${before.of} → #${after.rank}/${after.of}` : ""}`);
  }
  return findings;
}

const fmt = (q: ListQuality | null) =>
  q ? `#${q.rank} of ${q.of} · ${q.competitors} (${q.established} established, ${q.fewReviews} few-review, ${q.departments} counter)` : "no scan";

export function qualityReport(findings: QualityFinding[], rerun: boolean): string {
  const big = findings.filter((f) => f.bigChange);
  return [
    "# Competitor audit — quality (established competitors)",
    "",
    `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC — ${findings.length} businesses with a Google listing. Established = open with ${ESTABLISHED_MIN_REVIEWS}+ reviews, not a department counter. Stored data first; ${rerun ? "only lists the new rules would change were re-searched" : "no Google calls"}.`,
    "",
    `**Rank changed a lot (${big.length}):** ${big.length ? big.map((f) => `${f.name} ${f.before ? `#${f.before.rank}/${f.before.of}` : "—"} → ${f.after ? `#${f.after.rank}/${f.after.of}` : "—"}`).join("; ") : "none"}`,
    "",
    "| Business | Before | After | What happened | Big change? |",
    "|---|---|---|---|---|",
    ...findings.map((f) => `| ${f.name}<br><small>${f.address ?? ""}</small> | ${fmt(f.before)} | ${fmt(f.after)} | ${f.action} | ${f.bigChange ? "**yes**" : ""} |`),
    "",
  ].join("\n");
}
