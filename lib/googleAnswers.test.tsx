import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "fs";

// Day 23E: "Answer your customers' common questions" (never a Google Q&A —
// Google retired its Q&A API on Nov 3, 2025), services with the owner's own
// prices, the website FAQ with FAQPage markup, Approve all's one-approval
// sitting and what it includes, This week's Ready / Needs you / All done,
// Grow's drafts and Premium line, and the results on the chart.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));

import { answersPlan, faqEntries, faqHtml, goodToKnowAnswers, ownerPriceFor, parsePrice, usdMoney, type AnswerFacts } from "@/lib/googleAnswers";
import { addServicesWithPrices, pricedServiceCount } from "@/lib/gbpListingFields";
import { approvalAllowed, inSitting } from "@/lib/gbpAttributes";
import { recommendations } from "@/lib/googleRecommendations";
import { groupActions } from "@/lib/googleActions.server";
import { answersState, postState, repliesState, thisWeekKinds, ThisWeekList } from "@/components/gbp/ThisWeekList";
import { approveCount, postReady } from "@/components/gbp/ApproveAll";
import { RecItem } from "@/components/gbp/GoogleRecs";
import { LocaleProvider, type Locale } from "@/lib/i18n";
import type { PostDraftState } from "@/components/gbp/PostPreview";
import type { AnswersState } from "@/components/gbp/AnswersPreview";
import type { WeekRepliesState } from "@/components/gbp/RepliesPreview";

const NOW = Date.parse("2026-11-20T15:00:00Z");
const TZ = "America/New_York";

describe("what's missing for Google to answer customers' questions", () => {
  test("a short description, services without prices, parking / accessibility / payments", () => {
    expect(answersPlan({ description: "Hair salon", services: ["Haircut"], pricedServices: 0, details: { payment: true, parking: false, accessibility: false } })).toEqual({
      missing: ["description", "services", "details"],
      details: ["parking", "accessibility"],
      services: "no_prices",
      minutes: 5 + 3 + 2,
    });
    expect(answersPlan({ description: "x".repeat(260), services: [], details: { payment: true, parking: true, accessibility: true } })).toMatchObject({ missing: ["services"], services: "none" });
    expect(answersPlan({ description: "x".repeat(260), services: ["Haircut"], pricedServices: 1, details: { payment: true, parking: true, accessibility: true } })).toBeNull();
    // Unread parts are skipped, never guessed.
    expect(answersPlan({})).toBeNull();
  });

  test("one This-week item takes the place of the description, details and services items", () => {
    const base = { type: "hair" as const, now: NOW, timeZone: TZ, replies: null, photos: null, posts: null, months: [], specialPeriods: null, description: "Hair salon", missingDetails: ["parking" as const], missingServices: ["Keratin treatment"] };
    expect(recommendations(base).map((r) => r.kind)).toEqual(["description", "details", "services"]);
    const recs = recommendations({ ...base, answers: answersPlan({ description: "Hair salon" }) });
    expect(recs.map((r) => r.kind)).toEqual(["answers"]);
    expect(recs[0]).toMatchObject({ kind: "answers", plan: { suggest: ["Keratin treatment"] } });
    expect(thisWeekKinds(recs).map((r) => r.kind)).toEqual(["answers"]);
  });
});

describe("services with the owner's own prices", () => {
  test("prices: plain amounts only; Google's Money; matched to the owner's PostScore prices", () => {
    expect(parsePrice("$45")).toBe(45);
    expect(parsePrice("45.50")).toBe(45.5);
    expect(parsePrice("about 45")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(usdMoney(45)).toEqual({ currencyCode: "USD", units: "45" });
    expect(usdMoney(45.5)).toEqual({ currencyCode: "USD", units: "45", nanos: 500_000_000 });
    expect(ownerPriceFor("Women's cut", [{ service: "womens cut", price: 55 }])).toBe(55);
    expect(ownerPriceFor("Color", [{ service: "womens cut", price: 55 }])).toBeNull();
  });

  test("a listed service gets a price only when it has none; new ones added with theirs; nothing else touched", () => {
    const items = [
      { freeFormServiceItem: { category: "c", label: { displayName: "Haircut" } } },
      { freeFormServiceItem: { category: "c", label: { displayName: "Color" } }, price: { currencyCode: "USD", units: "90" } },
      { structuredServiceItem: { serviceTypeId: "job_type_id:blowout" } },
    ];
    const out = addServicesWithPrices(items, [{ serviceTypeId: "job_type_id:blowout", displayName: "Blowout" }], "c", [
      { name: "haircut", price: usdMoney(40) },
      { name: "Color", price: usdMoney(10) },
      { name: "Keratin treatment", price: usdMoney(200) },
      { name: "Blowout", price: null },
    ]);
    expect(out[0].price).toEqual({ currencyCode: "USD", units: "40" });
    expect(out[1].price).toEqual({ currencyCode: "USD", units: "90" });
    expect(out[2]).toEqual(items[2]);
    expect(out).toHaveLength(4);
    expect(out[3]).toMatchObject({ freeFormServiceItem: { label: { displayName: "Keratin treatment" } }, price: { units: "200" } });
    expect(pricedServiceCount(out)).toBe(3);
  });
});

describe("the website FAQ and the 'Good to know' post", () => {
  const facts: AnswerFacts = {
    name: "Hair Express",
    city: "Tarrytown",
    hours: ["Monday: Closed", "Tuesday: 9:30 AM – 5:00 PM"],
    parking: ["a free parking lot"],
    accessibility: ["a wheelchair-accessible entrance"],
    payments: ["credit cards", "debit cards", "mobile payments (Apple Pay / Google Pay)"],
    services: [{ name: "Haircut", price: 40 }, { name: "Color", price: null }],
    bookingUrl: "https://book.example/hx",
  };
  test("only confirmed facts; EN and ES (usted)", () => {
    const en = faqEntries(facts, "en");
    expect(en.map((e) => e.q)).toEqual(["What are Hair Express's hours?", "Is there parking?", "What payment methods do you accept?", "Is it wheelchair accessible?", "How much do your services cost?", "Can I book online?"]);
    expect(en[1].a).toBe("Yes, there's a free parking lot.");
    expect(en[2].a).toBe("We accept credit cards, debit cards and mobile payments (Apple Pay / Google Pay).");
    expect(en[4].a).toBe("Haircut: from $40.");
    const es = faqEntries(facts, "es");
    expect(es[0].q).toBe("¿Cuál es el horario de Hair Express?");
    expect(es[5].a).toContain("puede reservar");
    expect(faqEntries({ ...facts, hours: null, parking: [], accessibility: [], payments: [], services: [], bookingUrl: null }, "en")).toEqual([]);
  });
  test("plain HTML plus schema.org FAQPage JSON-LD, escaped", () => {
    const html = faqHtml([{ q: "Is <b>parking</b> free?", a: "Yes & it's close." }], "en");
    expect(html).toContain("<h3>Is &lt;b&gt;parking&lt;/b&gt; free?</h3>");
    expect(html).toContain('<script type="application/ld+json">');
    const ld = JSON.parse(html.split('<script type="application/ld+json">')[1].split("</script>")[0]);
    expect(ld).toMatchObject({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Is <b>parking</b> free?", acceptedAnswer: { "@type": "Answer", text: "Yes & it's close." } }] });
    expect(html.split("<script")[1]).not.toContain("<b>");
    expect(faqHtml([], "en")).toBe("");
  });
  test("'Good to know' lines from the same facts", () => {
    expect(goodToKnowAnswers(facts, "en")).toEqual(["there's a free parking lot", "we accept credit cards, debit cards and mobile payments (Apple Pay / Google Pay)", "there's a wheelchair-accessible entrance", "Haircut from $40", "you can book online"]);
  });
});

describe("Approve all: one approval for the sitting", () => {
  test("the limits are checked once; the sitting's own writes don't hold the next one back", async () => {
    const start = NOW;
    const earlier = new Date(NOW - 5 * 60_000).toISOString();
    const ownWrite = new Date(NOW + 2_000).toISOString();
    const store = { approvalsSince: async (...args: string[]) => (args.length >= 0 ? [earlier, ownWrite] : []) };
    expect(approvalAllowed(await store.approvalsSince(), NOW + 3_000)).toBe("wait_minute");
    expect(approvalAllowed((await inSitting(store, start).approvalsSince("b1", ""))!, NOW + 3_000)).toBe("ok");
    expect(await inSitting({ approvalsSince: async (...args: string[]) => (args.length >= 0 ? null : []) }, start).approvalsSince("b1", "")).toBeNull();
  });

  const post = (p: Partial<PostDraftState>): PostDraftState => ({ status: "ok", text: "Hi", setText: vi.fn(), ctas: [], cta: "NONE", setCta: vi.fn(), photos: [], photoName: null, setPhotoName: vi.fn(), left: null, fallback: false, publish: { canEdit: true, practice: true }, latest: null, setLatest: vi.fn(), another: vi.fn(), anotherBusy: false, anotherLimit: false, problems: [], load: vi.fn(), blockedToday: null, setBlockedToday: vi.fn(), topic: "hair", offer: null, flags: [], fixFlag: vi.fn(), keep: [], keepWord: vi.fn(), custom: vi.fn(), type: "update", setType: vi.fn(), types: ["update"], ...p });
  const replies = (p: Partial<WeekRepliesState>): WeekRepliesState => ({ status: "ok", items: [], canPost: true, practice: true, more: 0, setText: vi.fn(), setInclude: vi.fn(), ready: [], post: vi.fn(), load: vi.fn(), redraft: vi.fn(), reload: vi.fn(), ...p });
  const answers = (p: Partial<AnswersState>): AnswersState => ({ status: "ok", data: { status: "ok", premium: true, canEdit: true, practice: true, plan: { missing: ["description", "details"], details: ["parking"], services: null, minutes: 6 }, listing: { description: "Hair salon", services: [], details: [] }, descriptionDraft: null, ownerPrices: [], facts: { name: "HX", city: null, hours: null, bookingUrl: null }, locale: "en", topic: null }, description: "", setDescription: vi.fn(), services: [], setService: vi.fn(), addService: vi.fn(), picks: {}, setPick: vi.fn(), unanswered: 0, flags: [], fixFlag: vi.fn(), keepWord: vi.fn(), payload: {}, ready: [], needsYou: [], results: null, setResults: vi.fn(), load: vi.fn(), ...p });

  test("what it includes: ready replies, this week's post, the answers — never what needs the owner", () => {
    expect(postReady(post({}))).toBe(true);
    expect(postReady(post({ problems: ["phone"] }))).toBe(false);
    expect(postReady(post({ latest: { batchId: "b", state: "waiting", searchUrl: null, undoUntil: null, approvedAt: "" } }))).toBe(false);
    expect(postReady(post({ latest: { batchId: "b", state: "rejected", searchUrl: null, undoUntil: null, approvedAt: "" } }))).toBe(true);
    expect(postReady(post({ publish: { canEdit: false, practice: false } }))).toBe(false);
    expect(approveCount({ replies: replies({ ready: ["r1", "r2"] }), post: post({}), answers: answers({ ready: ["description"] }) })).toBe(4);
    // Details only the owner knows: the answers item isn't counted until they choose.
    expect(approveCount({ answers: answers({ ready: [], needsYou: ["details"] }) })).toBe(0);
    // Posting replies off: not counted.
    expect(approveCount({ replies: replies({ ready: ["r1"], canPost: false }) })).toBe(0);
  });

  test("Ready / Needs you / done per item", () => {
    expect(repliesState(replies({ status: "loading" }))).toBe("loading");
    expect(repliesState(replies({ items: [] }))).toBe("done");
    expect(repliesState(replies({ items: [{ reviewId: "r1", reviewer: null, stars: 5, comment: "Great", createTime: null, reply: "Thanks!", text: "Thanks!", include: true, sent: "draft", length: "medium", redrafting: false }], ready: ["r1"] }))).toBe("ready");
    expect(repliesState(replies({ items: [{ reviewId: "r1", reviewer: null, stars: 5, comment: "Great", createTime: null, reply: "Thanks!", text: "Thanks!", include: true, sent: "sent", length: "medium", redrafting: false }] }))).toBe("done");
    expect(postState(post({}))).toBe("ready");
    expect(postState(post({ latest: { batchId: "b", state: "live", searchUrl: "u", undoUntil: null, approvedAt: "" } }))).toBe("done");
    expect(answersState(answers({ ready: ["description"] }))).toBe("ready");
    expect(answersState(answers({ needsYou: ["details"] }))).toBe("needs_you");
  });

  test("This week (Premium): Approve all, each item's badge, and 'Needs you · 5 min' for the owner's own photos — EN and ES", () => {
    const recs = recommendations({ type: "hair", now: NOW, timeZone: TZ, replies: { replied: 0, inWindow: 3 }, photos: { count: 2, newestAt: "2026-08-01T00:00:00Z" }, posts: { last30: 0 }, months: [], specialPeriods: null, answers: answersPlan({ description: "Hair salon" }) });
    const html = (locale: Locale) =>
      renderToStaticMarkup(
        <LocaleProvider locale={locale}>
          <ThisWeekList businessId="b1" recs={recs} type="hair" canEdit practice />
        </LocaleProvider>
      );
    const en = html("en");
    expect(en).toContain('data-testid="approve-all-button"');
    // Drafts still loading in a static render: disabled, never a misleading "(0)".
    expect(en).toContain("Approve all (getting ready…)");
    expect(en).toContain("Nothing goes to Google until you approve.");
    expect(en).toContain("Getting drafts ready…");
    expect(en).toContain('data-testid="week-replies"');
    expect(en).toContain('data-testid="week-posts"');
    expect(en).toContain('data-testid="week-answers"');
    expect(en).toContain("Answer your customers&#x27; common questions");
    expect(en).toMatch(/data-testid="week-photos" data-state="needs_you"/);
    expect(en).toContain("Needs you · 5 min");
    expect(en).toContain('href="#edit-photos"');
    expect(en).toContain("Post 1 update on Google this week");
    const es = html("es");
    expect(es).toContain("Aprobar todo (preparando…)");
    expect(es).toContain("Le toca a usted · 5 min");
    expect(es).toContain("Responda las preguntas frecuentes de sus clientes");
  });

  test("Grow: the post's and the answers' drafts come with the steps, plus the Premium line; Free: the steps only", () => {
    const [postRec] = recommendations({ type: "hair", now: NOW, timeZone: TZ, replies: null, photos: null, posts: { last30: 0 }, months: [], specialPeriods: null });
    const html = (drafts: boolean) => renderToStaticMarkup(<LocaleProvider locale="en"><ul><RecItem rec={postRec} businessId="b1" premium={false} canEdit={false} type="hair" drafts={drafts} /></ul></LocaleProvider>);
    expect(html(true)).toContain("Premium does this for you in one click →");
    expect(html(false)).toContain("Premium does this for you in one click →");
    expect(readFileSync("components/gbp/GoogleProfilePanel.tsx", "utf8")).toContain('drafts={plan === "grow"}');
    expect(readFileSync("components/gbp/GoogleProfilePanel.tsx", "utf8")).toContain("dashboard.googleTab.w.grow.premiumAll");
    expect(readFileSync("app/business/[id]/growth/page.tsx", "utf8")).toContain('answers: plan === "grow" && extras ? answersPlan(');
  });
});

describe("results: posts and answers on the chart and in 'Since you did this'", () => {
  test("a published post and an answers sitting are their own events; undone / failed / practice left out", () => {
    const events = groupActions(
      {
        replies: [],
        changes: [
          { batch_id: "p1", kind: "local_post", field: "post", status: "sent", approved_at: "2026-11-10T15:00:00Z" },
          { batch_id: "p2", kind: "local_post", field: "post", status: "failed", approved_at: "2026-11-10T16:00:00Z" },
          { batch_id: "p3", kind: "local_post", field: "post", status: "sent", approved_at: "2026-11-11T15:00:00Z", undone_at: "2026-11-11T16:00:00Z" },
          { batch_id: "p4", kind: "local_post_practice", field: "post", status: "sent", approved_at: "2026-11-12T15:00:00Z" },
          { batch_id: "a1", kind: "profile_info", field: "description", status: "sent", approved_at: "2026-11-12T15:00:00.100Z", origin: "answers" },
          { batch_id: "a2", kind: "services", field: "serviceItems", status: "sent", approved_at: "2026-11-12T15:00:02.000Z", origin: "answers" },
          { batch_id: "h1", kind: "profile_info", field: "hours", status: "sent", approved_at: "2026-11-12T18:00:00Z" },
        ],
        promos: [],
        referrals: [],
      },
      { timeZone: TZ, practice: false }
    );
    expect(events).toEqual([
      { date: "2026-11-10", kind: "posts", count: 1 },
      { date: "2026-11-12", kind: "answers", count: 1 },
      { date: "2026-11-12", kind: "listing", count: 1, what: ["hours"] },
    ]);
  });
});

describe("wording: never a Google Q&A / FAQ", () => {
  test("no message offers a Google Q&A or FAQ section (EN or ES)", () => {
    const src = readFileSync("lib/i18n/messages.ts", "utf8");
    const lines = src.split("\n").filter((l) => /^\s+"[^"]+":/.test(l) || /^\s+"/.test(l));
    const bad = lines.filter((l) => /Q&A|Questions\s*&\s*answers|preguntas y respuestas/i.test(l) && /Google/i.test(l));
    expect(bad).toEqual([]);
    expect(src).not.toMatch(/Google (?:profile's |Business Profile )?FAQ/i);
  });
  test("the old Q&A draft is for the website only", () => {
    // Day 23E: the copy-it-yourself Google post and Q&A drafts are gone; the Campaigns page links to the post flow.
    const promos = readFileSync("lib/promos.ts", "utf8");
    expect(promos).not.toContain("buildFaqDraft");
    expect(promos).not.toContain("buildGooglePostDraft");
    expect(existsSync("app/business/[id]/campaigns/MoreWaysToBringPeopleIn.tsx")).toBe(false);
    const coupons = readFileSync("app/business/[id]/campaigns/CouponsSection.tsx", "utf8");
    expect(coupons).toContain('data-testid="post-offer-link"');
    expect(coupons).toContain("<WeekPost businessId={businessId} premium={isPremiumPlan(plan)} promoId={promos[0].id} />");
  });
});
