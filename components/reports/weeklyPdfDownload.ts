// Downloads a weekly report PDF. The server draws it on demand (never
// stored); this keeps it in memory for the rest of the browser session
// only, so a second click doesn't redraw it.

import { downloadPdf } from "@/lib/signStudio/output";

const sessionCache = new Map<string, { bytes: Uint8Array; name: string }>();

/** `cacheable`: finished weeks only — the week in progress can still change. */
export async function downloadWeeklyPdf(businessId: string, weekStart: string, cacheable: boolean): Promise<boolean> {
  const key = `${businessId}:${weekStart}`;
  try {
    let hit = sessionCache.get(key);
    if (!hit) {
      const res = await fetch(`/api/business/${businessId}/weekly-report-pdf?week=${weekStart}`, { cache: "no-store" });
      if (!res.ok) return false;
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `postscore-weekly-${weekStart}.pdf`;
      hit = { bytes: new Uint8Array(await res.arrayBuffer()), name };
      if (cacheable) sessionCache.set(key, hit);
    }
    downloadPdf(hit.bytes, hit.name);
    return true;
  } catch {
    return false;
  }
}
