"use client";

// CLAUDE.md "Plans": Grow shows how to fix it yourself; Premium does it for
// you in one click. On Grow and Free, under the steps of every fix Premium
// can do in one click (lib/fixDestination.ts premiumDoesInOneClick), a small
// "Premium does this for you in one click →" to the plans (Premium is the
// highlighted column). Never on Premium; off where the page has no plan
// state (no GbpEditProvider).

import Link from "next/link";
import { useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { premiumDoesInOneClick, type FixItem } from "@/lib/fixDestination";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function PremiumOneClickLine({ businessId, item, className }: { businessId: string; item: FixItem; className?: string }) {
  const locale = useLocale();
  const gbp = useGbpEdit();
  if (!gbp.enabled || gbp.premium || !premiumDoesInOneClick(item)) return null;
  return (
    <Link
      href={`/business/${businessId}/settings#compare-plans`}
      data-testid="premium-one-click"
      className={cn("w-fit text-[12px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink", className)}
    >
      {t(locale, "dashboard.fix.premiumOneClick")}
    </Link>
  );
}
