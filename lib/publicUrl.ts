// Validates a website address an owner typed in (the "find my listing by
// my website" search and the website-only mode) before the server ever
// fetches it: http(s) only, a real public hostname, no IP literals or
// local/internal names, no unusual ports, no credentials. Blocks the
// obvious server-side request forgery cases; DNS that later resolves to
// a private address isn't covered here.

const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".test", ".invalid"];

function looksLikeIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || /^[0-9a-f:]+$/i.test(host) && host.includes(":");
}

/** The owner's website as a safe, normalized URL, or null. A bare
 * "example.com" gets https:// added. */
export function parsePublicWebsiteUrl(input: string | null | undefined): URL | null {
  const raw = (input ?? "").trim();
  if (!raw || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || looksLikeIpLiteral(host)) return null;
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  url.hash = "";
  return url;
}
