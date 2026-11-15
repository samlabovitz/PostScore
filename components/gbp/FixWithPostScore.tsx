"use client";

// "Fix it with PostScore (Beta)" on a Premium step or score row whose fix
// PostScore can now make itself — it opens the existing editor, never a new
// flow: hours and phone (Edit on Google), the website link, and review
// replies (the Google reviews inbox). Customer details opens its own editor
// in place (CustomerDetailsGoogleEdit) and isn't here. Steps with no editor
// keep "Coming soon: PostScore can do this for you".
//
// The same locks as the editors themselves: practice mode works with no
// connection; otherwise Google must be connected ("Connect Google →"), and
// on a business not on GOOGLE_WRITES_LIVE_PLACES the editor opens
// read-only (the note says so). Free and Grow see nothing here — their
// upsell is unchanged. Off where no GbpEditProvider is.

import Link from "next/link";
import { IconArrowRight, IconWand } from "@tabler/icons-react";
import { useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { ReadOnlyNote } from "@/components/gbp/googleEditBits";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fixFlowHref } from "@/lib/fixFlows";

export { fixFlowHref };

export function FixWithPostScore({ businessId, checkId, mergedCheckIds = null, className }: { businessId: string; checkId: string; mergedCheckIds?: string[] | null; className?: string }) {
  const locale = useLocale();
  const gbp = useGbpEdit();
  const href = fixFlowHref(businessId, checkId, mergedCheckIds);
  if (!href || !gbp.enabled || !gbp.premium) return null;
  if (!gbp.practice && !gbp.connected)
    return (
      <p data-testid="fix-with-postscore-connect" className={cn("flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-soft", className)}>
        {t(locale, "dashboard.fixWithPostScore.connectFirst")}
        <Link href={`/business/${businessId}/connect-gbp`} className="font-semibold text-ink underline-offset-2 hover:underline">
          {t(locale, "dashboard.gbpEdit.connectLink")}
        </Link>
      </p>
    );
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <Link
        href={href}
        data-testid="fix-with-postscore"
        data-check={checkId}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-ink bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-ink/90"
      >
        <IconWand size={14} aria-hidden />
        {t(locale, "dashboard.fixWithPostScore.button")}
        <span className="rounded-full bg-white/15 px-1.5 py-px text-[10.5px] font-semibold">{t(locale, "dashboard.fixWithPostScore.beta")}</span>
        <IconArrowRight size={13} aria-hidden />
      </Link>
      {!gbp.practice && !gbp.canEdit && <ReadOnlyNote testId="fix-with-postscore-read-only" />}
    </div>
  );
}
