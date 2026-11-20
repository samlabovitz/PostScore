// Server-only. Day 23E: publishing a post once the gate has passed —
// shared by "Publish to Google" (app/actions/gbpPosts.ts) and Approve all
// (app/actions/approveAll.ts). Not a server action: the context comes from
// postContext on the server, never from the browser.
import "server-only";
import { ctaChoices, isPostCta, isPostKind, type PostKind, type PostProblem, type PostState } from "@/lib/gbpPosts";
import type { PostContext } from "@/lib/gbpPostsContext.server";
import { inSitting } from "@/lib/gbpAttributes";
import type { SpellingFlag } from "@/lib/serviceSpelling";

export interface LatestPost {
  batchId: string;
  state: PostState | "unknown";
  searchUrl: string | null;
  /** "Remove from Google" until then; null: past 7 days. */
  undoUntil: string | null;
  approvedAt: string;
}

export type PublishResult =
  | { status: "published"; latest: LatestPost }
  | { status: "invalid"; problems: PostProblem[] }
  | { status: "posted_today" }
  | { status: "spelling"; flags: SpellingFlag[] }
  | { status: "error"; error: string };

export function cleanZone(timeZone: unknown): string {
  try {
    if (typeof timeZone === "string" && timeZone) {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return timeZone;
    }
  } catch {
    // fall through
  }
  return "America/New_York";
}

export async function publishWith(
  c: Extract<PostContext, { ok: true }>,
  input: { text: string; cta: unknown; photoName: unknown; kind: unknown; timeZone: unknown; promoId?: unknown; keep?: unknown },
  practiceOutcome: unknown,
  origin: "approve_all" | null,
  /** Approve all: the sitting's start (lib/gbpAttributes.ts inSitting). */
  sittingStart: number | null = null
): Promise<PublishResult> {
  const businessId = c.post.businessId;
  if (c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    practice.setPracticeOutcome(businessId, practice.isPracticeOutcome(practiceOutcome) ? practiceOutcome : "accept");
  }
  const { createClient } = await import("@/lib/supabase/server");
  const { loadDraftInputs } = await import("@/lib/gbpPostsContext.server");
  const inputs = await loadDraftInputs(createClient(), c.admin, businessId);
  const choices = ctaChoices(inputs?.links ?? { booking: null, website: null, phone: null });
  // An offer post only for the owner's own active coupon, read here — never from the browser.
  const { loadActiveOffer } = await import("@/lib/gbpPostsContext.server");
  const offer = typeof input.promoId === "string" && /^[0-9a-f-]{36}$/i.test(input.promoId) ? await loadActiveOffer(createClient(), businessId, input.promoId) : null;
  const keep = Array.isArray(input.keep) ? input.keep.filter((k): k is string => typeof k === "string" && k.length <= 40).slice(0, 20) : [];
  const cta = choices.find((x) => x.type === (isPostCta(input.cta) ? input.cta : "NONE")) ?? { type: "NONE" as const, url: null };
  const { publishPost, supabasePostStore } = await import("@/lib/gbpPosts.server");
  const r = await publishPost(
    c.post,
    { text: input.text, cta, photoName: typeof input.photoName === "string" && input.photoName ? input.photoName : null, kind: isPostKind(input.kind) ? (input.kind as PostKind) : "week", timeZone: cleanZone(input.timeZone), origin, offer, services: inputs?.serviceNames ?? [], keep, ownerTerms: inputs?.facts.prices.map((p) => p.service) ?? [] },
    sittingStart === null ? supabasePostStore(c.admin) : inSitting(supabasePostStore(c.admin), sittingStart),
    { fetchImpl: c.postFetch, practice: c.practice, refreshToken: c.refreshToken }
  );
  if (r.status === "error") {
    if (r.error === "reconnect") await c.markReconnect();
    return { status: "error", error: r.error };
  }
  if (r.status !== "published") return r;
  if (!c.practice) {
    const { refreshPhotosAndPosts } = await import("@/lib/gbpMediaPosts.server");
    await refreshPhotosAndPosts(c.admin, businessId).catch(() => null);
  }
  return { status: "published", latest: { batchId: r.batchId, state: r.state, searchUrl: r.searchUrl, undoUntil: r.undoUntil, approvedAt: new Date().toISOString() } };
}

