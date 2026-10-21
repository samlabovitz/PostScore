"use client";

// One "Score breakdown" panel for all three categories. Collapsed: each
// category's real share of the score ("x / 40") over one progress bar
// (brass earned, cream missing, hatched = couldn't check). Expanded:
// every check, grouped by category, with Done / Needs work / Couldn't
// check and a fix link where there's work to do.
//
// Opens by itself when the page is opened at one of its check rows
// (#check-photos from PostAI, or #score-breakdown from a tile).

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { IconArrowRight, IconChevronDown } from "@tabler/icons-react";
import { CategoryCard, checkOutcome, formatPoints } from "@/components/scoring/CategoryCard";
import { WebsiteCoverageNote } from "@/components/scoring/WebsiteCoverageNote";
import { ANCHOR_HIGHLIGHT_EVENT, anchorScrollBehavior } from "@/components/layout/AnchorHighlight";
import { categoryBarShares, categoryOutcomeCounts, postaiTargetForCheck, wholeCategoryPoints } from "@/lib/overviewTiles";
import { checkAnchorId, resolveLinkTarget, type LinkOptions } from "@/lib/postaiLinks";
import { isMinorSpeedGap, type CategoryResult } from "@/lib/scoring";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const BREAKDOWN_ANCHOR = "score-breakdown";
const ANIMATION_MS = 320;
const STRIPES = "repeating-linear-gradient(135deg, var(--color-paper-deep) 0 3px, rgba(107,120,144,.35) 3px 5px)";

/** The fix link for a check that needs work: PostAI's link for it, or —
 * when that would only point back at this same row (listing checks) —
 * this week's plan on Growth. */
export function breakdownFixLinks(categories: CategoryResult[], businessId: string, locale: Locale, options: LinkOptions = {}) {
  const links: Record<string, { href: string; label: string }> = {};
  for (const check of categories.flatMap((c) => c.checks)) {
    if (checkOutcome(check) !== "needs_work") continue;
    let target = resolveLinkTarget(postaiTargetForCheck(check.id), businessId, options);
    if (!target || target.href.startsWith(`/business/${businessId}#`)) target = resolveLinkTarget("growth", businessId, options);
    if (target) links[check.id] = { href: target.href, label: t(locale, target.label) };
  }
  return links;
}

// categoryBarShares moved to lib/overviewTiles.ts (the PDF report uses it
// on the server); re-exported here for existing imports.
export { categoryBarShares } from "@/lib/overviewTiles";

/** One rounded bar: solid brass (earned), cream track (missing), and a
 * short hatched end only when some points couldn't be checked. Fills
 * from the left once on load (not with "reduce motion"). */
function CategoryBar({ category }: { category: CategoryResult }) {
  const { earned, unchecked } = categoryBarShares(category);
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-paper-deep" aria-hidden>
      {unchecked > 0 && (
        <div className="absolute inset-y-0 right-0" style={{ width: `${unchecked * 100}%`, backgroundImage: STRIPES }} />
      )}
      {earned > 0 && <div className="ps-bar-grow absolute inset-y-0 left-0 rounded-full bg-brass" style={{ width: `${earned * 100}%` }} />}
    </div>
  );
}

function CategorySummary({
  businessId,
  category,
  hasWebsite,
  scoreBasis,
  websiteFixCount,
  points,
}: {
  businessId: string;
  category: CategoryResult;
  hasWebsite: boolean;
  scoreBasis: number;
  websiteFixCount: number | null;
  /** Whole points (wholeCategoryPoints over all three categories). */
  points: number | null;
}) {
  const locale = useLocale();
  const counts = categoryOutcomeCounts(category);
  // The check that needs work costing the most points (never an
  // "Excellent"/"Good" rating, never a tiny speed gap).
  const topIssue = category.checks
    .filter((c) => checkOutcome(c) === "needs_work" && !isMinorSpeedGap(c))
    .sort((a, b) => b.maxPoints - (b.earnedPoints ?? 0) - (a.maxPoints - (a.earnedPoints ?? 0)))[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-[15px] font-semibold text-ink">{category.label}</h3>
        <span className="shrink-0 font-serif text-[17px] font-semibold tabular-nums text-ink">
          {points === null ? "—" : formatPoints(points)}
          <span className="text-[13px] font-medium text-ink-soft"> / {category.weight}</span>
        </span>
      </div>
      <CategoryBar category={category} />
      <p className="text-[12px] text-ink-soft">
        {[
          tPlural(locale, "dashboard.overview.breakdown.done", counts.done, { count: counts.done }),
          tPlural(locale, "dashboard.overview.breakdown.needsWork", counts.needsWork, { count: counts.needsWork }),
          ...(counts.couldntCheck > 0 ? [tPlural(locale, "dashboard.overview.breakdown.couldntCheck", counts.couldntCheck, { count: counts.couldntCheck })] : []),
        ].join(" · ")}
      </p>
      <p className="text-[12px] text-ink">
        {category.relativeScore === null
          ? t(locale, "dashboard.overview.categoryNotDeterminable")
          : topIssue
            ? t(locale, "dashboard.overview.topIssue", { label: topIssue.label })
            : t(locale, "dashboard.overview.nothingLeftHere")}
      </p>
      <WebsiteCoverageNote category={category} hasWebsite={hasWebsite} scoreBasis={scoreBasis} className="text-[12px] text-ink-soft" />
      {category.id === "website" && websiteFixCount !== null && (
        // The Website page's own fix count (same plan, same builder rule).
        <p className="text-[12px] font-medium text-ink">
          {!hasWebsite ? (
            t(locale, "dashboard.overview.tiles.noWebsite")
          ) : websiteFixCount === 0 ? (
            t(locale, "dashboard.overview.tiles.nothingToFix")
          ) : (
            <Link href={`/business/${businessId}/website`} className="inline-flex items-center gap-1 underline decoration-paper-line underline-offset-2 hover:text-brass">
              {tPlural(locale, "dashboard.overview.tiles.fixes", websiteFixCount, { count: websiteFixCount })}
              <IconArrowRight size={13} aria-hidden />
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

export function ScoreBreakdownPanel({
  businessId,
  categories,
  hasWebsite,
  scoreBasis,
  linkOptions,
  audit = false,
  websiteFixCount = null,
}: {
  businessId: string;
  categories: CategoryResult[];
  hasWebsite: boolean;
  scoreBasis: number;
  linkOptions?: LinkOptions;
  /** The Website page's fix count (lib/websiteFixes.ts), or null to hide it. */
  websiteFixCount?: number | null;
  /** Free: open from the start (the audit), with no fix links — what's
   * wrong and the points each costs, never how to fix it. */
  audit?: boolean;
}) {
  const locale = useLocale();
  // `mounted` keeps the rows in the page while the close animation runs.
  // The audit (Free) starts open — same on the server and in the browser.
  const [open, setOpen] = useState(audit);
  const [mounted, setMounted] = useState(audit);
  const [expanded, setExpanded] = useState(audit);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fixLinks = audit ? {} : breakdownFixLinks(categories, businessId, locale, linkOptions);
  const wholePoints = wholeCategoryPoints(categories);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame, so the height animates from 0.
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const timer = setTimeout(() => setMounted(false), ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Open at #score-breakdown or at one of its own check rows.
  const anchorIds = categories.flatMap((c) => c.checks.map((check) => checkAnchorId(check.id)));
  const anchorKey = anchorIds.join(",");
  useEffect(() => {
    const ids = new Set(anchorKey.split(","));
    const pending = timers.current;
    function openForHash() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id !== BREAKDOWN_ANCHOR && !ids.has(id)) return;
      setOpen(true);
      // Re-center once the rows have finished growing.
      pending.push(setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: anchorScrollBehavior(), block: "start" }), ANIMATION_MS + 60));
    }
    openForHash();
    window.addEventListener("hashchange", openForHash);
    window.addEventListener(ANCHOR_HIGHLIGHT_EVENT, openForHash);
    return () => {
      window.removeEventListener("hashchange", openForHash);
      window.removeEventListener(ANCHOR_HIGHLIGHT_EVENT, openForHash);
      pending.forEach(clearTimeout);
    };
  }, [anchorKey]);

  return (
    <section id={BREAKDOWN_ANCHOR} className="scroll-mt-20 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.overview.breakdown.heading")}</h2>
          <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.overview.breakdown.caption")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink-soft"
        >
          {open ? t(locale, "dashboard.overview.hideChecks") : t(locale, "dashboard.overview.showChecks")}
          <IconChevronDown size={15} className={cn("transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 nav:grid-cols-3">
        {categories.map((category, i) => (
          <div key={category.id} className="flex min-w-0 flex-col">
            <CategorySummary businessId={businessId} category={category} hasWebsite={hasWebsite} scoreBasis={scoreBasis} websiteFixCount={websiteFixCount} points={wholePoints[i]} />
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none",
                expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
              style={{ transitionDuration: `${ANIMATION_MS}ms` }}
            >
              <div className="min-h-0 overflow-hidden">
                {mounted && (
                  <div className="mt-3 border-t border-paper-line pt-3">
                    <CategoryCard category={category} embedded fixLinks={fixLinks} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-paper-line pt-3 text-[11.5px] text-ink-soft">
        <LegendSwatch className="bg-brass" label={t(locale, "dashboard.overview.breakdown.legendEarned")} />
        <LegendSwatch className="bg-paper-deep" label={t(locale, "dashboard.overview.breakdown.legendMissing")} />
        <LegendSwatch style={{ backgroundImage: STRIPES }} className="bg-paper-deep" label={t(locale, "dashboard.checkResult.couldntCheck")} />
      </div>
    </section>
  );
}

function LegendSwatch({ className, style, label }: { className?: string; style?: CSSProperties; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("h-2.5 w-4 rounded-[3px]", className)} style={style} />
      {label}
    </span>
  );
}
