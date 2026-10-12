import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWebsiteAnalysis } from "@/lib/scoring";
import { screenshotCallsThisMonth } from "@/lib/screenshotBudget";
import { browserRendersThisMonth } from "@/lib/browserRender";

/** This month's real ScreenshotOne requests across EVERY business (the
 * plan is shared, so the cap is too) — read with the service-role
 * client because a scan's own RLS client only sees its owner's rows. */
export async function loadScreenshotCallsThisMonth(now: Date = new Date()): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("businesses").select("website_analysis_json");
  // Can't read usage -> assume the cap is reached (never overspend).
  if (error || !data) return Number.POSITIVE_INFINITY;
  return screenshotCallsThisMonth(data.map((r) => parseWebsiteAnalysis(r.website_analysis_json)), now);
}

/** Step 2g: this month's real Browserless renders across EVERY business —
 * same shared-plan reasoning as screenshots. Unreadable -> assume the cap
 * is reached (never overspend). */
export async function loadBrowserRendersThisMonth(now: Date = new Date()): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("businesses").select("website_analysis_json");
  if (error || !data) return Number.POSITIVE_INFINITY;
  return browserRendersThisMonth(data.map((r) => parseWebsiteAnalysis(r.website_analysis_json)), now);
}
