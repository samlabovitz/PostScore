// "What changed since your last scan" — a plain-language diff of a
// business's real Google listing fields (hours, phone, website,
// categories, photo count, rating, review count, status) between two
// saved scans. Distinct from lib/actionPlan.ts's check-by-check score
// diff: this reports real-world listing changes in their own terms
// ("your hours changed," "3 new reviews"), not point deltas. Pure and
// deterministic — every description here is derived directly from two
// real snapshots, never inferred, estimated, or invented. A field is
// only ever compared when both sides have a real, known value (or one
// side is a clean null->value / value->null transition worth naming);
// an unknown baseline never gets treated as zero or guessed at.
//
// Every description is sourced from lib/i18n's message dictionary via
// t()/tPlural(), keyed under "content.listingChange.<field>.*" — shared
// with the monthly report email, same as lib/scoring.ts's CHECKS.
// `locale` defaults to DEFAULT_LOCALE, so every existing caller that
// doesn't pass one keeps getting the exact same English text this file
// used to hardcode.

import { DEFAULT_LOCALE, t, tPlural, type Locale } from "@/lib/i18n";
import { GOOGLE_PHOTO_CAP } from "@/lib/googlePhotoCap";

export interface ProfileSnapshot {
  phone: string | null;
  website: string | null;
  openingHours: string[] | null;
  categories: string[] | null;
  photoCount: number | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
}

/** Builds a snapshot from whatever real Google-derived fields a caller
 * has on hand — the current `businesses` row, or a freshly-fetched
 * PlaceDetails mapped to the same field names. Never invents a value:
 * whatever's null on the source stays null here. */
export function buildProfileSnapshot(business: {
  phone: string | null;
  website: string | null;
  opening_hours: string[] | null;
  categories: string[] | null;
  photo_count: number | null;
  rating: number | null;
  review_count: number | null;
  business_status: string | null;
}): ProfileSnapshot {
  return {
    phone: business.phone,
    website: business.website,
    openingHours: business.opening_hours,
    categories: business.categories,
    photoCount: business.photo_count,
    rating: business.rating,
    reviewCount: business.review_count,
    businessStatus: business.business_status,
  };
}

export interface ProfileChange {
  field: "phone" | "website" | "hours" | "categories" | "photos" | "rating" | "reviews" | "status";
  /** A single, honest, plain-language sentence — e.g. "Your hours changed." */
  description: string;
}

function sameStringArray(a: string[] | null, b: string[] | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function businessStatusLabel(status: string, locale: Locale): string {
  if (status === "OPERATIONAL") return t(locale, "content.listingChange.status.operational");
  if (status === "CLOSED_TEMPORARILY") return t(locale, "content.listingChange.status.closedTemporarily");
  if (status === "CLOSED_PERMANENTLY") return t(locale, "content.listingChange.status.closedPermanently");
  return status;
}

/**
 * Compares two real saved profile snapshots and returns every genuine
 * difference, in plain language. Order is not significant — callers
 * render the full list. Returns an empty array when nothing real
 * changed, which callers must show honestly (never as an error or as
 * "no data"). `locale` defaults to DEFAULT_LOCALE, same reasoning as
 * lib/scoring.ts's scoreBusiness().
 */
export function diffProfileSnapshots(
  previous: ProfileSnapshot,
  current: ProfileSnapshot,
  locale: Locale = DEFAULT_LOCALE
): ProfileChange[] {
  const changes: ProfileChange[] = [];

  if (previous.phone !== current.phone) {
    if (!previous.phone && current.phone) {
      changes.push({ field: "phone", description: t(locale, "content.listingChange.phone.added") });
    } else if (previous.phone && !current.phone) {
      changes.push({ field: "phone", description: t(locale, "content.listingChange.phone.removed") });
    } else {
      changes.push({ field: "phone", description: t(locale, "content.listingChange.phone.changed") });
    }
  }

  if (previous.website !== current.website) {
    if (!previous.website && current.website) {
      changes.push({ field: "website", description: t(locale, "content.listingChange.website.added") });
    } else if (previous.website && !current.website) {
      changes.push({ field: "website", description: t(locale, "content.listingChange.website.removed") });
    } else {
      changes.push({ field: "website", description: t(locale, "content.listingChange.website.changed") });
    }
  }

  if (!sameStringArray(previous.openingHours, current.openingHours)) {
    if (!previous.openingHours && current.openingHours) {
      changes.push({ field: "hours", description: t(locale, "content.listingChange.hours.added") });
    } else if (previous.openingHours && !current.openingHours) {
      changes.push({ field: "hours", description: t(locale, "content.listingChange.hours.removed") });
    } else {
      changes.push({ field: "hours", description: t(locale, "content.listingChange.hours.changed") });
    }
  }

  const prevCats = new Set(previous.categories ?? []);
  const currCats = new Set(current.categories ?? []);
  const addedCats = Array.from(currCats).filter((c) => !prevCats.has(c));
  const removedCats = Array.from(prevCats).filter((c) => !currCats.has(c));
  if (addedCats.length > 0 || removedCats.length > 0) {
    const parts: string[] = [];
    if (addedCats.length > 0) {
      parts.push(t(locale, "content.listingChange.categories.addedPart", { list: addedCats.join(", ") }));
    }
    if (removedCats.length > 0) {
      parts.push(t(locale, "content.listingChange.categories.removedPart", { list: removedCats.join(", ") }));
    }
    changes.push({
      field: "categories",
      description: t(locale, "content.listingChange.categories.changed", { parts: parts.join("; ") }),
    });
  }

  if (
    previous.photoCount !== null &&
    current.photoCount !== null &&
    previous.photoCount !== current.photoCount
  ) {
    // Google's own Place Details `photos` field never returns more than
    // GOOGLE_PHOTO_CAP entries — a reading at or above that cap is a
    // lower bound, not the real total. An exact delta is only ever
    // honest when NEITHER side is capped; once either is, the real
    // magnitude (and, with both capped, even the real DIRECTION) is
    // genuinely unknowable, never a fact this feed can state.
    const prevAtCap = previous.photoCount >= GOOGLE_PHOTO_CAP;
    const currAtCap = current.photoCount >= GOOGLE_PHOTO_CAP;
    if (prevAtCap && currAtCap) {
      // Both readings are capped lower bounds — whether anything real
      // changed between them can't be known, so this is omitted
      // entirely rather than silently implying "no change" as if that
      // were a real, confirmed fact.
    } else if (!prevAtCap && currAtCap) {
      changes.push({
        field: "photos",
        description: t(locale, "content.listingChange.photos.crossedCapUp", { cap: GOOGLE_PHOTO_CAP }),
      });
    } else if (prevAtCap && !currAtCap) {
      changes.push({
        field: "photos",
        description: t(locale, "content.listingChange.photos.crossedCapDown", { cap: GOOGLE_PHOTO_CAP }),
      });
    } else {
      const delta = current.photoCount - previous.photoCount;
      changes.push({
        field: "photos",
        description:
          delta > 0
            ? tPlural(locale, "content.listingChange.photos.added", delta)
            : tPlural(locale, "content.listingChange.photos.removed", Math.abs(delta)),
      });
    }
  }

  if (previous.rating !== null && current.rating !== null && previous.rating !== current.rating) {
    changes.push({
      field: "rating",
      description: t(locale, current.rating > previous.rating ? "content.listingChange.rating.rose" : "content.listingChange.rating.dropped", {
        previous: previous.rating.toFixed(1),
        current: current.rating.toFixed(1),
      }),
    });
  }

  if (
    previous.reviewCount !== null &&
    current.reviewCount !== null &&
    previous.reviewCount !== current.reviewCount
  ) {
    const delta = current.reviewCount - previous.reviewCount;
    changes.push({
      field: "reviews",
      description:
        delta > 0
          ? tPlural(locale, "content.listingChange.reviews.gained", delta)
          : t(locale, "content.listingChange.reviews.lost", { count: Math.abs(delta) }),
    });
  }

  if (
    previous.businessStatus !== null &&
    current.businessStatus !== null &&
    previous.businessStatus !== current.businessStatus
  ) {
    changes.push({
      field: "status",
      description: t(locale, "content.listingChange.status.changed", {
        previous: businessStatusLabel(previous.businessStatus, locale),
        current: businessStatusLabel(current.businessStatus, locale),
      }),
    });
  }

  return changes;
}
