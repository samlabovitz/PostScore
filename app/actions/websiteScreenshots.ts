"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchWebsiteHtml, captureWebsiteScreenshots } from "@/lib/websiteAnalysis";
import { uploadWebsiteScreenshots } from "@/lib/websiteScreenshotUpload";
import { parseWebsiteAnalysis, SCREENSHOT_REFRESH_COOLDOWN_DAYS, type WebsiteAnalysis } from "@/lib/scoring";

const COOLDOWN_MS = SCREENSHOT_REFRESH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export type RefreshWebsiteScreenshotsResult =
  | { status: "ok"; websiteAnalysis: WebsiteAnalysis }
  | { status: "too_soon"; nextAvailableAt: string }
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

  const { data: row, error } = await supabase
    .from("businesses")
    .select("website, website_analysis_json")
    .eq("id", businessId)
    .single();

  if (error || !row) {
    return { status: "not_found" };
  }
  if (!row.website || row.website.trim().length === 0) {
    return { status: "no_website" };
  }

  const existing = parseWebsiteAnalysis(row.website_analysis_json);

  if (existing?.lastScreenshotRefreshAt) {
    const lastRefreshMs = new Date(existing.lastScreenshotRefreshAt).getTime();
    const elapsedMs = Date.now() - lastRefreshMs;
    if (elapsedMs < COOLDOWN_MS) {
      return { status: "too_soon", nextAvailableAt: new Date(lastRefreshMs + COOLDOWN_MS).toISOString() };
    }
  }

  const html = await fetchWebsiteHtml(row.website);
  const capture = await captureWebsiteScreenshots(row.website, html, process.env.SCREENSHOT_API_KEY);
  // Ownership invariant: uploadWebsiteScreenshots writes with the
  // service-role admin client, bypassing RLS — safe here because
  // businessId was only ever obtained from the query above, RLS-scoped
  // to this authenticated user's own rows (the .single() above already
  // proved ownership; a business belonging to someone else simply
  // wouldn't have been found).
  const { screenshotUrl, additionalPages } = await uploadWebsiteScreenshots(businessId, capture);

  const lastScreenshotRefreshAt = new Date().toISOString();
  const updated: WebsiteAnalysis = {
    content: existing?.content ?? null,
    mobilePerformanceScore: existing?.mobilePerformanceScore ?? null,
    screenshotUrl,
    additionalPages,
    lastScreenshotRefreshAt,
    // Not touched by this action — see the doc comment above.
    checkedAt: existing?.checkedAt ?? lastScreenshotRefreshAt,
    hasAboutPage: existing?.hasAboutPage ?? false,
    hasServicesPage: existing?.hasServicesPage ?? false,
  };

  const { error: updateError } = await supabase
    .from("businesses")
    .update({ website_analysis_json: updated })
    .eq("id", businessId);

  if (updateError) {
    return { status: "error", message: updateError.message };
  }

  return { status: "ok", websiteAnalysis: updated };
}
