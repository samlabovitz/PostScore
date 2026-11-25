// Server-only. Website screenshots in the PRIVATE "website-screenshots"
// bucket (supabase/storage-cleanup.sql): stored as paths ("<id>.png",
// "<id>/<slug>.png"), shown to the business owner through short-lived
// signed URLs (the Website page), and cleaned up — files a new capture
// replaced, files of businesses that no longer exist, and captures not
// refreshed in 90 days (lib/storageCleanup.server.ts, scripts/screenshot-orphans.ts).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebsiteAnalysis } from "@/lib/scoring";

export const WEBSITE_SCREENSHOTS_BUCKET = "website-screenshots";
export const SIGNED_URL_SECONDS = 60 * 60;
export const SCREENSHOT_MAX_AGE_DAYS = 90;

/** A stored screenshot reference — a path, or an old public URL — as the
 * bucket path; null when it isn't one of ours. */
export function screenshotPathOf(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (!/^https?:\/\//.test(ref)) return ref.replace(/^\/+/, "");
  const m = ref.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/website-screenshots\/([^?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** The business a bucket path belongs to ("<id>.png" or "<id>/<slug>.png"). */
export const businessOfPath = (path: string) => path.split("/")[0].replace(/\.png$/, "");

/** Every screenshot path a business's current analysis uses. */
export function referencedPaths(analysis: Pick<WebsiteAnalysis, "screenshotUrl" | "additionalPages" | "mobileScreenshotUrl"> | null | undefined): string[] {
  if (!analysis) return [];
  return [analysis.screenshotUrl, analysis.mobileScreenshotUrl, ...(analysis.additionalPages ?? []).map((p) => p.screenshotUrl)].map(screenshotPathOf).filter((p): p is string => !!p);
}

/** The analysis with signed URLs (1 hour) in place of the stored paths, for
 * the owner's own page. A path that can't be signed shows as "no screenshot". */
export async function withSignedScreenshots<T extends Pick<WebsiteAnalysis, "screenshotUrl" | "additionalPages"> | null>(admin: SupabaseClient, analysis: T): Promise<T> {
  if (!analysis) return analysis;
  const paths = referencedPaths(analysis);
  if (paths.length === 0) return analysis;
  const signed = new Map<string, string>();
  try {
    const { data } = await admin.storage.from(WEBSITE_SCREENSHOTS_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  } catch {
    // Shown as "no screenshot" below.
  }
  const sign = (ref: string | null | undefined) => {
    const path = screenshotPathOf(ref);
    return path ? (signed.get(path) ?? null) : null;
  };
  return {
    ...analysis,
    screenshotUrl: sign(analysis.screenshotUrl),
    ...("mobileScreenshotUrl" in analysis ? { mobileScreenshotUrl: sign((analysis as { mobileScreenshotUrl?: string | null }).mobileScreenshotUrl) } : {}),
    additionalPages: (analysis.additionalPages ?? []).map((p) => ({ ...p, screenshotUrl: sign(p.screenshotUrl) })),
  };
}

export interface StoredScreenshot {
  path: string;
  updatedAt: string | null;
  bytes: number;
}

/** Every file in the bucket (homepages at the root, pages in "<id>/" folders). */
export async function listScreenshots(admin: SupabaseClient): Promise<StoredScreenshot[]> {
  const out: StoredScreenshot[] = [];
  const walk = async (prefix: string): Promise<void> => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.storage.from(WEBSITE_SCREENSHOTS_BUCKET).list(prefix, { limit: 100, offset });
      if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
      for (const f of data ?? []) {
        const path = prefix ? `${prefix}/${f.name}` : f.name;
        if (!f.id) await walk(path);
        else out.push({ path, updatedAt: f.updated_at ?? f.created_at ?? null, bytes: Number((f.metadata as { size?: number } | null)?.size ?? 0) });
      }
      if ((data ?? []).length < 100) break;
    }
  };
  await walk("");
  return out;
}

/** After a new capture: this business's files the new capture no longer uses. */
export function replacedPaths(existing: string[], businessId: string, keep: string[]): string[] {
  const kept = new Set(keep);
  return existing.filter((p) => businessOfPath(p) === businessId && !kept.has(p));
}

/** The homepage ("<id>.png") is overwritten in place; the page files in
 * "<id>/" that the new capture doesn't use are removed. */
export async function removeReplacedScreenshots(admin: SupabaseClient, businessId: string, keep: string[]): Promise<number> {
  try {
    const { data } = await admin.storage.from(WEBSITE_SCREENSHOTS_BUCKET).list(businessId, { limit: 100 });
    const existing = (data ?? []).filter((f) => f.id).map((f) => `${businessId}/${f.name}`);
    const remove = replacedPaths(existing, businessId, keep);
    if (remove.length === 0) return 0;
    await admin.storage.from(WEBSITE_SCREENSHOTS_BUCKET).remove(remove);
    return remove.length;
  } catch {
    return 0;
  }
}

export type SweepReason = "business_gone" | "not_referenced" | "older_than_90_days";

/** What the sweep deletes: files whose business is gone, files the
 * business's current analysis doesn't use, and captures not refreshed in 90 days. */
export function sweepPlan(files: StoredScreenshot[], businesses: Map<string, string[]>, now: number): Array<StoredScreenshot & { reason: SweepReason }> {
  const cutoff = now - SCREENSHOT_MAX_AGE_DAYS * 86_400_000;
  const out: Array<StoredScreenshot & { reason: SweepReason }> = [];
  for (const f of files) {
    const refs = businesses.get(businessOfPath(f.path));
    if (!refs) out.push({ ...f, reason: "business_gone" });
    else if (!refs.includes(f.path)) out.push({ ...f, reason: "not_referenced" });
    else if (f.updatedAt && Date.parse(f.updatedAt) < cutoff) out.push({ ...f, reason: "older_than_90_days" });
  }
  return out;
}

/** The analysis without these paths (a deleted capture shows as "no screenshot" with Refresh). */
export function withoutPaths<T extends Pick<WebsiteAnalysis, "screenshotUrl" | "additionalPages">>(analysis: T, removed: Set<string>): T {
  const keep = (ref: string | null | undefined) => {
    const p = screenshotPathOf(ref);
    return p && removed.has(p) ? null : (ref ?? null);
  };
  return { ...analysis, screenshotUrl: keep(analysis.screenshotUrl), additionalPages: (analysis.additionalPages ?? []).map((p) => ({ ...p, screenshotUrl: keep(p.screenshotUrl) })) };
}

/** One sweep (nightly, and scripts/screenshot-orphans.ts). Dry run: lists, changes nothing. */
export async function sweepScreenshots(admin: SupabaseClient, options: { now?: number; dryRun: boolean }): Promise<{ plan: Array<StoredScreenshot & { reason: SweepReason }>; deleted: number }> {
  const now = options.now ?? Date.now();
  const files = await listScreenshots(admin);
  const businesses = new Map<string, string[]>();
  const analyses = new Map<string, WebsiteAnalysis>();
  for (let page = 0; ; page++) {
    const { data, error } = await admin.from("businesses").select("id, website_analysis_json").range(page * 500, page * 500 + 499);
    if (error) throw new Error(`businesses: ${error.message}`);
    for (const b of (data ?? []) as Array<{ id: string; website_analysis_json: WebsiteAnalysis | null }>) {
      businesses.set(b.id, referencedPaths(b.website_analysis_json));
      if (b.website_analysis_json) analyses.set(b.id, b.website_analysis_json);
    }
    if ((data ?? []).length < 500) break;
  }
  const plan = sweepPlan(files, businesses, now);
  if (options.dryRun || plan.length === 0) return { plan, deleted: 0 };
  let deleted = 0;
  for (let i = 0; i < plan.length; i += 100) {
    const batch = plan.slice(i, i + 100).map((p) => p.path);
    const { error } = await admin.storage.from(WEBSITE_SCREENSHOTS_BUCKET).remove(batch);
    if (!error) deleted += batch.length;
  }
  // Captures removed for age: the analysis forgets them too.
  const stale = new Map<string, Set<string>>();
  for (const p of plan.filter((x) => x.reason === "older_than_90_days")) {
    const id = businessOfPath(p.path);
    stale.set(id, (stale.get(id) ?? new Set()).add(p.path));
  }
  for (const [id, removed] of Array.from(stale)) {
    const analysis = analyses.get(id);
    if (analysis) await admin.from("businesses").update({ website_analysis_json: withoutPaths(analysis, removed) }).eq("id", id);
  }
  return { plan, deleted };
}
