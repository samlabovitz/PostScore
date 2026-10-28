"use client";

// Google shows the owner's business as closed (lib/businessStatus.ts):
// permanently → the urgent red banner, with the fix, official links and
// "Yes, we've closed" (archive); temporarily → an amber "if you've
// reopened, update it". Archived → a plain notice with Restore. Never a
// browser dialog: the archive confirm is inline.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconArchive, IconClock } from "@tabler/icons-react";
import { archiveBusiness, restoreBusiness } from "@/app/actions/businessArchive";
import { closureOf } from "@/lib/businessStatus";
import { GOOGLE_LINKS, googleHelpUrl } from "@/lib/googleHelpLinks";
import { t, useLocale } from "@/lib/i18n";

const LINK = "whitespace-nowrap font-semibold underline-offset-2 hover:underline";

export function ClosedListingBanner({ businessId, status, archived }: { businessId: string; status: string | null | undefined; archived: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closure = closureOf(status);

  async function run(action: typeof archiveBusiness) {
    setSaving(true);
    setError(null);
    const result = await action(businessId);
    setSaving(false);
    if (result.status === "ok") {
      setConfirming(false);
      router.refresh();
    } else setError(t(locale, result.status === "not_enabled" ? "dashboard.closed.archive.notEnabled" : "dashboard.closed.archive.error"));
  }

  const links = (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      <a href={GOOGLE_LINKS.businessProfile} target="_blank" rel="noopener noreferrer" className={LINK}>
        {t(locale, "dashboard.closed.link.profile")} ↗
      </a>
      <a href={googleHelpUrl(GOOGLE_LINKS.closedStatusHelp, locale)} target="_blank" rel="noopener noreferrer" className={LINK}>
        {t(locale, "dashboard.closed.link.help")} ↗
      </a>
    </span>
  );

  if (archived) {
    return (
      <div role="status" data-testid="archived-banner" className="flex flex-wrap items-center gap-3 rounded-lg border border-paper-deep bg-paper px-4 py-3 text-[13.5px] text-ink">
        <IconArchive size={18} className="shrink-0 text-ink-soft" aria-hidden />
        <span className="min-w-0 flex-1">{t(locale, "dashboard.closed.archived.message")}</span>
        <button type="button" disabled={saving} onClick={() => run(restoreBusiness)} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-mute">
          {t(locale, "dashboard.closed.archived.restore")}
        </button>
        {error && <span className="w-full text-[12px] text-red">{error}</span>}
      </div>
    );
  }

  if (closure === "temporary") {
    return (
      <div role="alert" data-testid="closed-banner-temporary" className="flex items-start gap-2.5 rounded-lg border border-[color:color-mix(in_srgb,var(--color-amber)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_12%,white)] px-4 py-3 text-ink">
        <IconClock size={18} className="mt-0.5 shrink-0 text-[color:var(--color-amber)]" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1.5 text-[13.5px]">
          <span className="font-semibold">{t(locale, "dashboard.closed.temporary.message")}</span>
          {links}
        </div>
      </div>
    );
  }

  if (closure !== "permanent") return null;
  return (
    <div role="alert" data-testid="closed-banner-permanent" className="flex items-start gap-2.5 rounded-lg border border-red/30 bg-red/5 px-4 py-3 text-ink">
      <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-red" aria-hidden />
      <div className="flex min-w-0 flex-col gap-2 text-[13.5px]">
        <span className="font-semibold">{t(locale, "dashboard.closed.permanent.message")}</span>
        <span className="text-[13px] text-ink-soft">{t(locale, "dashboard.closed.permanent.steps")}</span>
        <span className="text-red">{links}</span>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {confirming ? (
            <>
              <span className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.closed.archive.confirm")}</span>
              <button type="button" disabled={saving} onClick={() => run(archiveBusiness)} className="rounded-lg bg-red px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">
                {t(locale, "dashboard.closed.archive.confirmYes")}
              </button>
              <button type="button" disabled={saving} onClick={() => setConfirming(false)} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-semibold text-ink">
                {t(locale, "dashboard.closed.archive.cancel")}
              </button>
            </>
          ) : (
            <button type="button" data-testid="archive-business" onClick={() => setConfirming(true)} className="rounded-lg border border-red/40 bg-white px-3 py-1.5 text-[13px] font-semibold text-red hover:bg-red/5">
              {t(locale, "dashboard.closed.archive.button")}
            </button>
          )}
        </div>
        {error && <span className="text-[12px] text-red">{error}</span>}
      </div>
    </div>
  );
}
