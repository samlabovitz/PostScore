// The site PostScore's last scan graded, from our own saved website
// analysis (businesses.website_analysis_json) — never Google's saved link.
// Day 23 2d-4: what a single empty answer from Google (lib/googleListingWebsite.ts)
// and a connected owner's pages (when Business Profile leaves the website
// out) keep scoring with. Pure.

const isUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);

/** The screenshot's site, else the homepage the speed test measured; null when none. */
export function gradedSiteUrl(analysisJson: unknown): string | null {
  const a = analysisJson && typeof analysisJson === "object" ? (analysisJson as Record<string, unknown>) : null;
  if (!a) return null;
  const measured = (k: string) => {
    const m = a[k];
    return m && typeof m === "object" ? (m as { measuredUrl?: unknown }).measuredUrl : undefined;
  };
  const history = Array.isArray(a.speedHistory) ? (a.speedHistory[0] as { measuredUrl?: unknown } | undefined)?.measuredUrl : undefined;
  for (const v of [a.screenshotSiteUrl, measured("mobilePerformance"), measured("speedSmoothed"), history]) if (isUrl(v)) return v;
  return null;
}
