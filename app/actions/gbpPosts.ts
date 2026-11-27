"use server";

// Day 23E: this week's Google post.
// - openPostDraft: the week's draft (PostAI, from what PostScore knows; a
//   plain template when PostAI is unavailable or breaks Google's rules
//   twice), kept for the week in post_drafts so reopening never redrafts.
//   Grow and Premium. Premium on a connected listing also gets the
//   owner's photos (read live, never saved), the buttons the listing can
//   have, whether PostScore can publish (practice mode or
//   GOOGLE_WRITES_LIVE_PLACES) and the latest post's state.
// - writeAnotherPost: a new draft. Grow: 3 a week; Premium: unlimited.
// - publishPostAction / postStatusAction / undoPostAction: Premium only,
//   ONLY from the owner's click (lib/gbpPosts.server.ts).
// Free never calls these (its post item is unchanged).

import { googlePagePaths } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { GROW_POST_REDRAFTS, cleanPostText, ctaChoices, isPostType, postProblems, postSystemPrompt, postTemplate, postUserMessage, qaPostText, requestGivesStory, weekStartOf, type PostCta, type PostOffer, type PostPhoto, type PostProblem, type PostTopic, type PostType } from "@/lib/gbpPosts";
import type { SpellingFlag } from "@/lib/serviceSpelling";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { LatestPost } from "@/lib/gbpPostsPublish.server";

export type { LatestPost };

type Blocked = { status: "blocked"; reason: GbpEditBlock | "not_found" | "free" } | { status: "error"; error: string };


export type OpenPostDraftResult =
  | {
      status: "ok";
      /** The draft for each post type: an update (a general invitation), a Q&A ("Your questions, answered",
       * from confirmed facts; null with fewer than 3 answers), the running coupon as an offer (null without one). */
      drafts: { update: string; qa: string | null; offer: string | null };
      /** The type shown first: the offer when a coupon is running, else the update. */
      defaultType: PostType;
      /** This week's PostAI draft isn't written yet (the background run does it): the plain draft for now. */
      pending?: boolean;
      /** PostAI couldn't write one that keeps Google's rules: the plain draft. */
      fallback: boolean;
      /** Grow: custom drafts ("Write another", "Tell PostScore what you want") left this week; null: unlimited (Premium). */
      left: number | null;
      ctas: Array<{ type: PostCta; url: string | null }>;
      topic: PostTopic;
      /** The business's own service names — the spellings it already uses. */
      serviceNames: string[];
      /** The owner's price list names (checked for typos, not trusted). */
      priceNames: string[];
      /** An active coupon: the offer type, and Premium publishes it as a Google Offer post. */
      offer: PostOffer | null;
      /** Premium on a connected listing (or practice mode). `blockedToday`: can't go to Google today. */
      publish: { canEdit: boolean; practice: boolean; photos: PostPhoto[]; latest: LatestPost | null; blockedToday: "posted_today" | "daily_cap" | null } | null;
    }
  | Blocked;

const WEEK_MS = 7 * 86_400_000;

const cleanZone = async (timeZone: unknown) => (await import("@/lib/gbpPostsPublish.server")).cleanZone(timeZone);

/** "Wednesday, Nov 26" from the page — prompt context only. */
const cleanDay = (day: unknown) => (typeof day === "string" ? day.replace(/[^A-Za-z0-9ÁÉÍÓÚÑÜáéíóúñü ,.]/g, "").slice(0, 40) || null : null);
/** The owner's request ("Tell PostScore what you want"), at most 300 characters. */
const cleanRequest = (request: unknown) => (typeof request === "string" ? request.replace(/\s+/g, " ").trim().slice(0, 300) || null : null);
const cleanPromo = (id: unknown) => (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null);

async function owner(businessId: string) {
  const { createClient } = await import("@/lib/supabase/server");
  const db = createClient();
  const { data } = await db.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!data) return null;
  const [{ getPlan }, { isPremiumPlan }, { createAdminClient }] = await Promise.all([import("@/lib/premium"), import("@/lib/plan"), import("@/lib/supabase/admin")]);
  const plan = await getPlan();
  return { db, admin: createAdminClient(), plan, premium: isPremiumPlan(plan) };
}

type Inputs = import("@/lib/gbpPostsContext.server").DraftInputs;
// The week's drafts (kept in post_drafts): shared with the background writer (lib/postDrafts.server.ts), loaded on
// demand like every server module here.
type PD = typeof import("@/lib/postDrafts.server");
const pd = () => import("@/lib/postDrafts.server");
const draft = async (...a: Parameters<PD["draft"]>) => (await pd()).draft(...a);
const savedDraft = async (...a: Parameters<PD["savedDraft"]>) => (await pd()).savedDraft(...a);
const saveDraft = async (...a: Parameters<PD["saveDraft"]>) => (await pd()).saveDraft(...a);
const customDraftsUsed = async (...a: Parameters<PD["customDraftsUsed"]>) => (await pd()).customDraftsUsed(...a);

/** "Your questions, answered" by PostAI from the confirmed pairs (and the owner's request); the plain pairs otherwise. */
async function qaDraft(inputs: Inputs, entries: Array<{ q: string; a: string }>, request: string | null): Promise<{ text: string; fallback: boolean } | null> {
  const plain = qaPostText(entries, inputs.locale);
  if (!plain) return null;
  const { callAnthropicMessage } = await import("@/lib/anthropicClient");
  try {
    const raw = await callAnthropicMessage({
      system: postSystemPrompt(inputs.locale, "qa", false, false, !!request),
      userMessage: postUserMessage(inputs.facts, inputs.topic, { day: null, answers: entries.map((e) => `${e.q} — ${e.a}`), request }),
      maxTokens: 600,
    });
    const text = cleanPostText(raw.trim().replace(/^["“]|["”]$/g, "")) ?? "";
    if (text && postProblems(text, { aiDraft: true }).length === 0) return { text, fallback: false };
  } catch {
    // the plain pairs below
  }
  return { text: plain, fallback: true };
}

type Ctx = Extract<Awaited<ReturnType<typeof import("@/lib/gbpPostsContext.server").postContext>>, { ok: true }>;

/** The latest PostScore post, its state read live (one GET). */
async function latest(c: Ctx): Promise<LatestPost | null> {
  const { latestPostRow, readPostStatus, supabasePostStore } = await import("@/lib/gbpPosts.server");
  const row = await latestPostRow(supabasePostStore(c.admin), c.post.businessId, c.practice).catch(() => null);
  if (!row || Date.now() - Date.parse(row.approvedAt) > WEEK_MS) return null;
  const s = await readPostStatus(c.post, row.name, { fetchImpl: c.postFetch, refreshToken: c.refreshToken }).catch(() => null);
  if (s?.status === "gone") return null;
  return { batchId: row.batchId, state: s?.status === "ok" ? s.state : "unknown", searchUrl: s?.status === "ok" ? s.searchUrl : null, undoUntil: row.undoUntil, approvedAt: row.approvedAt };
}

/** Can a post go to Google today: one a day, and the daily approval cap. */
async function blockedToday(c: Ctx, timeZone: string): Promise<"posted_today" | "daily_cap" | null> {
  const [{ supabasePostStore }, { postsKind, postedToday }, { approvalAllowed }] = await Promise.all([import("@/lib/gbpPosts.server"), import("@/lib/gbpPosts"), import("@/lib/gbpAttributes")]);
  const store = supabasePostStore(c.admin);
  const now = Date.now();
  const rows = await store.postRows(c.post.businessId, postsKind(c.practice), new Date(now - 2 * 86_400_000).toISOString()).catch(() => null);
  if (rows && postedToday(rows, now, timeZone)) return "posted_today";
  const approvals = await store.approvalsSince(c.post.businessId, new Date(now - 86_400_000).toISOString()).catch(() => null);
  return approvals && approvalAllowed(approvals, now + 61_000) === "daily_cap" ? "daily_cap" : null;
}

/** The confirmed Q&A pairs (the same as the website FAQ), in the page's language. */
async function qaEntries(admin: import("@supabase/supabase-js").SupabaseClient, businessId: string, inputs: Inputs) {
  const [{ confirmedAnswerFacts }, { faqEntries }] = await Promise.all([import("@/lib/googleAnswers.server"), import("@/lib/googleAnswers")]);
  const facts = await confirmedAnswerFacts(admin, businessId, inputs.facts.name, inputs.locale).catch(() => null);
  return facts ? faqEntries(facts, inputs.locale) : [];
}

/** This week's drafts: the update (a general invitation, kept for the week), the Q&A, and the running coupon's offer. */
export async function openPostDraft(businessId: string, timeZone: unknown, day: unknown = null, promoId: unknown = null): Promise<OpenPostDraftResult> {
  const o = await owner(businessId);
  if (!o) return { status: "blocked", reason: "not_found" };
  if (o.plan === "free") return { status: "blocked", reason: "free" };
  const { loadDraftInputs, loadActiveOffer } = await import("@/lib/gbpPostsContext.server");
  const inputs = await loadDraftInputs(o.db, o.admin, businessId);
  if (!inputs) return { status: "blocked", reason: "not_found" };
  const zone = await cleanZone(timeZone);
  const week = weekStartOf(Date.now(), zone);
  const offer = await loadActiveOffer(o.db, businessId, cleanPromo(promoId)).catch(() => null);
  const fallback = false;
  // The update: this week's saved draft (in this language), else a new one.
  const saved = await savedDraft(o.admin, businessId, week, inputs.locale);
  let update = saved === "missing" ? ((await pd()).memDrafts.get(`${businessId}|${week}|${inputs.locale}`) ?? null) : saved;
  if (update && postProblems(update, { aiDraft: true }).length) update = null;
  // Never written on page load (lib/postDrafts.server.ts writes it in the background): until it's saved, the plain
  // draft, said plainly.
  let pending = false;
  if (!update) {
    update = postTemplate(inputs.topic, inputs.locale, inputs.facts);
    pending = true;
  }
  // The offer: kept in memory by coupon and language (it changes when the coupon does).
  let offerText: string | null = null;
  if (offer) {
    const key = `offer|${offer.promoId}|${offer.offer}|${offer.code}|${offer.expiry}|${inputs.locale}`;
    offerText = (await pd()).memDrafts.get(key) ?? null;
    if (offerText && postProblems(offerText, { aiDraft: true, ownerFacts: offer.offer }).length) offerText = null;
    if (!offerText) {
      offerText = (await draft(inputs, cleanDay(day), { offer })).text;
      (await pd()).memDrafts.set(key, offerText);
    }
  }
  // The Q&A: the confirmed pairs as they are (no AI until "Write another").
  const qa = qaPostText(await qaEntries(o.admin, businessId, inputs), inputs.locale);
  const left = o.premium ? null : Math.max(0, GROW_POST_REDRAFTS - (await customDraftsUsed(o.admin, businessId, week)));
  const ctas = ctaChoices(inputs.links);
  let publish: Extract<OpenPostDraftResult, { status: "ok" }>["publish"] = null;
  if (o.premium) {
    const { postContext } = await import("@/lib/gbpPostsContext.server");
    const c = await postContext(businessId);
    if (c.ok) {
      const { listPostPhotos } = await import("@/lib/gbpPosts.server");
      const photos = await listPostPhotos(c.post, { fetchImpl: c.postFetch, refreshToken: c.refreshToken }).catch(() => null);
      publish = { canEdit: c.canEdit, practice: c.practice, photos: photos?.ok ? photos.data : [], latest: await latest(c).catch(() => null), blockedToday: await blockedToday(c, zone).catch(() => null) };
    }
  }
  return {
    status: "ok",
    drafts: { update, qa, offer: offerText },
    defaultType: offer ? "offer" : "update",
    fallback,
    pending,
    left,
    ctas,
    topic: inputs.topic,
    serviceNames: inputs.serviceNames,
    priceNames: inputs.facts.prices.map((p) => p.service),
    offer,
    publish,
  };
}

export type WriteAnotherResult = { status: "ok"; text: string; fallback: boolean; left: number | null } | { status: "limit" } | { status: "none" } | Blocked;

/** "Write another" — or "Tell PostScore what you want" (`request`) — for the post type shown. Same rules:
 * no invented events, prices or results (a real story only from facts the owner gives), Google's post rules.
 * Grow: 3 custom drafts a week; Premium: unlimited. */
export async function writeAnotherPost(businessId: string, timeZone: unknown, day: unknown = null, request: unknown = null, promoId: unknown = null, type: unknown = "update"): Promise<WriteAnotherResult> {
  const o = await owner(businessId);
  if (!o) return { status: "blocked", reason: "not_found" };
  if (o.plan === "free") return { status: "blocked", reason: "free" };
  const week = weekStartOf(Date.now(), await cleanZone(timeZone));
  const used = await customDraftsUsed(o.admin, businessId, week);
  if (!o.premium && used >= GROW_POST_REDRAFTS) return { status: "limit" };
  const { loadDraftInputs, loadActiveOffer } = await import("@/lib/gbpPostsContext.server");
  const inputs = await loadDraftInputs(o.db, o.admin, businessId);
  if (!inputs) return { status: "blocked", reason: "not_found" };
  const req = cleanRequest(request);
  const kind: PostType = isPostType(type) ? type : "update";
  let d: { text: string; fallback: boolean } | null;
  if (kind === "qa") d = await qaDraft(inputs, await qaEntries(o.admin, businessId, inputs), req);
  else if (kind === "offer") {
    const offer = await loadActiveOffer(o.db, businessId, cleanPromo(promoId)).catch(() => null);
    d = offer ? await draft(inputs, cleanDay(day), { offer, request: req }) : null;
  } else d = await draft(inputs, cleanDay(day), { request: req });
  if (!d) return { status: "none" };
  await saveDraft(o.admin, businessId, week, kind === "update" ? "another" : kind, d.text, inputs.locale).catch(() => null);
  return { status: "ok", text: d.text, fallback: d.fallback, left: o.premium ? null : Math.max(0, GROW_POST_REDRAFTS - used - 1) };
}

/** Grow's new drafts left this week (the post and the description share them); null: unlimited (Premium). */
export async function draftsLeftAction(businessId: string, timeZone: unknown): Promise<number | null> {
  const o = await owner(businessId);
  if (!o || o.plan === "free" || o.premium) return null;
  const used = await customDraftsUsed(o.admin, businessId, weekStartOf(Date.now(), await cleanZone(timeZone)));
  return Math.max(0, GROW_POST_REDRAFTS - used);
}

/** "Draft another with PostAI" for the description (the answers' step 1): PostAI under Google's
 * description rules, from what PostScore knows plus the owner's request. Grow: counts toward the 3. */
export async function redraftDescription(businessId: string, request: unknown, timeZone: unknown): Promise<WriteAnotherResult> {
  const o = await owner(businessId);
  if (!o) return { status: "blocked", reason: "not_found" };
  if (o.plan === "free") return { status: "blocked", reason: "free" };
  const week = weekStartOf(Date.now(), await cleanZone(timeZone));
  const used = await customDraftsUsed(o.admin, businessId, week);
  if (!o.premium && used >= GROW_POST_REDRAFTS) return { status: "limit" };
  const [{ loadDraftInputs }, { descriptionProblems, descriptionSystemPrompt }, { callAnthropicMessage }] = await Promise.all([import("@/lib/gbpPostsContext.server"), import("@/lib/gbpProfileEdits"), import("@/lib/anthropicClient")]);
  const inputs = await loadDraftInputs(o.db, o.admin, businessId);
  if (!inputs) return { status: "blocked", reason: "not_found" };
  const f = inputs.facts;
  const req = cleanRequest(request);
  const facts = [`Name: ${f.name}`, f.category ? `Category: ${f.category}` : null, f.city ? `City: ${f.city}` : null, [...f.services, ...inputs.serviceNames].length ? `Services: ${Array.from(new Set([...f.services, ...inputs.serviceNames])).slice(0, 15).join(", ")}` : null, f.differentiator ? `What sets it apart (the owner's words): ${f.differentiator.slice(0, 300)}` : null].filter(Boolean);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAnthropicMessage({
        system: `${descriptionSystemPrompt(inputs.locale)}\nFollow the owner's request between <owner_request> tags (what to focus on, the tone, the length) — but add no fact that isn't in the facts or the request itself.`,
        userMessage: `<facts>\n${facts.join("\n")}\n</facts>${req ? `\n\n<owner_request>\n${req}\n</owner_request>` : ""}\n\nWrite at least 300 characters.`,
        maxTokens: 400,
      });
      const text = raw.trim().replace(/^["“]|["”]$/g, "");
      if (text && descriptionProblems(text).length === 0 && postProblems(text, { aiDraft: true, ownerFacts: requestGivesStory(req) ? req : null }).length === 0) {
        await saveDraft(o.admin, businessId, week, "description", text, inputs.locale).catch(() => null);
        return { status: "ok", text, fallback: false, left: o.premium ? null : Math.max(0, GROW_POST_REDRAFTS - used - 1) };
      }
    } catch {
      break;
    }
  }
  return { status: "error", error: "unavailable" };
}

export type PublishPostActionResult =
  | { status: "published"; latest: LatestPost }
  | { status: "invalid"; problems: PostProblem[] }
  | { status: "posted_today" }
  | { status: "spelling"; flags: SpellingFlag[] }
  | { status: "editing_off" }
  | Blocked;

/** "Publish to Google" — the text the owner approved, the button type
 * (its link is the listing's own, looked up here), their photo, the
 * offer's coupon id (read again on the server) and the words they chose to keep. */
export async function publishPostAction(businessId: string, input: { text: unknown; cta: unknown; photoName: unknown; kind: unknown; timeZone: unknown; promoId?: unknown; keep?: unknown }, practiceOutcome: unknown = null): Promise<PublishPostActionResult> {
  const text = cleanPostText(input?.text);
  if (!text) return { status: "invalid", problems: ["empty"] };
  const problems = postProblems(text);
  if (problems.length) return { status: "invalid", problems };
  const { postContext } = await import("@/lib/gbpPostsContext.server");
  const c = await postContext(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const { publishWith } = await import("@/lib/gbpPostsPublish.server");
  const r = await publishWith(c, { text, cta: input.cta, photoName: input.photoName, kind: input.kind, timeZone: input.timeZone, promoId: input.promoId, keep: input.keep }, practiceOutcome, null);
  if (r.status === "published" && !c.practice) for (const p of googlePagePaths(businessId)) revalidatePath(p);
  return r;
}

export type PostStatusActionResult = { status: "ok"; latest: LatestPost | null } | Blocked;

/** "Waiting for Google": the latest post's state, read live. */
export async function postStatusAction(businessId: string): Promise<PostStatusActionResult> {
  const { postContext } = await import("@/lib/gbpPostsContext.server");
  const c = await postContext(businessId);
  if (!c.ok) return c.result;
  return { status: "ok", latest: await latest(c).catch(() => null) };
}

export type UndoPostActionResult = { status: "undone" } | { status: "editing_off" } | Blocked;

export async function undoPostAction(businessId: string, batchId: string): Promise<UndoPostActionResult> {
  if (typeof batchId !== "string" || !batchId) return { status: "error", error: "undo_expired" };
  const { postContext } = await import("@/lib/gbpPostsContext.server");
  const c = await postContext(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const { undoPost, supabasePostStore } = await import("@/lib/gbpPosts.server");
  const r = await undoPost(c.post, batchId, supabasePostStore(c.admin), { fetchImpl: c.postFetch, practice: c.practice, refreshToken: c.refreshToken });
  if (r.status === "error") return { status: "error", error: r.error };
  if (!c.practice) {
    const { refreshPhotosAndPosts } = await import("@/lib/gbpMediaPosts.server");
    await refreshPhotosAndPosts(c.admin, businessId).catch(() => null);
    for (const p of googlePagePaths(businessId)) revalidatePath(p);
  }
  return r;
}
