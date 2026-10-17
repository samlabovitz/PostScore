// Google listing photo cost control (Overview header). Each photo shown is
// one "Place Details Photos" request: 1,000 free a month, then $7.00 /
// 1,000. Loads are logged in place_photo_loads (one row per paid
// request) and stop for the month at PLACE_PHOTO_MONTHLY_CAP (default
// 900 — under the free 1,000). Over the cap, or if the log can't be read,
// the header simply shows no photo. Pure.

export const DEFAULT_PLACE_PHOTO_MONTHLY_CAP = 900;
/** The header shows the photo at 64–72px; 160px covers 2× screens. */
export const LISTING_PHOTO_MAX_WIDTH_PX = 160;

export function placePhotoMonthlyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(env.PLACE_PHOTO_MONTHLY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_PLACE_PHOTO_MONTHLY_CAP;
}

/** Start of the current calendar month (UTC) — Google bills by month. */
export function utcMonthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function canLoadPlacePhoto(loadsThisMonth: number | null, cap: number): boolean {
  return loadsThisMonth !== null && loadsThisMonth < cap;
}
