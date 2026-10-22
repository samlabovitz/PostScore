"use client";

// The Google listing's main photo beside the business name. Loaded after
// the page renders, through our own server route (the API key never
// reaches the browser), never stored or cached (Google's rule), with
// the photo author's credit and a link to the photo on Google Maps (both
// required). No photo on the listing, over the monthly free budget, or
// any error → no image at all: no screenshot, no placeholder.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ListingPhotoResponse } from "@/app/api/business/[id]/listing-photo/route";
import { t, useLocale } from "@/lib/i18n";
import { GoogleMapsLogo } from "@/components/google/GoogleMapsAttribution";

export type Photo = NonNullable<ListingPhotoResponse["photo"]>;

/** The header row: the listing photo (when Google has one) beside
 * `children` (the name, address and scan line), with the photo's required
 * credit on ONE small line under the row — never squeezed under the photo
 * and never overlapping the text beside it. No photo → just `children`. */
export function ListingPhoto({
  businessId,
  businessName,
  children,
  footer = null,
  chips = null,
  aside = null,
  note = null,
}: {
  businessId: string;
  businessName: string;
  children: ReactNode;
  /** A small line under the row (the scan line) — the photo credit joins it. */
  footer?: ReactNode;
  /** The listing chips, on their own full-width row. */
  chips?: ReactNode;
  /** The header's buttons (right of the name; last on a phone). */
  aside?: ReactNode;
  /** A line under the scan line (the snapshot message). */
  note?: ReactNode;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loaded, setLoaded] = useState(false);
  // One paid load per page view. React's dev mode runs effects twice
  // (mount → cleanup → mount): the second run must not fetch again, and
  // the first run's answer must still be used — so "mounted" is tracked
  // separately from "requested", instead of a per-run cancel flag that
  // would throw the only answer away.
  const requested = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (!requested.current) {
      requested.current = true;
      fetch(`/api/business/${encodeURIComponent(businessId)}/listing-photo`, { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<ListingPhotoResponse>) : { photo: null }))
        .then((body) => {
          if (mounted.current && body.photo) setPhoto(body.photo);
        })
        .catch(() => {});
    }
    return () => {
      mounted.current = false;
    };
  }, [businessId]);

  return (
    <ListingPhotoView
      businessName={businessName}
      photo={photo}
      loaded={loaded}
      onLoad={() => setLoaded(true)}
      onError={() => setPhoto(null)}
      footer={footer}
      chips={chips}
      aside={aside}
      note={note}
    >
      {children}
    </ListingPhotoView>
  );
}

// The header as a grid. From sm up: name (and photo) | buttons, then the
// chips and the scan line across the full width. On a phone: one column,
// the buttons last.
const HEADER_GRID = "m-0 grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto]";
const TOP = "flex min-w-0 items-start gap-3.5 sm:col-start-1 sm:row-start-1";
const ASIDE = "order-last mt-1 flex min-w-0 flex-col items-start gap-1.5 sm:order-none sm:col-start-2 sm:row-start-1 sm:mt-0 sm:items-end";
const CHIPS = "min-w-0 sm:col-span-2 sm:row-start-2";
const FOOT = "sm:col-span-2 sm:row-start-3";
const NOTE = "min-w-0 sm:col-span-2 sm:row-start-4";

/** The header row as drawn (exported for tests): `photo` null → no image. */
export function ListingPhotoView({
  businessName,
  photo,
  loaded,
  onLoad = () => {},
  onError = () => {},
  footer = null,
  chips = null,
  aside = null,
  note = null,
  children,
}: {
  businessName: string;
  photo: Photo | null;
  loaded: boolean;
  onLoad?: () => void;
  onError?: () => void;
  footer?: ReactNode;
  /** The listing chips: their own full-width row under the name, so all
   * four fit on one line on a desktop. */
  chips?: ReactNode;
  /** The header's buttons: right of the name from sm up, last on a phone. */
  aside?: ReactNode;
  /** A line under the scan line (the snapshot message). */
  note?: ReactNode;
  children: ReactNode;
}) {
  const locale = useLocale();
  // The name, address and chips are Google Maps data: the logo ends the
  // scan line, vertically centered, with 10px clear around it (gap-x-3
  // and gap-2.5 beside it; gap-y-2.5 when the line wraps on a phone).
  if (!photo) {
    return (
      <div className={HEADER_GRID}>
        <div className={TOP}>{children}</div>
        {aside && <div className={ASIDE}>{aside}</div>}
        {chips && <div className={CHIPS}>{chips}</div>}
        <div className={cn(FOOT, "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2.5")}>
          {footer}
          <GoogleMapsLogo />
        </div>
        {note && <div className={NOTE}>{note}</div>}
      </div>
    );
  }
  const author = photo.attributions[0] ?? null;

  return (
    <figure className={HEADER_GRID}>
      <div className={TOP}>
      <a
        href={photo.googleMapsUri ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={t(locale, "dashboard.overview.photo.viewOnMaps")}
        className={cn("block shrink-0", !loaded && "hidden")}
      >
        {/* Google's short-lived image URL — not stored, not proxied into our storage. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.uri}
          alt={t(locale, "dashboard.overview.photo.alt", { name: businessName })}
          referrerPolicy="no-referrer"
          onLoad={() => onLoad()}
          onError={() => onError()}
          className={cn("h-16 w-16 shrink-0 rounded-xl border border-paper-deep object-cover sm:h-[76px] sm:w-[76px]", !loaded && "hidden")}
        />
      </a>
      {children}
      </div>
      {aside && <div className={ASIDE}>{aside}</div>}
      {chips && <div className={CHIPS}>{chips}</div>}
      {/* One small line: the scan line, then the photo's required credit
          ending in the Google Maps logo (always shown — the name, address
          and chips are Google's too). */}
      <div className={cn(FOOT, "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2.5")}>
        {footer}
        <figcaption className="flex min-w-0 max-w-full items-center gap-2.5 text-[11px] leading-tight text-ink-mute">
          {author && loaded && (
            <span className="min-w-0 truncate whitespace-nowrap">
              {author.uri ? (
                <a href={author.uri} target="_blank" rel="noreferrer" className="underline decoration-paper-line underline-offset-2 hover:text-ink">
                  {author.displayName}
                </a>
              ) : (
                author.displayName
              )}{" "}
              ·
            </span>
          )}
          <GoogleMapsLogo />
        </figcaption>
      </div>
      {note && <div className={NOTE}>{note}</div>}
    </figure>
  );
}
