"use client";

import { categoryCheckCoverage, type CategoryResult } from "@/lib/scoring";
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
}: {
  category: CategoryResult;
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
  return (
    <p className={className ?? "text-[12px] text-ink-mute"}>
      {t(locale, "dashboard.website.partlyChecked", { n: checked, total })}
    </p>
  );
}
