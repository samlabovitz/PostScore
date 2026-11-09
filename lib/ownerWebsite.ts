// "Wrong site?" — the owner tells PostScore which website is theirs. Pure:
// does a page mention the business (name, phone, address)? The server side
// is app/actions/ownerWebsite.ts; the order of sites is lib/businessWebsite.ts.

export type BusinessMention = "name" | "phone" | "address";

/** At most this many site changes a day get a fresh website check (and
 * screenshot) right away — beyond the usual daily re-check limit. */
export const SITE_CHANGE_RECHECKS_PER_DAY = 3;

/** The page's visible words, lower case (tags, scripts and styles gone). */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&apos;|&rsquo;/gi, "'")
    .toLowerCase();
}

const GENERIC = new Set(["the", "and", "of", "llc", "inc", "co", "corp", "ltd", "&", "a", "an", "restaurant", "shop", "store", "salon", "cafe"]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9& ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Which of the business's own details the page shows — the honest
 * "We found your business name and phone on this page". `html` may also
 * hold the page's <title> and meta tags (a name often lives there). */
export function pageMentionsBusiness(html: string, business: { name: string | null; phone: string | null; address: string | null }): BusinessMention[] {
  const raw = html.toLowerCase();
  const text = visibleText(html);
  const plain = ` ${words(text).join(" ")} `;
  const found: BusinessMention[] = [];

  // The name: its distinctive words, in order, anywhere on the page or in its title/meta.
  const nameWords = words(business.name ?? "").filter((w) => !GENERIC.has(w));
  if (nameWords.length > 0) {
    const phrase = ` ${nameWords.join(" ")} `;
    const rawPlain = ` ${words(raw.replace(/<[^>]+>/g, " ")).join(" ")} `;
    if (plain.includes(phrase) || rawPlain.includes(phrase) || ` ${words(raw).join(" ")} `.includes(phrase)) found.push("name");
  }

  // The phone: its last 10 digits, however the page formats them (or a tel: link).
  const phoneDigits = (business.phone ?? "").replace(/\D/g, "").slice(-10);
  if (phoneDigits.length === 10) {
    const pageDigits = raw.replace(/[^\d]/g, " ");
    const runs = raw.match(/\+?\d[\d\s().\-]{8,}\d/g) ?? [];
    if (runs.some((r) => r.replace(/\D/g, "").endsWith(phoneDigits)) || pageDigits.replace(/\s+/g, "").includes(phoneDigits)) found.push("phone");
  }

  // The address: its street number and the street name's first word, close together.
  const firstLine = (business.address ?? "").split(",")[0] ?? "";
  const m = /^\s*(\d+[a-z]?)\s+(.+)$/i.exec(firstLine);
  if (m) {
    const number = m[1].toLowerCase();
    const street = words(m[2]).find((w) => w.length > 2 && !/^(n|s|e|w|north|south|east|west)$/.test(w));
    if (street && new RegExp(`\\b${number}\\b[^a-z0-9]{1,4}(?:[a-z.]+\\s+){0,2}${street}`).test(plain)) found.push("address");
  }
  return found;
}

/** A host name to show ("newarkcolorfulyunnan.com"). */
export function siteHost(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}
