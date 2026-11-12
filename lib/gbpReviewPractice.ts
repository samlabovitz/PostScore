// Review replies (lib/gbpReviewInbox.server.ts): the two switches for
// testing without posting to a real Google listing. Pure — the env is
// passed in.
//
// - Practice mode (REVIEW_REPLIES_PRACTICE=1 in .env.local): the inbox
//   talks to a fake, in-memory Google (lib/gbpReviewPractice.server.ts)
//   with sample reviews. Never in production: NODE_ENV=production refuses
//   it even when the variable is set.
// - One live allow list for EVERY write to Google (GOOGLE_WRITES_LIVE_PLACES):
//   review replies (post / edit / delete), Edit on Google (hours, phone,
//   description), the ordering / booking link, the website link and
//   customer details. With practice mode off, a business's real Google
//   data loads read-only, and every Approve / Undo is locked in the page
//   and refused on the server unless:
//   - its Google place id is in the comma-separated list, or
//   - the list is exactly "all" (every connected business — for launch;
//     a startup warning outside production, instrumentation.ts).
//   Empty or unset: nothing can write to Google.
//   The old per-feature lists (REVIEW_REPLIES_LIVE_PLACES,
//   GBP_PROFILE_EDITS_LIVE_PLACES, GBP_PLACE_ACTIONS_LIVE_PLACES) are no
//   longer read; startup warns when one is still set.

type Env = { NODE_ENV?: string; REVIEW_REPLIES_PRACTICE?: string; GOOGLE_WRITES_LIVE_PLACES?: string; [legacy: string]: string | undefined };

export function reviewRepliesPracticeOn(env: Env = process.env): boolean {
  if (env.REVIEW_REPLIES_PRACTICE !== "1") return false;
  if (env.NODE_ENV === "production") {
    console.warn("[review-replies] REVIEW_REPLIES_PRACTICE is set in production — refused; practice mode stays off.");
    return false;
  }
  return true;
}

/** The live allow list: "all", or the listed place ids (empty = none). */
export function googleWritesLivePlaces(env: Env = process.env): "all" | string[] {
  const raw = (env.GOOGLE_WRITES_LIVE_PLACES ?? "").trim();
  if (raw.toLowerCase() === "all") return "all";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** May PostScore write to this business's real Google listing (any
 * write: replies, profile edits, links, customer details)? Practice mode
 * never reaches here — it has no real Google. */
export function googleWritesAllowed(placeId: string | null | undefined, env: Env = process.env): boolean {
  const places = googleWritesLivePlaces(env);
  if (places === "all") return true;
  return !!placeId && places.includes(placeId);
}

export const LEGACY_LIVE_PLACE_VARS = ["REVIEW_REPLIES_LIVE_PLACES", "GBP_PROFILE_EDITS_LIVE_PLACES", "GBP_PLACE_ACTIONS_LIVE_PLACES"] as const;

/** Startup warnings (instrumentation.ts): "all" outside production, and
 * old per-feature lists that are no longer read. */
export function googleWritesStartupWarnings(env: Env = process.env): string[] {
  const out: string[] = [];
  if (googleWritesLivePlaces(env) === "all" && env.NODE_ENV !== "production") {
    out.push(`[google-writes] GOOGLE_WRITES_LIVE_PLACES=all outside production (NODE_ENV=${env.NODE_ENV ?? "unset"}): every connected business's real Google listing can be changed from this server.`);
  }
  for (const name of LEGACY_LIVE_PLACE_VARS) {
    if ((env[name] ?? "").trim()) out.push(`[google-writes] ${name} is no longer read — use GOOGLE_WRITES_LIVE_PLACES (one list for every write to Google).`);
  }
  return out;
}
