// Competitor selection v2: one location per chain, and never the business's
// own brand (the real Drybar - Midtown East case: two other Drybars, four
// Carvels for Main Street Sweets). Two listings are the same brand when
// they share a website domain (not a social, booking or ordering site), or
// their names match before the location part ("Drybar - Hell's Kitchen" →
// "drybar"), or one name is the other plus a location ("GS Blow Dry Bar" /
// "GS Blow Dry Bar Midtown New York City"). Pure.

/** Domains many unrelated businesses share — never a brand signal. */
const SHARED_DOMAINS =
  /(^|\.)(facebook|instagram|yelp|google|goo|square|squareup|linktr|wixsite|godaddysites|business|vagaro|booksy|styleseat|schedulicity|mindbody|mindbodyonline|genbook|toasttab|doordash|ubereats|grubhub|tiktok|twitter|x|linkedin|youtube|weebly|wordpress|blogspot|sites|carrd|beacons)\.[a-z.]+$/i;

export function domainKey(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (SHARED_DOMAINS.test(host)) return null;
  const parts = host.split(".");
  // example.co.uk → example.co.uk; shop.example.com → example.com
  const tail = parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length <= 2 ? 3 : 2;
  return parts.slice(-tail).join(".");
}

/** The brand part of a name: before " - ", " | ", " @ ", "(" or ",". */
export function nameKey(name: string | null | undefined): string {
  const cut = (name ?? "").split(/\s[-–—|@]\s|\(|,/)[0];
  return cut
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sameBrand(a: { name: string | null | undefined; website?: string | null }, b: { name: string | null | undefined; website?: string | null }): boolean {
  const da = domainKey(a.website);
  if (da && da === domainKey(b.website)) return true;
  const ka = nameKey(a.name);
  const kb = nameKey(b.name);
  if (ka.length < 3 || kb.length < 3) return false;
  if (ka === kb) return true;
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  // "gs blow dry bar" + a location — at least two words, so "hair" alone
  // never makes "Hair Bar" and "Hair Studio" one chain.
  return short.split(" ").length >= 2 && long.startsWith(`${short} `);
}

/**
 * The listings with their own brand removed and each other brand kept
 * once — the `better` one of each (most relevant, or nearest). Listings
 * the owner added are always kept.
 */
export function onePerBrand<T>(
  items: T[],
  view: (item: T) => { name: string | null | undefined; website?: string | null; ownerAdded?: boolean },
  own: { name: string | null | undefined; website?: string | null },
  better: (a: T, b: T) => number
): { kept: T[]; ownBrand: T[]; sameChain: T[] } {
  const ownBrand: T[] = [];
  const sameChain: T[] = [];
  const kept: T[] = [];
  for (const item of [...items].sort(better)) {
    const v = view(item);
    if (v.ownerAdded) {
      kept.push(item);
      continue;
    }
    if (sameBrand(v, own)) {
      ownBrand.push(item);
      continue;
    }
    if (kept.some((k) => !view(k).ownerAdded && sameBrand(view(k), v))) {
      sameChain.push(item);
      continue;
    }
    kept.push(item);
  }
  return { kept, ownBrand, sameChain };
}
