// Server-only. Claims this business's scan run (lib/scanRunGuard.ts).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { firstScanRun, SCAN_RUN_KIND, SCAN_RUN_WINDOW_MS, type ScanRunMarker } from "@/lib/scanRunGuard";

export interface ScanRunClaim {
  /** false: another run is starting or running — ignore this request. */
  claimed: boolean;
  release: () => Promise<void>;
}

const NOTHING = async () => undefined;

/** A marker that can't be written or read never blocks an owner (the plan's own limits still apply). */
export async function claimScanRun(businessId: string, opts: { db?: SupabaseClient; now?: Date } = {}): Promise<ScanRunClaim> {
  try {
    const db = opts.db ?? createAdminClient();
    const now = opts.now ?? new Date();
    const { data: mark, error } = await db.from("places_calls").insert({ business_id: businessId, kind: SCAN_RUN_KIND, calls: 0 }).select("id").single();
    if (error || !mark) return { claimed: true, release: NOTHING };
    const id = String((mark as { id: string | number }).id);
    const release = async () => {
      await db.from("places_calls").delete().eq("id", id);
    };
    const { data: markers, error: readError } = await db
      .from("places_calls")
      .select("id, created_at")
      .eq("business_id", businessId)
      .eq("kind", SCAN_RUN_KIND)
      .gte("created_at", new Date(now.getTime() - SCAN_RUN_WINDOW_MS).toISOString());
    if (readError || !markers) return { claimed: true, release };
    if (firstScanRun(markers as ScanRunMarker[]) !== id) {
      await release().catch(() => undefined);
      return { claimed: false, release: NOTHING };
    }
    return { claimed: true, release };
  } catch {
    return { claimed: true, release: NOTHING };
  }
}
