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

type Photo = NonNullable<ListingPhotoResponse["photo"]>;

/** The header row: the listing photo (when Google has one) beside
 * `children` (the name, address and scan line), with the photo's required
 * credit on ONE small line under the row — never squeezed under the photo
 * and never overlapping the text beside it. No photo → just `children`. */
export function ListingPhoto({
  businessId,
  businessName,
  children,
  footer = null,
}: {
  businessId: string;
  businessName: string;
  children: ReactNode;
  /** A small line under the row (the scan line) — the photo credit joins it. */
  footer?: ReactNode;
}) {
  const locale = useLocale();
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

  if (!photo) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-start gap-3.5">{children}</div>
        {footer}
      </div>
    );
  }
  const author = photo.attributions[0] ?? null;

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-start gap-3.5">
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
          onLoad={() => setLoaded(true)}
          onError={() => setPhoto(null)}
          className={cn("h-16 w-16 shrink-0 rounded-xl border border-paper-deep object-cover sm:h-[76px] sm:w-[76px]", !loaded && "hidden")}
        />
      </a>
      {children}
      </div>
      {/* One small line: the scan line, then the photo's required credit. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {footer}
        <figcaption className={cn("max-w-full truncate whitespace-nowrap text-[11px] leading-tight text-ink-mute", !loaded && "hidden")}>
        {author ? (
          author.uri ? (
            <a href={author.uri} target="_blank" rel="noreferrer" className="underline decoration-paper-line underline-offset-2 hover:text-ink">
              {author.displayName}
            </a>
          ) : (
            author.displayName
          )
        ) : null}
        {author ? " · " : ""}
        <span className="whitespace-nowrap">Google Maps</span>
        </figcaption>
      </div>
    </figure>
  );
}
