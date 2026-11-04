"use client";

// After any change PostScore sends to the owner's Google Business Profile
// (Update on Google, an approval, an undo) — success, failure or still
// reviewing: "View on Google" (Google's own metadata.mapsUri for that
// location, new tab) and one line on Google's review time.

import { IconExternalLink } from "@tabler/icons-react";
import { safeMapsUri } from "@/lib/gbpMapsUri";
import { t, useLocale } from "@/lib/i18n";

export function ViewOnGoogle({ mapsUri }: { mapsUri: string | null | undefined }) {
  const locale = useLocale();
  const href = safeMapsUri(mapsUri);
  if (!href) return null;
  return (
    <span data-testid="view-on-google" className="mt-1 flex w-full flex-col gap-0.5">
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-[12.5px] font-semibold text-ink underline underline-offset-2 hover:text-ink-soft">
        {t(locale, "dashboard.gbpEdit.viewOnGoogle")}
        <IconExternalLink size={13} aria-hidden />
      </a>
      <span className="text-[12px] font-normal text-ink-mute">{t(locale, "dashboard.gbpEdit.viewOnGoogleNote")}</span>
    </span>
  );
}
