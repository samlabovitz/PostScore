// Day 23 2c-1: our own record of what changed on a business's Google
// listing at each scan ("hours changed", "+3 reviews") — written once, at
// the scan, so "what changed" never needs two saved copies of Google's
// values. Two inputs, best first:
// - both scans' listing values, when they're on hand at the scan (today:
//   the previous scan's saved snapshot) — the same fields as
//   lib/profileChanges.ts's diffProfileSnapshots;
// - otherwise each scan's keyed one-way fingerprints (scores.field_fingerprints):
//   we can tell a field changed (or was added / removed), never what it was.
// A rating or review count records only "changed" (decided Nov 16: never an
// amount we couldn't keep knowing); connected owners' new reviews are
// counted exactly from their own Business Profile reviews.
// Pure; the key and the database live in lib/scanChanges.server.ts.

import { createHmac } from "crypto";
import { GOOGLE_PHOTO_CAP } from "@/lib/googlePhotoCap";
import type { ProfileChange, ProfileSnapshot } from "@/lib/profileChanges";

export type ScanChangeField = ProfileChange["field"];
export type ScanChangeDirection = "up" | "down" | "changed" | "added" | "removed";

export const SCAN_CHANGE_FIELDS: readonly ScanChangeField[] = ["name", "address", "phone", "website", "hours", "categories", "photos", "rating", "reviews", "status"];

export interface ScanChangeRecord {
  field: ScanChangeField;
  direction: ScanChangeDirection;
  /** +3 reviews, -0.1 rating, +2 photos. Null when only the direction is known. */
  delta: number | null;
}

/** One scan's fingerprints: `k` identifies the key (a new key never
 * compares with an old one); `f` maps each field to its fingerprint, or
 * null when the listing had no value. A field left out wasn't known. */
export interface FieldFingerprints {
  k: string;
  f: Partial<Record<ScanChangeField, string | null>>;
}

const NUMERIC: ReadonlySet<ScanChangeField> = new Set<ScanChangeField>(["photos", "rating", "reviews"]);

/** Each field's value in the form compared — the same equality
 * diffProfileSnapshots uses (hours in order, categories as a set, a
 * photo count at Google's cap only "at the cap"). Undefined = unknown. */
function comparable(snapshot: ProfileSnapshot, field: ScanChangeField): string | null | undefined {
  switch (field) {
    case "name":
      return snapshot.name === undefined ? undefined : (snapshot.name ?? "").trim() || null;
    case "address":
      return snapshot.address === undefined ? undefined : (snapshot.address ?? "").trim() || null;
    case "phone":
      return snapshot.phone || null;
    case "website":
      return snapshot.website || null;
    case "hours":
      return snapshot.openingHours ? JSON.stringify(snapshot.openingHours) : null;
    case "categories":
      // As a set: none and an empty list are the same.
      return snapshot.categories?.length ? JSON.stringify(Array.from(new Set(snapshot.categories)).sort()) : null;
    case "photos":
      return snapshot.photoCount === null ? null : snapshot.photoCount >= GOOGLE_PHOTO_CAP ? `${GOOGLE_PHOTO_CAP}+` : String(snapshot.photoCount);
    case "rating":
      return snapshot.rating === null ? null : snapshot.rating.toFixed(1);
    case "reviews":
      return snapshot.reviewCount === null ? null : String(snapshot.reviewCount);
    case "status":
      return snapshot.businessStatus || null;
  }
}

/** A key's id: lets a later scan tell whether two fingerprints are comparable. */
export function fingerprintKeyId(key: Buffer): string {
  return createHmac("sha256", key).update("postscore-scan-fingerprint-key-id").digest("hex").slice(0, 8);
}

/** Keyed one-way fingerprints of a snapshot's fields. The business id is
 * bound in, so the same phone on two businesses never matches. */
export function fingerprintSnapshot(snapshot: ProfileSnapshot, businessId: string, key: Buffer): FieldFingerprints {
  const f: FieldFingerprints["f"] = {};
  for (const field of SCAN_CHANGE_FIELDS) {
    const value = comparable(snapshot, field);
    if (value === undefined) continue;
    f[field] = value === null ? null : createHmac("sha256", key).update(`${businessId}\n${field}\n${value}`).digest("hex").slice(0, 16);
  }
  return { k: fingerprintKeyId(key), f };
}

function exactRecord(field: ScanChangeField, prev: ProfileSnapshot, curr: ProfileSnapshot): ScanChangeRecord | null {
  const a = comparable(prev, field);
  const b = comparable(curr, field);
  if (a === undefined || b === undefined || a === b) return null;
  if (field === "photos") {
    // Both at Google's cap: unknowable (comparable() already made them equal).
    if (a === null || b === null) return null;
    const p = prev.photoCount as number;
    const c = curr.photoCount as number;
    if (p >= GOOGLE_PHOTO_CAP || c >= GOOGLE_PHOTO_CAP) return { field, direction: c >= GOOGLE_PHOTO_CAP ? "up" : "down", delta: null };
    return { field, direction: c > p ? "up" : "down", delta: c - p };
  }
  // A rating or review count: only that it changed, the same as from
  // fingerprints — an amount we can't keep knowing is never recorded (new
  // reviews come exactly from Business Profile, scanChangeRecords).
  // An unknown side is never a change (never treated as zero).
  if (field === "rating" || field === "reviews") return a === null || b === null ? null : { field, direction: "changed", delta: null };
  if (field === "status") return a === null || b === null ? null : { field, direction: "changed", delta: null };
  if (field === "categories") return { field, direction: "changed", delta: null };
  return { field, direction: a === null ? "added" : b === null ? "removed" : "changed", delta: null };
}

function fingerprintRecord(field: ScanChangeField, prev: FieldFingerprints, curr: FieldFingerprints): ScanChangeRecord | null {
  if (!(field in prev.f) || !(field in curr.f)) return null;
  const a = prev.f[field] ?? null;
  const b = curr.f[field] ?? null;
  if (a === b) return null;
  // Same rules as the exact path: an unknown number or status is never a change.
  if (NUMERIC.has(field) || field === "status") return a === null || b === null ? null : { field, direction: "changed", delta: null };
  if (field === "categories") return { field, direction: "changed", delta: null };
  return { field, direction: a === null ? "added" : b === null ? "removed" : "changed", delta: null };
}

/** Connected owners: how many reviews were written after the previous
 * scan, from their own reviews (newest-updated first, read at this scan,
 * never saved). Null when the list was cut off before reaching that date. */
export interface GbpReviewTimes {
  createTimes: string[];
  oldestUpdateTime: string | null;
  capped: boolean;
}

export function newReviewsSince(reviews: GbpReviewTimes, since: string): number | null {
  const t = Date.parse(since);
  if (Number.isNaN(t)) return null;
  // A review written after `since` was also updated after it, so it's on
  // the pages read unless they stopped before reaching `since`.
  if (reviews.capped && (reviews.oldestUpdateTime === null || Date.parse(reviews.oldestUpdateTime) > t)) return null;
  return reviews.createTimes.filter((c) => Date.parse(c) > t).length;
}

export interface ScanSide {
  snapshot?: ProfileSnapshot | null;
  fingerprints?: FieldFingerprints | null;
}

/** What changed between two scans, field by field: from the values when
 * both are on hand, else from the fingerprints when both scans have them
 * under the same key, else nothing (never guessed). `newReviews`
 * (connected owners, newReviewsSince) makes the reviews change exact. */
export function scanChangeRecords(previous: ScanSide | null, current: ScanSide, options: { newReviews?: number | null } = {}): ScanChangeRecord[] {
  if (!previous) return [];
  const fpComparable = !!previous.fingerprints && !!current.fingerprints && previous.fingerprints.k === current.fingerprints.k;
  const out: ScanChangeRecord[] = [];
  for (const field of SCAN_CHANGE_FIELDS) {
    const exact = previous.snapshot && current.snapshot && comparable(previous.snapshot, field) !== undefined && comparable(current.snapshot, field) !== undefined;
    const record = exact
      ? exactRecord(field, previous.snapshot as ProfileSnapshot, current.snapshot as ProfileSnapshot)
      : fpComparable
        ? fingerprintRecord(field, previous.fingerprints as FieldFingerprints, current.fingerprints as FieldFingerprints)
        : null;
    if (field === "reviews" && typeof options.newReviews === "number" && options.newReviews > 0) out.push({ field, direction: "up", delta: options.newReviews });
    else if (record) out.push(record);
  }
  return out;
}

/** A saved fingerprints value, or null when it isn't one. */
export function parseFieldFingerprints(value: unknown): FieldFingerprints | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { k?: unknown; f?: unknown };
  return typeof v.k === "string" && !!v.f && typeof v.f === "object" ? (v as FieldFingerprints) : null;
}
