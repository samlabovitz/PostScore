// v1.11.0: a social link on the business's site must lead to a real
// profile. ONE plain request per link (redirects followed by fetch, no
// Browserless, no paid API), and where it ended up decides:
//   profile      — lands on the platform (or another social profile) → counts;
//   unconfirmed  — the platform blocked us (login wall, 403/429/999, a
//                  timeout) but the address is a valid profile path → counts,
//                  shown as "link looks right — we couldn't open it";
//   own_site     — redirects back to the business's own website → doesn't count;
//   elsewhere    — redirects to an unrelated site → doesn't count;
//   not_found    — the platform itself answers 404/410 → doesn't count.
// Never fails a real link just because the platform blocked us. The
// result is saved on each profile (SocialProfile.check) for auditing.

import type { SocialLinkCheck, SocialProfile } from "@/lib/scoring";

// ---------------------------------------------------------------------------
// Platform pages: social, link-in-bio, review/directory, ordering, delivery,
// reservation and booking pages. NEVER the business's own website — in the
// Google listing's website field, or as a verified website — for owners and
// competitors alike: not scored as a website, never crawled, screenshotted
// or speed-tested. The one shared list (lib/websiteTrust.ts
// socialPagePlatform reads it).
//
// Only the platform's OWN pages: a restaurant's site on its own domain
// built with Toast, BentoBox, ChowNow or Wix, or a Square Online site
// (*.square.site), is a real website and never matches.
// ---------------------------------------------------------------------------

export type PlatformKind = "social" | "link_in_bio" | "directory" | "ordering" | "reservations" | "appointments";

export interface PlatformDef {
  hosts: string[];
  name: string;
  kind: PlatformKind;
}

export const PLATFORM_PAGES: PlatformDef[] = [
  { hosts: ["facebook.com", "fb.com", "fb.me"], name: "Facebook", kind: "social" },
  { hosts: ["instagram.com"], name: "Instagram", kind: "social" },
  { hosts: ["tiktok.com"], name: "TikTok", kind: "social" },
  { hosts: ["x.com", "twitter.com"], name: "X", kind: "social" },
  { hosts: ["youtube.com", "youtu.be"], name: "YouTube", kind: "social" },
  { hosts: ["linkedin.com"], name: "LinkedIn", kind: "social" },
  { hosts: ["pinterest.com"], name: "Pinterest", kind: "social" },
  { hosts: ["threads.net"], name: "Threads", kind: "social" },
  { hosts: ["nextdoor.com"], name: "Nextdoor", kind: "social" },
  { hosts: ["linktr.ee", "linktree.com"], name: "Linktree", kind: "link_in_bio" },
  { hosts: ["beacons.ai"], name: "Beacons", kind: "link_in_bio" },
  { hosts: ["linkin.bio"], name: "Linkin.bio", kind: "link_in_bio" },
  { hosts: ["yelp.com"], name: "Yelp", kind: "directory" },
  { hosts: ["nailsites.com"], name: "NailSites", kind: "directory" },
  { hosts: ["localsearch.com"], name: "Localsearch", kind: "directory" },
  { hosts: ["doordash.com"], name: "DoorDash", kind: "ordering" },
  { hosts: ["ubereats.com"], name: "Uber Eats", kind: "ordering" },
  { hosts: ["grubhub.com"], name: "Grubhub", kind: "ordering" },
  { hosts: ["postmates.com"], name: "Postmates", kind: "ordering" },
  { hosts: ["seamless.com"], name: "Seamless", kind: "ordering" },
  { hosts: ["slicelife.com"], name: "Slice", kind: "ordering" },
  // ChowNow's own ordering pages only (ordering.chownow.com, direct.chownow.com…);
  // a restaurant's ChowNow-built site on its own domain doesn't match.
  { hosts: ["chownow.com"], name: "ChowNow", kind: "ordering" },
  { hosts: ["opentable.com"], name: "OpenTable", kind: "reservations" },
  { hosts: ["resy.com"], name: "Resy", kind: "reservations" },
  { hosts: ["exploretock.com"], name: "Tock", kind: "reservations" },
  { hosts: ["vagaro.com"], name: "Vagaro", kind: "appointments" },
  { hosts: ["booksy.com"], name: "Booksy", kind: "appointments" },
  { hosts: ["styleseat.com"], name: "StyleSeat", kind: "appointments" },
  { hosts: ["fresha.com"], name: "Fresha", kind: "appointments" },
];

/** The platform a "website" address really is, or null for a real website
 * (or anything unparsable). Pure — no fetch. */
export function platformPage(url: string | null | undefined): { name: string; kind: PlatformKind } | null {
  if (!url || !url.trim()) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
  const def = PLATFORM_PAGES.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return def ? { name: def.name, kind: def.kind } : null;
}

/** Google's "Order online" / "Reservations" / "Appointments" link type for
 * a platform kind (Place Actions API PlaceActionType); null when Google
 * has no such section for it (social, link-in-bio, directory). */
export function placeActionTypeFor(kind: PlatformKind): "FOOD_ORDERING" | "DINING_RESERVATION" | "APPOINTMENT" | null {
  return kind === "ordering" ? "FOOD_ORDERING" : kind === "reservations" ? "DINING_RESERVATION" : kind === "appointments" ? "APPOINTMENT" : null;
}

/** Links checked per site at most (each one plain request). */
export const MAX_SOCIAL_LINK_CHECKS = 8;

const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "yelp.com",
  "pinterest.com",
  "threads.net",
];

/** Where platforms send a logged-out visitor instead of the profile. */
const LOGIN_WALL_PATHS = [/^\/accounts\/login/i, /^\/login/i, /^\/authwall/i, /^\/checkpoint/i, /^\/i\/flow\/login/i, /^\/uas\/login/i, /^\/challenge/i];

function bareHost(host: string): string {
  return host.replace(/^(www|m|l|lm|mobile)\./i, "").toLowerCase();
}

function sameSite(a: string, b: string): boolean {
  const x = bareHost(a);
  const y = bareHost(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

function isSocialHost(host: string): boolean {
  const h = bareHost(host);
  return SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
}

/** Pure: what a finished request means. `finalUrl` null = no response. */
export function classifySocialLink(params: {
  finalUrl: string | null;
  httpStatus: number | null;
  ownSiteUrl: string;
}): SocialLinkCheck["result"] {
  const { finalUrl, httpStatus } = params;
  if (!finalUrl) return "unconfirmed";
  let final: URL;
  let own: URL;
  try {
    final = new URL(finalUrl);
    own = new URL(params.ownSiteUrl);
  } catch {
    return "unconfirmed";
  }
  if (sameSite(final.hostname, own.hostname)) return "own_site";
  if (!isSocialHost(final.hostname)) return "elsewhere";
  if (httpStatus === 404 || httpStatus === 410) return "not_found";
  if (httpStatus !== null && (httpStatus >= 400 || httpStatus === 999)) return "unconfirmed";
  if (LOGIN_WALL_PATHS.some((re) => re.test(final.pathname))) return "unconfirmed";
  return "profile";
}

/** Does this profile count toward Social links? Unchecked ones keep
 * counting as before. */
export function socialProfileCounts(profile: SocialProfile): boolean {
  return !profile.check || profile.check.result === "profile" || profile.check.result === "unconfirmed";
}

/** Network: one plain GET per link (up to MAX_SOCIAL_LINK_CHECKS),
 * redirects followed, body discarded. Profiles beyond the cap, or
 * without a stored address, are returned unchecked. */
export async function checkSocialProfiles(
  profiles: SocialProfile[],
  ownSiteUrl: string,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date()
): Promise<{ profiles: SocialProfile[]; requests: number }> {
  let requests = 0;
  const checked = await Promise.all(
    profiles.map(async (profile, i) => {
      if (i >= MAX_SOCIAL_LINK_CHECKS) return profile;
      const href = profile.href ?? `https://${profile.url}`;
      requests++;
      let finalUrl: string | null = null;
      let httpStatus: number | null = null;
      try {
        const res = await fetchImpl(href, {
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
            Accept: "text/html",
          },
        });
        finalUrl = res.url || href;
        httpStatus = res.status;
        await res.body?.cancel().catch(() => undefined);
      } catch {
        // Blocked, timed out or unreachable — never a failure on its own.
      }
      const result = classifySocialLink({ finalUrl, httpStatus, ownSiteUrl });
      return { ...profile, check: { result, finalUrl, httpStatus, checkedAt: now().toISOString() } };
    })
  );
  return { profiles: checked, requests };
}
