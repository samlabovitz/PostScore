// Pure: only a real https Google Maps link from Google's API is ever
// shown as "View on Google" — never one built by hand.

export function safeMapsUri(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    const google = host === "maps.google.com" || host === "www.google.com" || host === "google.com" || host === "maps.app.goo.gl" || host === "goo.gl" || /^maps\.google\.[a-z.]+$/.test(host);
    return google ? u.toString() : null;
  } catch {
    return null;
  }
}
