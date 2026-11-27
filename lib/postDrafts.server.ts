import "server-only";

// Day 25B §2d: the weekly Google post and the answers' description are drafted in the BACKGROUND, like the review
// replies (lib/replyBatch.server.ts): the daily job (app/api/cron/reply-drafts) and the run after a scan or a voice
// change. Pages only read what's saved, so a saved draft shows at once — never "Getting drafts ready…", never a
// PostAI call on page load. Saved in post_drafts: our own text only (kind 'week' for the post, 'answers_description'
// for the description, supabase/day25b-background-drafts.sql); Google's own values are read live when shown.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plan";
import { cleanPostText, offerTemplate, postProblems, postSystemPrompt, postTemplate, postUserMessage, requestGivesStory, savedDraftUsable, weekStartOf, type PostOffer } from "@/lib/gbpPosts";

type Inputs = import("@/lib/gbpPostsContext.server").DraftInputs;
type DraftKind = "week" | "another" | "qa" | "offer" | "description" | "answers_description";

/** This server's copies, so a page opened right after a draft never waits on the database. */
export const memDrafts = new Map<string, string>();
const memAnother = new Map<string, number>();

/** PostAI's draft, checked like the owner's own text — plus, for a draft, no invented story unless the
 * owner's request gives the facts of one; the plain draft otherwise. */
export async function draft(inputs: Inputs, day: string | null, extra: { offer?: PostOffer | null; request?: string | null } = {}): Promise<{ text: string; fallback: boolean }> {
  const { callAnthropicMessage } = await import("@/lib/anthropicClient");
  const story = requestGivesStory(extra.request);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAnthropicMessage({
        system: postSystemPrompt(inputs.locale, "week", story, !!extra.offer, !!extra.request),
        userMessage: postUserMessage(inputs.facts, inputs.topic, { day, offer: extra.offer, request: extra.request, ownerFacts: story ? extra.request : null }),
        maxTokens: 400,
      });
      const text = cleanPostText(raw.trim().replace(/^["“]|["”]$/g, "")) ?? "";
      if (text && text.length <= 700 && postProblems(text, { aiDraft: true, ownerFacts: story ? extra.request : extra.offer ? extra.offer.offer : null }).length === 0) return { text, fallback: false };
    } catch {
      break;
    }
  }
  return { text: extra.offer ? offerTemplate(extra.offer, inputs.facts.name, inputs.locale) : postTemplate(inputs.topic, inputs.locale, inputs.facts), fallback: true };
}

export async function savedDraft(admin: SupabaseClient, businessId: string, week: string, language: string): Promise<string | null | "missing"> {
  const { data, error } = await admin.from("post_drafts").select("text, kind, created_at").eq("business_id", businessId).eq("week_start", week).eq("language", language).in("kind", ["week", "another"]).order("created_at", { ascending: false }).limit(5);
  if (error) return "missing";
  // The newest usable one; an older-rules or rule-breaking draft is skipped (and a new one written).
  const rows = (data ?? []) as Array<{ text: string; kind: string; created_at: string }>;
  return rows.find(savedDraftUsable)?.text ?? null;
}

/** Custom drafts this week (Grow: 3) — "Write another" and "Tell PostScore what you want", for any post type or the
 * description. PostScore's own background drafts ('week', 'answers_description') never count. */
export async function customDraftsUsed(admin: SupabaseClient, businessId: string, week: string): Promise<number> {
  const { count, error } = await admin.from("post_drafts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("week_start", week).in("kind", ["another", "qa", "offer", "description"]);
  return Math.max(error ? 0 : (count ?? 0), memAnother.get(`${businessId}|${week}`) ?? 0);
}

export async function saveDraft(admin: SupabaseClient, businessId: string, week: string, kind: DraftKind, text: string, language: string) {
  if (kind === "week" || kind === "another") memDrafts.set(`${businessId}|${week}|${language}`, text);
  if (kind !== "week" && kind !== "answers_description") memAnother.set(`${businessId}|${week}`, (memAnother.get(`${businessId}|${week}`) ?? 0) + 1);
  await admin.from("post_drafts").insert({ business_id: businessId, week_start: week, kind, text: text.slice(0, 1500), language });
}

/** The newest saved background description draft in this language (any week: it's about the business, not the week). */
export async function savedAnswersDescription(admin: SupabaseClient, businessId: string, language: string): Promise<string | null> {
  const { data, error } = await admin.from("post_drafts").select("text").eq("business_id", businessId).eq("kind", "answers_description").eq("language", language).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return (data as { text?: string } | null)?.text ?? null;
}

/** The answers' description draft (PostAI, Google's description rules, 250+ characters), from what PostScore knows
 * plus the listing's own services. */
export async function writeAnswersDescription(inputs: Inputs, listed: string[]): Promise<string | null> {
  const [{ descriptionProblems, descriptionSystemPrompt }, { callAnthropicMessage }] = await Promise.all([import("@/lib/gbpProfileEdits"), import("@/lib/anthropicClient")]);
  const f = inputs.facts;
  const facts = [`Name: ${f.name}`, f.category ? `Category: ${f.category}` : null, f.city ? `City: ${f.city}` : null, [...f.services, ...listed].length ? `Services: ${Array.from(new Set([...f.services, ...listed])).slice(0, 15).join(", ")}` : null, f.differentiator ? `What sets it apart (the owner's words): ${f.differentiator.slice(0, 300)}` : null].filter(Boolean);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = (await callAnthropicMessage({ system: descriptionSystemPrompt(inputs.locale), userMessage: `<facts>\n${facts.join("\n")}\n</facts>\n\nWrite at least 300 characters.`, maxTokens: 400 })).trim().replace(/^["“]|["”]$/g, "");
      if (text && descriptionProblems(text).length === 0 && (text.length >= 250 || attempt === 1)) return text;
    } catch {
      return null;
    }
  }
  return null;
}

export type WeekDraftsResult = { post: "written" | "kept" | "skipped"; description: "written" | "kept" | "not_needed" | "skipped" };

/** The background run for one business (service role): this week's post draft and, when the listing's description
 * is under 250 characters, the answers' description draft — each only when none is saved yet. Free: nothing. */
export async function writeWeekDrafts(admin: SupabaseClient, businessId: string, plan: Plan, now: Date = new Date()): Promise<WeekDraftsResult> {
  const out: WeekDraftsResult = { post: "skipped", description: "skipped" };
  if (plan === "free") return out;
  const [{ loadDraftInputs }, { businessTimeZone }] = await Promise.all([import("@/lib/gbpPostsContext.server"), import("@/lib/businessTimeZone")]);
  const inputs = await loadDraftInputs(admin, admin, businessId).catch(() => null);
  if (!inputs) return out;
  const { data: biz } = await admin.from("businesses").select("lat, lng").eq("id", businessId).maybeSingle();
  const zone = businessTimeZone((biz as { lat?: unknown } | null)?.lat, (biz as { lng?: unknown } | null)?.lng);
  const week = weekStartOf(now.getTime(), zone);

  const saved = await savedDraft(admin, businessId, week, inputs.locale);
  if (typeof saved === "string") out.post = "kept";
  else if (saved === null) {
    const d = await draft(inputs, null);
    await saveDraft(admin, businessId, week, "week", d.text, inputs.locale).catch(() => null);
    out.post = "written";
  }

  // The description: only when the listing's is short (the answers card's own rule), read from Business Profile.
  const { readAnswersReal } = await import("@/lib/googleAnswers.server");
  const listing = await readAnswersReal(admin, businessId).catch(() => null);
  if (!listing) return out;
  const { answersPlan } = await import("@/lib/googleAnswers");
  const plan23e = answersPlan({ description: listing.description, services: listing.services.map((s) => s.name), pricedServices: 0, details: null });
  if (!plan23e?.missing.includes("description")) {
    out.description = "not_needed";
    return out;
  }
  if (await savedAnswersDescription(admin, businessId, inputs.locale)) {
    out.description = "kept";
    return out;
  }
  const text = await writeAnswersDescription(inputs, listing.services.map((s) => s.name));
  if (text) {
    await saveDraft(admin, businessId, week, "answers_description", text, inputs.locale).catch(() => null);
    out.description = "written";
  }
  return out;
}
