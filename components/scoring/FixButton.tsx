"use client";

// Day 23B: the ONE button on an item that's missing points (lib/fixDestination.ts)
// — the score breakdown rows, "Top recommendations", the Growth recap steps
// and the details-mismatch tasks. Premium with Google writes: "PostScore can
// do this for you"; everyone else: a verb to where it's fixed.

import { isFixPlanStepsHref } from "@/lib/routes";
import Link from "next/link";
import { IconWand } from "@tabler/icons-react";
import { useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { ANCHOR_HIGHLIGHT_EVENT } from "@/components/layout/AnchorHighlight";
import { PremiumOneClickLine } from "@/components/scoring/PremiumOneClickLine";
import { fixDestination, withFromScore, type FixContext, type FixDestination, type FixItem } from "@/lib/fixDestination";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const FIX_BUTTON_CLASS = "inline-flex min-h-8 w-fit items-center gap-1.5 rounded-lg py-1 text-left leading-tight border border-ink bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-ink/90";

/** The page's context for lib/fixDestination.ts (off without a GbpEditProvider: the step-by-step). */
export function useFixContext(businessId: string): FixContext {
  const gbp = useGbpEdit();
  return { businessId, premium: gbp.enabled && gbp.premium, connected: gbp.enabled && gbp.connected, practice: gbp.enabled && gbp.practice === true, canEdit: gbp.enabled && gbp.canEdit === true };
}

/** "payment, parking and accessibility" in the owner's language. */
export function partList(parts: string[], locale: Locale): string {
  const names = parts.map((p) => t(locale, `content.checks.completeness.customer_details.partLabel.${p}` as MessageKey).toLowerCase());
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${t(locale, "dashboard.breakdown.and")} ${names[names.length - 1]}`;
}

export function fixLabel(dest: FixDestination, locale: Locale): string {
  if (dest.key === "addParts") return t(locale, "dashboard.breakdown.action.addParts", { parts: partList((dest.params?.parts ?? "").split("|"), locale) });
  return t(locale, `dashboard.breakdown.action.${dest.key}` as MessageKey);
}

export function FixButton({
  businessId,
  item,
  fromScore = false,
  onSteps,
  className,
  premiumLine = true,
}: {
  businessId: string;
  item: FixItem;
  /** From the Overview: the destination shows "← Back to your score". */
  fromScore?: boolean;
  /** On the Growth step itself: the step-by-step opens here instead of navigating. */
  onSteps?: () => void;
  className?: string;
  /** Grow/Free: "Premium does this for you in one click →" under it (off: the caller places it). */
  premiumLine?: boolean;
}) {
  const locale = useLocale();
  const ctx = useFixContext(businessId);
  const dest = fixDestination(item, ctx);
  if (!dest) return null;
  const label = fixLabel(dest, locale);
  const icon = dest.kind === "do_it" ? <IconWand size={14} aria-hidden /> : null;
  const ownSteps = onSteps && dest.kind === "steps" && isFixPlanStepsHref(dest.href);
  const line = premiumLine ? <PremiumOneClickLine businessId={businessId} item={item} className="w-full" /> : null;
  if (ownSteps) {
    return (
      <>
        <button type="button" onClick={onSteps} data-testid="fix-button" data-kind="steps" className={cn(FIX_BUTTON_CLASS, className)}>
          {label} →
        </button>
        {line}
      </>
    );
  }
  return (
    <>
    <Link
      href={fromScore ? withFromScore(dest.href) : dest.href}
      data-testid="fix-button"
      data-kind={dest.kind}
      // Same-page anchors don't fire "hashchange" under client navigation.
      onClick={() => setTimeout(() => window.dispatchEvent(new Event(ANCHOR_HIGHLIGHT_EVENT)), 150)}
      className={cn(FIX_BUTTON_CLASS, className)}
    >
      {icon}
      {label} →
    </Link>
    {line}
    </>
  );
}
