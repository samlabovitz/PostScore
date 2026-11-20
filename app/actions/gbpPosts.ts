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

import { revalidatePath } from "next/cache";
import { GROW_POST_REDRAFTS, savedDraftUsable, cleanPostText, ctaChoices, offerTemplate, postProblems, postSystemPrompt, postTemplate, postUserMessage, weekStartOf, type PostCta, type PostOffer, type PostPhoto, type PostProblem, type PostTopic } from "@/lib/gbpPosts";
import type { SpellingFlag } from "@/lib/serviceSpelling";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { LatestPost } from "@/lib/gbpPostsPublish.server";

export type { LatestPost };

type Blocked = { status: "blocked"; reason: GbpEditBlock | "not_found" | "free" } | { status: "error"; error: string };


export type OpenPostDraftResult =
  | {
      status: "ok";
      text: string;
      /** PostAI couldn't write one that keeps Google's rules: the plain draft. */
      fallback: boolean;
      /** Grow: "Write another" left this week; null: unlimited (Premium). */
      left: number | null;
      ctas: Array<{ type: PostCta; url: string | null }>;
      topic: PostTopic;
      /** The business's own service names — the spellings it already uses. */
      serviceNames: string[];
      /** The owner's price list names (checked for typos, not trusted). */
      priceNames: string[];
      /** An active coupon: the draft is about it, and Premium publishes it as a Google Offer post. */
      offer: PostOffer | null;
      /** Premium on a connected listing (or practice mode). `blockedToday`: can't go to Google today. */
      publish: { canEdit: boolean; practice: boolean; photos: PostPhoto[]; latest: LatestPost | null; blockedToday: "posted_today" | "daily_cap" | null } | null;
    }
  | Blocked;

const WEEK_MS = 7 * 86_400_000;
const memDrafts = new Map<string, string>();
const memAnother = new Map<string, number>();

const cleanZone = async (timeZone: unknown) => (await import("@/lib/gbpPostsPublish.server")).cleanZone(timeZone);

/** "Wednesday, Nov 26" from the page — prompt context only. */
const cleanDay = (day: unknown) => (typeof day === "string" ? day.replace(/[^A-Za-z0-9ÁÉÍÓÚÑÜáéíóúñü ,.]/g, "").slice(0, 40) || null : null);
/** The owner's 1–2 facts for a real story (what, when, for whom). */
const cleanFacts = (facts: unknown) => (typeof facts === "string" ? facts.replace(/\s+/g, " ").trim().slice(0, 300) || null : null);
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

/** PostAI's draft, checked like the owner's own text — plus, for a draft,
 * no invented story unless the owner gave the facts; the plain draft otherwise. */
async function draft(inputs: import("@/lib/gbpPostsContext.server").DraftInputs, day: string | null, extra: { ownerFacts?: string | null; offer?: PostOffer | null } = {}): Promise<{ text: string; fallback: boolean }> {
  const { callAnthropicMessage } = await import("@/lib/anthropicClient");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAnthropicMessage({
        system: postSystemPrompt(inputs.locale, "week", !!extra.ownerFacts, !!extra.offer),
        userMessage: postUserMessage(inputs.facts, inputs.topic, { day, ownerFacts: extra.ownerFacts, offer: extra.offer }),
        maxTokens: 400,
      });
      const text = cleanPostText(raw.trim().replace(/^["“]|["”]$/g, "")) ?? "";
      if (text && text.length <= 700 && postProblems(text, { aiDraft: true, ownerFacts: extra.ownerFacts ?? (extra.offer ? extra.offer.offer : null) }).length === 0) return { text, fallback: false };
    } catch {
      break;
    }
  }
  return { text: extra.offer ? offerTemplate(extra.offer, inputs.facts.name, inputs.locale) : postTemplate(inputs.topic, inputs.locale, inputs.facts), fallback: true };
}

async function savedDraft(admin: import("@supabase/supabase-js").SupabaseClient, businessId: string, week: string, language: string): Promise<string | null | "missing"> {
  const { data, error } = await admin.from("post_drafts").select("text, kind, created_at").eq("business_id", businessId).eq("week_start", week).eq("language", language).in("kind", ["week", "another"]).order("created_at", { ascending: false }).limit(5);
  if (error) return "missing";
  // The newest usable one; an older-rules or rule-breaking draft is skipped (and a new one written).
  const rows = (data ?? []) as Array<{ text: string; kind: string; created_at: string }>;
  return rows.find(savedDraftUsable)?.text ?? null;
}

async function anotherCount(admin: import("@supabase/supabase-js").SupabaseClient, businessId: string, week: string): Promise<number> {
  const { count, error } = await admin.from("post_drafts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("week_start", week).eq("kind", "another");
  return error ? (memAnother.get(`${businessId}|${week}`) ?? 0) : (count ?? 0);
}

async function saveDraft(admin: import("@supabase/supabase-js").SupabaseClient, businessId: string, week: string, kind: "week" | "another", text: string, language: string) {
  memDrafts.set(`${businessId}|${week}|${language}`, text);
  if (kind === "another") memAnother.set(`${businessId}|${week}`, (memAnother.get(`${businessId}|${week}`) ?? 0) + 1);
  await admin.from("post_drafts").insert({ business_id: businessId, week_start: week, kind, text: text.slice(0, 1500), language });
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

/** This week's draft — or, with an active coupon (or `promoId`), the offer's. */
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
  let text: string | null;
  let fallback = false;
  if (offer) {
    // The offer's draft: kept in memory by coupon and language (it changes when the coupon does).
    const key = `offer|${offer.promoId}|${offer.offer}|${offer.code}|${offer.expiry}|${inputs.locale}`;
    text = memDrafts.get(key) ?? null;
    if (text && postProblems(text, { aiDraft: true, ownerFacts: offer.offer }).length) text = null;
    if (!text) {
      const d = await draft(inputs, cleanDay(day), { offer });
      text = d.text;
      fallback = d.fallback;
      memDrafts.set(key, text);
    }
  } else {
    const saved = await savedDraft(o.admin, businessId, week, inputs.locale);
    text = saved === "missing" ? (memDrafts.get(`${businessId}|${week}|${inputs.locale}`) ?? null) : saved;
    if (text && postProblems(text, { aiDraft: true }).length) text = null;
    if (!text) {
      const d = await draft(inputs, cleanDay(day));
      text = d.text;
      fallback = d.fallback;
      await saveDraft(o.admin, businessId, week, "week", text, inputs.locale).catch(() => null);
    }
  }
  const left = o.premium ? null : Math.max(0, GROW_POST_REDRAFTS - (await anotherCount(o.admin, businessId, week)));
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
  return { status: "ok", text, fallback, left, ctas, topic: inputs.topic, serviceNames: inputs.serviceNames, priceNames: inputs.facts.prices.map((p) => p.service), offer, publish };
}

export type WriteAnotherResult = { status: "ok"; text: string; fallback: boolean; left: number | null } | { status: "limit" } | Blocked;

/** "Write another" — or, with the owner's 1–2 facts, a post about what really happened (written only from those). */
export async function writeAnotherPost(businessId: string, timeZone: unknown, day: unknown = null, ownerFacts: unknown = null, promoId: unknown = null): Promise<WriteAnotherResult> {
  const o = await owner(businessId);
  if (!o) return { status: "blocked", reason: "not_found" };
  if (o.plan === "free") return { status: "blocked", reason: "free" };
  const week = weekStartOf(Date.now(), await cleanZone(timeZone));
  const used = await anotherCount(o.admin, businessId, week);
  if (!o.premium && used >= GROW_POST_REDRAFTS) return { status: "limit" };
  const { loadDraftInputs, loadActiveOffer } = await import("@/lib/gbpPostsContext.server");
  const inputs = await loadDraftInputs(o.db, o.admin, businessId);
  if (!inputs) return { status: "blocked", reason: "not_found" };
  const facts = cleanFacts(ownerFacts);
  const offer = facts ? null : await loadActiveOffer(o.db, businessId, cleanPromo(promoId)).catch(() => null);
  const d = await draft(inputs, cleanDay(day), { ownerFacts: facts, offer });
  await saveDraft(o.admin, businessId, week, "another", d.text, inputs.locale).catch(() => null);
  return { status: "ok", text: d.text, fallback: d.fallback, left: o.premium ? null : Math.max(0, GROW_POST_REDRAFTS - used - 1) };
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
  if (r.status === "published" && !c.practice) revalidatePath(`/business/${businessId}/growth`);
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
    revalidatePath(`/business/${businessId}/growth`);
  }
  return r;
}
