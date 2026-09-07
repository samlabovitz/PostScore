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

function businessStatusLabel(status: string): string {
  if (status === "OPERATIONAL") return "Operational";
  if (status === "CLOSED_TEMPORARILY") return "Temporarily closed";
  if (status === "CLOSED_PERMANENTLY") return "Permanently closed";
  return status;
}

/**
 * Compares two real saved profile snapshots and returns every genuine
 * difference, in plain language. Order is not significant — callers
 * render the full list. Returns an empty array when nothing real
 * changed, which callers must show honestly (never as an error or as
 * "no data").
 */
export function diffProfileSnapshots(
  previous: ProfileSnapshot,
  current: ProfileSnapshot
): ProfileChange[] {
  const changes: ProfileChange[] = [];

  if (previous.phone !== current.phone) {
    if (!previous.phone && current.phone) {
      changes.push({ field: "phone", description: "A phone number was added to your listing." });
    } else if (previous.phone && !current.phone) {
      changes.push({ field: "phone", description: "The phone number was removed from your listing." });
    } else {
      changes.push({ field: "phone", description: "Your phone number changed." });
    }
  }

  if (previous.website !== current.website) {
    if (!previous.website && current.website) {
      changes.push({ field: "website", description: "A website was added to your listing." });
    } else if (previous.website && !current.website) {
      changes.push({ field: "website", description: "The website was removed from your listing." });
    } else {
      changes.push({ field: "website", description: "Your website URL changed." });
    }
  }

  if (!sameStringArray(previous.openingHours, current.openingHours)) {
    if (!previous.openingHours && current.openingHours) {
      changes.push({ field: "hours", description: "Hours were added to your listing." });
    } else if (previous.openingHours && !current.openingHours) {
      changes.push({ field: "hours", description: "Hours were removed from your listing." });
    } else {
      changes.push({ field: "hours", description: "Your hours changed." });
    }
  }

  const prevCats = new Set(previous.categories ?? []);
  const currCats = new Set(current.categories ?? []);
  const addedCats = Array.from(currCats).filter((c) => !prevCats.has(c));
  const removedCats = Array.from(prevCats).filter((c) => !currCats.has(c));
  if (addedCats.length > 0 || removedCats.length > 0) {
    const parts: string[] = [];
    if (addedCats.length > 0) parts.push(`added ${addedCats.join(", ")}`);
    if (removedCats.length > 0) parts.push(`removed ${removedCats.join(", ")}`);
    changes.push({ field: "categories", description: `Your categories changed — ${parts.join("; ")}.` });
  }

  if (
    previous.photoCount !== null &&
    current.photoCount !== null &&
    previous.photoCount !== current.photoCount
  ) {
    const delta = current.photoCount - previous.photoCount;
    changes.push({
      field: "photos",
      description:
        delta > 0
          ? `${delta} photo${delta === 1 ? "" : "s"} added.`
          : Math.abs(delta) === 1
            ? "A photo was removed."
            : `${Math.abs(delta)} photos were removed.`,
    });
  }

  if (previous.rating !== null && current.rating !== null && previous.rating !== current.rating) {
    changes.push({
      field: "rating",
      description: `Your rating ${current.rating > previous.rating ? "rose" : "dropped"} from ${previous.rating.toFixed(1)}★ to ${current.rating.toFixed(1)}★.`,
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
          ? `${delta} new review${delta === 1 ? "" : "s"}.`
          : `Your review count dropped by ${Math.abs(delta)}.`,
    });
  }

  if (
    previous.businessStatus !== null &&
    current.businessStatus !== null &&
    previous.businessStatus !== current.businessStatus
  ) {
    changes.push({
      field: "status",
      description: `Your listing status changed from ${businessStatusLabel(previous.businessStatus)} to ${businessStatusLabel(current.businessStatus)}.`,
    });
  }

  return changes;
}
