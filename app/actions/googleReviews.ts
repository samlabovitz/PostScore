"use server";

// Premium "Reply to your Google reviews" (lib/gbpReviewInbox.server.ts):
// list the owner's reviews live from Google (shown, never stored), and
// post / edit / delete a reply — each only from the owner's own click
// (Google's policy). Every call goes through gbpEditGate: the signed-in
// owner (RLS), Premium, not archived, Google connected with a matched
// location and a usable token. Never trusts anything from the browser
// beyond the review id and the reply text, both checked here.
//
// Two test switches (lib/gbpReviewPractice.ts):
// - practice mode (REVIEW_REPLIES_PRACTICE=1, never in production): the
//   same code runs against a fake, in-memory Google — no Google connection
//   needed, nothing ever sent to Google;
// - otherwise a business's real reviews load, but Post / Edit / Delete are
//   refused here unless its place id is in REVIEW_REPLIES_LIVE_PLACES
//   (default: none).

import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import { cleanPostedReply, isReviewId, type InboxReview } from "@/lib/gbpReviewInbox";
import { replyBreaksRules } from "@/lib/reviewReplies";
import type { ReplyAction } from "@/lib/gbpReviewInbox.server";
import { livePostingAllowed, reviewRepliesPracticeOn } from "@/lib/gbpReviewPractice";
import type { PendingReply } from "@/lib/gbpReviewPending";

export type ListGoogleReviewsResult =
  /** `practice`: the fake Google (practice mode). `canPost`: Post / Edit / Delete are on for this business. */
  | { status: "ok"; reviews: InboxReview[]; nextPageToken: string | null; total: number | null; practice: boolean; canPost: boolean; pending: PendingReply[] }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: "reconnect" | "failed" };

export type ChangeGoogleReplyResult =
  | { status: "ok"; review: InboxReview }
  | { status: "unconfirmed" }
  | { status: "already_replied"; review: InboxReview }
  | { status: "no_reply"; review: InboxReview }
  | { status: "not_set_up" }
  /** The reply asks for something Google and PostScore don't allow (an incentive, changing the review). */
  | { status: "rules" }
  | { status: "invalid" }
  /** Not practice mode, and this business isn't on the live posting allow list. Nothing sent. */
  | { status: "posting_off" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: "reconnect" | "not_found" | "failed" };

type GateFailure = { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: string };

interface InboxContext {
  ok: true;
  admin: import("@supabase/supabase-js").SupabaseClient;
  target: import("@/lib/gbpReviewInbox.server").InboxTarget;
  practice: boolean;
  canPost: boolean;
  fetchImpl: typeof fetch;
}

// Server-only modules load on demand, so client components can import these actions.
async function inboxTarget(businessId: string): Promise<InboxContext | { ok: false; result: GateFailure }> {
  if (reviewRepliesPracticeOn()) return practiceTarget(businessId);
  const { gbpEditGate } = await import("@/lib/gbpEditGate.server");
  const gate = await gbpEditGate(businessId, { requirePremium: true });
  if (!gate.ok) return { ok: false as const, result: gate.result };
  const [{ data: conn }, { data: business }] = await Promise.all([
    gate.admin.from("gbp_connections").select("google_account_id").eq("business_id", businessId).maybeSingle(),
    gate.admin.from("businesses").select("place_id").eq("id", businessId).maybeSingle(),
  ]);
  const accountName = (conn as { google_account_id: string | null } | null)?.google_account_id;
  if (typeof accountName !== "string" || !accountName.startsWith("accounts/")) return { ok: false as const, result: { status: "blocked" as const, reason: "not_connected" as const } };
  return {
    ok: true as const,
    admin: gate.admin,
    target: { businessId, userId: gate.target.userId, accountName, locationName: gate.target.locationName, accessToken: gate.target.accessToken },
    practice: false,
    canPost: livePostingAllowed((business as { place_id: string | null } | null)?.place_id),
    fetchImpl: fetch,
  };
}

/** Practice mode: the owner, Premium and not archived — like the real gate,
 * minus Google (no connection or token needed: the fake Google answers). */
async function practiceTarget(businessId: string): Promise<InboxContext | { ok: false; result: GateFailure }> {
  const blocked = (reason: GbpEditBlock) => ({ ok: false as const, result: { status: "blocked" as const, reason } });
  const [{ createClient }, { getPlan }, { isPremiumPlan }, { isBusinessArchived }, { createAdminClient }, practice] = await Promise.all([
    import("@/lib/supabase/server"),
    import("@/lib/premium"),
    import("@/lib/plan"),
    import("@/lib/businessArchive.server"),
    import("@/lib/supabase/admin"),
    import("@/lib/gbpReviewPractice.server"),
  ]);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return blocked("unauthenticated");
  const { data: business } = await supabase.from("businesses").select("id").eq("id", businessId).eq("owner_id", user.id).maybeSingle();
  if (!business) return blocked("not_found");
  if (!isPremiumPlan(await getPlan())) return blocked("not_premium");
  if (await isBusinessArchived(supabase, businessId)) return blocked("archived");
  return {
    ok: true as const,
    admin: createAdminClient(),
    target: { businessId, userId: user.id, accountName: practice.PRACTICE_ACCOUNT, locationName: practice.PRACTICE_LOCATION, accessToken: practice.PRACTICE_TOKEN },
    practice: true,
    canPost: true,
    fetchImpl: practice.practiceFetch(businessId),
  };
}

function gateFailure(result: GateFailure) {
  return result.status === "blocked" ? result : ({ status: "error", error: result.error === "reconnect" ? "reconnect" : "failed" } as const);
}

/** One page (50) of the owner's Google reviews, newest first. */
export async function listGoogleReviews(businessId: string, pageToken: string | null = null): Promise<ListGoogleReviewsResult> {
  const t = await inboxTarget(businessId);
  if (!t.ok) return gateFailure(t.result);
  const { fetchInboxPage } = await import("@/lib/gbpReviewInbox.server");
  const page = await fetchInboxPage(t.target, typeof pageToken === "string" && pageToken.length < 500 ? pageToken : null, t.fetchImpl);
  if (!page.ok) {
    if (page.kind === "auth") {
      const { markGbpReconnect } = await import("@/lib/gbpTokens.server");
      await markGbpReconnect(t.admin, businessId);
      return { status: "error", error: "reconnect" };
    }
    console.warn("[review-inbox] list failed", JSON.stringify({ status: page.status, reason: page.reason }));
    return { status: "error", error: "failed" };
  }
  const { pendingFromLog } = await import("@/lib/gbpReviewInbox.server");
  return { status: "ok", reviews: page.reviews, nextPageToken: page.nextPageToken, total: page.total, practice: t.practice, canPost: t.canPost, pending: pageToken ? [] : await pendingFromLog(t.admin, businessId) };
}

export type CheckGoogleReviewResult = { status: "ok"; review: InboxReview } | { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: "reconnect" | "not_found" | "failed" };

/** The waiting page's re-check: one review as Google shows it now (read only). */
export async function checkGoogleReview(businessId: string, reviewId: string): Promise<CheckGoogleReviewResult> {
  if (!isReviewId(reviewId)) return { status: "error", error: "not_found" };
  const t = await inboxTarget(businessId);
  if (!t.ok) return gateFailure(t.result);
  const { fetchReview } = await import("@/lib/gbpReviewInbox.server");
  const res = await fetchReview(t.target, reviewId, t.fetchImpl);
  if (res.ok) return { status: "ok", review: res.review };
  return { status: "error", error: res.kind === "auth" ? "reconnect" : res.kind === "not_found" ? "not_found" : "failed" };
}

/** The owner's click: "Approve and post", "Save to Google" (edit) or "Delete reply" (after its confirm step). */
export async function changeGoogleReviewReply(businessId: string, reviewId: string, action: ReplyAction, text: string | null = null): Promise<ChangeGoogleReplyResult> {
  if (!isReviewId(reviewId) || (action !== "post" && action !== "edit" && action !== "delete")) return { status: "invalid" };
  const reply = action === "delete" ? null : cleanPostedReply(text);
  if (action !== "delete") {
    if (!reply) return { status: "invalid" };
    if (replyBreaksRules(reply)) return { status: "rules" };
  }
  const t = await inboxTarget(businessId);
  if (!t.ok) return gateFailure(t.result);
  // Checked here on the server — the page's disabled buttons are only the visible half.
  if (!t.canPost) return { status: "posting_off" };
  const { changeReplyWithClient } = await import("@/lib/gbpReviewInbox.server");
  const result = await changeReplyWithClient(t.admin, t.target, { action, reviewId, text: reply }, t.fetchImpl, { practice: t.practice });
  if (result.status === "error") return { status: "error", error: result.error };
  return result;
}
