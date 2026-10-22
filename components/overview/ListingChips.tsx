"use client";

// The business's Google listing at a glance, in the Overview header: phone
// (tap to call), today's hours in the business's own time zone (tap for the
// full week), website, and Google Maps. Missing data is said plainly ("Hours
// not listed on Google") — never hidden or guessed.
//
// One row, always. From 1024px (lg) the four chips sit on one line — the
// website and hours chips shrink with "…" (full text on hover) if it's
// tight. Below that the row scrolls sideways (one swipeable line, never a
// second line with one chip). The hours popover is positioned fixed so the
// scrolling row can't clip it.

import { useEffect, useRef, useState } from "react";
import { IconClock, IconMapPin, IconPhone, IconWorld } from "@tabler/icons-react";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import { businessWebsiteUrl, isWebsiteVerifiedElsewhereOnly } from "@/lib/businessWebsite";
import { formatOpeningHours, todayHours, todayLineIndex } from "@/lib/hours";
import { socialPagePlatform } from "@/lib/websiteTrust";
import { t, useLocale, useTimeZone, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface ListingChipsBusiness {
  phone: string | null;
  website: string | null;
  verified_website_url?: string | null;
  opening_hours: string[] | null;
  opening_hours_periods: OpeningHoursPeriod[] | null;
  google_maps_uri: string | null;
}

const CHIP = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-paper-deep bg-white px-2 py-[3px] text-[12px] text-ink";
/** May shrink with "…" on a desktop line (hours, website). */
const SHRINK = "min-w-0 lg:shrink";
const LINK_CHIP = `${CHIP} font-medium transition-colors hover:border-[color:color-mix(in_srgb,var(--color-brass)_50%,white)] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass`;
const MUTED_CHIP = `${CHIP} text-ink-mute`;

function host(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Today's hours as chip text. Pure; exported for tests. */
export function hoursChipText(business: ListingChipsBusiness, now: Date, timeZone: string, locale: Locale): string {
  const today = todayHours(business.opening_hours_periods, business.opening_hours, now, timeZone, locale);
  switch (today.kind) {
    case "open":
      return t(locale, "dashboard.overview.listingChips.openToday", { hours: today.ranges.join(", ") });
    case "open24":
      return t(locale, "dashboard.overview.listingChips.open24Today");
    case "closed":
      return t(locale, "dashboard.overview.listingChips.closedToday");
    default:
      return t(locale, "dashboard.overview.listingChips.hoursNotListed");
  }
}

const POPOVER_WIDTH = 272; // w-[17rem]

function HoursChip({ business, now }: { business: ListingChipsBusiness; now: Date }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  // Where the popover goes (fixed, under the chip); null = closed.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const open = at !== null;
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  function toggle() {
    if (open) return setAt(null);
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    setAt({ top: r.bottom + 6, left: Math.max(16, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 16)) });
  }
  const today = todayHours(business.opening_hours_periods, business.opening_hours, now, timeZone, locale);
  // The full week: localized from Google's structured hours, or Google's
  // own weekday text when those are missing.
  const week = formatOpeningHours(business.opening_hours_periods, locale) ?? business.opening_hours;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setAt(null);
    };
    // Fixed to the screen: scrolling the page or the chip row closes it.
    const dismiss = () => setAt(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const text = hoursChipText(business, now, timeZone, locale);
  if (today.kind === "not_listed" || !week || week.length === 0) {
    return (
      <span className={cn(MUTED_CHIP, SHRINK)} title={text}>
        <IconClock size={14} className="shrink-0 text-brass" aria-hidden />
        <span className="truncate">{text}</span>
      </span>
    );
  }
  const todayIndex = todayLineIndex(today.googleDay);
  return (
    <div ref={ref} className={cn("flex shrink-0", SHRINK)}>
      <button ref={buttonRef} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={toggle} title={text} className={cn(LINK_CHIP, "max-w-full")}>
        <IconClock size={14} className="shrink-0 text-brass" aria-hidden />
        <span className="truncate">{text}</span>
      </button>
      {at && (
        <div
          role="dialog"
          aria-label={t(locale, "dashboard.overview.hoursLabel")}
          style={{ top: at.top, left: at.left }}
          className="fixed z-40 w-[17rem] max-w-[calc(100vw-2rem)] rounded-xl border border-paper-deep bg-white p-3 text-[12.5px] shadow-card"
        >
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{t(locale, "dashboard.overview.hoursLabel")}</div>
          <ul className="flex flex-col gap-0.5">
            {week.map((line, i) => (
              <li key={line} className={cn("rounded-md px-1.5 py-0.5", i === todayIndex ? "bg-[color:color-mix(in_srgb,var(--color-brass)_12%,white)] font-semibold text-ink" : "text-ink-soft")}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ListingChips({ business, now }: { business: ListingChipsBusiness; now: string }) {
  const locale = useLocale();
  // A Facebook/Instagram/Yelp page on the listing is not a website — show
  // "Facebook page only", unless a real site was verified elsewhere.
  const social = business.website ? socialPagePlatform(business.website) : null;
  const verified = business.verified_website_url?.trim() || null;
  const site = social ? verified : businessWebsiteUrl(business);
  const elsewhere = site !== null && (social !== null || isWebsiteVerifiedElsewhereOnly(business));
  return (
    <div
      data-testid="listing-chips"
      className="-mx-1 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] lg:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {business.phone ? (
        <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`} className={LINK_CHIP}>
          <IconPhone size={14} className="shrink-0 text-brass" aria-hidden />
          <span className="truncate">{business.phone}</span>
        </a>
      ) : (
        <span className={MUTED_CHIP}>
          <IconPhone size={14} className="shrink-0 text-brass" aria-hidden />
          {t(locale, "dashboard.overview.listingChips.noPhone")}
        </span>
      )}

      <HoursChip business={business} now={new Date(now)} />

      {site ? (
        <a
          href={site}
          target="_blank"
          rel="noreferrer"
          className={cn(LINK_CHIP, SHRINK, "max-w-[16rem]")}
          title={elsewhere ? `${site} — ${t(locale, "dashboard.overview.listingChips.notOnListing")}` : site}
        >
          <IconWorld size={14} className="shrink-0 text-brass" aria-hidden />
          <span className="truncate">{host(site)}</span>
          {elsewhere && <span className="shrink-0 text-ink-mute">· {t(locale, "dashboard.overview.listingChips.notOnListingShort")}</span>}
        </a>
      ) : social ? (
        <a href={business.website!} target="_blank" rel="noreferrer" className={LINK_CHIP}>
          <IconWorld size={14} className="shrink-0 text-brass" aria-hidden />
          {t(locale, "dashboard.competitors.socialPageOnly", { platform: social })}
        </a>
      ) : (
        <span className={MUTED_CHIP}>
          <IconWorld size={14} className="shrink-0 text-brass" aria-hidden />
          {t(locale, "dashboard.overview.listingChips.noWebsite")}
        </span>
      )}

      {business.google_maps_uri && (
        <a href={business.google_maps_uri} target="_blank" rel="noreferrer" className={LINK_CHIP}>
          <IconMapPin size={14} className="shrink-0 text-brass" aria-hidden />
          {t(locale, "dashboard.overview.viewOnGoogleMaps")}
        </a>
      )}
    </div>
  );
}
