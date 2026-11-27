// Day 25B step 6, Sam's follow-ups 1–10: one way to steer a draft ("Draft
// another with PostAI"), "On Google now" for the description and services,
// the routine's own buttons and "Also this week", review replies (first name,
// the owner's voice, length, varied openings, no stock phrases), and "Keep
// your tier" (§6.4–6.5) with Local favorite's "You're at the top".
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1/growth" }));
vi.mock("@/app/actions/weeklyChecklist", () => ({ setWeeklyCheckItem: vi.fn() }));
vi.mock("@/components/gbp/GoogleResults", () => ({ ThisWeek: () => <div />, GrowThisWeek: () => <div /> }));
vi.mock("@/components/gbp/MoreWaysCards", () => ({ MoreWaysCards: () => <div /> }));
vi.mock("@/app/actions/gbpPosts", () => ({ openPostDraft: vi.fn(), postStatusAction: vi.fn(), publishPostAction: vi.fn(), undoPostAction: vi.fn(), writeAnotherPost: vi.fn(), redraftDescription: vi.fn(), draftsLeftAction: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/app/actions/reviewReplies", () => ({ getReplyVoice: vi.fn(() => Promise.resolve("me")), setReplyVoice: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import type { GrowthFacts } from "@/lib/growthTier";
import { growthState } from "@/lib/growthPlan";
import { TierCard, WeekPlanCard, keepLine } from "@/components/growth/GrowthPlanView";
import { AnswersPreview, OnGoogleNow, type AnswersState } from "@/components/gbp/AnswersPreview";
import { ReplyTweaks, ReplyVoicePicker } from "@/components/reviews/ReplyTweaks";
import { devPreviewKeep, devPreviewTier } from "@/lib/devTier";
import { REPLY_RULES_VERSION, STOCK_PHRASES, starOnlyReply, cleanReply, parseReplyBatch, replyBatchSystemPrompt, replyBatchUserMessage, isStarOnlyReview, sharedPhrases, namedInReview, replyAcceptable, replyFirstName, replyHasStockPhrase, replyOpening, replySystemPrompt } from "@/lib/reviewReplies";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);
const facts = (over: Partial<GrowthFacts> = {}): GrowthFacts => ({ timeZone: "America/New_York", actions: [], countTestRows: false, countsFrom: null, insights: [], connected: true, reviewIncreases: [], offerUseLogSince: null, neutralWeeks: {}, freePeriods: [], ...over });
const HE = facts({ actions: ["2026-10-21", "2026-10-28", "2026-11-11", "2026-11-18"].map((d) => ({ at: `${d}T16:00:00Z`, kind: "verified" as const, source: "listing_change" })) });

describe("1–2. one way to steer a draft", () => {
  test("the post: the optional theme + the gold button replace 'Write another' and both request links", () => {
    const src = readFileSync("components/gbp/PostPreview.tsx", "utf8");
    expect(src).not.toContain("AnotherButton");
    expect(src).not.toContain("RequestBox");
    expect(src).toContain('testId="post-steer"');
    // Empty: a fresh draft; with text: a draft on that theme (the server's own rules — no invented facts).
    expect(src).toContain("custom: (request) => write(request?.trim() ? request : null),");
    expect(readFileSync("app/actions/gbpPosts.ts", "utf8")).toContain("add no fact that isn't in the facts or the request itself");
  });
  test("3. the answers box: the same control, labeled for its own section (the description)", () => {
    const src = readFileSync("components/gbp/AnswersPreview.tsx", "utf8");
    expect(src).toContain('label={t(locale, W("steer.desc.label"))}');
    expect(src.match(/<DescriptionSteer /g)?.length).toBe(2);
  });
});

describe("5. the description and services: what's on Google now, never guessed", () => {
  const answers = (p: Partial<AnswersState> = {}): AnswersState =>
    ({ status: "ok", data: { status: "ok", premium: true, canEdit: true, practice: false, plan: { missing: ["description", "services"], details: [], services: null, minutes: 6 }, listing: { description: "Hair salon", services: [{ name: "Haircut", googlePrice: 45 }, { name: "Color", googlePrice: null }], details: [] }, descriptionDraft: null, ownerPrices: [], facts: { name: "HX", city: null, hours: null, bookingUrl: null }, locale: "en", topic: null }, description: "A neighborhood salon in Tarrytown…", setDescription: vi.fn(), services: [{ name: "Haircut", price: "", googlePrice: 45, listed: true, include: true }, { name: "Color", price: "90", googlePrice: null, listed: true, include: true }, { name: "Blowout", price: "40", googlePrice: null, listed: false, include: true }], setService: vi.fn(), addService: vi.fn(), picks: {}, setPick: vi.fn(), unanswered: 0, flags: [], fixFlag: vi.fn(), keepWord: vi.fn(), payload: {}, ready: [], needsYou: [], results: null, setResults: vi.fn(), load: vi.fn(), ...p }) as AnswersState;
  test("'On Google now' (read-only), then 'Your new description (not on Google yet)'; each service's Google side, New / Changed (EN + ES)", () => {
    const html = wrap(<AnswersPreview businessId="b1" state={answers()} />);
    const words = text(html);
    expect(words).toContain("On Google now Hair salon 10 characters");
    expect(words).toContain("Your new description (not on Google yet)");
    expect(words).toContain("What should the description focus on? (optional)");
    expect(html).toContain('placeholder="e.g. what you&#x27;re known for, walk-ins welcome, how long you&#x27;ve been in business"');
    const hair = wrap(<AnswersPreview businessId="b1" state={answers({ data: { ...answers().data!, topic: "hair" } })} />);
    expect(hair).toContain('placeholder="e.g. our curly hair specialists, walk-ins welcome, 20 years in Tarrytown"');
    expect(words).toContain("Draft another with PostAI");
    expect(words).toContain("On Google: no price");
    expect(words).toContain("Not on Google yet");
    expect(html.match(/data-testid="answers-service-new"/g)?.length).toBe(1);
    expect(html.match(/data-testid="answers-service-changed"/g)?.length).toBe(1);
    expect(text(wrap(<OnGoogleNow description="Hair salon" />, "es"))).toContain("En Google ahora Hair salon 10 caracteres");
  });
  test("Google can't be read: says so", () => {
    expect(text(wrap(<AnswersPreview businessId="b1" state={answers({ status: "failed", data: null })} />))).toBe("Couldn't load what's on Google right now.");
  });
});

describe("6–8. the routine's own buttons; the count matches the list", () => {
  test("'Get your review link & QR →', 'Check your hours →', both with 'I did this', under 'Also this week'", () => {
    const state = growthState(HE, new Date("2026-11-21T17:00:00Z"));
    const routine = [{ id: "share_review_link" as const, title: "Share your review link with 3+ customers", howTo: "old" }, { id: "check_hours" as const, title: "Check your hours", howTo: "Open your Google Business Profile" }];
    const html = wrap(<WeekPlanCard props={{ businessId: "b1", connected: true, practice: false } as never} plan="premium" state={state} week={{ order: ["posts"] as never, lines: {}, checked: [], count: 4, connected: true }} routine={routine} />);
    const words = text(html);
    expect(words).toContain("4 tasks · ranked by what they do for your tier");
    expect(words).toContain("Also this week");
    expect(words).toContain("Copy your review link or QR on Get more reviews and send it to a few recent customers.");
    // getReviewsHref / googleListingHref: today's pages here, /get-reviews and /google-listing on the preview.
    expect(html).toContain('data-testid="routine-link-share_review_link" href="/business/b1/website-reviews#review-link"');
    expect(html).toContain('data-testid="routine-link-check_hours" href="/business/b1/growth?tab=google#listing-hours"');
    expect(words).toContain("Get your review link & QR →");
    expect(words).toContain("Check your hours →");
    expect(words.match(/I did this/g)?.length).toBe(2);
  });
});

describe("9. review replies", () => {
  test("the reviewer's first name, properly capitalized; none when it isn't a plausible first name", () => {
    expect(replyFirstName("YADIRA MORALES")).toBe("Yadira");
    expect(replyFirstName("yadira m.")).toBe("Yadira");
    expect(replyFirstName("mary-jo smith")).toBe("Mary-Jo");
    expect(replyFirstName("McKenzie Ross")).toBe("McKenzie");
    expect(replyFirstName("José")).toBe("José");
    for (const no of ["A Google user", "J. R.", "JD", "Tarrytown Auto Body LLC", "Best Salon", "user12345", "K", null]) expect(replyFirstName(no), String(no)).toBeNull();
  });
  test("written as the owner (I) by default, or the team (we); never the owner in the third person", () => {
    const me = replySystemPrompt("en", "Hair express", { firstName: "Yadira" });
    expect(me).toContain("first person singular");
    expect(me).toContain("that person is the owner writing this reply");
    expect(me).toContain('written exactly "Yadira"');
    expect(replySystemPrompt("en", "HX", { voice: "team" })).toContain("first person plural (we, us, our)");
    expect(replySystemPrompt("en", "HX", {})).toContain("Don't address the reviewer by name.");
    expect(replySystemPrompt("es", "HX", {})).toContain("usted");
  });
  test("Short · Medium · Long and 'Different wording'; the existing rules stay", () => {
    expect(replySystemPrompt("en", "HX", { length: "short" })).toContain("under 35 words");
    expect(replySystemPrompt("en", "HX", { length: "long" })).toContain("under 130 words");
    const diff = replySystemPrompt("en", "HX", { previous: { text: "x", mode: "different" } });
    expect(diff).toContain("different wording");
    expect(diff).toContain("NEVER invent facts");
    const html = wrap(<ReplyTweaks onRedraft={vi.fn()} busy={false} length="medium" />);
    expect(text(html)).toBe("Short Medium Long Different wording");
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="reply-length-medium"/);
    expect(text(wrap(<ReplyTweaks onRedraft={vi.fn()} busy={false} length="short" />, "es"))).toBe("Corta Media Larga Otras palabras");
  });
  test("variety: each reply in a batch opens its own way; stock phrases never pass", () => {
    expect(replySystemPrompt("en", "HX", { opening: 0, firstName: "Ana" })).not.toBe(replySystemPrompt("en", "HX", { opening: 1, firstName: "Ana" }));
    expect(replySystemPrompt("en", "HX", { avoidOpenings: ["thank you"] })).toContain('Other replies in this batch already begin with "thank you…": your first two words must be different from all of them.');
    // Two words: "Thank you, Tat!" and "Thank you, Bari!" open the same way.
    expect(replyOpening("Thank you, Yadira! I'm so glad.", "Yadira")).toBe("thank you");
    expect(replyOpening("Thank you, Bari! We…", "Bari")).toBe(replyOpening("Thank you, Tat! Hearing…", "Tat"));
    expect(replyOpening("Yadira, what a lovely note.", "Yadira")).toBe("what a");
    for (const p of STOCK_PHRASES) expect(replyHasStockPhrase(`${p}, Ana.`), p).toBe(true);
    expect(replyAcceptable("Thank you so much for taking the time, Ana!", "Ana")).toBe(false);
    expect(replyAcceptable("Ana, I'm so glad the color came out the way you wanted.", "Ana")).toBe(true);
    expect(replyAcceptable("I'm so glad. Thank you, Ana!", "Ana")).toBe(false);
    expect(replyAcceptable("Thank you, Ana! Here's 10% off your next visit.", "Ana")).toBe(false);
  });
  test("one batch, one voice but no template: no shared 4-word phrase, no repeated signature phrase; one paragraph", () => {
    const a = { text: "Thank you, Ana! It means the world to me, and I look forward to seeing you again soon.", firstName: "Ana" };
    expect(sharedPhrases("Bo, I'm so glad. I look forward to seeing you again soon.", [a], "Bo")).toContain("i look forward to");
    expect(sharedPhrases("Bo, your note means the world.", [a], "Bo")).toContain("means the world");
    expect(sharedPhrases("Bo, thank you for trusting me with your hair.", [{ text: "I love that you trust me with your hair, Ana.", firstName: "Ana" }], "Bo")).toContain("trust me with your hair");
    expect(sharedPhrases("Bo, what a lovely note about your color.", [a], "Bo")).toEqual([]);
    expect(cleanReply("Hi Win,\n\nI'm so glad you came in.")).toBe("Hi Win, I'm so glad you came in.");
    // Variants count: "mean everything", "means so much to hear".
    expect(sharedPhrases("Bo, your words mean everything.", [{ text: "Your trust means everything to me, Ana.", firstName: "Ana" }], "Bo")).toContain("means everything");
    expect(sharedPhrases("It means so much to hear this, Bo.", [{ text: "It means a lot to hear that, Ana.", firstName: "Ana" }], "Bo")).toContain("means a lot to me");
    // Checked against every reply already kept in the batch: phrases and openings.
    const batch = [{ text: "Thank you, Ana! I look forward to seeing you again soon.", firstName: "Ana" }];
    expect(replyAcceptable("Bo, what a lovely note. I look forward to seeing you again soon.", "Bo", { batch })).toBe(false);
    expect(replyAcceptable("Thank you, Bo! Your color looks wonderful.", "Bo", { batch })).toBe(false);
    expect(replyAcceptable("Bo, what a lovely note about your color.", "Bo", { batch })).toBe(true);
    // A hard check, not a hint.
    expect(replyAcceptable("Thank you, Bo! Your note means everything.", "Bo", { avoid: ["means everything"] })).toBe(false);
    expect(replyAcceptable("Thank you, Bo! I look forward to seeing you.", "Bo", { avoid: ["i look forward to"] })).toBe(false);
    expect(replySystemPrompt("en", "HX", { avoidPhrases: ["means the world"] })).toContain('Other replies in this batch already say "means the world"');
    expect(replySystemPrompt("en", "HX", {})).toContain("Mention only things the review itself says");
  });
  test("the batch is written in one call, with the same rules per reply; its answer is checked reply by reply", () => {
    const sys = replyBatchSystemPrompt("Hair express on Broadway", "me");
    expect(sys).toContain("first person singular");
    expect(sys).toContain("no two replies may start with the same two words or share any phrase of 4 or more words");
    expect(sys).toContain('"means the world"');
    expect(sys).toContain("NEVER invent facts");
    expect(sys).toContain("star rating only");
    expect(replyBatchUserMessage([{ input: { review: "Great cut", stars: 5 }, firstName: "Ana", locale: "es" }])).toBe('<review n="1" name="Ana" language="Spanish" stars="5">\nGreat cut\n</review>');
    expect(parseReplyBatch('Here you go: ["Thank you, Ana!\\nSee you.", "Bo, wow."]', 2)).toEqual(["Thank you, Ana! See you.", "Bo, wow."]);
    expect(parseReplyBatch('["one"]', 2)).toBeNull();
    expect(parseReplyBatch("no json", 1)).toBeNull();
  });
  test("stars only, written without PostAI: thanks for the stars by name + an owner line no other reply uses", () => {
    expect(starOnlyReply("Bari", 5, "en")).toBe("Thank you for the 5 stars, Bari! It made my day.");
    const first = { text: starOnlyReply("Melissa", 5, "en"), firstName: "Melissa" };
    const second = starOnlyReply("Bari", 5, "en", [first]);
    // A second star-only reply in the batch opens differently and shares no 4-word phrase.
    expect(second).toBe("Bari, I'm grateful for your 5-star rating! I really appreciate it.");
    expect(sharedPhrases(second, [first], "Bari")).toEqual([]);
    expect(starOnlyReply("Ana", 4, "es")).toBe("¡Gracias por las 4 estrellas, Ana! Me alegró el día.");
    expect(starOnlyReply(null, 5, "en")).toBe("Thank you for the 5 stars! It made my day.");
    for (const r of [first.text, second]) expect(replyAcceptable(r, null, { review: "[The reviewer left a star rating with no text.]", locale: "en" }), r).toBe(true);
    expect(replyHasStockPhrase("I'm so grateful you took the time to share this.")).toBe(true);
  });
  test("stars only: thanks for the stars by first name + one short line; nothing they didn't write", () => {
    const stars = "[The reviewer left a star rating with no text.]";
    expect(isStarOnlyReview(stars)).toBe(true);
    expect(isStarOnlyReview("The reviewer left a 5-star rating with no written review.")).toBe(true);
    expect(isStarOnlyReview("Great cut!")).toBe(false);
    const ctx = { voice: "me" as const, review: stars, businessName: "Hair express on Broadway", locale: "en" as const };
    expect(replyAcceptable("Thank you for the 5 stars, Bari! It made my day.", "Bari", ctx)).toBe(true);
    // The owner's pet phrases are banned outright now, not just once per batch.
    expect(replyAcceptable("Thank you for the 5 stars, Bari! It means a lot to me.", "Bari", ctx)).toBe(false);
    expect(replyAcceptable("Hi Bari, I'm truly grateful for the five stars. It means a lot that you'd recommend Hair Express on Broadway to others.", "Bari", ctx)).toBe(false);
    expect(replyAcceptable("Thank you for the 5 stars, Melissa! I look forward to seeing you again soon.", "Melissa", { ...ctx })).toBe(false);
    expect(replyAcceptable("Thank you so much, Bari! It means a lot to me.", "Bari", ctx)).toBe(false);
    expect(replyAcceptable("¡Gracias por las 5 estrellas, Bari! Me alegró el día.", "Bari", { ...ctx, locale: "es" })).toBe(true);
    expect(replyAcceptable("¡Gracias por las 5 estrellas, Bari! Significa mucho para mí.", "Bari", { ...ctx, locale: "es" })).toBe(false);
  });
  test("checked, not just asked: the owner never in the third person, never 'we' as Me, the review's language in usted", () => {
    const review = "I had a great experience at Hair express on Broadway. Angelica really took her time with my hair. Thank you Angelica!";
    expect(namedInReview(review, "Yadira", "Hair express on Broadway")).toEqual(["Angelica"]);
    const ctx = { voice: "me" as const, review, businessName: "Hair express on Broadway", locale: "en" as const };
    // At the start of a sentence too ("Angelica is lovely…").
    expect(namedInReview("Angelica is lovely and extremely talented. I feel beautiful.", "Laurel", "Hair express on Broadway")).toEqual(["Angelica"]);
    expect(replyAcceptable("What a kind thing to say, Laurel! Angelica truly loves what she does.", "Laurel", { ...ctx, review: "Angelica is lovely." })).toBe(false);
    expect(replySystemPrompt("en", "HX", { voice: "me", named: ["Angelica"] })).toContain('The review names "Angelica": that is you, the owner writing this reply.');
    expect(replyAcceptable("It means so much, Yadira. I'm so glad Angelica made you feel comfortable.", "Yadira", ctx)).toBe(false);
    expect(replyAcceptable("Thank you, Yadira! I'm so glad you felt comfortable in my chair.", "Yadira", ctx)).toBe(true);
    expect(replyAcceptable("Thank you, Bari! We really appreciate your five stars.", "Bari", { ...ctx, review: "x" })).toBe(false);
    expect(replyAcceptable("Thank you, Bari! We really appreciate your kind words.", "Bari", { ...ctx, voice: "team", review: "x" })).toBe(true);
    // A review with words: never the star-only thanks (the real "J" case, Nov 25).
    expect(replyAcceptable("Thank you, Bari! We really appreciate your five stars.", "Bari", { ...ctx, voice: "team", review: "x" })).toBe(false);
    expect(replyAcceptable("I'm grateful for the 5 stars. It's wonderful to hear you're happy with your haircuts.", null, { ...ctx, review: "Love my haircuts here, always comfortable." })).toBe(false);
    expect(replyAcceptable("Gracias, Melissa, por esa calificación de cinco estrellas. Me alegra mucho que hayas tenido una buena experiencia.", "Melissa", { ...ctx, review: "x" })).toBe(false);
    expect(replyAcceptable("Gracias, Melissa, por sus amables palabras. Me alegra mucho que haya tenido una buena experiencia en el salón.", "Melissa", { ...ctx, review: "x", locale: "es" })).toBe(true);
    expect(replyAcceptable("Gracias, Melissa, por sus cinco estrellas. Me alegra mucho que haya tenido una buena experiencia en el salón.", "Melissa", { ...ctx, review: "x", locale: "es" })).toBe(false);
    expect(replyAcceptable("Gracias, Melissa. Me alegra que hayas venido y espero verte pronto en el salón.", "Melissa", { ...ctx, review: "x", locale: "es" })).toBe(false);
  });
  test("the setting: 'Replies are written as: Me (I) / My team (we)'; the batch redrafts under the new rules", () => {
    expect(text(wrap(<ReplyVoicePicker businessId="b1" />))).toBe("Replies are written as: Me (I) My team (we)");
    // The default shows as chosen before anything is saved.
    expect(wrap(<ReplyVoicePicker businessId="b1" />)).toMatch(/aria-checked="true"[^>]*data-testid="reply-voice-me"/);
    expect(readFileSync("supabase/reply-voice.sql", "utf8")).toMatch(/reply_voice text check \(reply_voice in \('me', 'team'\)\)[\s\S]*notify pgrst, 'reload schema';\s*$/);
    expect(REPLY_RULES_VERSION).toBe(18);
    expect(replySystemPrompt("en", "HX", {})).toContain('never "for all my clients"');
    expect(replySystemPrompt("en", "HX", {})).toContain('Thank you for the 5 stars, NAME!');
    // One set of saved drafts, written in the background (lib/replyBatch.server.ts); pages only read them.
    const batch = readFileSync("lib/replyBatch.server.ts", "utf8");
    expect(batch).toContain("r.rules_version === REPLY_RULES_VERSION && r.voice === voice");
    expect(batch).toContain("draftReplyBatch(");
    expect(batch).toContain("rr.replyAcceptable(reply, first, ctx)");
    const page = readFileSync("app/actions/approveAll.ts", "utf8");
    const read = page.slice(page.indexOf("export async function draftWeekReplies"), page.indexOf("export type RedraftReplyResult"));
    expect(read).not.toMatch(/draftReplyBatch|draftReplyText|callAnthropicMessage/);
    for (const f of ["components/gbp/RepliesPreview.tsx", "components/reviews/GoogleReviewsInbox.tsx", "components/reviews/ReviewReplyDrafter.tsx"]) expect(readFileSync(f, "utf8"), f).toContain("<ReplyTweaks ");
  });
});

describe("10. Keep your tier (§6.4–6.5)", () => {
  const base = growthState(HE, new Date("2026-11-21T17:00:00Z"));
  test("the three states (+ a closed week), calm, with the next update", () => {
    expect(base.keep).toBe("set");
    expect(base.nextUpdate).toBe("2026-11-23");
    expect(growthState(HE, new Date("2026-11-24T17:00:00Z")).keep).toBe("due");
    expect(keepLine({ tier: 2, keep: "set" }, "en")).toBe("You're set for this week. Stay active each week to keep Building.");
    expect(keepLine({ tier: 2, keep: "due" }, "en")).toBe("One thing from this week's plan by Sunday keeps Building.");
    expect(keepLine({ tier: 5, keep: "quiet" }, "en")).toBe("Last week was quiet. One task by Sunday keeps Local favorite; two quiet weeks in a row drop you to Thriving.");
    expect(keepLine({ tier: 3, keep: "closed" }, "en")).toBe("This week is marked closed, so it won't count against Growing.");
    expect(keepLine({ tier: 1, keep: "due" }, "en")).toBe("Make this week count: one thing from this week's plan by Sunday.");
    expect(keepLine({ tier: 2, keep: "quiet" }, "es")).toContain("dos semanas tranquilas seguidas lo bajan a Comenzando");
    const html = wrap(<TierCard state={{ ...base, keep: "quiet", warning: true }} testAccount={false} />);
    expect(html).toContain('data-keep="quiet"');
    expect(text(html)).toContain("Next update: Mon, Nov 23");
    expect(html).not.toMatch(/bg-red|text-red/);
    expect(text(html)).not.toMatch(/streak|countdown|hours left/i);
  });
  test("Tier 1 has nothing to lose: never amber there", () => {
    expect(wrap(<TierCard state={{ ...base, tier: 1, keep: "quiet" }} testAccount={false} />)).toContain('data-keep="due"');
  });
  test("Local favorite: 'You're at the top' instead of 'To reach…', with ✓ for what's met", () => {
    const top = growthState(HE, new Date("2026-11-21T17:00:00Z"), 5);
    expect(top.stay).toMatchObject({ of: 12, activeNow: 3, results: 3 });
    const words = text(wrap(<TierCard state={top} testAccount={false} />));
    expect(words).toContain("You're at the top Local favorite stays yours as long as you keep showing up.");
    expect(words).toContain("Stay active: never two quiet weeks in a row 3 active weeks out of the last 12.");
    expect(words).not.toContain("To reach");
  });
  test("the dev preview shows each state ('2-quiet'), never for anyone else", () => {
    expect(devPreviewTier("2-quiet", true)).toBe(2);
    expect(devPreviewKeep("2-quiet", true)).toBe("quiet");
    expect(devPreviewKeep("2-quiet", false)).toBeNull();
    expect(devPreviewKeep("2", true)).toBeNull();
    const q = growthState(HE, new Date("2026-11-21T17:00:00Z"), 2, "quiet");
    expect(q).toMatchObject({ keep: "quiet", warning: true });
  });
});

describe("Presence pages: the category points next to the title", () => {
  test("the Overview breakdown's whole points, so the three pages add up to the score", async () => {
    const { wholeCategoryPoints, websiteWholePoints } = await import("@/lib/categoryPoints");
    const cats = [
      { id: "visibility", relativeScore: (20.6 / 40) * 100, weight: 40 },
      { id: "completeness", relativeScore: (27.7 / 30) * 100, weight: 30 },
      { id: "website", relativeScore: (29.4 / 30) * 100, weight: 30 },
    ] as never;
    const whole = wholeCategoryPoints(cats);
    expect(whole).toEqual([21, 28, 29]);
    expect((whole as number[]).reduce((a, b) => a + b, 0)).toBe(Math.round(20.6 + 27.7 + 29.4));
    expect(websiteWholePoints(cats)).toEqual({ earned: 29, of: 30 });
  });
  test("Reviews, Website and Google listing use the same helper, from the saved scan (3000 and 3001)", () => {
    expect(readFileSync("app/actions/reviews.ts", "utf8")).toContain("wholeCategoryPoints(breakdown.categories)[i]");
    expect(readFileSync("app/actions/website.ts", "utf8")).toContain("websiteWholePoints(realBreakdown.categories)");
    expect(readFileSync("lib/googlePages.server.ts", "utf8")).toContain("reportCategories(breakdown.categories)[i]");
    expect(readFileSync("app/business/[id]/website-reviews/ReviewsView.tsx", "utf8")).toContain('data-testid="reviews-pts"');
    const site = readFileSync("app/business/[id]/website/page.tsx", "utf8");
    expect(site).toContain('data-testid="website-pts"');
    expect(site).toContain('t(locale, "dashboard.website.speedNotScored")');
  });
});
