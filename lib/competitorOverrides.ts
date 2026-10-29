// The owner's own competitor choices (supabase/competitor-overrides.sql):
// "Remove" (with a reason) and "Add a competitor". Respected on every
// future scan (lib/competitors.ts ownerOverrides) and applied to the saved
// list right away. Pure.

import type { SavedCompetitorEntry, SavedCompetitorScan } from "@/lib/savedCompetitorScans";

export type RemoveReason = "closed" | "not_competitor" | "other";
export const REMOVE_REASONS: RemoveReason[] = ["closed", "not_competitor", "other"];

export interface CompetitorOverride {
  placeId: string;
  action: "removed" | "added";
  reason: RemoveReason | null;
  name: string | null;
  createdAt: string;
}

export function isRemoveReason(value: unknown): value is RemoveReason {
  return typeof value === "string" && (REMOVE_REASONS as string[]).includes(value);
}

export function overridesFromRows(rows: Array<Record<string, unknown>>): CompetitorOverride[] {
  return rows
    .filter((r) => typeof r.place_id === "string" && (r.action === "removed" || r.action === "added"))
    .map((r) => ({
      placeId: r.place_id as string,
      action: r.action as "removed" | "added",
      reason: isRemoveReason(r.reason) ? r.reason : null,
      name: typeof r.name === "string" ? r.name : null,
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
    }));
}

/** What a scan needs: the place IDs to skip and to keep. */
export function scanOverrides(overrides: CompetitorOverride[]): { removed: string[]; added: string[] } {
  return {
    removed: overrides.filter((o) => o.action === "removed").map((o) => o.placeId),
    added: overrides.filter((o) => o.action === "added").map((o) => o.placeId),
  };
}

/** The saved list as the owner sees it: removed ones gone, added ones
 * labeled. The owner's own row is never touched. */
export function applyOverrides(scan: SavedCompetitorScan, overrides: CompetitorOverride[]): SavedCompetitorScan {
  if (overrides.length === 0) return scan;
  const removed = new Set(overrides.filter((o) => o.action === "removed").map((o) => o.placeId));
  const added = new Set(overrides.filter((o) => o.action === "added").map((o) => o.placeId));
  return {
    ...scan,
    entries: scan.entries
      .filter((e) => e.isSubject || !removed.has(e.placeId))
      .map((e): SavedCompetitorEntry => (!e.isSubject && added.has(e.placeId) ? { ...e, ownerAdded: true } : e)),
  };
}
