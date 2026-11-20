// Server-only. Day 23E: who may publish a Google post and where it goes —
// the owner, Premium, practice mode and the live allow list
// (googleWriteContext) plus the v4 parent from gbp_connections. Practice
// mode gets the in-memory fake (lib/gbpPostsPractice.server.ts), never
// Google. And the facts a draft may use (the business's own details, the
// listing as Google shows it now, the owner's own prices) — read, never
// saved.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoogleWriteContext, GoogleWriteBlocked } from "@/lib/gbpWriteContext.server";
import type { PostTarget } from "@/lib/gbpPosts.server";
import type { PostFacts, PostOffer, PostTopic } from "@/lib/gbpPosts";

export type PostContext =
  | (Extract<GoogleWriteContext, { ok: true }> & { post: PostTarget; postFetch: typeof fetch; refreshToken: () => Promise<string | null> })
  | GoogleWriteBlocked
  | { ok: false; result: { status: "error"; error: "not_connected" } };

export async function postContext(businessId: string): Promise<PostContext> {
  const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
  const c = await googleWriteContext(businessId);
  if (!c.ok) return c;
  const languageCode = c.target.locale === "es" ? "es" : "en";
  if (c.practice) {
    const { practicePostFetch, PRACTICE_POST_PARENT } = await import("@/lib/gbpPostsPractice.server");
    return { ...c, post: { businessId, userId: c.target.userId, parent: PRACTICE_POST_PARENT, accessToken: "practice-token", languageCode }, postFetch: practicePostFetch(businessId), refreshToken: async () => null };
  }
  const { data } = await c.admin.from("gbp_connections").select("google_account_id, google_location_id").eq("business_id", businessId).maybeSingle();
  const conn = data as { google_account_id?: string | null; google_location_id?: string | null } | null;
  if (!conn?.google_account_id?.startsWith("accounts/") || !conn.google_location_id?.startsWith("locations/")) return { ok: false, result: { status: "error", error: "not_connected" } };
  const refreshToken = async () => {
    // A 401: refresh once (only a refused refresh loses the connection).
    await c.markReconnect();
    const { getValidAccessTokenWithClient } = await import("@/lib/gbpTokens.server");
    const t = await getValidAccessTokenWithClient(c.admin, businessId);
    return t.status === "ok" ? t.accessToken : null;
  };
  return { ...c, post: { businessId, userId: c.target.userId, parent: `${conn.google_account_id}/${conn.google_location_id}`, accessToken: c.target.accessToken, languageCode }, postFetch: fetch, refreshToken };
}

export interface DraftInputs {
  facts: PostFacts;
  topic: PostTopic;
  locale: "en" | "es";
  /** The listing's links and phone, for the post's button. */
  links: { booking: string | null; website: string | null; phone: string | null };
  /** The business's own service names (Google's list, the business's, its price list), for spelling. */
  serviceNames: string[];
}

/** The owner's running coupon (Campaigns): `promoId`, or the newest active one. Null when none. */
export async function loadActiveOffer(db: SupabaseClient, businessId: string, promoId: string | null = null): Promise<PostOffer | null> {
  let q = db.from("promos").select("id, offer, code, terms, expiry, active").eq("business_id", businessId).eq("active", true);
  if (promoId) q = q.eq("id", promoId);
  const { data } = await q.order("created_at", { ascending: false }).limit(1);
  const p = ((data ?? [])[0] ?? null) as { id: string; offer: string; code: string; terms: string | null; expiry: string | null } | null;
  if (!p || !p.offer?.trim()) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (p.expiry && p.expiry < today) return null;
  return { promoId: p.id, offer: p.offer, code: p.code ?? "", terms: p.terms, expiry: p.expiry };
}

/** The facts for a draft: the business row, the listing as Google shows it
 * now (Business Profile for connected owners), the booking link and the
 * owner's PostScore prices. A failed read leaves its part out. */
export async function loadDraftInputs(db: SupabaseClient, admin: SupabaseClient, businessId: string): Promise<DraftInputs | null> {
  const { data } = await db.from("businesses").select("id, place_id, listing_mode, niche_id, services, differentiator, language").eq("id", businessId).maybeSingle();
  if (!data) return null;
  const [{ withLiveListingFor }, { withOwnerDetailsFor }, { normalizeLocale }, { extractCityFromAddress }, { ideaTypeOf }] = await Promise.all([
    import("@/lib/ownerListing.server"),
    import("@/lib/ownerDetails.server"),
    import("@/lib/i18n"),
    import("@/lib/websiteTrust"),
    import("@/lib/listingIdeas"),
  ]);
  const live = (await withLiveListingFor(admin, businessId, data).catch(() => data)) as typeof data & { name?: string | null; address?: string | null };
  const b = (await withOwnerDetailsFor(admin, businessId, live).catch(() => live)) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const locale = normalizeLocale(str(b.language));
  // The real listing (connected owners): categories, services, the booking link.
  const real = await (async () => {
    const { readRealListingCached } = await import("@/lib/gbpRealListing.server");
    const read = await readRealListingCached(admin, businessId).catch(() => null);
    return read?.ok ? read.listing : null;
  })();
  const categories = [real?.location.categories?.primaryCategory?.displayName, ...(real?.location.categories?.additionalCategories ?? []).map((c) => c.displayName)].filter((x): x is string => !!x);
  const booking = await (async () => {
    if (!real) return null;
    const { bookingLink } = await import("@/lib/bookingPartners");
    const link = bookingLink(real.placeActionLinks);
    return link.kind === "none" ? null : link.uri;
  })();
  const { data: prices } = await db.from("prices").select("service, price").eq("business_id", businessId).limit(50);
  const listed = await (async () => {
    if (!real) return [] as string[];
    const { serviceNames } = await import("@/lib/gbpListingFields");
    type Cat = { serviceTypes?: Array<{ serviceTypeId?: string; displayName?: string }> };
    const cats = real.location.categories as { primaryCategory?: Cat; additionalCategories?: Cat[] } | undefined;
    const types = [...(cats?.primaryCategory?.serviceTypes ?? []), ...(cats?.additionalCategories ?? []).flatMap((c) => c.serviceTypes ?? [])];
    return serviceNames((real.location.serviceItems ?? []) as import("@/lib/gbpListingFields").ServiceItem[], types);
  })();
  const services = Array.isArray(b.services) ? (b.services as unknown[]).filter((s): s is string => typeof s === "string" && !!s.trim()) : [];
  const address = str(b.address);
  return {
    facts: {
      name: str(b.name) ?? "",
      category: categories[0] ?? str(b.category),
      city: address ? (extractCityFromAddress(address) ?? null) : null,
      services,
      prices: ((prices ?? []) as Array<{ service: string; price: number }>).filter((p) => p.service && Number(p.price) > 0).map((p) => ({ service: p.service, price: `$${Number(p.price)}` })),
      differentiator: str(b.differentiator),
      hasBooking: !!booking,
    },
    topic: ideaTypeOf(str(b.niche_id), categories) ?? "default",
    locale,
    links: { booking, website: str(real?.location.websiteUri) ?? str(b.website), phone: str(real?.location.phoneNumbers?.primaryPhone) ?? str(b.phone) },
    // Google's own list and the business's: the spellings the owner already uses. (The price list's names are checked, not trusted.)
    serviceNames: Array.from(new Set([...listed, ...services])),
  };
}
