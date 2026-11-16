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
import { fingerprintSnapshot, newReviewsSince, parseFieldFingerprints, scanChangeRecords, type GbpReviewTimes, type ScanChangeRecord } from "@/lib/scanChanges";

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
