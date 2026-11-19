// Server-only. Day 23B: the Overview's "Your Google listing" card — the
// same rows and counts as the Google Profile tab's section 4 (Premium,
// connected or practice), from the same reads: the visit's listing (scored
// business), Business Profile's cached listing, photos and posts, the
// booking button, messaging, and Google's own edits. Nothing new is saved.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckResult } from "@/lib/scoring";
import type { GoogleTabSaved, ListingInput } from "@/lib/googleProfileTab";

export interface OverviewListingData {
  input: ListingInput;
  saved: GoogleTabSaved | null;
  /** When Google was last read for this card's numbers ("synced 2 h ago"). */
  syncedAt: string | null;
  scan: { website: string | null; phone: string | null };
}

export async function loadOverviewListing(
  db: SupabaseClient,
  businessId: string,
  opts: {
    business: { phone?: string | null; website?: string | null; category?: string | null; opening_hours?: string[] | null; photo_count?: number | null; rating?: number | null; review_count?: number | null; business_status?: string | null };
    checks: CheckResult[];
    connected: boolean;
    practice: boolean;
    timeZone: string;
    replyCounts: { replied: number; reviewsInWindow: number; checkedAt?: string | null } | null;
    lastScanAt: string | null;
  }
): Promise<OverviewListingData> {
  const safe = async <T,>(read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch {
      return null;
    }
  };
  const live = opts.connected;
  // Business Profile's cached listing is read with the server's own client.
  const admin = (await import("@/lib/supabase/admin")).createAdminClient();
  const [{ listingExtras }, { loadPhotosAndPosts }, { loadBookingState, loadInsights }, { loadGoogleTabSaved }] = await Promise.all([
    import("@/lib/gbpRealListing.server"),
    import("@/lib/gbpMediaPosts.server"),
    import("@/lib/gbpInsights.server"),
    import("@/lib/googleProfileTab.server"),
  ]);
  const [extras, media, booking, messagingOn, saved] = await Promise.all([
    live ? safe(() => listingExtras(admin, businessId)) : Promise.resolve(null),
    live ? safe(() => loadPhotosAndPosts(db, businessId)) : Promise.resolve(null),
    live
      ? safe(async () => {
          const months = await loadInsights(db, businessId);
          return loadBookingState(admin, businessId, months.ok ? months.months : []);
        })
      : Promise.resolve(null),
    live ? safe(async () => (await import("@/lib/gbpMessaging.server")).readGbpMessaging(businessId)) : Promise.resolve(null),
    live || opts.practice ? safe(() => loadGoogleTabSaved(db, businessId, { timeZone: opts.timeZone, practice: opts.practice, businessStatus: opts.business.business_status ?? null })) : Promise.resolve(null),
  ]);
  const b = opts.business;
  return {
    input: {
      businessId,
      checks: opts.checks,
      phone: b.phone ?? null,
      website: b.website ?? null,
      category: b.category ?? null,
      openingHours: b.opening_hours ?? null,
      photoCount: b.photo_count ?? null,
      rating: b.rating ?? null,
      reviewCount: b.review_count ?? null,
      messagingOn: typeof messagingOn === "boolean" ? messagingOn : null,
      replies: opts.replyCounts ? { replied: opts.replyCounts.replied, inWindow: opts.replyCounts.reviewsInWindow } : null,
      booking: booking ?? null,
      media: media ? { photos: media.photos, posts: media.posts, checkedAt: media.checkedAt } : null,
      extras: extras ?? null,
    },
    saved,
    syncedAt: opts.replyCounts?.checkedAt ?? opts.lastScanAt,
    scan: { website: b.website ?? null, phone: b.phone ?? null },
  };
}
