// "Add photos" from PostScore (Business Profile API v4 media): Google's
// photo categories, the ones that suit each business type, and the checks
// every photo passes before it's sent (10 KB–5 MB, at least 720×720,
// JPG / PNG, at most 10 at a time). The upload itself is
// lib/gbpPhotos.server.ts. Pure.

import type { IdeaType } from "@/lib/listingIdeas";

/** The categories offered (Google's LocationAssociation.Category values). */
export type PhotoCategory = "INTERIOR" | "EXTERIOR" | "AT_WORK" | "TEAMS" | "PRODUCT" | "ADDITIONAL";
export const PHOTO_CATEGORIES: readonly PhotoCategory[] = ["INTERIOR", "EXTERIOR", "AT_WORK", "TEAMS", "PRODUCT", "ADDITIONAL"];
export const isPhotoCategory = (v: unknown): v is PhotoCategory => typeof v === "string" && (PHOTO_CATEGORIES as readonly string[]).includes(v);

/** The best categories for the business type, best first. */
export function suggestedCategories(type: IdeaType | null): PhotoCategory[] {
  switch (type) {
    case "hair":
    case "barber":
    case "nails":
      return ["INTERIOR", "AT_WORK", "TEAMS", "PRODUCT"];
    case "restaurant":
      return ["PRODUCT", "INTERIOR", "EXTERIOR", "TEAMS"];
    case "art":
      return ["AT_WORK", "INTERIOR", "PRODUCT", "TEAMS"];
    case "home":
      return ["AT_WORK", "TEAMS", "EXTERIOR", "PRODUCT"];
    default:
      return ["INTERIOR", "EXTERIOR", "AT_WORK", "TEAMS"];
  }
}

export const MAX_PHOTOS = 10;
export const MIN_BYTES = 10 * 1024;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MIN_SIDE = 720;
/** The browser re-encodes to at most this long side (keeps each upload well under the 6 MB request limit). */
export const MAX_SIDE = 3000;

export type PhotoProblem = "type" | "too_small_file" | "too_big_file" | "too_small_size" | "unreadable";

/** One photo's problem, or null when Google will take it. */
export function photoProblem(p: { type: string; bytes: number; width: number | null; height: number | null }): PhotoProblem | null {
  if (!/^image\/(jpeg|png)$/.test(p.type)) return "type";
  if (p.bytes < MIN_BYTES) return "too_small_file";
  if (p.bytes > MAX_BYTES) return "too_big_file";
  if (p.width === null || p.height === null) return "unreadable";
  if (p.width < MIN_SIDE || p.height < MIN_SIDE) return "too_small_size";
  return null;
}

/** The size to re-encode to: never bigger than MAX_SIDE on the long side. */
export function targetSize(width: number, height: number, square = false): { width: number; height: number; sx: number; sy: number; sw: number; sh: number } {
  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;
  if (square) {
    const side = Math.min(width, height);
    sx = Math.round((width - side) / 2);
    sy = Math.round((height - side) / 2);
    sw = sh = side;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  return { width: Math.round(sw * scale), height: Math.round(sh * scale), sx, sy, sw, sh };
}

export const PHOTOS_KIND = "photos";
export const photosKind = (practice: boolean) => (practice ? `${PHOTOS_KIND}_practice` : PHOTOS_KIND);

/** What gbp_changes keeps per photo: Google's media name and the category — never the image. */
export interface StoredPhoto {
  name: string | null;
  category: PhotoCategory;
}
