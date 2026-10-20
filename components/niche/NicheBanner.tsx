"use client";

// The one-time "We think you're a Skate & snow shop — Change" banner
// (Overview). Never a silent guess: shown until the owner confirms
// ("Looks right"), changes it, or dismisses it. A suggestion from another
// type (Google says ice cream shop, the owner chose café) keeps the owner's
// choice and only offers the change. Before supabase/business-niches.sql
// is run, a dismissal is remembered on this device only.

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTag } from "@tabler/icons-react";
import { confirmBusinessNiche } from "@/app/actions/niches";
import { articleFor, nicheLabel } from "@/lib/niches";
import { t, useLocale } from "@/lib/i18n";
import type { NicheBannerKind } from "@/lib/businessNiche";

export interface NicheBannerProps {
  businessId: string;
  kind: NicheBannerKind;
  nicheId: string;
  suggestion: string | null;
  parentLabel: string;
}

const storageKey = (id: string) => `ps_niche_banner_${id}`;

export function NicheBanner({ businessId, kind, nicheId, suggestion, parentLabel }: NicheBannerProps) {
  const locale = useLocale();
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();
  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey(businessId))) setHidden(true);
    } catch {
      // Storage blocked: the banner just stays until confirmed on the server.
    }
  }, [businessId]);
  if (hidden) return null;

  const current = nicheLabel(nicheId, locale);
  const message =
    kind === "suggest" && suggestion
      ? t(locale, "dashboard.niche.suggest", { article: articleFor(nicheLabel(suggestion, "en")), suggested: nicheLabel(suggestion, locale), current })
      : kind === "needsOwner"
        ? t(locale, "dashboard.niche.needsOwner", { parent: parentLabel.toLowerCase() })
        : t(locale, "dashboard.niche.weThink", { article: articleFor(nicheLabel(nicheId, "en")), niche: current });

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(storageKey(businessId), "1");
    } catch {
      // ignore
    }
    startTransition(async () => {
      const result = await confirmBusinessNiche(businessId);
      if (result.status === "ok") router.refresh();
    });
  }

  const changeHref = `/business/${businessId}/settings#business-type`;
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-brass/40 bg-brass/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="niche-banner">
      <div className="flex min-w-0 items-start gap-2.5">
        <IconTag size={17} className="mt-0.5 shrink-0 text-brass" aria-hidden />
        <p className="text-[13.5px] text-ink">{message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {kind !== "needsOwner" && (
          <button type="button" onClick={dismiss} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-soft">
            {kind === "suggest" ? t(locale, "dashboard.niche.dismiss") : t(locale, "dashboard.niche.looksRight")}
          </button>
        )}
        <Link href={changeHref} className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-ink/90">
          {kind === "needsOwner" ? t(locale, "dashboard.niche.choose") : t(locale, "dashboard.niche.change")}
        </Link>
      </div>
    </div>
  );
}
