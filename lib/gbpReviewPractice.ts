// Review replies (lib/gbpReviewInbox.server.ts): the two switches for
// testing without posting to a real Google listing. Pure — the env is
// passed in.
//
// - Practice mode (REVIEW_REPLIES_PRACTICE=1 in .env.local): the inbox
//   talks to a fake, in-memory Google (lib/gbpReviewPractice.server.ts)
//   with sample reviews. Never in production: NODE_ENV=production refuses
//   it even when the variable is set.
// - Live posting allow list (REVIEW_REPLIES_LIVE_PLACES, comma-separated
//   Google place ids): with practice mode off, a business's real reviews
//   load read-only, and Post / Edit / Delete stay off unless its place id
//   is listed. Default: no business may post.

type Env = { NODE_ENV?: string; REVIEW_REPLIES_PRACTICE?: string; REVIEW_REPLIES_LIVE_PLACES?: string };

export function reviewRepliesPracticeOn(env: Env = process.env): boolean {
  if (env.REVIEW_REPLIES_PRACTICE !== "1") return false;
  if (env.NODE_ENV === "production") {
    console.warn("[review-replies] REVIEW_REPLIES_PRACTICE is set in production — refused; practice mode stays off.");
    return false;
  }
  return true;
}

export function livePostingPlaces(env: Env = process.env): string[] {
  return (env.REVIEW_REPLIES_LIVE_PLACES ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** May this business post, edit or delete replies on its real Google listing? */
export function livePostingAllowed(placeId: string | null | undefined, env: Env = process.env): boolean {
  return !!placeId && livePostingPlaces(env).includes(placeId);
}
