// Day 23 2c-2: fingerprints for every saved scan, and our own change
// records from each pair of saved listing snapshots
// (lib/scanChangesBackfill.server.ts). Blanks nothing. Connected owners'
// reviews are read once each (Business Profile, never saved) for exact
// new-review counts. Dry run by default; `--live` writes.
//   npx --no-install tsx --env-file=.env.local scripts/scan-changes-backfill.ts [--live]
import { allowServerOnly } from "./allowServerOnly";

(async () => {
  const live = process.argv.includes("--live");
  allowServerOnly();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { backfillScanChanges } = await import("../lib/scanChangesBackfill.server");
  const { scanFingerprintKey } = await import("../lib/scanChanges.server");
  const { fingerprintKeyId } = await import("../lib/scanChanges");
  const { fetchGbpReviews } = await import("../lib/gbpReplyCounts.server");
  const { getValidAccessTokenWithClient } = await import("../lib/gbpTokens.server");
  const db = createAdminClient();
  const key = scanFingerprintKey();
  if (!key) throw new Error("GBP_TOKEN_ENCRYPTION_KEY is missing: no fingerprint key.");

  const gbpReviews = async (businessId: string) => {
    const { data: row } = await db.from("gbp_connections").select("status, google_account_id, google_location_id").eq("business_id", businessId).maybeSingle();
    if (row?.status !== "connected" || !row.google_account_id || !row.google_location_id) return null;
    const token = await getValidAccessTokenWithClient(db, businessId);
    if (token.status !== "ok") return null;
    const fetched = await fetchGbpReviews(token.accessToken, row.google_account_id, row.google_location_id, fetch);
    if (!fetched.ok) return null;
    const updated = fetched.reviews.map((r) => r.updateTime).filter((u): u is string => typeof u === "string");
    console.log(`  connected business ${businessId.slice(0, 8)}…: ${fetched.reviews.length} review date(s) read`);
    return { createTimes: fetched.reviews.map((r) => r.createTime).filter((c): c is string => typeof c === "string"), oldestUpdateTime: updated.at(-1) ?? null, capped: fetched.capped };
  };

  const c = await backfillScanChanges(db, { dryRun: !live, key, gbpReviews });
  console.log(`Fingerprint key id: ${fingerprintKeyId(key)}`);
  console.log(
    `${live ? "Wrote" : "Would write"}: fingerprints on ${c.fingerprinted} of ${c.scores} scan(s) in ${c.businesses} business(es); ${c.records} change record(s) from ${c.pairs} scan pair(s) ` +
      `(${Object.entries(c.byField).map(([f, n]) => `${f} ${n}`).join(", ") || "none"}; ${c.exactReviewRecords} with an exact new-review count). ${c.withoutSnapshot} scan(s) have no saved snapshot (their changes stay unknown).` +
      (live ? "" : "  (dry run: nothing changed; add --live to write)")
  );
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
