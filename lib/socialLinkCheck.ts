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
