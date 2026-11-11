// Server-only. Practice mode for the "Order online" / "Booking link" card
// (REVIEW_REPLIES_PRACTICE=1, never in production — lib/gbpReviewPractice.ts):
// a fake, in-memory Place Actions API swapped in for `fetch` under the real
// code (lib/gbpOrderLink.server.ts) — the read, the "before" saved for
// undo, the create / patch / delete and the read-back all run as they do
// against Google; nothing is ever sent.
//
// The sample listing starts with NO ordering or booking link. The owner
// picks what the fake Google does with the next Approve, with the same
// chooser as Edit on Google (lib/gbpProfilePractice.server.ts): accept it,
// refuse it (400), or hold it (Google answers OK but doesn't show it).
// Kept until the dev server restarts.
import "server-only";

import type { PlaceActionLink } from "@/lib/gbpPlaceActions";
import { PRACTICE_PROFILE_LOCATION, practiceOutcomeOf } from "@/lib/gbpProfilePractice.server";

interface PracticeLinks {
  shown: PlaceActionLink[];
  /** Held: created or changed, but not shown. */
  held: PlaceActionLink[];
  next: number;
}

const g = globalThis as unknown as { __practicePlaceActions?: Map<string, PracticeLinks> };
const listings = (g.__practicePlaceActions ??= new Map());

function listing(businessId: string): PracticeLinks {
  let l = listings.get(businessId);
  if (!l) listings.set(businessId, (l = { shown: [], held: [], next: 1 }));
  return l;
}

/** For tests: every business starts over with no link. */
export function resetPracticePlaceActions() {
  listings.clear();
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const googleError = (status: number, code: string) => json({ error: { code: status, status: code } }, status);
const TYPES = new Set(["FOOD_ORDERING", "FOOD_DELIVERY", "FOOD_TAKEOUT", "SHOP_ONLINE", "DINING_RESERVATION", "APPOINTMENT", "ONLINE_APPOINTMENT"]);

/** A fetch that answers like the Place Actions API v1, from memory. */
export function practicePlaceActionsFetch(businessId: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.hostname !== "mybusinessplaceactions.googleapis.com") return googleError(404, "NOT_FOUND");
    const l = listing(businessId);
    const collection = `/v1/${PRACTICE_PROFILE_LOCATION}/placeActionLinks`;
    if (url.pathname === collection && method === "GET") return json({ placeActionLinks: l.shown });
    const outcome = practiceOutcomeOf(businessId);
    if (url.pathname === collection && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as PlaceActionLink;
      if (typeof body.uri !== "string" || !body.uri.startsWith("https://") || !TYPES.has(String(body.placeActionType))) return googleError(400, "INVALID_ARGUMENT");
      if (outcome === "refuse") return googleError(400, "INVALID_ARGUMENT");
      const link: PlaceActionLink = { name: `${collection.slice(4)}/practice-${l.next++}`, uri: body.uri, placeActionType: body.placeActionType, providerType: "MERCHANT", isEditable: true };
      (outcome === "hold" ? l.held : l.shown).push(link);
      return json(link);
    }
    if (!url.pathname.startsWith(`${collection}/`)) return googleError(404, "NOT_FOUND");
    const name = url.pathname.slice(4);
    const shown = l.shown.find((x) => x.name === name);
    const heldIndex = l.held.findIndex((x) => x.name === name);
    if (!shown && heldIndex < 0) return googleError(404, "NOT_FOUND");
    if (outcome === "refuse") return googleError(400, "INVALID_ARGUMENT");
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as PlaceActionLink;
      if (url.searchParams.get("updateMask") !== "uri" || typeof body.uri !== "string" || !body.uri.startsWith("https://")) return googleError(400, "INVALID_ARGUMENT");
      const link = shown ?? l.held[heldIndex];
      // Held: Google answers with the change, but keeps showing the old link.
      if (outcome !== "hold") link.uri = body.uri;
      return json({ ...link, uri: body.uri });
    }
    if (method === "DELETE") {
      if (outcome === "hold" && shown) return json({});
      l.shown = l.shown.filter((x) => x.name !== name);
      if (heldIndex >= 0) l.held.splice(heldIndex, 1);
      return json({});
    }
    return googleError(400, "INVALID_ARGUMENT");
  }) as typeof fetch;
}
