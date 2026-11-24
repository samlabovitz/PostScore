"use client";

// Day 25B step 4 (spec §2a, mockups 02/02b): the Overview's "Your Google
// listing" as one compact row, on the new-design preview. Connected: the
// sync pill, the same counts as the Google listing page header
// (listingCounts, Hours mismatch = "to improve") and "Open your Google
// listing →". Disconnected (the connection was lost; tokens are never
// deleted after one failure, so one failed call never shows this): red,
// with Reconnect. Never connected: "Connect Google to check your listing
// every day" + Connect. Free (spec §5: the audit is open): the same counts
// from the scan and the link to the page, with "Connect Google with Grow →"
// in place of the connection status.

import Link from "next/link";
import { IconArrowRight, IconMapPin } from "@tabler/icons-react";
import { googleListingHref } from "@/lib/routes";
import { gbpConnectHref } from "@/lib/gbpLanding";
import { listingCounts, listingGroups, syncedAgo, type GoogleTabSaved, type ListingInput } from "@/lib/googleProfileTab";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.overview.listingCard.${key}` as MessageKey;
const G = (key: string) => `dashboard.googleTab.${key}` as MessageKey;
const R = (key: string) => `dashboard.overview.listingRow.${key}` as MessageKey;
const ROW = "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-white px-4 py-3 shadow-card sm:px-5";
const BUTTON = "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[12.5px] font-semibold";

export function GoogleListingRow({
  businessId,
  connected,
  needsReconnect,
  canStart,
  hoursMismatch,
  free = false,
  data,
}: {
  businessId: string;
  connected: boolean;
  /** The connection was lost (Google refused the refresh, or access was revoked). */
  needsReconnect: boolean;
  canStart: boolean;
  /** The website's hours differ from Google's (the Google listing page's Hours row is "to improve"). */
  hoursMismatch: boolean;
  /** Free: the scan's counts, never a connection (Google connects with Grow). */
  free?: boolean;
  data: { input: ListingInput; saved: GoogleTabSaved | null; syncedAt: string | null } | null;
}) {
  const locale = useLocale();
  const title = <h2 className="font-serif text-[16px] font-semibold text-ink">{t(locale, K("title"))}</h2>;
  const pin = <IconMapPin size={18} aria-hidden className="shrink-0 text-ink-soft" />;
  const connectHref = canStart ? gbpConnectHref(businessId, "profile") : `/business/${businessId}/connect-gbp`;

  if (free && data) {
    return (
      <section data-testid="google-listing-row" data-state="free" className={cn(ROW, "border-paper-deep")}>
        {pin}
        {title}
        <Link href={`/business/${businessId}/settings#compare-plans`} data-testid="google-listing-grow" className="whitespace-nowrap text-[12.5px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
          {t(locale, R("connectWithGrow"))} →
        </Link>
        <Counts counts={listingCounts(listingGroups({ ...data.input, hoursMismatch }))} />
        <OpenLink businessId={businessId} />
      </section>
    );
  }

  if (!connected || !data) {
    if (needsReconnect) {
      return (
        <section data-testid="google-listing-row" data-state="disconnected" className={cn(ROW, "border-red/40 bg-[color:color-mix(in_srgb,var(--color-red)_6%,white)]")}>
          {pin}
          {title}
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-red">{t(locale, R("disconnected"))}</span>
          <a href={connectHref} data-testid="google-listing-reconnect" className={cn(BUTTON, "bg-red text-white hover:bg-red/90")}>
            {t(locale, R("reconnect"))}
          </a>
        </section>
      );
    }
    return (
      <section data-testid="google-listing-row" data-state="not-connected" className={cn(ROW, "border-paper-deep")}>
        {pin}
        {title}
        <span className="min-w-0 flex-1 text-[13px] text-ink-soft">{t(locale, R("connectLine"))}</span>
        <a href={connectHref} data-testid="google-listing-connect" className={cn(BUTTON, "border border-ink bg-ink text-white hover:bg-ink/90")}>
          {t(locale, R("connect"))}
        </a>
      </section>
    );
  }

  const counts = listingCounts(listingGroups({ ...data.input, hoursMismatch }));
  const ago = syncedAgo(data.syncedAt, Date.now());
  const agoText = ago ? t(locale, G(ago.unit === "days" && ago.count === 1 ? "ago.daysOne" : `ago.${ago.unit}`), { count: ago.count }) : null;
  return (
    <section data-testid="google-listing-row" data-state="connected" className={cn(ROW, "border-paper-deep")}>
      {pin}
      {title}
      <span className="whitespace-nowrap text-[12.5px] font-semibold text-green">● {agoText ? t(locale, G("strip.synced"), { ago: agoText }) : t(locale, G("strip.connected"))}</span>
      <Counts counts={counts} />
      <OpenLink businessId={businessId} />
    </section>
  );
}

/** "5 OK · 1 to fix · 7 to improve" — the Google listing page header's numbers. */
function Counts({ counts }: { counts: { ok: number; fix: number; improve: number } }) {
  const locale = useLocale();
  return (
    // Phones: its own line, each count kept whole.
    <span className="min-w-0 basis-full text-[12.5px] text-ink-mute sm:flex-1 sm:basis-0" data-testid="google-listing-counts">
      <span className="whitespace-nowrap">{t(locale, G("count.ok"), { count: counts.ok })}</span> · <b className="whitespace-nowrap text-red">{t(locale, G("count.fix"), { count: counts.fix })}</b> ·{" "}
      <b className="whitespace-nowrap text-amber">{t(locale, G("count.improve"), { count: counts.improve })}</b>
    </span>
  );
}

function OpenLink({ businessId }: { businessId: string }) {
  const locale = useLocale();
  return (
    <Link href={googleListingHref(businessId)} data-testid="google-listing-open" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink hover:text-brass">
      {t(locale, K("open"))}
      <IconArrowRight size={14} aria-hidden />
    </Link>
  );
}
