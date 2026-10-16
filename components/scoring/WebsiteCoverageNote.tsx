"use client";

import { categoryCheckCoverage, PARTLY_CHECKED_THRESHOLD, websitePointShare, type CategoryResult } from "@/lib/scoring";
import { t, useLocale } from "@/lib/i18n";

/**
 * Step 2d: "Based on {n} of {total} website checks — the rest couldn't be
 * checked." Shown next to the Website score only when some checks were
 * excluded as couldn't-check (a bot-blocked site, the real Wonder case),
 * so a high score built on few checks is never mistaken for a full one.
 * Renders nothing for other categories or a fully checked Website.
 */
export function WebsiteCoverageNote({
  category,
  hasWebsite,
  className,
  scoreBasis = null,
}: {
  category: CategoryResult;
  /** v1.10.0: the whole score's basis — scoreBasisPoints(all categories)
   * from lib/scoring.ts, i.e. the sum of the category maxes shown. The
   * "Partly checked — score based on X of 100 points" label needs it;
   * without it only the check-count line shows. */
  scoreBasis?: number | null;
  /** A business with no website has nothing to check — its other website
   * checks are "not applicable", never "couldn't be checked". */
  hasWebsite: boolean;
  className?: string;
}) {
  const locale = useLocale();
  if (category.id !== "website" || !hasWebsite) return null;
  const { checked, total, unreachable } = categoryCheckCoverage(category);
  // Only when checks were excluded because we couldn't reach the site.
  if (unreachable === 0 || checked === 0) return null;
  const share = websitePointShare(category);
  return (
    <p className={className ?? "text-[12px] text-ink-mute"}>
      {share < PARTLY_CHECKED_THRESHOLD && scoreBasis !== null && (
        <span className="font-semibold text-amber">
          {t(locale, "dashboard.website.partlyCheckedPoints", { points: scoreBasis })}{" "}
        </span>
      )}
      {t(locale, "dashboard.website.partlyChecked", { n: checked, total })}
    </p>
  );
}

/** Share of the Website category's points we could actually check
 * (e.g. a bot-blocked site: 9 of 30 → 0.3) — see lib/scoring.ts. */
export function websitePointsCoverage(category: CategoryResult): { share: number } {
  return { share: websitePointShare(category) };
}
