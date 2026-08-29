// Pure, presentation-only helpers for the Growth → Coupons builder.
// No persistence and no scoring logic here — the code and redeem URL
// are cosmetic/preview-only until pass 2b adds a real promos table,
// uniqueness enforcement, and an actual /redeem/<code> page.

// Excludes 0/O/1/I so a customer or owner reading the code aloud (or
// off a printed coupon) never has to guess which character it was.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short, readable, random coupon code, e.g. "7K4M-QX2P". */
export function generateCouponCode(): string {
  const chars = Array.from(
    { length: 8 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  );
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** The URL the coupon's QR code encodes. Built from the page's own real
 * origin so it's a genuine, working-domain-shaped link, not a
 * fabricated placeholder. */
export function buildRedeemUrl(origin: string, code: string): string {
  return `${origin}/redeem/${code}`;
}

/** A sensible default expiry — `daysFromNow` days out, as an ISO
 * yyyy-mm-dd date ready for a native `<input type="date">`. Takes
 * `now` explicitly so it stays a pure, testable function. */
export function defaultExpiryDate(daysFromNow: number, now: Date): string {
  const date = new Date(now);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

/** Formats an ISO yyyy-mm-dd date (as produced by a native
 * `<input type="date">`) as a short, human-readable expiry line — or an
 * honest placeholder when nothing's been picked yet. Parsed as a plain
 * calendar date (not through the local timezone) so the displayed day
 * always matches what the owner typed. */
export function formatExpiry(isoDate: string): string {
  if (!isoDate) return "No expiration set yet";
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return "No expiration set yet";
  const date = new Date(Date.UTC(year, month - 1, day));
  return `Expires ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}
