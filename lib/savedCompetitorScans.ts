// Saved competitor scans (competitor_scans rows) as the Competitors page
// and its tests use them. Pure — no database or network.

import type { ScoreBreakdown } from "@/lib/scoring";

/** One business in a saved competitor scan — the owner's own row
 * (isSubject) or a competitor's. Exactly what was saved; nothing filled
 * in. */
export interface SavedCompetitorEntry {
  placeId: string;
  name: string | null;
  isSubject: boolean;
  address: string | null;
  /** null for the owner's own row. */
  distanceMeters: number | null;
  rating: number | null;
  reviewCount: number | null;
  hasWebsite: boolean | null;
  total: number | null;
  grade: string | null;
  scoringVersion: string | null;
  /** The full saved breakdown (categories + checks), or null if the row
   * has none. */
  breakdown: ScoreBreakdown | null;
  /** Google's price-level enum, or null when Google doesn't list one. */
  priceLevel: string | null;
  photoCount: number | null;
}

export interface SavedCompetitorScan {
  scanId: string;
  createdAt: string;
  /** Every saved row of this scan, highest PostScore first. */
  entries: SavedCompetitorEntry[];
}

/** The owner's rank in one saved scan — for "Compared over time". */
export interface CompetitorRankPoint {
  scanId: string;
  createdAt: string;
  /** 1 = highest score; null if the owner's own row is missing. */
  rank: number | null;
  of: number;
  total: number | null;
}

/** Every competitor_scans column SavedScanRow needs. */
export const SAVED_SCAN_COLUMNS =
  "scan_id, created_at, is_subject, place_id, name, address, distance_meters, rating, review_count, has_website, total, grade, scoring_version, breakdown_json, price_level, photo_count";

export interface SavedScanRow {
  scan_id: string;
  created_at: string;
  is_subject: boolean;
  place_id: string;
  name: string | null;
  address: string | null;
  distance_meters: number | string | null;
  rating: number | string | null;
  review_count: number | null;
  has_website: boolean | null;
  total: number | null;
  grade: string | null;
  scoring_version: string | null;
  breakdown_json: unknown;
  price_level: string | null;
  photo_count: number | null;
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseBreakdown(value: unknown): ScoreBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ScoreBreakdown>;
  return Array.isArray(v.checks) && Array.isArray(v.categories) ? (value as ScoreBreakdown) : null;
}

function toEntry(row: SavedScanRow): SavedCompetitorEntry {
  return {
    placeId: row.place_id,
    name: row.name,
    isSubject: row.is_subject,
    address: row.address,
    distanceMeters: row.is_subject ? null : toNumber(row.distance_meters),
    rating: toNumber(row.rating),
    reviewCount: row.review_count,
    hasWebsite: row.has_website,
    total: row.total,
    grade: row.grade,
    scoringVersion: row.scoring_version,
    breakdown: parseBreakdown(row.breakdown_json),
    priceLevel: row.price_level,
    photoCount: row.photo_count,
  };
}

/** Groups saved rows (any order) into scans, newest scan first, each
 * scan's entries highest score first. Exported for tests. */
export function groupSavedScans(rows: SavedScanRow[]): SavedCompetitorScan[] {
  const byScan = new Map<string, SavedCompetitorScan>();
  for (const row of rows) {
    const scan = byScan.get(row.scan_id) ?? { scanId: row.scan_id, createdAt: row.created_at, entries: [] };
    scan.entries.push(toEntry(row));
    if (row.created_at > scan.createdAt) scan.createdAt = row.created_at;
    byScan.set(row.scan_id, scan);
  }
  const scans = Array.from(byScan.values());
  for (const scan of scans) scan.entries.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  return scans.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function rankPoint(scan: SavedCompetitorScan): CompetitorRankPoint {
  const index = scan.entries.findIndex((e) => e.isSubject);
  return {
    scanId: scan.scanId,
    createdAt: scan.createdAt,
    rank: index >= 0 ? index + 1 : null,
    of: scan.entries.length,
    total: index >= 0 ? scan.entries[index].total : null,
  };
}

