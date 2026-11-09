// The ONE list of online-ordering platforms (Nov 10: merged from
// lib/pagePresenceDetection.ts, lib/socialLinkCheck.ts and
// lib/websiteTrust.ts, which each kept their own). Pure — no fetch.
//
// Two kinds, because a listing's "Website" button can point at either:
// - marketplace: the platform's own ordering pages (DoorDash, Uber Eats…).
//   A listing link there is NOT a website (lib/socialLinkCheck.ts).
// - builder: platforms that also host restaurants' real websites (Toast,
//   Square Online, Popmenu, BentoBox, Olo, Clover). A link to them is
//   ordering evidence on a website, but a listing link there still counts
//   as a website — unchanged from before the merge.
// Plus a business's own ordering subdomain ("order.qamariacoffee.com"),
// which is its own site, never a platform.

export interface OrderingPlatform {
  name: string;
  hosts: string[];
  kind: "marketplace" | "builder";
}

export const ORDERING_PLATFORMS: readonly OrderingPlatform[] = [
  { name: "Toast", hosts: ["toasttab.com"], kind: "builder" },
  // ChowNow's own ordering pages only (ordering.chownow.com, direct.chownow.com…);
  // a restaurant's ChowNow-built site on its own domain doesn't match.
  { name: "ChowNow", hosts: ["chownow.com"], kind: "marketplace" },
  { name: "Olo", hosts: ["olo.com"], kind: "builder" },
  { name: "Square", hosts: ["squareup.com", "square.site"], kind: "builder" },
  { name: "Clover", hosts: ["clover.com"], kind: "builder" },
  { name: "Popmenu", hosts: ["popmenu.com"], kind: "builder" },
  { name: "BentoBox", hosts: ["bentobox.com"], kind: "builder" },
  { name: "DoorDash", hosts: ["doordash.com"], kind: "marketplace" },
  { name: "Uber Eats", hosts: ["ubereats.com"], kind: "marketplace" },
  { name: "Grubhub", hosts: ["grubhub.com"], kind: "marketplace" },
  { name: "Postmates", hosts: ["postmates.com"], kind: "marketplace" },
  { name: "Seamless", hosts: ["seamless.com"], kind: "marketplace" },
  { name: "Slice", hosts: ["slicelife.com"], kind: "marketplace" },
];

function hostOf(urlOrHost: string): string | null {
  const v = urlOrHost.trim();
  if (!v) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** The ordering platform an address (or host name) belongs to, or null. */
export function orderingPlatformFor(urlOrHost: string | null | undefined): OrderingPlatform | null {
  const host = urlOrHost ? hostOf(urlOrHost) : null;
  if (!host) return null;
  return ORDERING_PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

/** Every platform host (for host lists: legitimate outbound links). */
export const ORDERING_PLATFORM_HOSTS: readonly string[] = ORDERING_PLATFORMS.flatMap((p) => p.hosts);

/** A business's own ordering subdomain — "order.", "ordering." or
 * "orders." on a real domain (order.qamariacoffee.com) — never a platform's. */
export function isOwnOrderingSubdomain(urlOrHost: string | null | undefined): boolean {
  const host = urlOrHost ? hostOf(urlOrHost) : null;
  if (!host || orderingPlatformFor(host)) return false;
  return /^(order|orders|ordering)\.[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host);
}

/** Online-ordering evidence: a known platform, or the business's own ordering subdomain. */
export function isOrderingHost(urlOrHost: string | null | undefined): boolean {
  return orderingPlatformFor(urlOrHost) !== null || isOwnOrderingSubdomain(urlOrHost);
}
