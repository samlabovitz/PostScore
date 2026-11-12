// The numbers in the Overview's "Google connected ✓ — your score updated:
// 78 → 84" (components/gbp/GoogleConnectionNotices.tsx). Pure, and in a
// plain module so the server page can call it — a function exported from a
// "use client" file is only a client reference on the server.

/** The latest snapshot when it's the connect's own (saved in the last 30
 * minutes by app/api/gbp/callback/route.ts), and the one before it. */
export function connectedScoreChange(
  snapshots: Array<{ total: number; created_at: string; breakdown_json: { scanKind?: string } | null }>,
  now: number
): { from: number | null; to: number | null } {
  const [latest, previous] = snapshots;
  if (!latest || latest.breakdown_json?.scanKind !== "google_connected" || now - Date.parse(latest.created_at) > 30 * 60 * 1000) return { from: null, to: null };
  return { from: previous ? previous.total : null, to: latest.total };
}
