// The business's own website for a card's QR — the site PostScore shows
// (lib/businessWebsite.ts shownWebsiteUrl: owner-confirmed, verified, or
// the listing's link), never a parked or broken listing link, and never a
// Facebook, Instagram or Yelp page (those aren't a website).

import { shownWebsiteUrl, type ShownWebsiteSource } from "@/lib/businessWebsite";

export function realWebsite(row: ShownWebsiteSource): string | null {
  return shownWebsiteUrl(row);
}
