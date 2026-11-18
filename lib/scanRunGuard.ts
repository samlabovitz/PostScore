// One scan run at a time per business: "Re-scan now" (which also
// refreshes competitors on Premium) and "Refresh competitors" share it, so
// a double click — or a second tab — never starts a second paid run while
// one is starting or running (the real Kee's case: two re-scans 28 s
// apart). A run writes a 0-call marker to places_calls before any work;
// the earliest marker in the window runs, any other request is ignored.
// The marker is removed when the run ends (a crashed run blocks only for
// the window). Pure.

export const SCAN_RUN_KIND = "scan_run";
/** Longer than any real run's start-to-finish. */
export const SCAN_RUN_WINDOW_MS = 5 * 60 * 1000;

export interface ScanRunMarker {
  id: string | number;
  created_at: string;
}

/** The marker whose run goes ahead: the earliest (ties by id), or null. */
export function firstScanRun(markers: ScanRunMarker[]): string | null {
  const sorted = [...markers].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || String(a.id).localeCompare(String(b.id)));
  return sorted.length > 0 ? String(sorted[0].id) : null;
}
