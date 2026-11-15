// Server-only. Practice mode for "Edit on Google" (REVIEW_REPLIES_PRACTICE=1,
// never in production — lib/gbpReviewPractice.ts): a fake, in-memory
// Business Information API with one sample listing per business, swapped
// in for `fetch` under the real code (lib/gbpProfileEdits.server.ts for
// hours / phone / description, lib/gbpWebsiteLink.server.ts for the
// website link, lib/gbpAttributes.server.ts for customer details) — the
// read, the "before" saved for undo, the patch, the pending check and the
// read-back all run as they do against Google; nothing is ever sent.
//
// The owner picks what the fake Google does with the next Approve:
// accept it, refuse it (400), or hold it for review (pendingMask — it
// isn't applied). Kept until the dev server restarts.
import "server-only";

import type { GooglePeriod, SiteWeekDay } from "@/lib/gbpProfileEdits";

export const PRACTICE_PROFILE_LOCATION = "locations/practice";
export type PracticeOutcome = "accept" | "refuse" | "hold";
export function isPracticeOutcome(v: unknown): v is PracticeOutcome {
  return v === "accept" || v === "refuse" || v === "hold";
}

interface PracticeListing {
  /** "real": a copy of the business's real listing (one read, Phase C);
   * "sample": the built-in sample; "fallback": the sample because the real
   * read failed ("Practice copy: couldn't load your real listing"). */
  source: "real" | "sample" | "fallback";
  /** Copied from the real listing when there is one (read-only here). */
  title?: string;
  categories?: unknown;
  storefrontAddress?: unknown;
  specialHours: { specialHourPeriods: unknown[] };
  serviceItems: unknown[];
  regularHours: { periods: GooglePeriod[] };
  phoneNumbers: { primaryPhone: string; additionalPhones?: string[] };
  profile: { description: string };
  /** The website link ("" = none). */
  websiteUri: string;
  /** Customer details: the owner's yes / no values, by attribute id ("attributes/pay_credit_card"). */
  attributes: Map<string, boolean>;
  /** Held for review: the masks, and the values Google hasn't applied. */
  pending: Map<string, Record<string, unknown>>;
}

const t = (hours: number, minutes = 0) => ({ hours, minutes });
function sample(source: PracticeListing["source"] = "sample"): PracticeListing {
  const weekday = (day: GooglePeriod["openDay"]) => ({ openDay: day, openTime: t(9), closeDay: day, closeTime: t(18) });
  return {
    source,
    specialHours: { specialHourPeriods: [] },
    serviceItems: [],
    regularHours: {
      periods: [
        weekday("MONDAY"),
        weekday("TUESDAY"),
        weekday("WEDNESDAY"),
        weekday("THURSDAY"),
        // Friday runs past midnight: 5 PM – 1 AM Saturday.
        { openDay: "FRIDAY", openTime: t(17), closeDay: "SATURDAY", closeTime: t(1) },
        { openDay: "SATURDAY", openTime: t(10), closeDay: "SATURDAY", closeTime: t(16) },
      ],
    },
    phoneNumbers: { primaryPhone: "(302) 555-0142", additionalPhones: ["(302) 555-0143"] },
    profile: { description: "A neighborhood practice listing for trying out PostScore's Edit on Google. Change the hours, the phone or this description — nothing here is ever sent to Google." },
    // An old page, so "Update website on Google" has something to replace.
    websiteUri: "https://www.example.com/old-page",
    // Cards yes; nothing said about parking or accessibility yet.
    attributes: new Map([
      ["attributes/pay_credit_card", true],
      ["attributes/pay_debit_card", true],
    ]),
    pending: new Map(),
  };
}

/** The customer details the sample listing offers (a salon's, as Google lists them). */
const PRACTICE_OFFERED = [
  "has_parking_street_free",
  "has_parking_lot_free",
  "has_parking_garage_paid",
  "pay_credit_card",
  "pay_debit_card",
  "pay_mobile_nfc",
  "requires_cash_only",
  "has_wheelchair_accessible_entrance",
  "has_wheelchair_accessible_restroom",
].map((id) => ({ parent: `attributes/${id}`, valueType: "BOOL", displayName: id.replace(/_/g, " ") }));

/** What the sample website says (so "Use the hours / phone from your website" can be tried). */
export const PRACTICE_SITE_WEEK: SiteWeekDay[] = [
  ...[1, 2, 3, 4, 5].map((day): SiteWeekDay => ({ day, closed: false, open: 9 * 60, close: 17 * 60 })),
  { day: 6, closed: false, open: 10 * 60, close: 15 * 60 },
  { day: 0, closed: true, open: null, close: null },
];
export const PRACTICE_SITE_PHONE = "(302) 555-2368";

const g = globalThis as unknown as { __practiceProfiles?: Map<string, PracticeListing>; __practiceOutcomes?: Map<string, PracticeOutcome> };
const listings = (g.__practiceProfiles ??= new Map());
const outcomes = (g.__practiceOutcomes ??= new Map());

function listing(businessId: string): PracticeListing {
  let l = listings.get(businessId);
  if (!l) listings.set(businessId, (l = sample()));
  return l;
}

/** Practice mode starts from the REAL listing when the business is
 * connected: one read of Google (lib/gbpRealListing.server.ts), copied into
 * the fake — practice edits apply to the copy and never reach Google. Not
 * connected: the sample. The read fails: the sample, marked "fallback". Once
 * per business until the dev server restarts. */
export async function seedPracticeListing(businessId: string, fetchImpl: typeof fetch = fetch): Promise<PracticeListing["source"]> {
  const existing = listings.get(businessId);
  if (existing) return existing.source;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: conn } = await Promise.resolve(admin.from("gbp_connections").select("status").eq("business_id", businessId).maybeSingle()).catch(() => ({ data: null }));
  if ((conn as { status?: string } | null)?.status !== "connected") {
    listings.set(businessId, sample());
    return "sample";
  }
  const { readRealListing } = await import("@/lib/gbpRealListing.server");
  // Practice mode must keep working whatever happens: any error is "couldn't load".
  const read = await readRealListing(admin, businessId, fetchImpl).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message.slice(0, 80) : "error" }));
  if (!read.ok) {
    console.warn(`[practice] couldn't copy the real listing for ${businessId}: ${read.error} — using the sample`);
    listings.set(businessId, sample("fallback"));
    return "fallback";
  }
  listings.set(businessId, fromReal(read.listing));
  const { seedPracticePlaceActions } = await import("@/lib/gbpPlaceActionsPractice.server");
  seedPracticePlaceActions(businessId, read.listing.placeActionLinks);
  return "real";
}

/** The fake's copy of a real listing (only what Google returned; nothing invented). */
export function fromReal(real: import("@/lib/gbpRealListing.server").RealListing): PracticeListing {
  const loc = real.location;
  return {
    source: "real",
    title: loc.title,
    categories: loc.categories,
    storefrontAddress: loc.storefrontAddress,
    specialHours: { specialHourPeriods: (loc.specialHours?.specialHourPeriods ?? []) as unknown[] },
    serviceItems: (loc.serviceItems ?? []) as unknown[],
    regularHours: { periods: (loc.regularHours?.periods ?? []) as GooglePeriod[] },
    phoneNumbers: { primaryPhone: loc.phoneNumbers?.primaryPhone ?? "", ...(loc.phoneNumbers?.additionalPhones?.length ? { additionalPhones: loc.phoneNumbers.additionalPhones } : {}) },
    profile: { description: loc.profile?.description ?? "" },
    websiteUri: loc.websiteUri ?? "",
    attributes: new Map(real.attributes.filter((a) => typeof a.values?.[0] === "boolean").map((a) => [a.name, a.values![0] as boolean])),
    pending: new Map(),
  };
}

/** Where the practice copy came from (null before it's made). */
export function practiceSourceOf(businessId: string): PracticeListing["source"] | null {
  return listings.get(businessId)?.source ?? null;
}

/** For tests: every business starts over with the sample listing. */
export function resetPracticeProfiles() {
  listings.clear();
  outcomes.clear();
}

/** What the next Approve gets from the fake Google (the practice panel's choice). */
export function setPracticeOutcome(businessId: string, outcome: PracticeOutcome) {
  outcomes.set(businessId, outcome);
}

/** The practice panel's choice — shared with the fake Place Actions API (lib/gbpPlaceActionsPractice.server.ts). */
export function practiceOutcomeOf(businessId: string): PracticeOutcome {
  return outcomes.get(businessId) ?? "accept";
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const googleError = (status: number, code: string) => json({ error: { code: status, status: code } }, status);

function pick(l: PracticeListing, readMask: string | null): Record<string, unknown> {
  const fields = (readMask ?? "regularHours,phoneNumbers,profile").split(",").map((m) => m.trim());
  const out: Record<string, unknown> = {};
  if (fields.includes("regularHours")) out.regularHours = l.regularHours;
  if (fields.includes("phoneNumbers")) out.phoneNumbers = l.phoneNumbers;
  if (fields.includes("profile")) out.profile = l.profile;
  if (fields.includes("websiteUri") && l.websiteUri) out.websiteUri = l.websiteUri;
  if (fields.includes("title") && l.title) out.title = l.title;
  if (fields.includes("categories") && l.categories) out.categories = l.categories;
  if (fields.includes("storefrontAddress") && l.storefrontAddress) out.storefrontAddress = l.storefrontAddress;
  if (fields.includes("specialHours")) out.specialHours = l.specialHours;
  if (fields.includes("serviceItems")) out.serviceItems = l.serviceItems;
  if (fields.includes("metadata")) out.metadata = { hasPendingEdits: l.pending.size > 0 };
  return out;
}

const attributesOf = (l: PracticeListing) => Array.from(l.attributes, ([name, value]) => ({ name, valueType: "BOOL", values: [value] }));

/** A fetch that answers like the Business Information API v1, from memory. */
export function practiceProfileFetch(businessId: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.hostname !== "mybusinessbusinessinformation.googleapis.com") return googleError(404, "NOT_FOUND");
    const l = listing(businessId);
    if (url.pathname === `/v1/${PRACTICE_PROFILE_LOCATION}:getGoogleUpdated` && method === "GET") {
      return json({ location: pick(l, url.searchParams.get("readMask")), pendingMask: Array.from(l.pending.keys()).join(","), diffMask: "" });
    }
    // Customer details: what's offered, the owner's values, what's live, and the one PATCH.
    if (url.pathname === "/v1/attributes" && method === "GET") {
      return url.searchParams.get("parent") === PRACTICE_PROFILE_LOCATION ? json({ attributeMetadata: PRACTICE_OFFERED }) : googleError(404, "NOT_FOUND");
    }
    if (url.pathname === `/v1/${PRACTICE_PROFILE_LOCATION}/attributes:getGoogleUpdated` && method === "GET") return json({ attributes: attributesOf(l) });
    if (url.pathname === `/v1/${PRACTICE_PROFILE_LOCATION}/attributes`) {
      if (method === "GET") return json({ name: `${PRACTICE_PROFILE_LOCATION}/attributes`, attributes: attributesOf(l) });
      if (method !== "PATCH") return googleError(400, "INVALID_ARGUMENT");
      const mask = (url.searchParams.get("attributeMask") ?? "").split(",").filter(Boolean);
      if (mask.length === 0) return googleError(400, "INVALID_ARGUMENT");
      const outcome = outcomes.get(businessId) ?? "accept";
      if (outcome === "refuse") return googleError(400, "INVALID_ARGUMENT");
      const body = JSON.parse(String(init?.body ?? "{}")) as { attributes?: Array<{ name: string; values: boolean[] }> };
      if (outcome === "hold") {
        l.pending.set("attributes", body);
        return json({ attributes: attributesOf(l) });
      }
      l.pending.delete("attributes");
      // In the mask, left out of the body: removed ("not set").
      for (const id of mask) {
        const sent = body.attributes?.find((a) => a.name === id);
        if (sent && typeof sent.values?.[0] === "boolean") l.attributes.set(id, sent.values[0]);
        else l.attributes.delete(id);
      }
      return json({ attributes: attributesOf(l) });
    }
    if (url.pathname !== `/v1/${PRACTICE_PROFILE_LOCATION}`) return googleError(404, "NOT_FOUND");
    if (method === "GET") return json(pick(l, url.searchParams.get("readMask")));
    if (method === "PATCH") {
      const mask = url.searchParams.get("updateMask") ?? "";
      if (!["regularHours", "phoneNumbers", "profile", "websiteUri", "specialHours", "serviceItems"].includes(mask)) return googleError(400, "INVALID_ARGUMENT");
      const outcome = outcomes.get(businessId) ?? "accept";
      if (outcome === "refuse") return googleError(400, "INVALID_ARGUMENT");
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (outcome === "hold") {
        l.pending.set(mask, body);
        return json(pick(l, mask));
      }
      l.pending.delete(mask);
      if (mask === "regularHours") l.regularHours = body.regularHours as PracticeListing["regularHours"];
      if (mask === "phoneNumbers") l.phoneNumbers = body.phoneNumbers as PracticeListing["phoneNumbers"];
      if (mask === "profile") l.profile = body.profile as PracticeListing["profile"];
      // An empty body removes the link.
      if (mask === "websiteUri") l.websiteUri = typeof body.websiteUri === "string" ? body.websiteUri : "";
      if (mask === "specialHours") l.specialHours = { specialHourPeriods: ((body.specialHours as { specialHourPeriods?: unknown[] } | undefined)?.specialHourPeriods ?? []) as unknown[] };
      if (mask === "serviceItems") l.serviceItems = (body.serviceItems as unknown[] | undefined) ?? [];
      return json(pick(l, mask));
    }
    return googleError(400, "INVALID_ARGUMENT");
  }) as typeof fetch;
}
