"use server";

import { createClient } from "@/lib/supabase/server";
import type { WebsiteAnalysis } from "@/lib/scoring";

export type RefreshWebsiteScreenshotsResult =
  | { status: "ok"; websiteAnalysis: WebsiteAnalysis }
  | { status: "too_soon"; nextAvailableAt: string }
  /** This month's ScreenshotOne limit is used (SCREENSHOT_AUTO_MONTHLY_CAP). */
  | { status: "capped" }
  | { status: "no_website" }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * The one explicit, owner-triggered way to force a fresh screenshot
 * capture outside a business's automatic first scan (see saveBusiness in
 * app/actions/businesses.ts, which captures once and reuses on every
 * regular re-scan after that). Real, billed ScreenshotOne cost, so
 * rate-limited server-side to once per SCREENSHOT_REFRESH_COOLDOWN_DAYS
 * — enforced here, not just hidden in the UI, by reading this business's
 * own stored lastScreenshotRefreshAt before doing anything else.
 *
 * Deliberately narrow: unlike a full re-scan, this never touches
 * content signals, PageSpeed, or the score itself — only
 * screenshotUrl/additionalPages/lastScreenshotRefreshAt in
 * website_analysis_json. checkedAt is left exactly as it was, so the
 * Website page never implies the whole analysis is fresher than it
 * actually is — only the screenshots are, and lastScreenshotRefreshAt is
 * what says so.
 */
export async function refreshWebsiteScreenshots(businessId: string): Promise<RefreshWebsiteScreenshotsResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  // The shared core (lib/websiteScreenshotRefresh.server.ts) — of the site
  // PostScore grades, once per SCREENSHOT_REFRESH_COOLDOWN_DAYS, and only
  // while the month's ScreenshotOne cap has room.
  const { captureScreenshotsWithClient } = await import("@/lib/websiteScreenshotRefresh.server");
  return captureScreenshotsWithClient(supabase, businessId, "refresh");
}
