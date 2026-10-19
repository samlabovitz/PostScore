// The business's own website for a card's QR — never a Facebook,
// Instagram or Yelp page (those aren't a website).

import { businessWebsiteUrl } from "@/lib/businessWebsite";
import { socialPagePlatform } from "@/lib/websiteTrust";

export function realWebsite(row: { website: string | null; verified_website_url: string | null }): string | null {
  const social = row.website ? socialPagePlatform(row.website) : null;
  const site = social ? row.verified_website_url?.trim() || null : businessWebsiteUrl(row);
  return site && !socialPagePlatform(site) ? site : null;
}
