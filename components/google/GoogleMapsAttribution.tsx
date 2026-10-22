// "Google Maps" attribution, required wherever we show Places API data
// without a Google Map (Overview, Competitors, Website, Reviews, Reports,
// Growth; the PDF and email have their own versions). Follows
// https://developers.google.com/maps/documentation/places/web-service/policies
// (Google Maps attribution):
// - the official logo, unmodified, aspect ratio kept. Google's asset pack
//   has no full-color version — only Gray, Dark Gray, White and outlined
//   ones; the non-outlined Gray (#5E5E5E, 4.5:1+ on our white/paper
//   cards) is the one for plain backgrounds;
// - 16–19dp tall: 16px here, the smallest allowed;
// - clear space at least 10dp left, right and top, 5dp bottom;
// - an accessibility label "Google Maps", never translated
//   (translate="no");
// - placed at the top or bottom of the content it attributes, inside the
//   same container, always visible. A "View on Google Maps" link doesn't
//   replace it (only a visible Google Map does).
// Works in server and client components (no hooks).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const GOOGLE_MAPS_LOGO_SRC = "/google/GoogleMaps_Logo_Gray.svg";
/** 16px tall — Google's minimum; width from the logo's own 98×18. */
export const GOOGLE_MAPS_LOGO_HEIGHT = 16;
export const GOOGLE_MAPS_LOGO_WIDTH = Math.round((98 / 18) * GOOGLE_MAPS_LOGO_HEIGHT);

/** The bare logo, for a line of small text (vertically centered). The
 * caller keeps 10px clear on each side and above, 5px below. */
export function GoogleMapsLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Google's own logo file, shown exactly as provided
    <img
      src={GOOGLE_MAPS_LOGO_SRC}
      alt="Google Maps"
      translate="no"
      data-testid="google-maps-attribution"
      width={GOOGLE_MAPS_LOGO_WIDTH}
      height={GOOGLE_MAPS_LOGO_HEIGHT}
      className={cn("inline-block h-4 w-auto max-w-none shrink-0 align-middle", className)}
    />
  );
}

/** A quiet footnote at the bottom of a card: the logo on the right, with
 * the card's other small text (`children`) on the same line when given.
 * 10px above (mt-2.5) and around it (gap-2.5, also when the line wraps);
 * the card's padding gives the room on the right and below. */
export function GoogleMapsAttribution({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("mt-2.5 flex flex-wrap items-center justify-end gap-x-2.5 gap-y-2.5", className)}>
      {children && <div className="mr-auto min-w-0">{children}</div>}
      <GoogleMapsLogo />
    </div>
  );
}
