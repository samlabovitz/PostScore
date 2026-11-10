// Server-only. Practice mode (lib/gbpReviewPractice.ts): a fake, in-memory
// Google Business Profile reviews API, swapped in for `fetch` under the
// real inbox code (lib/gbpReviewInbox.server.ts) — so listing, posting,
// the read-back, editing and deleting all run exactly as they do against
// Google, and nothing is ever sent to Google.
//
// 8 sample reviews per business (1–5 stars, some already replied, one in
// Spanish, one Google-translated), kept until the dev server restarts.
// Two of them trigger Google's harder answers:
// - "Practice — Google refuses the reply": every reply is refused (400);
// - "Practice — accepted, not showing yet": the reply is accepted, but
//   reading it back doesn't show it for 30 seconds.
import "server-only";

import type { RawGbpReview } from "@/lib/gbpReviewInbox";

export const PRACTICE_ACCOUNT = "accounts/practice";
export const PRACTICE_LOCATION = "locations/practice";
export const PRACTICE_TOKEN = "practice-token";
export const REFUSED_REVIEW_ID = "practice-refused";
export const DELAYED_REVIEW_ID = "practice-delayed";
/** How long an "accepted, not showing yet" reply stays hidden from the read-back. */
export const DELAY_MS = 30_000;

interface PracticeReview extends RawGbpReview {
  reviewId: string;
  /** "Accepted, not showing yet": the read-back shows the reply only from this time. */
  visibleFrom?: number;
}

const DAY = 86_400_000;

function samples(now: number): PracticeReview[] {
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  const review = (reviewId: string, name: string | null, stars: string, comment: string | undefined, days: number, reply?: string): PracticeReview => ({
    name: `${PRACTICE_ACCOUNT}/${PRACTICE_LOCATION}/reviews/${reviewId}`,
    reviewId,
    reviewer: name ? { displayName: name } : { displayName: "A Google user", isAnonymous: true },
    starRating: stars,
    comment,
    createTime: at(days),
    updateTime: at(days),
    ...(reply ? { reviewReply: { comment: reply, updateTime: at(days - 1) } } : {}),
  });
  return [
    review("practice-maria", "Maria P.", "FIVE", "Angelica did an amazing job with my color — exactly what I asked for. The salon is spotless and everyone is so friendly.", 1),
    review("practice-lucia", "Lucía G.", "FIVE", "Excelente servicio, muy amables y siempre puntuales. ¡Gracias por el corte tan bonito!", 3),
    review("practice-kevin", "Kevin R.", "ONE", "Waited 40 minutes past my appointment time and nobody told me why. The cut was fine but I won't be back.", 5),
    review(REFUSED_REVIEW_ID, "Practice — Google refuses the reply", "TWO", "Use this review to see what happens when Google refuses a reply. Nothing you post here is accepted.", 7),
    review(DELAYED_REVIEW_ID, "Practice — accepted, not showing yet", "FOUR", "Use this review to see a reply Google accepts but doesn't show yet. It appears about 30 seconds after you post it.", 9),
    review("practice-joao", "João S.", "THREE", "(Translated by Google) The cut was good, but the wait was long.\n\n(Original)\nO corte ficou bom, mas a espera foi longa.", 12),
    review("practice-james", "James T.", "FOUR", "Great haircut and fair prices. Parking can be tricky on Broadway.", 20, "Thank you, James! We're glad you liked your cut — and thanks for the tip about parking."),
    review("practice-stars", null, "FIVE", undefined, 30, "Thank you for the five stars!"),
  ];
}

const g = globalThis as unknown as { __practiceReviews?: Map<string, PracticeReview[]> };
const stores = (g.__practiceReviews ??= new Map());

function store(businessId: string, now: number): PracticeReview[] {
  let reviews = stores.get(businessId);
  if (!reviews) stores.set(businessId, (reviews = samples(now)));
  return reviews;
}

/** For tests: start every business over with the sample reviews. */
export function resetPracticeReviews() {
  stores.clear();
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const googleError = (status: number, code: string) => json({ error: { code: status, status: code } }, status);

/** What the read-back sees: an "accepted, not showing yet" reply stays hidden until its time. */
function asGoogleShowsIt(r: PracticeReview, now: number): RawGbpReview {
  const { visibleFrom, ...rest } = r;
  if (visibleFrom !== undefined && now < visibleFrom) return { ...rest, reviewReply: undefined };
  return rest;
}

/** A fetch that answers like the My Business v4 reviews API, from memory. */
export function practiceFetch(businessId: string, clock: () => number = Date.now): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const now = clock();
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const prefix = `/v4/${PRACTICE_ACCOUNT}/${PRACTICE_LOCATION}/reviews`;
    if (url.hostname !== "mybusiness.googleapis.com" || !url.pathname.startsWith(prefix)) return googleError(404, "NOT_FOUND");
    const reviews = store(businessId, now);
    const rest = url.pathname.slice(prefix.length);

    if (rest === "" && method === "GET") {
      const sorted = [...reviews].sort((a, b) => Date.parse(b.updateTime ?? "") - Date.parse(a.updateTime ?? ""));
      return json({ reviews: sorted.map((r) => asGoogleShowsIt(r, now)), totalReviewCount: reviews.length });
    }
    const match = rest.match(/^\/([A-Za-z0-9_-]+)(\/reply)?$/);
    const review = match ? reviews.find((r) => r.reviewId === match[1]) : undefined;
    if (!match || !review) return googleError(404, "NOT_FOUND");

    if (!match[2] && method === "GET") return json(asGoogleShowsIt(review, now));
    if (match[2] && method === "PUT") {
      if (review.reviewId === REFUSED_REVIEW_ID) return googleError(400, "INVALID_ARGUMENT");
      const comment = (JSON.parse(String(init?.body ?? "{}")) as { comment?: string }).comment ?? "";
      const updateTime = new Date(now).toISOString();
      review.reviewReply = { comment, updateTime };
      review.visibleFrom = review.reviewId === DELAYED_REVIEW_ID ? now + DELAY_MS : undefined;
      return json({ comment, updateTime });
    }
    if (match[2] && method === "DELETE") {
      if (!review.reviewReply) return googleError(404, "NOT_FOUND");
      review.reviewReply = undefined;
      review.visibleFrom = undefined;
      return json({});
    }
    return googleError(400, "INVALID_ARGUMENT");
  }) as typeof fetch;
}
