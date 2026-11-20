// Day 23E: this week's Google post (Business Profile API v4 localPosts).
// PostScore drafts it — the topic from the business type, on the day
// before the busiest call days (lib/googleRecommendations.ts postPlan) —
// the owner edits it, and on Premium one click publishes it
// (lib/gbpPosts.server.ts). Pure: Google's post rules, the button choice,
// which of the owner's photos to offer, the post's state, the one-a-day
// limit, the AI prompt and the plain fallback drafts (EN + ES).

import type { IdeaType } from "@/lib/listingIdeas";
import { LINK, PHONE } from "@/lib/gbpProfileEdits";
import { addDays, localToday } from "@/lib/googleRecommendations";

/** Google's limit for a post's text. */
export const POST_MAX = 1500;
/** What PostScore aims for: the point in the first ~80 characters (what shows before "More"). */
export const POST_AIM = { min: 150, max: 600 } as const;
/** Undo ("Remove from Google"): 7 days, like photos. */
export const POST_UNDO_DAYS = 7;
/** Grow: 1 draft a week + 3 "Write another". */
export const GROW_POST_REDRAFTS = 3;
/** Google's post photo minimum. */
export const POST_PHOTO_MIN = { width: 400, height: 300 } as const;

/** "week": this week's post; "good_to_know": the answers' FAQ-style post. */
export type PostKind = "week" | "good_to_know";
export const isPostKind = (v: unknown): v is PostKind => v === "week" || v === "good_to_know";

export type PostTopic = IdeaType | "default";

// ---------------------------------------------------------------------------
// Google's rules
// ---------------------------------------------------------------------------

export type PostProblem = "empty" | "too_long" | "phone" | "link" | "caps" | "incentive" | "invented_story";

/** A reward for a review ("leave a review for 10% off") — Google forbids it.
 * Offers on their own are fine in a post. */
const REVIEW_INCENTIVE =
  /\b(?:review|reviews|rating|stars?|rese[nñ]as?|calificaci[oó]n|estrellas?)\b[^.!?]{0,60}\b(?:discounts?|coupons?|\d+\s?% off|free|gift|reward|descuentos?|cup[oó]n|cupones|gratis|regalo|premio)\b|\b(?:discounts?|coupons?|\d+\s?% off|free|gift|reward|descuentos?|cup[oó]n|cupones|gratis|regalo|premio)\b[^.!?]{0,60}\b(?:review|reviews|rese[nñ]as?)\b/i;

/** A made-up story: a specific job, client, result, reaction or quote
 * ("Just finished an amazing balayage… our client absolutely loves the
 * results"). PostAI never writes one unless the owner gave the facts. */
const INVENTED_STORY =
  /\b(?:just (?:finished|completed|wrapped up|did)|recently (?:finished|completed|did)|(?:our|a|one of our|this) (?:lovely |happy |amazing )?(?:client|customer|guest|regular)s?\b|lov(?:es|ed) (?:the|her|his|their) (?:results?|new)|absolutely lov|was (?:thrilled|so happy)|couldn'?t be happier|(?:amazing|stunning|incredible) transformation|testimonial|acabamos de|nuestr[ao] client[ae]|un[ao]? client[ae]|le encant[óa]|qued[óo] encantad|transformaci[oó]n (?:incre[íi]ble|asombrosa))|[“"][^”"]{12,}[”"]/i;

/** Google's post rules, checked on the owner's text and on PostAI's draft
 * alike: 1–1,500 characters; no phone numbers (the Call button uses the
 * listing's) and no links (they go in the button); no ALL-CAPS shouting or
 * "!!!" runs; no reward for a review. And for PostAI's drafts only
 * (`aiDraft`): no invented story unless the owner gave the facts — the
 * owner's own text may tell a real one. */
export function postProblems(text: string, opts: { aiDraft?: boolean; ownerFacts?: string | null } = {}): PostProblem[] {
  const t = text.trim();
  if (!t) return ["empty"];
  const out: PostProblem[] = [];
  if (t.length > POST_MAX) out.push("too_long");
  if (PHONE.test(t)) out.push("phone");
  if (LINK.test(t)) out.push("link");
  const shouting = t.match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) ?? [];
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, "");
  if (shouting.length >= 3 || (letters.length >= 20 && upper.length / letters.length > 0.5) || /!{3,}/.test(t)) out.push("caps");
  if (REVIEW_INCENTIVE.test(t)) out.push("incentive");
  if (opts.aiDraft && !opts.ownerFacts?.trim() && INVENTED_STORY.test(t)) out.push("invented_story");
  return out;
}

export const cleanPostText = (raw: unknown): string | null => (typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : null);

// ---------------------------------------------------------------------------
// The button
// ---------------------------------------------------------------------------

export type PostCta = "BOOK" | "LEARN_MORE" | "CALL" | "NONE";
export const isPostCta = (v: unknown): v is PostCta => v === "BOOK" || v === "LEARN_MORE" || v === "CALL" || v === "NONE";

const httpsUrl = (u: string | null | undefined): string | null => {
  if (!u) return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** The buttons this listing can have, best first: Book (the booking link),
 * Learn more (the website), Call (the listing's phone — no number in the
 * text), or none. Links are https only and the owner's own. */
export function ctaChoices(input: { booking: string | null; website: string | null; phone: string | null }): Array<{ type: PostCta; url: string | null }> {
  const out: Array<{ type: PostCta; url: string | null }> = [];
  const booking = httpsUrl(input.booking);
  const website = httpsUrl(input.website);
  if (booking) out.push({ type: "BOOK", url: booking });
  if (website) out.push({ type: "LEARN_MORE", url: website });
  if (input.phone && input.phone.trim()) out.push({ type: "CALL", url: null });
  out.push({ type: "NONE", url: null });
  return out;
}

/** Google's callToAction for the chosen button; undefined: none. */
export function callToAction(cta: { type: PostCta; url: string | null }): { actionType: string; url?: string } | undefined {
  if (cta.type === "NONE") return undefined;
  if (cta.type === "CALL") return { actionType: "CALL" };
  return cta.url ? { actionType: cta.type, url: cta.url } : undefined;
}

// ---------------------------------------------------------------------------
// The owner's photos
// ---------------------------------------------------------------------------

export interface GbpMediaItem {
  name?: string;
  mediaFormat?: string;
  googleUrl?: string;
  thumbnailUrl?: string;
  createTime?: string;
  dimensions?: { widthPixels?: number; heightPixels?: number };
  locationAssociation?: { category?: string };
}

export interface PostPhoto {
  /** Google's media name ("accounts/…/locations/…/media/…"). */
  name: string;
  /** For the preview only — read live, never saved. */
  thumb: string;
  createTime: string | null;
}

/** The owner's own photos that suit a post, newest first: photos (not
 * videos), not the logo or the profile picture, at least 400 × 300. Read
 * live from the listing; never saved. */
export function postPhotos(items: GbpMediaItem[], max = 8): PostPhoto[] {
  return items
    .filter((m) => (m.mediaFormat ?? "PHOTO") === "PHOTO" && !!m.name && !!(m.googleUrl || m.thumbnailUrl))
    .filter((m) => !["LOGO", "PROFILE"].includes(m.locationAssociation?.category ?? ""))
    .filter((m) => !m.dimensions || ((m.dimensions.widthPixels ?? 0) >= POST_PHOTO_MIN.width && (m.dimensions.heightPixels ?? 0) >= POST_PHOTO_MIN.height))
    .sort((a, b) => (b.createTime ?? "").localeCompare(a.createTime ?? ""))
    .slice(0, max)
    .map((m) => ({ name: m.name!, thumb: (m.thumbnailUrl || m.googleUrl)!, createTime: m.createTime ?? null }));
}

// ---------------------------------------------------------------------------
// The post on Google, and what PostScore keeps
// ---------------------------------------------------------------------------

export type PostState = "waiting" | "live" | "rejected";

/** Google's localPost.state: PROCESSING (and anything unknown) is still waiting. */
export function postStateOf(state: string | null | undefined): PostState {
  if (state === "LIVE") return "live";
  if (state === "REJECTED") return "rejected";
  return "waiting";
}

export const LOCAL_POST_KIND = "local_post";
export const LOCAL_POST_KIND_PRACTICE = "local_post_practice";
export const postsKind = (practice: boolean) => (practice ? LOCAL_POST_KIND_PRACTICE : LOCAL_POST_KIND);

/** gbp_changes.after_value for a post: Google's post name and PostScore's own choices — never the text. */
export interface StoredPost {
  name: string | null;
  kind: PostKind;
  cta: PostCta;
  hasPhoto: boolean;
  length: number;
  /** A Google Offer post (an active coupon). */
  offer?: boolean;
}

export function readStoredPost(value: string | null): StoredPost | null {
  try {
    const v = JSON.parse(value ?? "null") as Partial<StoredPost> | null;
    if (!v || typeof v !== "object") return null;
    return { name: typeof v.name === "string" ? v.name : null, kind: isPostKind(v.kind) ? v.kind : "week", cta: isPostCta(v.cta) ? v.cta : "NONE", hasPhoto: v.hasPhoto === true, length: typeof v.length === "number" ? v.length : 0 };
  } catch {
    return null;
  }
}

export interface PostRow {
  id: string;
  batch_id: string;
  after_value: string | null;
  approved_at: string;
  status: string;
  undone_at: string | null;
}

/** One post from PostScore a day per business (no flooding the listing). */
export function postedToday(rows: PostRow[], now: number, timeZone: string): boolean {
  const today = localToday(now, timeZone).date;
  return rows.some((r) => (r.status === "sent" || r.status === "sending") && !r.undone_at && localToday(Date.parse(r.approved_at), timeZone).date === today);
}

/** The newest post PostScore published that's still up (not undone). */
export function latestPost(rows: PostRow[]): (PostRow & { post: StoredPost }) | null {
  const r = rows
    .filter((x) => x.status === "sent" && !x.undone_at)
    .sort((a, b) => b.approved_at.localeCompare(a.approved_at))
    .map((x) => ({ ...x, post: readStoredPost(x.after_value) }))
    .find((x) => x.post?.name);
  return r ? (r as PostRow & { post: StoredPost }) : null;
}

/** "Remove from Google" until this time; null: past 7 days. */
export function postUndoUntil(approvedAt: string, now: number): string | null {
  const until = Date.parse(approvedAt) + POST_UNDO_DAYS * 86_400_000;
  return now < until ? new Date(until).toISOString() : null;
}

/** Monday of the week (the business's time zone), for this week's draft. */
export function weekStartOf(now: number, timeZone: string): string {
  const t = localToday(now, timeZone);
  return addDays(t.date, -((t.weekday + 6) % 7));
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/** What PostScore knows about the business — the only facts a draft may use. */
export interface PostFacts {
  name: string;
  category: string | null;
  city: string | null;
  services: string[];
  /** The owner's own prices (PostScore's prices list). */
  prices: Array<{ service: string; price: string }>;
  differentiator: string | null;
  hasBooking: boolean;
}

/** What a general draft invites people to — never a specific job, dish or date. */
const TOPIC_BRIEF: Record<PostTopic, string> = {
  hair: "an invitation to come in for a new color or cut this season (for example highlights or balayage, if they're in the services)",
  barber: "an invitation to come in for a fresh cut or fade, with its price only if one is in the facts",
  nails: "an invitation to come in for a fresh set or new nail designs this season",
  restaurant: "an invitation to come in and enjoy the menu this week",
  art: "an invitation to join a class or workshop",
  home: "an invitation to book the business for a project this season",
  default: "an invitation to visit the business this month",
};

/** Topics whose best post is a real story (a before-and-after, a recent
 * job, this week's special, the next class's date): the owner gives 1–2
 * facts first, and PostAI writes only from those. */
export const STORY_TOPICS: readonly PostTopic[] = ["hair", "home", "restaurant", "art"];

// ---------------------------------------------------------------------------
// An offer post (an active coupon or deal from the Campaigns page)
// ---------------------------------------------------------------------------

/** The owner's running coupon, as the post shows it. */
export interface PostOffer {
  promoId: string;
  offer: string;
  code: string;
  terms: string | null;
  /** "2026-12-31"; null: no end date set. */
  expiry: string | null;
}

/** Google's offer title limit. */
export const OFFER_TITLE_MAX = 58;
/** With no end date, the offer runs 30 days on Google. */
export const OFFER_DEFAULT_DAYS = 30;

const gDate = (d: string) => {
  const [year, month, day] = d.split("-").map(Number);
  return { year, month, day };
};

/** Google's OFFER fields: the title, start (today) and end dates, the code and terms. Null when the offer has already ended. */
export function offerPostFields(o: PostOffer, today: string): { event: { title: string; schedule: { startDate: { year: number; month: number; day: number }; endDate: { year: number; month: number; day: number } } }; offer: { couponCode?: string; termsConditions?: string } } | null {
  const end = o.expiry && /^\d{4}-\d{2}-\d{2}$/.test(o.expiry) ? o.expiry : addDays(today, OFFER_DEFAULT_DAYS);
  if (end < today) return null;
  const title = o.offer.trim().replace(/\s+/g, " ");
  return {
    event: { title: title.length > OFFER_TITLE_MAX ? `${title.slice(0, OFFER_TITLE_MAX - 1).trimEnd()}…` : title, schedule: { startDate: gDate(today), endDate: gDate(end) } },
    offer: { ...(o.code.trim() ? { couponCode: o.code.trim().slice(0, 58) } : {}), ...(o.terms?.trim() ? { termsConditions: o.terms.trim().slice(0, 5000) } : {}) },
  };
}

/** The plain offer draft when PostAI is unavailable. */
export function offerTemplate(o: PostOffer, name: string, locale: "en" | "es"): string {
  const until = o.expiry ? (locale === "es" ? ` hasta el ${o.expiry.split("-").reverse().join("/")}` : ` through ${o.expiry.slice(5).replace("-", "/")}/${o.expiry.slice(0, 4)}`) : "";
  return locale === "es"
    ? `${o.offer} en ${name}${until}. Muestre esta publicación o mencione el código ${o.code} al pagar.`
    : `${o.offer} at ${name}${until}. Show this post or mention code ${o.code} at checkout.`;
}

export function postSystemPrompt(locale: "en" | "es", kind: PostKind, withOwnerFacts = false, withOffer = false): string {
  const language = locale === "es" ? "Spanish, formal (usted) where it addresses the reader" : "English";
  return [
    "You write one Google Business Profile post for a small local business owner.",
    `Write ONLY the post text, in ${language}. 2 to 4 short sentences, 150 to 500 characters, never more than 600. Put the main point in the first sentence.`,
    kind === "good_to_know"
      ? "It is a 'Good to know' post answering customers' common questions, using only the answers given."
      : withOffer
        ? "It announces the owner's offer given between <offer> tags: what it is, the code and until when — exactly as given. Add no other discount, condition or date."
      : withOwnerFacts
        ? "Tell what the owner describes between <owner_facts> tags — and ONLY that. Add nothing that isn't there: no reactions, results, quotes, client details, dates or prices the owner didn't give."
        : "Write a GENERAL invitation about the topic given, warmly and plainly, as the owner. NEVER describe a specific job, client, event, result, reaction, review or quote — no \"just finished\", no \"our client loves the results\", no testimonials. Nothing in it may claim something happened.",
    "Use ONLY the facts given between <facts> tags. NEVER invent offers, discounts, prices, dates, awards, staff names or services. Spell every service exactly as it is written in the facts.",
    "Google's rules: NO phone numbers, NO links or web addresses, NO hashtags, NO ALL-CAPS words, at most one exclamation mark, no emojis.",
    "NEVER mention reviews or ask for reviews. NEVER promise results. No quotation marks around the text.",
    "If the business can be booked online, you may end with a short invitation to book; otherwise invite people to stop by or call (without a number).",
  ].join("\n");
}

export function postUserMessage(facts: PostFacts, topic: PostTopic, extra: { day: string | null; answers?: string[]; ownerFacts?: string | null; offer?: PostOffer | null }): string {
  const lines = [
    `Name: ${facts.name}`,
    facts.category ? `Category: ${facts.category}` : null,
    facts.city ? `City: ${facts.city}` : null,
    facts.services.length ? `Services: ${facts.services.slice(0, 12).join(", ")}` : null,
    facts.prices.length ? `Prices (the owner's own): ${facts.prices.slice(0, 8).map((p) => `${p.service} ${p.price}`).join("; ")}` : null,
    facts.differentiator ? `What sets it apart (the owner's words): ${facts.differentiator.slice(0, 300)}` : null,
    `Online booking: ${facts.hasBooking ? "yes" : "no"}`,
    ...(extra.answers?.length ? [`Answers to share: ${extra.answers.join("; ")}`] : []),
  ].filter(Boolean);
  const offer = extra.offer ? `<offer>\nOffer: ${extra.offer.offer}\nCode: ${extra.offer.code}${extra.offer.expiry ? `\nEnds: ${extra.offer.expiry}` : ""}${extra.offer.terms ? `\nTerms: ${extra.offer.terms}` : ""}\n</offer>` : null;
  return [`<facts>\n${lines.join("\n")}\n</facts>`, offer ?? (extra.ownerFacts?.trim() ? `<owner_facts>\n${extra.ownerFacts.trim().slice(0, 300)}\n</owner_facts>` : `Topic: ${TOPIC_BRIEF[topic]}`), extra.day ? `It goes up on ${extra.day}, the day before the business's busiest call days.` : null].filter(Boolean).join("\n\n");
}

const TEMPLATE: Record<"en" | "es", Record<PostTopic, (f: PostFacts) => string>> = {
  en: {
    hair: (f) => `Fresh color, fresh start. Our stylists at ${f.name} love helping you find a look that fits you, from a subtle refresh to a full change.`,
    barber: (f) => `Time for a fresh cut? The chairs at ${f.name} are ready for clean fades, sharp lineups and classic cuts.`,
    nails: (f) => `This month's nail designs are here at ${f.name}. Come in for a fresh set and leave with something you'll love showing off.`,
    restaurant: (f) => `This week at ${f.name}, our kitchen has something special on the menu. Come hungry and ask what's new.`,
    art: (f) => `New classes are coming up at ${f.name}. Whether you're just starting or growing your skills, there's a seat for you.`,
    home: (f) => `Another job done right. The ${f.name} team takes care of every detail, start to finish, so you don't have to.`,
    default: (f) => `Here's what's new at ${f.name} this month. We'd love to see you soon.`,
  },
  es: {
    hair: (f) => `Color nuevo, comienzo nuevo. En ${f.name} nuestros estilistas le ayudan a encontrar el look que le queda, desde un retoque sutil hasta un cambio completo.`,
    barber: (f) => `¿Le toca un corte? En ${f.name} las sillas están listas para fades limpios, contornos definidos y cortes clásicos.`,
    nails: (f) => `Ya llegaron los diseños de uñas de este mes a ${f.name}. Visítenos para un juego nuevo que le encantará lucir.`,
    restaurant: (f) => `Esta semana en ${f.name} nuestra cocina tiene algo especial en el menú. Venga con hambre y pregunte qué hay de nuevo.`,
    art: (f) => `Se acercan nuevas clases en ${f.name}. Ya sea que esté empezando o mejorando su técnica, tenemos un lugar para usted.`,
    home: (f) => `Otro trabajo bien hecho. El equipo de ${f.name} se encarga de cada detalle, de principio a fin, para que usted no tenga que hacerlo.`,
    default: (f) => `Esto es lo nuevo en ${f.name} este mes. Nos encantará verle pronto.`,
  },
};

/** The plain draft when PostAI is unavailable or its draft breaks a rule twice. */
export function postTemplate(topic: PostTopic, locale: "en" | "es", facts: PostFacts): string {
  const base = TEMPLATE[locale][topic](facts);
  const close = facts.hasBooking ? (locale === "es" ? " Reserve su cita en línea." : " Book online anytime.") : locale === "es" ? " Le esperamos." : " Stop by and see us.";
  return `${base}${close}`;
}

/** "Good to know: free parking in the back, cards and Apple Pay accepted,
 * wheelchair accessible." — from the answers only (no AI, nothing invented). */
export function goodToKnowText(name: string, answers: string[], locale: "en" | "es"): string | null {
  const list = answers.map((a) => a.trim()).filter(Boolean).slice(0, 6);
  if (list.length === 0) return null;
  const joined = list.join(", ");
  return locale === "es" ? `Bueno saber sobre ${name}: ${joined}. Si tiene alguna otra pregunta, con gusto le atendemos.` : `Good to know about ${name}: ${joined}. Any other questions? We're happy to help.`;
}
