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

export function newReviewsSince(reviews: GbpReviewTimes, since: string, until?: string): number | null {
  const t = Date.parse(since);
  const u = until === undefined ? Infinity : Date.parse(until);
  if (Number.isNaN(t) || Number.isNaN(u)) return null;
  // A review written after `since` was also updated after it, so it's on
  // the pages read unless they stopped before reaching `since`.
  if (reviews.capped && (reviews.oldestUpdateTime === null || Date.parse(reviews.oldestUpdateTime) > t)) return null;
  return reviews.createTimes.filter((c) => Date.parse(c) > t && Date.parse(c) <= u).length;
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

/** A saved fingerprints value's key id, or null. */
export function fingerprintKeyOf(value: unknown): string | null {
  return parseFieldFingerprints(value)?.k ?? null;
}

/** One saved scan, as the change readers need it. */
export interface ScanRef {
  id: string;
  /** Its fingerprints' key id (scores.field_fingerprints->>k), or null. */
  fpKey: string | null;
}

/** What changed across a run of scans, oldest first: `available` only when
 * every one of them was fingerprinted under the same key (so each change
 * between them was recorded) — otherwise honestly unknown, never "nothing
 * changed". */
export interface ScanChangeSummary {
  available: boolean;
  records: ScanChangeRecord[];
}

const NOT_AVAILABLE: ScanChangeSummary = { available: false, records: [] };

/** Several scans' records for one field, as one change: amounts add up
 * when every one is known; otherwise it's simply "changed". */
function combine(field: ScanChangeField, records: ScanChangeRecord[]): ScanChangeRecord | null {
  if (records.length === 1) return records[0];
  if (records.every((r) => r.delta !== null) && (field === "reviews" || field === "photos")) {
    const total = records.reduce((sum, r) => sum + (r.delta as number), 0);
    return total === 0 ? { field, direction: "changed", delta: null } : { field, direction: total > 0 ? "up" : "down", delta: total };
  }
  if (records.every((r) => r.direction === records[0].direction) && (records[0].direction === "up" || records[0].direction === "down")) return { field, direction: records[0].direction, delta: null };
  return { field, direction: "changed", delta: null };
}

export function changesAcross(scans: ScanRef[], recordsByScore: Map<string, ScanChangeRecord[]> | null): ScanChangeSummary {
  if (scans.length < 2 || !recordsByScore) return NOT_AVAILABLE;
  const key = scans[0].fpKey;
  if (!key || scans.some((s) => s.fpKey !== key)) return NOT_AVAILABLE;
  const byField = new Map<ScanChangeField, ScanChangeRecord[]>();
  for (const s of scans.slice(1)) for (const r of recordsByScore.get(s.id) ?? []) byField.set(r.field, [...(byField.get(r.field) ?? []), r]);
  const records = SCAN_CHANGE_FIELDS.map((f) => (byField.has(f) ? combine(f, byField.get(f)!) : null)).filter((r): r is ScanChangeRecord => r !== null);
  return { available: true, records };
}

/** The scans from `from` to `to` (inclusive), out of a business's scans in
 * any order. */
export function scansBetween<T extends ScanRef & { createdAt: string }>(scans: T[], from: T, to: T): T[] {
  const a = Date.parse(from.createdAt);
  const b = Date.parse(to.createdAt);
  return scans.filter((s) => s.id === from.id || s.id === to.id || (Date.parse(s.createdAt) > a && Date.parse(s.createdAt) < b)).sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
}

/** The review count across a summary: an exact number of new reviews
 * (Business Profile), "changed" with no amount, 0 when it was compared and
 * didn't move — or null when it couldn't be compared. */
export type ReviewCountChange = { kind: "exact"; delta: number } | { kind: "changed" } | { kind: "none" } | null;

export function reviewCountChangeOf(summary: ScanChangeSummary): ReviewCountChange {
  if (!summary.available) return null;
  const r = summary.records.find((x) => x.field === "reviews");
  if (!r) return { kind: "none" };
  return r.delta !== null ? { kind: "exact", delta: r.delta } : { kind: "changed" };
}

/** Whether the rating changed (never by how much); null when not compared. */
export function ratingChangedOf(summary: ScanChangeSummary): boolean | null {
  return summary.available ? summary.records.some((x) => x.field === "rating") : null;
}
