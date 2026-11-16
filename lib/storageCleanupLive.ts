// The storage cleanup (lib/storageCleanup.server.ts) and the clearing of
// competitor scans' Google values (lib/competitorRawCleanup.server.ts) run
// for real only when STORAGE_CLEANUP_LIVE=true; otherwise they count. Pure.
export function storageCleanupLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.STORAGE_CLEANUP_LIVE === "true";
}
