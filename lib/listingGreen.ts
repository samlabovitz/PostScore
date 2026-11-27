// "Get your Google listing to all green": one goal across Fix plan, the Overview and the Google listing page — the
// same rows, the same count, the same to-do list. A row is green when its status is ✓; a row Google is still
// reviewing (a change PostScore sent) is neither green nor to-do until Google decides; a row that couldn't be read
// isn't counted. Each to-do shows "+N pts" when a score check is behind it (from the saved scan, lib/googleProfileTab.ts
// rowPoints), else "helps customers · no points" — those never change the score's projection. Not in the goal: the
// Reviews row (Fix plan's own "Reply to your recent reviews") and Google posts (a Growth habit). Pure.

import { ROW_CHECK, rowPoints, type ListingChangeKind, type ListingGroup, type MadeChange } from "@/lib/googleProfileTab";
import type { CheckResult } from "@/lib/scoring";

/** Listing rows that belong to another plan row: never in the green count. */
export const NOT_IN_GREEN = new Set(["reviews", "posts"]);

/** A change PostScore sent, by the listing row it changes. */
const KIND_ROW: Record<ListingChangeKind, string> = {
  hours: "hours",
  phone: "phone",
  description: "description",
  website_link: "website",
  customer_details: "customerDetails",
  booking_link: "booking",
  holiday_hours: "holiday",
  services: "services",
  photos: "photos",
};

export interface GreenTodo {
  rowId: string;
  /** "+N pts" from the saved scan; 0 when no score check is behind the row. */
  points: number;
  scored: boolean;
}

export interface ListingGreen {
  green: number;
  total: number;
  /** The page's dots: ✓ OK (= green), ! to improve, ✕ to fix — reviewing rows in none of them. */
  ok: number;
  improve: number;
  fix: number;
  todo: GreenTodo[];
  /** Rows with a change Google is still reviewing: not to-do until Google decides. */
  reviewing: string[];
  /** The score points the to-do rows are worth (scored rows only). */
  points: number;
  allGreen: boolean;
}

/** The rows a change PostScore sent is still waiting on Google for (status "reviewing"). */
export function reviewingRows(made: Array<Pick<MadeChange, "kind" | "status">> | null | undefined): string[] {
  return Array.from(new Set((made ?? []).filter((m) => m.status === "reviewing").map((m) => KIND_ROW[m.kind]).filter(Boolean)));
}

export function listingGreen(groups: ListingGroup[], checks: CheckResult[], opts: { reviewing?: string[] } = {}): ListingGreen {
  const reviewing = new Set(opts.reviewing ?? []);
  const rows = groups.flatMap((g) => g.rows).filter((r) => !NOT_IN_GREEN.has(r.id) && (r.status === "ok" || r.status === "warn" || r.status === "bad"));
  // Still with Google (even when the listing already shows the new value): neither green nor to-do.
  const waiting = rows.filter((r) => reviewing.has(r.id)).map((r) => r.id);
  const counted = rows.filter((r) => !waiting.includes(r.id));
  const todo = counted
    .filter((r) => r.status !== "ok")
    .map((r) => ({ rowId: r.id, points: rowPoints(r.id, checks), scored: !!ROW_CHECK[r.id] && rowPoints(r.id, checks) > 0 }))
    // The points first (biggest), then the rest in the page's order.
    .sort((a, b) => b.points - a.points);
  const green = counted.length - todo.length;
  const points = Math.round(todo.reduce((n, t) => n + t.points, 0) * 10) / 10;
  const improve = counted.filter((r) => r.status === "warn").length;
  return { green, total: counted.length, ok: green, improve, fix: todo.length - improve, todo, reviewing: waiting, points, allGreen: todo.length === 0 && counted.length > 0 };
}

/** Fix plan / Overview: the score checks behind the Google listing rows — each folds into the one "all green" row. */
export const LISTING_CHECK_IDS = new Set(Object.values(ROW_CHECK).filter((id) => id.startsWith("completeness.")));
export const LISTING_GREEN_ID = "listing.all_green";

/** The Google listing page's rows from its props — the one place the rows are built, for the page and for Fix plan
 * and the Overview (lib/listingGreen.server.ts), so every page counts the same rows. */
export function listingInputFrom(props: {
  businessId: string;
  checks: CheckResult[];
  listing: { phone: string | null; website: string | null; category: string | null; openingHours: string[] | null; photoCount: number | null; rating: number | null; reviewCount: number | null };
  messagingOn?: boolean | null;
  replyCounts?: { replied: number; reviewsInWindow: number } | null;
  booking?: import("@/lib/googleProfileTab").BookingState | null;
  media?: import("@/lib/googleProfileTab").ListingInput["media"];
  extras?: import("@/lib/googleProfileTab").ListingExtras | null;
  hoursMismatch?: boolean;
}, page: boolean): import("@/lib/googleProfileTab").ListingInput {
  return {
    businessId: props.businessId,
    checks: props.checks,
    phone: props.listing.phone,
    website: props.listing.website,
    category: props.listing.category,
    openingHours: props.listing.openingHours,
    photoCount: props.listing.photoCount,
    rating: props.listing.rating,
    reviewCount: props.listing.reviewCount,
    // As the page always read it (undefined: the row asks to turn it on).
    messagingOn: props.messagingOn as boolean | null,
    replies: props.replyCounts ? { replied: props.replyCounts.replied, inWindow: props.replyCounts.reviewsInWindow } : null,
    booking: props.booking ?? null,
    media: props.media ?? null,
    extras: props.extras ?? null,
    // The page only: a website hours mismatch makes the Hours row ! ("to improve").
    hoursMismatch: page ? props.hoursMismatch === true : undefined,
  };
}

/** Fix plan / Overview: the Google listing fixes (and every other non-green row) as ONE task, "Get your Google
 * listing to all green" — its points the scored rows' (no-point rows never change the projection), the earliest of
 * their timings, ranked like any task. Tasks for other checks are untouched. Listing unread (null): unchanged. */
export function foldListingTasks<T extends { checkId: string; weightedPoints: number; when?: string | null; urgent?: boolean; mergedCheckIds?: string[] | null }>(tasks: T[], green: ListingGreen | null): T[] {
  if (!green) return tasks;
  const listing = tasks.filter((t) => LISTING_CHECK_IDS.has(t.checkId));
  if (listing.length === 0 && green.allGreen) return tasks;
  const order = ["this_week", "weeks", "months"];
  const when = listing.map((t) => t.when ?? "weeks").sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? "this_week";
  const base = (listing[0] ?? { checkId: "", category: "completeness", label: "", status: "open", effort: "quick_win", action: "", why: "", fix: "", weightedPointsHigh: null }) as T;
  const folded = {
    ...base,
    checkId: LISTING_GREEN_ID,
    weightedPoints: Math.round(listing.reduce((n, t) => n + t.weightedPoints, 0) * 10) / 10,
    when,
    urgent: listing.some((t) => t.urgent),
    mergedCheckIds: listing.map((t) => t.checkId),
  } as T;
  return [...tasks.filter((t) => !LISTING_CHECK_IDS.has(t.checkId)), folded];
}
