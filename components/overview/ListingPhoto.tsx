"use client";

// The Google listing's main photo beside the business name. Loaded after
// the page renders, through our own server route (the API key never
// reaches the browser), never stored or cached (Google's rule), with
// the photo author's credit and a link to the photo on Google Maps (both
// required). No photo on the listing, over the monthly free budget, or
// any error → no image at all: no screenshot, no placeholder.

import { useEffect, useRef, useState } from "react";
import type { ListingPhotoResponse } from "@/app/api/business/[id]/listing-photo/route";
import { t, useLocale } from "@/lib/i18n";

type Photo = NonNullable<ListingPhotoResponse["photo"]>;

export function ListingPhoto({ businessId, businessName }: { businessId: string; businessName: string }) {
  const locale = useLocale();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loaded, setLoaded] = useState(false);
  // One paid load per page view (dev's double-mounted effects included).
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    let cancelled = false;
    fetch(`/api/business/${encodeURIComponent(businessId)}/listing-photo`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ListingPhotoResponse>) : { photo: null }))
      .then((body) => {
        if (!cancelled && body.photo) setPhoto(body.photo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  if (!photo) return null;
  const author = photo.attributions[0] ?? null;

  return (
    <figure className={loaded ? "flex shrink-0 flex-col gap-1" : "hidden"}>
      <a
        href={photo.googleMapsUri ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={t(locale, "dashboard.overview.photo.viewOnMaps")}
        className="block"
      >
        {/* Google's short-lived image URL — not stored, not proxied into our storage. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.uri}
          alt={t(locale, "dashboard.overview.photo.alt", { name: businessName })}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setPhoto(null)}
          className="h-16 w-16 rounded-xl border border-paper-deep object-cover sm:h-[76px] sm:w-[76px]"
        />
      </a>
      <figcaption className="max-w-[76px] text-[10px] leading-tight text-ink-soft">
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
    </figure>
  );
}
