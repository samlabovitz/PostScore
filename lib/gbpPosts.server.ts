// Server-only. Day 23E: this week's Google post (Business Profile API v4
// localPosts), with the same safety flow as every write. The caller
// (app/actions/gbpPosts.ts) has already checked the owner, Premium,
// practice mode and the live allow list (GOOGLE_WRITES_LIVE_PLACES).
//   1. Google's post rules (lib/gbpPosts.ts postProblems), one post a day,
//      the approval limits, the edit log ready;
//   2. the owner's photo, when chosen: that one media item read again from
//      the listing — its googleUrl is the post's sourceUrl (nothing is
//      uploaded, nothing kept);
//   3. a gbp_changes row saved as "sending" first — Google's post name and
//      PostScore's own choices only, never the text;
//   4. localPosts.create;
//   5. read it back: PROCESSING is "Waiting for Google", LIVE has its link,
//      REJECTED says so.
// A 401 is refreshed once and the call tried again (tokens are never
// deleted after one failure). Undo (≤ 7 days): DELETE the post.
import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { approvalAllowed } from "@/lib/gbpAttributes";
import { call, type GbpEditError, type GoogleCall } from "@/lib/gbpAttributes.server";
import { supabasePhotoStore, type PhotoStore } from "@/lib/gbpPhotos.server";
import {
  callToAction,
  postedToday,
  postPhotos,
  postProblems,
  postsKind,
  postStateOf,
  postUndoUntil,
  readStoredPost,
  type GbpMediaItem,
  type PostCta,
  type PostKind,
  type PostPhoto,
  type PostProblem,
  type PostRow,
  type PostState,
  type StoredPost,
  type PostOffer,
  offerPostFields,
} from "@/lib/gbpPosts";
import { spellingFlags, type SpellingFlag } from "@/lib/serviceSpelling";
import { localToday } from "@/lib/googleRecommendations";

const V4 = "https://mybusiness.googleapis.com/v4";
const DAY_MS = 86_400_000;

export interface PostTarget {
  businessId: string;
  userId: string;
  /** "accounts/1/locations/2" (v4 names the account too). */
  parent: string;
  accessToken: string;
  languageCode: "en" | "es";
}

export interface PostStore extends PhotoStore {
  /** This business's PostScore posts since `since` (null: not readable). */
  postRows(businessId: string, kind: string, since: string): Promise<PostRow[] | null>;
}

export function supabasePostStore(db: SupabaseClient): PostStore {
  const base = supabasePhotoStore(db);
  return {
    ...base,
    async insert(row) {
      const first = await db.from("gbp_changes").insert(row).select("id").single();
      // Before supabase/day23e-posts-answers.sql: the same row without its origin.
      if (first.error && "origin" in row && (first.error.code === "PGRST204" || first.error.code === "42703")) {
        const rest = { ...row };
        delete rest.origin;
        const again = await db.from("gbp_changes").insert(rest).select("id").single();
        return again.error ? null : ((again.data as { id: string }).id ?? null);
      }
      return first.error ? null : ((first.data as { id: string }).id ?? null);
    },
    async postRows(businessId, kind, since) {
      const { data, error } = await db.from("gbp_changes").select("id, batch_id, after_value, approved_at, status, undone_at").eq("business_id", businessId).eq("kind", kind).is("undo_of", null).gte("approved_at", since).order("approved_at", { ascending: false }).limit(50);
      return error ? null : ((data ?? []) as PostRow[]);
    },
  };
}

export interface PostOptions {
  fetchImpl?: typeof fetch;
  practice?: boolean;
  now?: number;
  /** A fresh token after a 401 (refresh once); null: couldn't. */
  refreshToken?: () => Promise<string | null>;
}

/** One call, with one refresh-and-retry on a 401. */
async function callOnce<T>(f: typeof fetch, target: PostTarget, url: string, init: RequestInit, refresh?: () => Promise<string | null>): Promise<GoogleCall<T>> {
  const first = await call<T>(f, target.accessToken, url, init);
  if (first.ok || first.status !== 401 || !refresh) return first;
  const token = await refresh();
  if (!token) return first;
  target.accessToken = token;
  return call<T>(f, token, url, init);
}

/** The owner's photos that suit a post, read live (never saved). */
export async function listPostPhotos(target: PostTarget, options: PostOptions = {}): Promise<GoogleCall<PostPhoto[]>> {
  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  try {
    const res = await callOnce<{ mediaItems?: GbpMediaItem[] }>(f, target, `${V4}/${target.parent}/media?pageSize=100`, {}, options.refreshToken);
    return res.ok ? { ok: true, data: postPhotos(res.data.mediaItems ?? []) } : res;
  } finally {
    logGbpCalls("posts-photos", counter);
  }
}

interface GoogleLocalPost {
  name?: string;
  state?: string;
  searchUrl?: string;
}

export type PublishPostResult =
  | { status: "published"; batchId: string; name: string; state: PostState; searchUrl: string | null; undoUntil: string | null }
  | { status: "invalid"; problems: PostProblem[] }
  | { status: "posted_today" }
  /** A likely typo of a service name the owner hasn't fixed or kept. Nothing sent. */
  | { status: "spelling"; flags: SpellingFlag[] }
  | { status: "error"; error: GbpEditError | "photo_gone" | "offer_ended" };

const reasonOf = (r: { reason?: string | null; status?: number | null; error: string }) => r.reason ?? (r.status ? String(r.status) : r.error);

export async function publishPost(
  target: PostTarget,
  input: {
    text: string;
    cta: { type: PostCta; url: string | null };
    photoName: string | null;
    kind: PostKind;
    timeZone: string;
    origin?: "approve_all" | null;
    /** An active coupon: published as a Google Offer post. */
    offer?: PostOffer | null;
    /** The business's own service names (spelling) and the words the owner chose to keep. */
    services?: string[];
    keep?: string[];
    /** The owner's price list names: a typo there ("baylage") is caught in the post too. */
    ownerTerms?: string[];
  },
  store: PostStore,
  options: PostOptions = {}
): Promise<PublishPostResult> {
  const now = options.now ?? Date.now();
  const practice = options.practice === true;
  const text = input.text.trim();
  // 1. Google's rules, one a day, the limits.
  const problems = postProblems(text);
  if (problems.length) return { status: "invalid", problems };
  const flags = spellingFlags(text, { services: input.services, keep: input.keep, prose: true, ownerTerms: input.ownerTerms });
  if (flags.length) return { status: "spelling", flags };
  const offer = input.offer ? offerPostFields(input.offer, localToday(now, input.timeZone).date) : null;
  if (input.offer && !offer) return { status: "error", error: "offer_ended" };
  const kind = postsKind(practice);
  const rows = await store.postRows(target.businessId, kind, new Date(now - 2 * DAY_MS).toISOString());
  if (rows === null || !(await store.editLogReady(target.businessId))) return { status: "error", error: "not_enabled" };
  if (postedToday(rows, now, input.timeZone)) return { status: "posted_today" };
  const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
  if (approvals === null) return { status: "error", error: "not_enabled" };
  const allowed = approvalAllowed(approvals, now);
  if (allowed !== "ok") return { status: "error", error: allowed };

  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  const log = (outcome: "ok" | "unconfirmed" | "failed", reason: string | null = null) =>
    store.logEdit({ business_id: target.businessId, user_id: target.userId, field: "posts", action: "edit", outcome, practice, error_reason: reason, changed_count: 1 });
  try {
    // 2. The photo: only this listing's own media, read again now.
    let sourceUrl: string | null = null;
    if (input.photoName) {
      if (!input.photoName.startsWith(`${target.parent}/media/`)) return { status: "error", error: "photo_gone" };
      const photo = await callOnce<GbpMediaItem>(f, target, `${V4}/${input.photoName}`, {}, options.refreshToken);
      sourceUrl = photo.ok ? (photo.data.googleUrl ?? null) : null;
      if (!sourceUrl) return { status: "error", error: photo.ok || photo.status === 404 ? "photo_gone" : photo.error };
    }

    // 3. Saved first — the name (once Google gives it) and our choices.
    const batchId = randomUUID();
    const stored: StoredPost = { name: null, kind: input.kind, cta: offer ? "NONE" : input.cta.type, hasPhoto: !!sourceUrl, length: text.length, ...(offer ? { offer: true } : {}) };
    const rowId = await store.insert({
      business_id: target.businessId,
      batch_id: batchId,
      kind,
      field: "post",
      before_value: null,
      after_value: JSON.stringify(stored),
      approved_by: target.userId,
      approved_at: new Date(now).toISOString(),
      location_name: target.parent.replace(/^accounts\/[^/]+\//, ""),
      status: "sending",
      ...(input.origin ? { origin: input.origin } : {}),
    });
    if (!rowId) return { status: "error", error: "not_enabled" };

    // 4. Create.
    // An offer post carries its title, dates, code and terms; Google gives it its own "View offer" button.
    const cta = offer ? undefined : callToAction(input.cta);
    const body = {
      languageCode: target.languageCode,
      summary: text,
      topicType: offer ? "OFFER" : "STANDARD",
      ...(offer ?? {}),
      ...(cta ? { callToAction: cta } : {}),
      ...(sourceUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl }] } : {}),
    };
    const created = await callOnce<GoogleLocalPost>(f, target, `${V4}/${target.parent}/localPosts`, { method: "POST", body: JSON.stringify(body) }, options.refreshToken);
    if (!created.ok || !created.data.name) {
      const res = created.ok ? { error: "failed" as const, reason: "no_name" } : created;
      await store.update(rowId, { status: "failed", error_reason: `create:${reasonOf(res)}`.slice(0, 120) });
      await log("failed", `create:${reasonOf(res)}`);
      return { status: "error", error: res.error };
    }
    const name = created.data.name;

    // 5. Read it back.
    const back = await callOnce<GoogleLocalPost>(f, target, `${V4}/${name}`, {}, options.refreshToken);
    const post = back.ok ? back.data : created.data;
    await store.update(rowId, { status: "sent", error_reason: back.ok ? null : "read_back_failed", after_value: JSON.stringify({ ...stored, name }) });
    await log(back.ok ? "ok" : "unconfirmed", back.ok ? null : "read_back_failed");
    return { status: "published", batchId, name, state: postStateOf(post.state), searchUrl: post.searchUrl ?? null, undoUntil: postUndoUntil(new Date(now).toISOString(), now) };
  } finally {
    logGbpCalls("posts-publish", counter);
  }
}

export type PostStatusResult = { status: "ok"; state: PostState; searchUrl: string | null } | { status: "gone" } | { status: "error"; error: GbpEditError };

/** "Waiting for Google" → live (with its link) or not accepted. A read only. */
export async function readPostStatus(target: PostTarget, name: string, options: PostOptions = {}): Promise<PostStatusResult> {
  if (!name.startsWith(`${target.parent}/localPosts/`)) return { status: "gone" };
  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  try {
    const res = await callOnce<GoogleLocalPost>(f, target, `${V4}/${name}`, {}, options.refreshToken);
    if (!res.ok) return res.status === 404 ? { status: "gone" } : { status: "error", error: res.error };
    return { status: "ok", state: postStateOf(res.data.state), searchUrl: res.data.searchUrl ?? null };
  } finally {
    logGbpCalls("posts-status", counter);
  }
}

/** The newest PostScore post still up, from gbp_changes (no Google call). */
export async function latestPostRow(store: PostStore, businessId: string, practice: boolean, now: number = Date.now()): Promise<{ batchId: string; name: string; post: StoredPost; approvedAt: string; undoUntil: string | null } | null> {
  const rows = await store.postRows(businessId, postsKind(practice), new Date(now - 30 * DAY_MS).toISOString());
  const r = (rows ?? []).filter((x) => x.status === "sent" && !x.undone_at).map((x) => ({ x, post: readStoredPost(x.after_value) })).find((y) => y.post?.name);
  return r ? { batchId: r.x.batch_id, name: r.post!.name!, post: r.post!, approvedAt: r.x.approved_at, undoUntil: postUndoUntil(r.x.approved_at, now) } : null;
}

/** "Remove from Google": delete the post (≤ 7 days). */
export async function undoPost(target: PostTarget, batchId: string, store: PostStore, options: PostOptions = {}): Promise<{ status: "undone" } | { status: "error"; error: GbpEditError | "undo_expired" }> {
  const now = options.now ?? Date.now();
  const rows = await store.batchRows(target.businessId, batchId);
  const row = (rows ?? []).find((r) => r.status === "sent" && !r.undone_at);
  const post = row ? readStoredPost(row.after_value) : null;
  if (!row || !post?.name || !postUndoUntil(row.approved_at, now) || !post.name.startsWith(`${target.parent}/localPosts/`)) return { status: "error", error: "undo_expired" };
  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  let res: GoogleCall<unknown>;
  try {
    res = await callOnce(f, target, `${V4}/${post.name}`, { method: "DELETE" }, options.refreshToken);
  } finally {
    logGbpCalls("posts-undo", counter);
  }
  // Already gone (404) counts as removed.
  const ok = res.ok || res.status === 404;
  await store.logEdit({ business_id: target.businessId, user_id: target.userId, field: "posts", action: "undo", outcome: ok ? "ok" : "failed", practice: options.practice === true, error_reason: ok || res.ok ? null : res.error, changed_count: ok ? 1 : 0 });
  if (!ok) return { status: "error", error: (res as Extract<GoogleCall<unknown>, { ok: false }>).error };
  await store.markUndone(target.businessId, batchId, new Date(now).toISOString());
  return { status: "undone" };
}
