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
function sample(): PracticeListing {
  const weekday = (day: GooglePeriod["openDay"]) => ({ openDay: day, openTime: t(9), closeDay: day, closeTime: t(18) });
  return {
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
      if (!["regularHours", "phoneNumbers", "profile", "websiteUri"].includes(mask)) return googleError(400, "INVALID_ARGUMENT");
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
      return json(pick(l, mask));
    }
    return googleError(400, "INVALID_ARGUMENT");
  }) as typeof fetch;
}
