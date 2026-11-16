// Server-only. Writes a scan's own change records (lib/scanChanges.ts) and
// its keyed fingerprints right after the scan's score is saved
// (saveScoreSnapshotWithClient, app/actions/scoring.ts). The fingerprint
// key is derived (HKDF, its own purpose) from GBP_TOKEN_ENCRYPTION_KEY,
// so no new secret; without it, records still come from the values on hand.
import "server-only";
import { hkdfSync } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readGbpKey } from "@/lib/gbpSecurity";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import { changesAcross, fingerprintSnapshot, newReviewsSince, parseFieldFingerprints, scanChangeRecords, type GbpReviewTimes, type ScanChangeRecord, type ScanChangeSummary } from "@/lib/scanChanges";

type Env = { GBP_TOKEN_ENCRYPTION_KEY?: string; NODE_ENV?: string };

export function scanFingerprintKey(env: Env = process.env): Buffer | null {
  const key = readGbpKey(env);
  return key ? Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), "postscore-scan-fingerprints", 32)) : null;
}

/** Saves this scan's fingerprints and what changed since the business's
 * previous scan. Returns the records written. */
export async function recordScanChanges(
  db: SupabaseClient,
  businessId: string,
  scoreId: string,
  snapshot: ProfileSnapshot,
  options: { env?: Env; at?: string; gbpReviews?: GbpReviewTimes | null } = {}
): Promise<ScanChangeRecord[]> {
  const key = scanFingerprintKey(options.env);
  const fingerprints = key ? fingerprintSnapshot(snapshot, businessId, key) : null;
  if (fingerprints) {
    const { error } = await db.from("scores").update({ field_fingerprints: fingerprints }).eq("id", scoreId);
    if (error) throw new Error(`scores.field_fingerprints: ${error.message}`);
  }

  const { data: prev, error: prevError } = await db
    .from("scores")
    .select("id, created_at, profile_snapshot_json, field_fingerprints")
    .eq("business_id", businessId)
    .neq("id", scoreId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevError) throw new Error(`scores: ${prevError.message}`);
  if (!prev) return [];

  const records = scanChangeRecords(
    { snapshot: (prev.profile_snapshot_json as ProfileSnapshot | null) ?? null, fingerprints: parseFieldFingerprints(prev.field_fingerprints) },
    { snapshot, fingerprints },
    { newReviews: options.gbpReviews ? newReviewsSince(options.gbpReviews, prev.created_at as string) : null }
  );
  if (records.length === 0) return [];
  const at = options.at ?? new Date().toISOString();
  const { error } = await db
    .from("scan_changes")
    .insert(records.map((r) => ({ business_id: businessId, score_id: scoreId, previous_score_id: prev.id, field: r.field, direction: r.direction, delta: r.delta, at })));
  if (error) throw new Error(`scan_changes: ${error.message}`);
  return records;
}

/** The saved records of these scans, by scan. Owners' own client works
 * (RLS: their businesses only). Missing table or a read error: none —
 * readers then say the changes aren't available, never "nothing changed". */
export async function loadScanChangeRecords(db: SupabaseClient, scoreIds: string[]): Promise<Map<string, ScanChangeRecord[]> | null> {
  const out = new Map<string, ScanChangeRecord[]>();
  for (let i = 0; i < scoreIds.length; i += 200) {
    const { data, error } = await db.from("scan_changes").select("score_id, field, direction, delta").in("score_id", scoreIds.slice(i, i + 200));
    if (error) {
      console.warn("[scan-changes] read failed:", error.message);
      return null;
    }
    for (const r of (data ?? []) as Array<{ score_id: string; field: ScanChangeRecord["field"]; direction: ScanChangeRecord["direction"]; delta: number | string | null }>) {
      out.set(r.score_id, [...(out.get(r.score_id) ?? []), { field: r.field, direction: r.direction, delta: r.delta === null ? null : Number(r.delta) }]);
    }
  }
  return out;
}

/** The column to select alongside a scan for ScanRef.fpKey. */
export const FP_KEY_COLUMN = "fp_key:field_fingerprints->>k";

/** What changed between two saved scans of a business (oldest first),
 * across every scan in between — the monthly email's "since your last
 * report". Unknown (never "nothing changed") when it can't be read. */
export async function scanChangesBetweenScores(db: SupabaseClient, businessId: string, fromScoreId: string, toScoreId: string): Promise<ScanChangeSummary> {
  const unknown: ScanChangeSummary = { available: false, records: [] };
  const { data: ends } = await db.from("scores").select("id, created_at").in("id", [fromScoreId, toScoreId]);
  const from = (ends ?? []).find((r) => r.id === fromScoreId);
  const to = (ends ?? []).find((r) => r.id === toScoreId);
  if (!from || !to || Date.parse(from.created_at as string) > Date.parse(to.created_at as string)) return unknown;
  const { data, error } = await db
    .from("scores")
    .select(`id, created_at, ${FP_KEY_COLUMN}`)
    .eq("business_id", businessId)
    .gte("created_at", from.created_at as string)
    .lte("created_at", to.created_at as string)
    .order("created_at", { ascending: true });
  if (error || !data) return unknown;
  const scans = (data as unknown as Array<{ id: string; fp_key: string | null }>).map((r) => ({ id: r.id, fpKey: r.fp_key ?? null }));
  return changesAcross(scans, await loadScanChangeRecords(db, scans.slice(1).map((s) => s.id)));
}
