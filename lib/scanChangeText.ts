// The plain-language sentences for scan change records (lib/scanChanges.ts)
// — the same content.listingChange.* sentences the old snapshot diff used
// wherever a record still says as much, and "… changed" where it can't
// (decided Nov 16: a rating, or a review count without Business Profile,
// shows only that it changed, with today's value next to it).

import { DEFAULT_LOCALE, t, tPlural, type Locale } from "@/lib/i18n";
import { GOOGLE_PHOTO_CAP } from "@/lib/googlePhotoCap";
import type { ProfileChange } from "@/lib/profileChanges";
import type { ScanChangeRecord } from "@/lib/scanChanges";

/** Today's values shown next to "Rating changed" / "Review count changed". */
export interface NowValues {
  rating?: number | null;
  reviewCount?: number | null;
}

function withNow(text: string, value: string | null, locale: Locale): string {
  return value === null ? text : `${text} · ${t(locale, "dashboard.overview.sinceCard.nowValue", { value })}`;
}

export function describeScanChange(r: ScanChangeRecord, locale: Locale = DEFAULT_LOCALE, now: NowValues = {}): ProfileChange {
  const key = (k: string) => t(locale, `content.listingChange.${k}` as Parameters<typeof t>[1]);
  const plain = (field: string) => key(`${field}.${r.direction === "added" ? "added" : r.direction === "removed" ? "removed" : "changed"}`);
  switch (r.field) {
    case "name":
    case "address":
      return { field: r.field, description: key(`${r.field}.changed`) };
    case "phone":
    case "website":
    case "hours":
      return { field: r.field, description: plain(r.field) };
    case "categories":
      return { field: r.field, description: key("categories.changedPlain") };
    case "status":
      return { field: r.field, description: key("status.changedPlain") };
    case "photos": {
      if (r.delta !== null) return { field: r.field, description: r.delta > 0 ? tPlural(locale, "content.listingChange.photos.added", r.delta) : tPlural(locale, "content.listingChange.photos.removed", Math.abs(r.delta)) };
      if (r.direction === "up") return { field: r.field, description: t(locale, "content.listingChange.photos.crossedCapUp", { cap: GOOGLE_PHOTO_CAP }) };
      if (r.direction === "down") return { field: r.field, description: t(locale, "content.listingChange.photos.crossedCapDown", { cap: GOOGLE_PHOTO_CAP }) };
      return { field: r.field, description: key("photos.changed") };
    }
    case "rating":
      return { field: r.field, description: withNow(key("rating.changed"), typeof now.rating === "number" ? `${now.rating.toFixed(1)}★` : null, locale) };
    case "reviews":
      return r.delta !== null && r.delta > 0
        ? { field: r.field, description: tPlural(locale, "content.listingChange.reviews.gained", r.delta) }
        : { field: r.field, description: withNow(key("reviews.changed"), typeof now.reviewCount === "number" ? String(now.reviewCount) : null, locale) };
  }
}

export function describeScanChanges(records: ScanChangeRecord[], locale: Locale = DEFAULT_LOCALE, now: NowValues = {}): ProfileChange[] {
  return records.map((r) => describeScanChange(r, locale, now));
}
