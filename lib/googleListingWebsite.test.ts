import { describe, expect, test } from "vitest";
import { findLastKnownWebsiteDate, resolveListingWebsite } from "./googleListingWebsite";

// The real Endless Nails case this fixes: a real re-scan's fresh Google
// Places Details lookup came back with no website, while the business
// already had a real, working one on file — and the old code trusted
// that single empty response immediately, wiping the stored website and
// crashing the business's score to zero. Two real confidence levels:
// SUSPECTED (one scan, both attempts empty — website still kept) vs
// CONFIRMED (a SEPARATE, later scan also comes back empty — website
// really is cleared and scored as missing).
describe("resolveListingWebsite", () => {
  const NOW = "2026-10-08T00:00:00.000Z";

  test("a real website on the first lookup always wins, clearing every flag", () => {
    const result = resolveListingWebsite(
      "https://old.example.com",
      "https://fresh.example.com",
      undefined,
      "2026-09-01T00:00:00.000Z",
      null,
      NOW
    );
    expect(result).toEqual({
      website: "https://fresh.example.com",
      googleListingMissingWebsiteSince: null,
      googleListingWebsiteRemovedSince: null,
    });
  });

  test("a real website on the RETRY also wins, clearing every flag", () => {
    const result = resolveListingWebsite(
      "https://old.example.com",
      null,
      "https://old.example.com",
      "2026-09-01T00:00:00.000Z",
      null,
      NOW
    );
    expect(result).toEqual({
      website: "https://old.example.com",
      googleListingMissingWebsiteSince: null,
      googleListingWebsiteRemovedSince: null,
    });
  });

  test("nothing stored and nothing fresh: genuinely no website, no flags — there was never anything to protect", () => {
    const result = resolveListingWebsite(null, null, undefined, null, null, NOW);
    expect(result).toEqual({ website: null, googleListingMissingWebsiteSince: null, googleListingWebsiteRemovedSince: null });
  });

  test("SUSPECTED: first time both attempts come back empty, with a real website on file — keep it, flag it as suspected (not confirmed)", () => {
    const result = resolveListingWebsite("https://endless-nails-newark.nailsites.com/", null, null, null, null, NOW);
    expect(result).toEqual({
      website: "https://endless-nails-newark.nailsites.com/",
      googleListingMissingWebsiteSince: NOW,
      googleListingWebsiteRemovedSince: null,
    });
  });

  test("SUSPECTED stays SUSPECTED only within the SAME scan — the real-world caller never calls this twice in one scan, so this reflects a single decision, not a loop", () => {
    // existingMissingSince is null here because this models the FIRST
    // scan's own decision — see the CONFIRMED tests below for what
    // happens on a SEPARATE, later scan where it's already set.
    const result = resolveListingWebsite("https://stored.example.com", null, null, null, null, NOW);
    expect(result.googleListingMissingWebsiteSince).toBe(NOW);
    expect(result.website).toBe("https://stored.example.com");
  });

  test("CONFIRMED: the real Endless Nails case — a LATER, separate scan also finds nothing, and a gap was already SUSPECTED — website is cleared, suspected flag cleared, confirmed flag set to the ORIGINAL suspected date", () => {
    const originalSuspectedDate = "2026-10-07T07:16:43.000Z";
    const result = resolveListingWebsite(
      "https://endless-nails-newark.nailsites.com/",
      null,
      null,
      originalSuspectedDate,
      null,
      NOW
    );
    expect(result).toEqual({
      website: null,
      googleListingMissingWebsiteSince: null,
      googleListingWebsiteRemovedSince: originalSuspectedDate, // NOT `now` — the original date it was first suspected
    });
  });

  test("CONFIRMED carries forward on every further scan that still finds nothing — the honest banner doesn't disappear after one re-scan", () => {
    const confirmedDate = "2026-10-07T07:16:43.000Z";
    // storedWebsite is null here because a PRIOR scan already cleared
    // it on confirmation — this models that NEXT scan.
    const result = resolveListingWebsite(null, null, undefined, null, confirmedDate, NOW);
    expect(result).toEqual({ website: null, googleListingMissingWebsiteSince: null, googleListingWebsiteRemovedSince: confirmedDate });
  });

  test("a business that's never had either flag and still has no website: everything stays null", () => {
    const result = resolveListingWebsite(null, null, undefined, null, null, NOW);
    expect(result.website).toBeNull();
    expect(result.googleListingMissingWebsiteSince).toBeNull();
    expect(result.googleListingWebsiteRemovedSince).toBeNull();
  });

  test("a real website found again AFTER a CONFIRMED removal clears the confirmed flag too, not just the suspected one", () => {
    const result = resolveListingWebsite(null, "https://back-online.example.com", undefined, null, "2026-10-07T07:16:43.000Z", NOW);
    expect(result).toEqual({
      website: "https://back-online.example.com",
      googleListingMissingWebsiteSince: null,
      googleListingWebsiteRemovedSince: null,
    });
  });

  test("an empty string stored website is treated the same as null — nothing real to protect, any existing confirmed flag still carries forward", () => {
    const result = resolveListingWebsite("", null, undefined, null, "2026-10-07T07:16:43.000Z", NOW);
    expect(result).toEqual({ website: null, googleListingMissingWebsiteSince: null, googleListingWebsiteRemovedSince: "2026-10-07T07:16:43.000Z" });
  });
});

describe("findLastKnownWebsiteDate — the real Endless Nails history (never the flag's own date)", () => {
  // The REAL `scores` history for Endless Nails (read directly from
  // the database for this fix): a real website on Oct 6 (score 94),
  // then the original bug wiped it on Oct 7 (two scans, both empty),
  // then a MANUAL one-off restore on Oct 9 set google_listing_missing_website_since
  // directly (not a real Google confirmation) and kept the website for
  // that one scan, before the NEXT scan promoted it to CONFIRMED.
  const ENDLESS_NAILS_HISTORY = [
    { website: "https://endless-nails-newark.nailsites.com/?utm_source=google&utm_medium=maps", createdAt: "2026-10-06T21:51:04.879607+00:00" },
    { website: null, createdAt: "2026-10-07T07:16:43.072558+00:00" },
    { website: null, createdAt: "2026-10-07T17:36:50.196504+00:00" },
    { website: "https://endless-nails-newark.nailsites.com/?utm_source=google&utm_medium=maps", createdAt: "2026-10-09T08:03:35.064631+00:00" },
  ];
  const SUSPECTED_SINCE = "2026-10-09T08:02:52.559Z"; // the manual restore's own timestamp — NOT a real Google confirmation

  test("real case: finds Oct 6 (the 94-score snapshot), correctly excluding the Oct 9 manually-kept snapshot", () => {
    const date = findLastKnownWebsiteDate(ENDLESS_NAILS_HISTORY, SUSPECTED_SINCE);
    expect(date).toBe("2026-10-06T21:51:04.879607+00:00");
  });

  test("date KNOWN: a real website snapshot exists strictly before the suspected-since cutoff", () => {
    const history = [
      { website: "https://example.com", createdAt: "2026-01-01T00:00:00.000Z" },
      { website: null, createdAt: "2026-02-01T00:00:00.000Z" },
    ];
    expect(findLastKnownWebsiteDate(history, "2026-02-01T00:00:00.000Z")).toBe("2026-01-01T00:00:00.000Z");
  });

  test("date UNKNOWN: no history at all returns null, never a guess", () => {
    expect(findLastKnownWebsiteDate([], "2026-02-01T00:00:00.000Z")).toBeNull();
  });

  test("date UNKNOWN: history exists but no real website ever appears before the cutoff", () => {
    const history = [
      { website: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { website: null, createdAt: "2026-01-15T00:00:00.000Z" },
    ];
    expect(findLastKnownWebsiteDate(history, "2026-02-01T00:00:00.000Z")).toBeNull();
  });

  test("date UNKNOWN: a real website exists, but only AT OR AFTER the cutoff — never counted (that's exactly the kept/manual-restore case, not a real confirmation)", () => {
    const history = [{ website: "https://example.com", createdAt: "2026-02-01T00:00:00.000Z" }];
    expect(findLastKnownWebsiteDate(history, "2026-02-01T00:00:00.000Z")).toBeNull();
  });

  test("picks the MOST RECENT qualifying snapshot when multiple real-website snapshots exist before the cutoff", () => {
    const history = [
      { website: "https://example.com", createdAt: "2026-01-01T00:00:00.000Z" },
      { website: "https://example.com", createdAt: "2026-01-20T00:00:00.000Z" },
      { website: null, createdAt: "2026-02-01T00:00:00.000Z" },
    ];
    expect(findLastKnownWebsiteDate(history, "2026-02-01T00:00:00.000Z")).toBe("2026-01-20T00:00:00.000Z");
  });

  test("an empty-string website in history never counts as a real one", () => {
    const history = [{ website: "", createdAt: "2026-01-01T00:00:00.000Z" }];
    expect(findLastKnownWebsiteDate(history, "2026-02-01T00:00:00.000Z")).toBeNull();
  });
});
