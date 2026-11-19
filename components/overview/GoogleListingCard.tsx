"use client";

// Day 23B: the Overview's "Your Google listing" card, in the Google Profile
// tab's style and from the same rows (lib/googleProfileTab.ts listingGroups):
// the connection pill, the counts, Google's own changes first, then up to 3
// rows to fix or improve, each opening that row's editor on the tab. Not
// connected: one short card with the Connect button. Premium only (the tab is).

import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { googleEditsLine, rowText } from "@/components/gbp/GoogleProfileTab";
import { gbpConnectHref } from "@/lib/gbpLanding";
import { listingCounts, listingGroups, syncedAgo, type GoogleTabSaved, type ListingInput, type ListingRow } from "@/lib/googleProfileTab";
import { overviewListingRows, rowHref } from "@/lib/overviewListing";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.overview.listingCard.${key}` as MessageKey;
const G = (key: string) => `dashboard.googleTab.${key}` as MessageKey;
const DOT: Record<ListingRow["status"], { cls: string; mark: string }> = {
  ok: { cls: "bg-green text-white", mark: "✓" },
  warn: { cls: "bg-amber text-white", mark: "!" },
  bad: { cls: "bg-red text-white", mark: "✕" },
  neutral: { cls: "bg-paper-deep text-ink-mute", mark: "–" },
  soon: { cls: "bg-paper-deep text-ink-mute", mark: "…" },
};
const CARD = "flex flex-col gap-2.5 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5";

export function GoogleListingCard({
  businessId,
  connected,
  canStart,
  data,
}: {
  businessId: string;
  connected: boolean;
  /** Google sign-in is configured (else the connect page). */
  canStart: boolean;
  data: { input: ListingInput; saved: GoogleTabSaved | null; syncedAt: string | null; scan: { website: string | null; phone: string | null } } | null;
}) {
  const locale = useLocale();
  const tab = `/business/${businessId}/growth?tab=google`;

  if (!connected || !data) {
    return (
      <section data-testid="google-listing-card" data-state="not-connected" className={CARD}>
        <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, K("title"))}</h2>
        <p className="text-[13px] text-ink-soft">{t(locale, K("connect"))}</p>
        <a
          href={canStart ? gbpConnectHref(businessId, "profile") : `/business/${businessId}/connect-gbp`}
          data-testid="google-listing-connect"
          className="inline-flex h-8 w-fit items-center rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-ink/90"
        >
          {t(locale, "dashboard.googleProfile.connectLink")}
        </a>
      </section>
    );
  }

  const groups = listingGroups(data.input);
  const counts = listingCounts(groups);
  const rows = overviewListingRows(groups);
  const changed = googleEditsLine(data.saved, data.scan, locale);
  const ago = syncedAgo(data.syncedAt, Date.now());
  const agoText = ago ? t(locale, G(ago.unit === "days" && ago.count === 1 ? "ago.daysOne" : `ago.${ago.unit}`), { count: ago.count }) : null;

  return (
    <section data-testid="google-listing-card" data-state="connected" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, K("title"))}</h2>
          <span className="whitespace-nowrap rounded-full border border-paper-line bg-white px-2.5 py-0.5 text-[12px] font-semibold text-green">
            ● {agoText ? t(locale, G("strip.synced"), { ago: agoText }) : t(locale, G("strip.connected"))}
          </span>
        </div>
        <Link href={`${tab}#listing`} data-testid="google-listing-open" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink hover:text-brass">
          {t(locale, K("open"))}
          <IconArrowRight size={14} aria-hidden />
        </Link>
      </div>
      <p className="text-[12.5px] text-ink-mute" data-testid="google-listing-counts">
        {t(locale, G("count.ok"), { count: counts.ok })} · <b className="text-red">{t(locale, G("count.fix"), { count: counts.fix })}</b> ·{" "}
        <b className="text-amber">{t(locale, G("count.improve"), { count: counts.improve })}</b>
      </p>
      {changed && (
        <Link
          href={`${tab}#others`}
          data-testid="google-listing-changed"
          className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13px]", changed.serious ? "border-red/30 text-red" : "border-amber/30 bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] text-ink")}
        >
          <b className="min-w-0">{changed.headline}</b>
          <span className="shrink-0 font-semibold">{t(locale, K("review"))} →</span>
        </Link>
      )}
      {rows.length === 0 ? (
        <p data-testid="google-listing-all-good" className="text-[13px] font-medium text-green">
          {t(locale, K("allGood"))}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-paper-line">
          {rows.map((row) => {
            const text = rowText(row, locale);
            return (
              <li key={row.id}>
                <Link href={rowHref(businessId, row)} data-testid={`google-listing-row-${row.id}`} data-status={row.status} className="flex items-center gap-2.5 py-2 hover:text-brass">
                  <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", DOT[row.status].cls)}>
                    {DOT[row.status].mark}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    <b>{text.label}</b>
                    {text.value ? <span className="text-ink-soft"> · {text.value}</span> : null}
                  </span>
                  {text.action && <span className="shrink-0 text-[12.5px] font-semibold text-ink">{text.action} →</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
