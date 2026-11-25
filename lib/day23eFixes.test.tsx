import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";

// Day 23E fixes before committing: drafts never invent a story; service
// names spell-checked ("Did you mean…?", never published unconfirmed); the
// photos item's button; Approve all counts and sends only what can go now,
// each failure on its own row, "All done this week ✓" with what waits
// listed underneath; the post flow in the Growth routine, the Growth
// page's cards and the Campaigns link (Offer posts); natural words for
// customer details (never raw attribute ids); the Yes / No / Skip choices;
// and "Apply to Google" saying what's needed.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));
vi.mock("@/app/actions/weeklyChecklist", () => ({ setWeeklyCheckItem: vi.fn() }));
const outcome = vi.hoisted(() => ({ value: "accept" as "accept" | "refuse" | "hold" }));
vi.mock("@/lib/gbpProfilePractice.server", () => ({ practiceOutcomeOf: () => outcome.value }));

import { offerPostFields, postProblems, postSystemPrompt, postUserMessage, type PostFacts } from "@/lib/gbpPosts";
import { publishPost, type PostStore } from "@/lib/gbpPosts.server";
import { PRACTICE_POST_PARENT, practicePostFetch } from "@/lib/gbpPostsPractice.server";
import { applySpellingFix, spellingFlags } from "@/lib/serviceSpelling";
import { DETAIL_WORDS, RAW_ATTRIBUTE, detailLabel, detailPhrase, faqEntries, faqHtml, goodToKnowAnswers } from "@/lib/googleAnswers";
import { CUSTOMER_DETAIL_OPTIONS } from "@/lib/gbpAttributes";
import { goodToKnowText } from "@/lib/gbpPosts";
import { allDoneThisWeek, postState, ThisWeekList, WeekItem } from "@/components/gbp/ThisWeekList";
import { approveCount, postReady } from "@/components/gbp/ApproveAll";
import { AnswersPreview, type AnswersState } from "@/components/gbp/AnswersPreview";
import type { PostDraftState } from "@/components/gbp/PostPreview";
import { WeeklyChecklist } from "@/app/business/[id]/growth/WeeklyChecklist";
import { MoreWaysCards } from "@/components/gbp/MoreWaysCards";
import { recommendations } from "@/lib/googleRecommendations";
import { buildWeeklyChecklistItems } from "@/lib/weeklyChecklist";
import { LocaleProvider, type Locale } from "@/lib/i18n";

const NOW = Date.parse("2026-11-20T15:00:00Z");
const TZ = "America/New_York";
const FACTS: PostFacts = { name: "Hair Express", category: "Hair salon", city: "Tarrytown", services: ["Balayage", "Haircut"], prices: [{ service: "baylage", price: "$45" }], differentiator: null, hasBooking: true };
const wrap = (node: React.ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

describe("1. drafts never invent events, clients, results or quotes", () => {
  const INVENTED = "Just finished an amazing baylage transformation here at Hair Express! Our client absolutely loves the results.";
  test("the invented-story case is refused for PostAI's drafts — never for the owner's own text, nor when the owner gave the facts", () => {
    expect(postProblems(INVENTED, { aiDraft: true })).toContain("invented_story");
    expect(postProblems("Acabamos de terminar un balayage. ¡A nuestra clienta le encantó!", { aiDraft: true })).toContain("invented_story");
    expect(postProblems("“Best haircut I've ever had,” says Maria.", { aiDraft: true })).toContain("invented_story");
    expect(postProblems(INVENTED)).not.toContain("invented_story");
    expect(postProblems(INVENTED, { aiDraft: true, ownerFacts: "Balayage for a regular, done Tuesday" })).not.toContain("invented_story");
    expect(postProblems("Thinking about a new color for the holidays? Our balayage and highlights can give you a fresh look. Book online anytime.", { aiDraft: true })).toEqual([]);
  });
  test("the prompt: a general invitation, or only the owner's facts", () => {
    const general = postSystemPrompt("en", "week");
    expect(general).toContain("GENERAL invitation");
    expect(general).toContain("NEVER describe a specific job, client, event, result, reaction, review or quote");
    expect(postUserMessage(FACTS, "hair", { day: null })).not.toMatch(/before-and-after|recent/i);
    expect(postSystemPrompt("en", "week", true)).toContain("ONLY that");
    const withFacts = postUserMessage(FACTS, "hair", { day: null, ownerFacts: "Balayage for a regular, done Tuesday" });
    expect(withFacts).toContain("<owner_facts>\nBalayage for a regular, done Tuesday\n</owner_facts>");
    expect(withFacts).not.toContain("Topic:");
  });
});

describe("10. service names spell-checked before anything is published", () => {
  test("'baylage' → 'Did you mean balayage?'; the business's own spellings and the words kept are never flagged", () => {
    expect(spellingFlags("baylage · Keratin treatments")).toEqual([{ word: "baylage", suggestion: "balayage" }]);
    expect(spellingFlags("Manicur")).toEqual([{ word: "Manicur", suggestion: "Manicure" }]);
    expect(spellingFlags("baylage", { keep: ["baylage"] })).toEqual([]);
    expect(spellingFlags("Haircut · Hair glazing · Kids' cuts · Brazilian hair straightening · Ombre hair color · Highlights")).toEqual([]);
    // Running text: "Express" isn't "espresso"; a typo from the owner's own price list is still caught.
    expect(spellingFlags("Fresh color at Hair Express this week.", { prose: true })).toEqual([]);
    expect(spellingFlags("Try our baylage this week.", { prose: true, ownerTerms: ["baylage"] })).toEqual([{ word: "baylage", suggestion: "balayage" }]);
    expect(applySpellingFix("Baylage and more baylage.", { word: "baylage", suggestion: "balayage" })).toBe("Balayage and more balayage.");
  });

  const store = (): PostStore => {
    const rows: Array<Record<string, unknown>> = [];
    return {
      approvalsSince: async () => [],
      editLogReady: async () => true,
      batchRows: async () => [],
      insert: async (row) => (rows.push(row), `r${rows.length}`),
      update: async () => undefined,
      markUndone: async () => undefined,
      logEdit: async () => undefined,
      postRows: async () => [],
    };
  };
  const target = (id: string) => ({ businessId: id, userId: "u1", parent: PRACTICE_POST_PARENT, accessToken: "t", languageCode: "en" as const });
  test("publishing: refused with the flags until the owner fixes or keeps the word; nothing reaches Google before", async () => {
    const f = vi.fn(practicePostFetch("b-spell"));
    const input = { text: "Our baylage is back this week. Book online anytime.", cta: { type: "NONE" as const, url: null }, photoName: null, kind: "week" as const, timeZone: TZ, ownerTerms: ["baylage"] };
    expect(await publishPost(target("b-spell"), input, store(), { fetchImpl: f, practice: true })).toEqual({ status: "spelling", flags: [{ word: "baylage", suggestion: "balayage" }] });
    expect(f).not.toHaveBeenCalled();
    expect((await publishPost(target("b-spell"), { ...input, keep: ["baylage"] }, store(), { fetchImpl: f, practice: true })).status).toBe("published");
  });

  test("an active coupon goes up as a Google Offer post: title, start/end dates, code and terms — no button", async () => {
    expect(offerPostFields({ promoId: "p", offer: "20% off any color", code: "HX20", terms: "One per visit", expiry: "2026-12-31" }, "2026-11-20")).toEqual({
      event: { title: "20% off any color", schedule: { startDate: { year: 2026, month: 11, day: 20 }, endDate: { year: 2026, month: 12, day: 31 } } },
      offer: { couponCode: "HX20", termsConditions: "One per visit" },
    });
    expect(offerPostFields({ promoId: "p", offer: "x", code: "c", terms: null, expiry: "2026-11-01" }, "2026-11-20")).toBeNull();
    const bodies: string[] = [];
    const real = practicePostFetch("b-offer");
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") bodies.push(String(init.body));
      return real(u, init);
    }) as typeof fetch;
    const r = await publishPost(target("b-offer"), { text: "20% off any color at Hair Express through Dec 31. Show code HX20.", cta: { type: "BOOK", url: "https://book.example" }, photoName: null, kind: "week", timeZone: TZ, offer: { promoId: "p", offer: "20% off any color", code: "HX20", terms: null, expiry: "2026-12-31" } }, store(), { fetchImpl: f, practice: true, now: NOW });
    expect(r.status).toBe("published");
    const body = JSON.parse(bodies[0]);
    expect(body).toMatchObject({ topicType: "OFFER", event: { title: "20% off any color" }, offer: { couponCode: "HX20" } });
    expect(body.callToAction).toBeUndefined();
  });
});

const post = (p: Partial<PostDraftState>): PostDraftState => ({ status: "ok", text: "Hi", setText: vi.fn(), ctas: [], cta: "NONE", setCta: vi.fn(), photos: [], photoName: null, setPhotoName: vi.fn(), left: null, fallback: false, publish: { canEdit: true, practice: true }, latest: null, setLatest: vi.fn(), another: vi.fn(), anotherBusy: false, anotherLimit: false, problems: [], load: vi.fn(), blockedToday: null, setBlockedToday: vi.fn(), topic: "hair", offer: null, flags: [], fixFlag: vi.fn(), keep: [], keepWord: vi.fn(), custom: vi.fn(), type: "update", setType: vi.fn(), types: ["update"], ...p });

describe("4–6. Approve all: only what can go now; failures on their own row; All done", () => {
  test("a post already up today, a spelling question or a failure is not counted or sent", () => {
    expect(postReady(post({}))).toBe(true);
    expect(postReady(post({ blockedToday: "posted_today" }))).toBe(false);
    expect(postReady(post({ blockedToday: "daily_cap" }))).toBe(false);
    expect(postReady(post({ flags: [{ word: "baylage", suggestion: "balayage" }] }))).toBe(false);
    expect(postReady(post({}), true)).toBe(false);
    expect(approveCount({ post: post({ blockedToday: "posted_today" }) })).toBe(0);
    expect(approveCount({ post: post({}), failures: { posts: "x" } })).toBe(0);
    expect(postState(post({ blockedToday: "posted_today" }))).toBe("tomorrow");
    expect(postState(post({}), true)).toBe("failed");
  });
  test("the row: 'Posted today · next post tomorrow' instead of Ready; a failure with its reason and 'Try again' — EN and ES", () => {
    const [rec] = recommendations({ type: "hair", now: NOW, timeZone: TZ, replies: null, photos: null, posts: { last30: 0 }, months: [], specialPeriods: null });
    const row = (state: Parameters<typeof WeekItem>[0]["state"], locale: Locale, extra: Partial<Parameters<typeof WeekItem>[0]> = {}) => wrap(<ul><WeekItem rec={rec} state={state} type="hair" businessId="b1" canEdit {...extra} /></ul>, locale);
    expect(row("tomorrow", "en", { tomorrow: "Posted today · next post tomorrow" })).toContain("Posted today · next post tomorrow");
    const failed = row("failed", "en", { failure: "Google didn't accept this. Check the text and try again.", onRetry: async () => undefined });
    expect(failed).toContain("Didn&#x27;t go through: Google didn&#x27;t accept this.");
    expect(failed).toContain('data-testid="week-retry-posts"');
    expect(failed).toContain(">Try again<");
    expect(row("failed", "es", { failure: "x", onRetry: async () => undefined })).toContain("No se envió: x");
    expect(row("failed", "es", { failure: "x", onRetry: async () => undefined })).toContain(">Intentar de nuevo<");
  });
  test("All done when nothing sendable is left, even with items for tomorrow or for the owner", () => {
    expect(allDoneThisWeek(["done", "tomorrow", "needs_you"])).toBe(true);
    expect(allDoneThisWeek(["tomorrow", "failed"])).toBe(true);
    expect(allDoneThisWeek(["done", "ready"])).toBe(false);
    expect(allDoneThisWeek(["loading"])).toBe(false);
    expect(allDoneThisWeek([])).toBe(false);
  });
});

describe("2. the photos item needs the owner: 'Upload your photos', never 'PostScore can do this for you'", () => {
  test("EN and ES", () => {
    const recs = recommendations({ type: "hair", now: NOW, timeZone: TZ, replies: null, photos: { count: 2, newestAt: "2026-08-01T00:00:00Z" }, posts: null, months: [], specialPeriods: null });
    const en = wrap(<ThisWeekList businessId="b1" recs={recs} type="hair" canEdit practice />);
    const photos = en.split('data-testid="week-photos"')[1];
    expect(photos).toContain(">Upload your photos<");
    expect(photos).toContain('href="#edit-photos"');
    expect(photos).not.toContain("PostScore can do this for you");
    expect(wrap(<ThisWeekList businessId="b1" recs={recs} type="hair" canEdit practice />, "es")).toContain(">Suba sus fotos<");
  });
});

describe("7–8. the same post flow in the Growth routine, the Growth page's cards and the Campaigns link", () => {
  const checklist = (postFlow: { premium: boolean } | null, locale: Locale = "en") =>
    wrap(<WeeklyChecklist businessId="b1" items={buildWeeklyChecklistItems(locale)} initialCheckedItemIds={[]} initialStreakWeeks={0} postFlow={postFlow} />, locale);
  test("'Post an update or offer to Google': Premium 'PostScore can do this for you', Grow the draft; Free unchanged", () => {
    expect(checklist({ premium: true })).toContain('data-testid="routine-post-open"');
    expect(checklist({ premium: true }).split('data-testid="routine-post_update"')[1]).toContain("PostScore can do this for you");
    expect(checklist({ premium: false })).toContain("Get this week&#x27;s draft");
    expect(checklist({ premium: false }, "es")).toContain("Ver el borrador de esta semana");
    expect(checklist(null)).not.toContain("routine-post-open");
    // One shared component, not a second copy.
    expect(readFileSync("app/business/[id]/growth/WeeklyChecklist.tsx", "utf8")).toContain("<WeekPost businessId={businessId} premium={postFlow.premium} />");
  });
  test("the Growth page's cards: the post and the answers (with the website FAQ); no copy-it-yourself versions left", () => {
    const premium = wrap(<MoreWaysCards businessId="b1" premium connected />);
    expect(premium).toContain('data-testid="more-ways-post"');
    expect(premium).toContain('data-testid="more-ways-answers"');
    expect(premium).toContain("PostScore can do this for you");
    const grow = wrap(<MoreWaysCards businessId="b1" premium={false} connected />, "es");
    expect(grow).toContain("Responda las preguntas frecuentes de sus clientes");
    expect(grow).toContain("Ver el borrador de esta semana");
    expect(wrap(<MoreWaysCards businessId="b1" premium connected={false} />)).not.toContain("more-ways-answers");
    expect(readFileSync("app/business/[id]/growth/GrowthView.tsx", "utf8")).toContain("<MoreWaysCards");
    const campaigns = readFileSync("app/business/[id]/campaigns/CouponsSection.tsx", "utf8");
    expect(campaigns).not.toContain("MoreWaysToBringPeopleIn");
    expect(campaigns).toContain("dashboard.googleTab.w.offerLink");
  });
});

describe("9. never a raw Google attribute id — choices and generated text alike", () => {
  const ids = Object.values(CUSTOMER_DETAIL_OPTIONS).flat().filter((id) => !["has_takeout", "has_delivery", "has_curbside_pickup"].includes(id));
  test("every parking / payment / accessibility choice has natural words, EN and ES", () => {
    for (const id of ids) {
      expect(DETAIL_WORDS[id], id).toBeDefined();
      for (const locale of ["en", "es"] as const) {
        const label = detailLabel(`attributes/${id}`, id.replace(/_/g, " "), locale);
        expect(label, id).not.toMatch(RAW_ATTRIBUTE);
        expect(label, id).not.toContain("_");
      }
    }
    expect(detailLabel("attributes/has_parking_lot_free", "has parking lot free", "en")).toBe("Free parking lot");
    expect(detailLabel("attributes/has_parking_street_free", null, "en")).toBe("Free street parking");
    expect(detailLabel("attributes/has_parking_garage_paid", null, "en")).toBe("Paid parking garage");
    expect(detailLabel("attributes/has_wheelchair_accessible_entrance", null, "en")).toBe("Wheelchair-accessible entrance");
    expect(detailLabel("attributes/has_wheelchair_accessible_restroom", null, "es")).toBe("Baño accesible en silla de ruedas");
    // An id PostScore doesn't know: Google's label, or the id made readable — never raw.
    expect(detailLabel("attributes/has_changing_table", "has changing table", "en")).toBe("Changing table");
  });
  test("the FAQ and the 'Good to know' post read naturally; nothing sent or shown contains a raw id", () => {
    const pay = ["pay_credit_card", "pay_debit_card", "pay_mobile_nfc"].map((id) => detailPhrase(id, id, "en"));
    const facts = { name: "Hair Express", city: null, hours: null, parking: [detailPhrase("has_parking_street_free", null, "en")], accessibility: [], payments: pay, services: [], bookingUrl: null };
    const faq = faqHtml(faqEntries(facts, "en"), "en");
    expect(faq).toContain("We accept credit cards, debit cards and mobile payments (Apple Pay / Google Pay).");
    const gtk = goodToKnowText("Hair Express", goodToKnowAnswers(facts, "en"), "en")!;
    const es = faqHtml(faqEntries({ ...facts, payments: ["pay_credit_card", "pay_mobile_nfc"].map((id) => detailPhrase(id, id, "es")) }, "es"), "es");
    for (const text of [faq, gtk, es]) {
      expect(text).not.toMatch(RAW_ATTRIBUTE);
      expect(text).not.toMatch(/pay_mobile_nfc|has_|pay credit card/);
    }
    expect(es).toContain("Aceptamos tarjetas de crédito y pagos con el teléfono (Apple Pay / Google Pay).");
  });
  test("no owner-facing message is a raw attribute id", () => {
    const values = readFileSync("lib/i18n/messages.ts", "utf8").split("\n").filter((l) => /^\s+"[a-zA-Z0-9_.]+":\s*"/.test(l)).map((l) => l.replace(/^\s+"[^"]+":\s*/, ""));
    expect(values.filter((v) => RAW_ATTRIBUTE.test(v) || /\b(?:has|pay)_[a-z_]+/.test(v))).toEqual([]);
  });
});

describe("11–12. the customer-details choices and 'Apply to Google'", () => {
  const state = (p: Partial<AnswersState>): AnswersState => ({
    status: "ok",
    data: {
      status: "ok",
      premium: true,
      canEdit: true,
      practice: true,
      plan: { missing: ["description", "details"], details: ["parking"], services: null, minutes: 8 },
      listing: { description: "Hair salon", services: [], details: [{ id: "attributes/has_parking_street_free", part: "parking", label: "has parking street free", current: null }, { id: "attributes/has_parking_lot_free", part: "parking", label: "has parking lot free", current: null }, { id: "attributes/has_parking_garage_paid", part: "parking", label: "has parking garage paid", current: null }] },
      descriptionDraft: "x".repeat(300),
      ownerPrices: [],
      facts: { name: "HX", city: null, hours: null, bookingUrl: null },
      locale: "en",
      topic: null,
    },
    description: "x".repeat(300),
    setDescription: vi.fn(),
    services: [],
    setService: vi.fn(),
    addService: vi.fn(),
    picks: {},
    setPick: vi.fn(),
    unanswered: 3,
    flags: [],
    fixFlag: vi.fn(),
    keepWord: vi.fn(),
    payload: { description: "x".repeat(300) },
    ready: ["description"],
    needsYou: ["details"],
    results: null,
    setResults: vi.fn(),
    load: vi.fn(),
    ...p,
  });
  test("44px+ tap targets, 14px text, nothing chosen by default; the chosen one filled with a check", () => {
    const html = wrap(<AnswersPreview businessId="b1" state={state({})} />);
    const rows = html.split('data-testid="answers-detail-row"').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Free street parking");
    expect(rows[0]).toContain("min-h-[44px]");
    expect(rows[0]).toContain("text-[14px]");
    expect(html).not.toContain('aria-pressed="true"');
    const chosen = wrap(<AnswersPreview businessId="b1" state={state({ picks: { "attributes/has_parking_lot_free": true } })} />).split('data-testid="answers-detail-row"')[2];
    expect(chosen).toMatch(/aria-pressed="true" class="[^"]*bg-ink[^"]*"><span aria-hidden="true">✓<\/span>Yes/);
    expect(html).not.toMatch(/has parking|has_parking/);
  });
  test("'Apply to Google' says what's needed and applies the parts that are ready — EN and ES", () => {
    const html = wrap(<AnswersPreview businessId="b1" state={state({})} />);
    expect(html).toContain("Answer 3 questions above to include customer details — or apply the rest now.");
    expect(html).not.toMatch(/data-testid="answers-apply"[^>]*disabled/);
    expect(html).not.toContain("Not included yet");
    expect(wrap(<AnswersPreview businessId="b1" state={state({})} />, "es")).toContain("Responda las 3 preguntas de arriba para incluir los datos para clientes, o aplique el resto ahora.");
    expect(wrap(<AnswersPreview businessId="b1" state={state({ ready: [], payload: {} })} />)).toContain("Answer 3 questions above to include customer details.");
  });
  test("a spelling question blocks its part, with a one-click fix", () => {
    const html = wrap(<AnswersPreview businessId="b1" state={state({ flags: [{ part: "description", flag: { word: "baylage", suggestion: "balayage" } }] })} />);
    expect(html).toContain("“baylage”: did you mean “balayage”?");
    expect(html).toContain(">Use “balayage”<");
    expect(html).toContain(">Keep “baylage”<");
  });
});
