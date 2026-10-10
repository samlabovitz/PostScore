// Pure decision logic for the real "Google's listing lookup came back
// with no website" case — see app/actions/scoring.ts's
// rescanBusinessWithClient for the real orchestration (the actual
// lookupBusinessByPlaceId call + one retry) that calls into this, and
// supabase/schema.sql's google_listing_missing_website_since /
// google_listing_website_removed_since column docs for the real
// Endless Nails case this fixes: a single empty response from Google
// was previously trusted immediately, silently wiping out a real,
// working, already-stored website and crashing that business's score
// to zero.
//
// Two real levels of confidence, never conflated:
//   - SUSPECTED (google_listing_missing_website_since): the first time
//     one scan's real lookup + one real retry both come back empty —
//     the stored website is still KEPT for scoring, since one scan is
//     not enough evidence the listing actually lost its website.
//   - CONFIRMED (google_listing_website_removed_since): a SECOND,
//     separate scan (on a LATER occasion — the flag was already set
//     from an earlier scan) also comes back empty on both attempts.
//     Two independent real checks agreeing is real evidence — at that
//     point the stored website is cleared and scored as genuinely
//     missing from the listing.
//
// Kept here, not inline in app/actions/scoring.ts, because that file's
// "use server" directive requires every export to be an async server
// action — a plain, synchronous, fully unit-testable decision function
// like this one can't live there.

export interface ResolvedListingWebsite {
  /** The real website to use for THIS scan's save + scoring. */
  website: string | null;
  /** The real value to store in google_listing_missing_website_since —
   * null clears any previous flag (Google's listing has a website
   * again, there's nothing stored to protect, or the gap has already
   * been promoted to CONFIRMED below); a real ISO date means this is
   * the first scan to suspect a gap. */
  googleListingMissingWebsiteSince: string | null;
  /** The real value to store in google_listing_website_removed_since —
   * null clears it (a real website was found again, or nothing has
   * ever been confirmed missing); a real ISO date — the ORIGINAL
   * google_listing_missing_website_since value, not "now" — means a
   * previously-SUSPECTED gap is now CONFIRMED, or (on every further
   * scan that still finds nothing) carries that same confirmed date
   * forward unchanged. */
  googleListingWebsiteRemovedSince: string | null;
}

/**
 * `firstLookupWebsite`/`retryLookupWebsite` are both real, fresh Google
 * Places Details results — never a cached/stored value. Pass
 * `retryLookupWebsite` as `undefined` when the retry was never attempted
 * (because the first lookup already had a website, or because there was
 * nothing stored worth protecting in the first place — see the two
 * early returns below).
 */
export function resolveListingWebsite(
  storedWebsite: string | null,
  firstLookupWebsite: string | null,
  retryLookupWebsite: string | null | undefined,
  existingMissingSince: string | null,
  existingRemovedSince: string | null,
  now: string
): ResolvedListingWebsite {
  if (firstLookupWebsite) {
    return { website: firstLookupWebsite, googleListingMissingWebsiteSince: null, googleListingWebsiteRemovedSince: null };
  }
  if (retryLookupWebsite) {
    return { website: retryLookupWebsite, googleListingMissingWebsiteSince: null, googleListingWebsiteRemovedSince: null };
  }
  // Both real attempts this scan came back empty.
  if (!storedWebsite) {
    // Nothing currently on file to protect — but if an earlier scan
    // already CONFIRMED this listing's website is gone, that confirmed
    // fact still holds (still nothing found) and must be carried
    // forward, not silently cleared just because there's no stored
    // website left to protect.
    return { website: null, googleListingMissingWebsiteSince: null, googleListingWebsiteRemovedSince: existingRemovedSince };
  }
  if (existingMissingSince) {
    // A gap was already SUSPECTED from an earlier scan, and this
    // separate, later scan also found nothing — two independent real
    // checks agreeing is real evidence. Promote to CONFIRMED: clear
    // the stored website and the suspected-flag, keep the ORIGINAL
    // suspected date for the honest "it last showed one on {date}" line.
    return { website: null, googleListingMissingWebsiteSince: null, googleListingWebsiteRemovedSince: existingMissingSince };
  }
  // First time suspected — keep the stored website for scoring rather
  // than silently zeroing it out on a single empty response.
  return { website: storedWebsite, googleListingMissingWebsiteSince: now, googleListingWebsiteRemovedSince: null };
}

/** One real `scores` row's own real history facts — the ONLY things
 * findLastKnownWebsiteDate needs. `website` is that scan's saved
 * `profile_snapshot_json.website`; `createdAt` is that row's real
 * `created_at`. */
export interface WebsiteHistorySnapshot {
  website: string | null;
  createdAt: string;
}

/**
 * Finds the real date Google last actually returned a website for
 * this business — used for the honest "it last showed one on {date}"
 * line, which must NEVER use `google_listing_website_removed_since`
 * itself (that's merely when THIS gap was first suspected/confirmed,
 * not when a real website was last seen — the real bug this fixes,
 * caught on the real Endless Nails case: a MANUAL one-off restore's
 * own timestamp ended up in that field and then in the banner, instead
 * of the real Oct 6 scan that actually had the website).
 *
 * Only ever called at the exact moment a SUSPECTED gap is promoted to
 * CONFIRMED (see resolveListingWebsite's own `existingMissingSince`
 * branch) — `suspectedSince` is that same original suspected-since
 * date. Real snapshots recorded strictly BEFORE that date are
 * guaranteed untouched by the suspected-gap's own "keep the stored
 * website for one scan" logic (that logic only ever activates once
 * suspicion starts), so any real website found among them is honestly
 * Google's own, never a kept/carried-forward value. Returns the most
 * recent such date, or null when none exists — callers must then drop
 * the date from the sentence entirely rather than guess (see
 * dashboard.website.googleListingWebsiteRemovedUnknownDate).
 */
export function findLastKnownWebsiteDate(
  history: WebsiteHistorySnapshot[],
  suspectedSince: string
): string | null {
  const cutoff = new Date(suspectedSince).getTime();
  const real = history.filter((h) => h.website && h.website.trim().length > 0 && new Date(h.createdAt).getTime() < cutoff);
  if (real.length === 0) return null;
  real.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return real[0].createdAt;
}
