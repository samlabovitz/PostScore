// Server-only. The one way a screenshot is taken outside a scan's first
// automatic capture (app/actions/websiteScreenshots.ts "Refresh
// screenshots", and app/actions/ownerWebsite.ts after "Wrong site?").
// Always of the site PostScore grades (lib/businessWebsite.ts
// gradedWebsite), and it records which site that was.
// - Refresh: once per SCREENSHOT_REFRESH_COOLDOWN_DAYS.
// - After the owner changes the site: one fresh capture even inside that
//   window.
// - Either way, only while the business's own monthly allowance (by plan)
//   and the account-wide monthly cap both have room (lib/screenshotBudget.ts
//   rules 2 and 4) — checked before ScreenshotOne is called; when either is
//   used, the existing screenshot stays.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businessWebsiteUrl } from "@/lib/businessWebsite";
import { withOwnerWebsite } from "@/lib/ownerWebsite.server";
import { fetchWebsiteHtml, captureWebsiteScreenshots } from "@/lib/websiteAnalysis";
import { uploadWebsiteScreenshots } from "@/lib/websiteScreenshotUpload";
import { canAutoCapture, canCaptureForBusiness, nextBusinessCaptureAt, nextCaptureLog, screenshotAutoMonthlyCap } from "@/lib/screenshotBudget";
import { getPlan } from "@/lib/premium";
import type { Plan } from "@/lib/plan";
import { loadScreenshotCallsThisMonth } from "@/lib/screenshotBudgetServer";
import { parseWebsiteAnalysis, SCREENSHOT_REFRESH_COOLDOWN_DAYS, type WebsiteAnalysis } from "@/lib/scoring";

const COOLDOWN_MS = SCREENSHOT_REFRESH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export type CaptureScreenshotsResult =
  | { status: "ok"; websiteAnalysis: WebsiteAnalysis }
  | { status: "too_soon"; nextAvailableAt: string }
  /** The month's ScreenshotOne cap has no room. */
  | { status: "capped" }
  /** This business's own allowance for the month is used (by plan). */
  | { status: "business_limit"; nextAvailableAt: string }
  | { status: "no_website" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** `supabase` must be the owner's own (RLS) client: the row read below is
 * what proves ownership before the service-role upload. */
export async function captureScreenshotsWithClient(
  supabase: SupabaseClient,
  businessId: string,
  reason: "refresh" | "site_change",
  now: Date = new Date(),
  /** The owner's plan (rule 4). Default: getPlan(). */
  plan?: Plan
): Promise<CaptureScreenshotsResult> {
  const { data: row, error } = await supabase
    .from("businesses")
    .select("website, verified_website_url, website_analysis_json")
    .eq("id", businessId)
    .single();

  if (error || !row) {
    return { status: "not_found" };
  }
  // The site PostScore grades: the owner's confirmed one, a verified one, or the listing's.
  const siteUrl = businessWebsiteUrl(await withOwnerWebsite(supabase, businessId, row));
  if (!siteUrl) {
    return { status: "no_website" };
  }

  const existing = parseWebsiteAnalysis(row.website_analysis_json);

  if (reason === "refresh" && existing?.lastScreenshotRefreshAt) {
    const lastRefreshMs = new Date(existing.lastScreenshotRefreshAt).getTime();
    const elapsedMs = now.getTime() - lastRefreshMs;
    if (elapsedMs < COOLDOWN_MS) {
      return { status: "too_soon", nextAvailableAt: new Date(lastRefreshMs + COOLDOWN_MS).toISOString() };
    }
  }
  // This business's own allowance for the month, by plan (rule 4).
  if (!canCaptureForBusiness(existing, plan ?? (await getPlan()), now)) {
    return { status: "business_limit", nextAvailableAt: nextBusinessCaptureAt(now) };
  }
  // After a site change, inside the window is fine — over the month's cap never is.
  if (!canAutoCapture(await loadScreenshotCallsThisMonth(now), screenshotAutoMonthlyCap())) {
    return { status: "capped" };
  }

  const { html } = await fetchWebsiteHtml(siteUrl);
  const capture = await captureWebsiteScreenshots(siteUrl, html, process.env.SCREENSHOT_API_KEY);
  // Ownership invariant: uploadWebsiteScreenshots writes with the
  // service-role admin client, bypassing RLS — safe here because
  // businessId was only ever obtained from the query above, RLS-scoped
  // to this authenticated user's own rows (the .single() above already
  // proved ownership; a business belonging to someone else simply
  // wouldn't have been found).
  const { screenshotUrl, additionalPages } = await uploadWebsiteScreenshots(businessId, capture);

  const lastScreenshotRefreshAt = now.toISOString();

  const updated: WebsiteAnalysis = {
    // Everything this screenshot-only refresh doesn't touch carries
    // forward — including websiteTrust, which an earlier version of this
    // object silently dropped (erasing the site-trust findings until the
    // next full scan).
    ...(existing ?? {}),
    content: existing?.content ?? null,
    mobilePerformance: existing?.mobilePerformance ?? null,
    // Not touched by this action — this is a screenshot-only refresh,
    // never a full re-scan — so the real failure reasons (if any) from
    // whenever content/mobilePerformance were last actually measured
    // carry forward unchanged, same as content/mobilePerformance above.
    mobilePerformanceFailureReason: existing?.mobilePerformanceFailureReason ?? null,
    contentFetchFailureReason: existing?.contentFetchFailureReason ?? null,
    httpsUnreachableReason: existing?.httpsUnreachableReason ?? null,
    screenshotUrl,
    additionalPages,
    lastScreenshotRefreshAt,
    screenshotHttpStatus: capture.screenshotHttpStatus ?? null,
    screenshotSiteUrl: siteUrl,
    // One capture log per business: this month's earlier calls stay in it,
    // so neither monthly count ever forgets a capture.
    screenshotCaptureLog: nextCaptureLog(existing?.screenshotCaptureLog, capture.calls ?? 0, reason === "refresh" ? "manual" : "site_change", now),
    // Not touched by this action — see the doc comment above.
    checkedAt: existing?.checkedAt ?? lastScreenshotRefreshAt,
    aboutPresence: existing?.aboutPresence ?? null,
    servicesPresence: existing?.servicesPresence ?? null,
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
