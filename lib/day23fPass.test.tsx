import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";

// The pass after the section 1 redesign: drafts in the language the page is
// viewed in (devShot never touches a real business's language), every lever
// / card link lands where the task is done and opens it, the listing's
// description from the shared read, the weekly post Ready by default,
// Approve all counting exactly what it sends, the Q&A post type, "Tell
// PostScore what you want", and the polish.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));
const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: (n: string) => (n === "ps_dev_locale" && jar.value ? { value: jar.value } : undefined) }) }));

import { devLocaleOverride, viewLocale } from "@/lib/viewLocale.server";
import { levers } from "@/lib/googleProfileTab";
import { buildGrowthMoves } from "@/lib/growthMoves";
import { kindFromHash, weekAnchor, postState } from "@/components/gbp/ThisWeekList";
import { approveCount, approveItems } from "@/components/gbp/ApproveAll";
import { postSystemPrompt, postUserMessage, qaPostText, requestGivesStory, type PostFacts } from "@/lib/gbpPosts";
import { spelledRight } from "@/lib/gbpPostsContext.server";
import { leverShort } from "@/components/gbp/GoogleProfileTab";
import { RequestBox, type PostDraftState } from "@/components/gbp/PostPreview";
import type { WeekRepliesState } from "@/components/gbp/RepliesPreview";
import { faqEntries } from "@/lib/googleAnswers";
import { LocaleProvider } from "@/lib/i18n";

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

describe("1. drafts in the language the page is viewed in; devShot never changes a business's language", () => {
  test("the saved language, or the dev-only cookie (never in production)", () => {
    jar.value = undefined;
    expect(viewLocale("en")).toBe("en");
    expect(viewLocale("es")).toBe("es");
    jar.value = "es";
    expect(devLocaleOverride({ NODE_ENV: "development" })).toBe("es");
    expect(devLocaleOverride({ NODE_ENV: "production" })).toBeNull();
    jar.value = undefined;
  });
  test("5 drafts in a row stay in English (the prompt's language follows the page, not a stray setting)", () => {
    jar.value = undefined;
    const facts: PostFacts = { name: "Hair Express", category: "Hair salon", city: "Tarrytown", services: ["Balayage"], prices: [], differentiator: null, hasBooking: true };
    for (let i = 0; i < 5; i++) {
      const locale = viewLocale("en");
      expect(postSystemPrompt(locale, "week")).toContain("in English");
      expect(postUserMessage(facts, "hair", { day: null })).not.toMatch(/español|usted/);
    }
  });
  test("the drafts read the page's language; devShot sets a cookie, never the business row", () => {
    expect(readFileSync("lib/gbpPostsContext.server.ts", "utf8")).toContain("viewLocale(str(b.language))");
    const shot = readFileSync("scripts/devShot.ts", "utf8");
    expect(shot).toContain("/api/dev/locale?lang=");
    expect(shot).not.toMatch(/from\("businesses"\)\.update\(\{ language/);
    expect(readFileSync("app/business/[id]/layout.tsx", "utf8")).toContain("viewLocale(business.language)");
    expect(readFileSync("app/api/dev/locale/route.ts", "utf8")).toContain('if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });');
  });
});

describe("2. every lever and card link lands where the task is done, opened", () => {
  const ls = levers({ businessId: "b1", replies: { replied: 0, inWindow: 20 }, couponsRunning: 0, website: { earned: 29, of: 30, fixes: 1 }, media: { photos: { count: 4, newestAt: "2026-09-01T00:00:00Z" }, posts: { last30: 0, lastAt: null, lastType: null }, checkedAt: null } });
  const href = (id: string) => ls.find((l) => l.id === id)!.href;
  test("Posts → the post preview open; Reviews → the reply inbox; Photos → the upload; Deals → a new offer; Website → its fixes", () => {
    expect(href("posts")).toBe("#this-week-post");
    expect(href("reviews")).toBe("/business/b1/website-reviews#google-reviews");
    expect(href("photos")).toBe("#edit-photos");
    expect(href("deals")).toBe("/business/b1/campaigns?tab=coupons#new-offer");
    expect(href("website")).toBe("/business/b1/website#website-checks");
    for (const l of ls) expect(l.href).not.toMatch(/growth#ways-to-grow|^\/business\/b1\/growth$/);
  });
  test("#this-week-post opens the post's row; the coupon designer and the fix list have their anchors", () => {
    expect(kindFromHash("#this-week-post")).toBe("posts");
    expect(kindFromHash("#this-week-replies")).toBe("replies");
    expect(kindFromHash("#something-else")).toBeNull();
    expect(weekAnchor("posts")).toBe("this-week-post");
    expect(readFileSync("app/business/[id]/campaigns/CouponsSection.tsx", "utf8")).toContain('<div id="new-offer" className="scroll-mt-20" />');
    expect(readFileSync("app/business/[id]/website/page.tsx", "utf8")).toContain('id="website-checks"');
  });
  test("'Ways to bring in more customers' cards: a coupon opens the new offer; photos go to the upload on Premium", () => {
    const moves = buildGrowthMoves(
      { businessId: "b1", photoUploadHref: "/business/b1/growth?tab=google#edit-photos", hasEverCreatedPromo: false, hasEverCreatedReferral: true, pricingAssessedAt: new Date().toISOString(), photoCount: 3, competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 40 }, hasWebsite: true, hasVerifiedWebsite: true, hasWebsiteTaskOpen: false, weakWebsiteIssueLabels: [] } as never,
      "en"
    );
    expect(moves.find((m) => m.id === "start_coupon")?.href).toBe("/business/b1/campaigns?tab=coupons#new-offer");
    expect(moves.find((m) => m.id === "add_photos_vs_competitors")?.href).toBe("/business/b1/growth?tab=google#edit-photos");
  });
});

describe("3. the listing's Description row reads what the editor reads", () => {
  test("from the page's own listing read — no second read that could fail on its own", () => {
    const src = readFileSync("components/gbp/GoogleProfileTab.tsx", "utf8");
    expect(src).toContain("useLiveValues(props.businessId, props.extras ? props.extras.description : undefined)");
    expect(src).toContain("known ? Promise.resolve(null) : safe(() => openProfileEdits(businessId))");
  });
});

const post = (p: Partial<PostDraftState>): PostDraftState => ({ status: "ok", text: "Hi", setText: vi.fn(), ctas: [], cta: "NONE", setCta: vi.fn(), photos: [], photoName: null, setPhotoName: vi.fn(), left: null, fallback: false, publish: { canEdit: true, practice: false }, latest: null, setLatest: vi.fn(), another: vi.fn(), anotherBusy: false, anotherLimit: false, problems: [], load: vi.fn(), blockedToday: null, setBlockedToday: vi.fn(), topic: "hair", offer: null, flags: [], fixFlag: vi.fn(), keep: [], keepWord: vi.fn(), custom: vi.fn(), type: "update", setType: vi.fn(), types: ["update"], ...p });

describe("4. the weekly post: Ready with a general topic", () => {
  test("a typo in the owner's price list is spelled right in what PostAI reads, so the draft has nothing to flag", () => {
    expect(spelledRight("baylage", [])).toBe("balayage");
    expect(spelledRight("Haircut", [])).toBe("Haircut");
    expect(postState(post({}))).toBe("ready");
    expect(postState(post({ flags: [{ word: "baylage", suggestion: "balayage" }] }))).toBe("needs_you");
  });
});

describe("5. Approve all counts exactly what it will send now", () => {
  const replies = (ready: string[], canPost = true): WeekRepliesState => ({ status: "ok", items: [], canPost, practice: false, more: 0, setText: vi.fn(), setInclude: vi.fn(), ready, post: vi.fn(), load: vi.fn() });
  test("10 replies + the answers = 11; no duplicates; nothing blocked", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `r${i}`);
    expect(approveItems({ replies: replies([...ids, "r0", "r1"]), post: post({ blockedToday: "posted_today" }) })).toEqual({ replies: 10, post: false, answers: false });
    expect(approveCount({ replies: replies(ids), post: post({ blockedToday: "posted_today" }) })).toBe(10);
    expect(approveCount({ replies: replies(ids, false), post: post({}) })).toBe(1);
    expect(approveCount({ post: post({ flags: [{ word: "x", suggestion: "y" }] }) })).toBe(0);
  });
  test("it says what it will send", () => {
    expect(readFileSync("components/gbp/ApproveAll.tsx", "utf8")).toContain('data-testid="approve-all-what"');
  });
});

describe("5 (first list). 'Your questions, answered': from confirmed facts only, the same pairs as the website FAQ", () => {
  const facts = { name: "Hair Express", city: null, hours: ["Monday: Closed", "Tuesday: 9:30 AM – 5:00 PM"], parking: ["free street parking"], accessibility: [], payments: ["credit cards"], services: [{ name: "Haircut", price: 40 }], bookingUrl: "https://book.example/hx" };
  test("3–5 pairs, no links (booking says to tap Book), EN and ES", () => {
    const en = qaPostText(faqEntries(facts, "en"), "en")!;
    expect(en.startsWith("Your questions, answered\n\nQ: What are Hair Express's hours?")).toBe(true);
    expect(en).toContain("A: Yes, you can book online with the Book button.");
    expect(en).not.toMatch(/https?:/);
    expect((en.match(/\nQ: /g) ?? []).length).toBe(5);
    const es = qaPostText(faqEntries({ ...facts, hours: ["Lunes: cerrado"] }, "es"), "es")!;
    expect(es.startsWith("Sus preguntas, respondidas\n\nP: ¿Cuál es el horario de Hair Express?\nR: Lunes: cerrado.")).toBe(true);
    expect(qaPostText(faqEntries({ ...facts, hours: null, parking: [], payments: [], services: [], bookingUrl: null }, "en"), "en")).toBeNull();
  });
});

describe("6. 'Tell PostScore what you want'", () => {
  test("a request shapes the draft but never adds facts; a real story only when the request gives one", () => {
    expect(postSystemPrompt("en", "week", false, false, true)).toContain("add no fact that isn't in the facts, the offer, the answers or the request itself");
    const facts: PostFacts = { name: "HX", category: null, city: null, services: [], prices: [], differentiator: null, hasBooking: false };
    expect(postUserMessage(facts, "hair", { day: null, request: "Make it shorter" })).toContain("<owner_request>\nMake it shorter\n</owner_request>");
    expect(requestGivesStory("Make it shorter")).toBe(false);
    expect(requestGivesStory("Friendlier tone")).toBe(false);
    expect(requestGivesStory("A real before-and-after: balayage for a regular, done Tuesday")).toBe(true);
  });
  test("example chips, a 44px write button; gone once Grow's 3 are used", () => {
    const html = wrap(<RequestBox chips={["Make it shorter", "Friendlier tone"]} onWrite={vi.fn()} busy={false} limited={false} testId="t" />);
    expect(html).toContain('data-testid="t-open"');
    expect(html).toContain("Tell PostScore what you want →");
    expect(wrap(<RequestBox chips={[]} onWrite={vi.fn()} busy={false} limited testId="t" />)).toBe("");
    const src = readFileSync("app/actions/gbpPosts.ts", "utf8");
    expect(src).toContain('in("kind", ["another", "qa", "offer", "description"])');
    expect(src).toContain("export async function redraftDescription(");
  });
});

describe("the dev language reaches the whole page (the shell), not only the drafts", () => {
  test("layout → DevLocaleProvider → DashboardShell", () => {
    expect(readFileSync("app/business/[id]/layout.tsx", "utf8")).toContain("<DevLocaleProvider value={devLocaleOverride()}>");
    expect(readFileSync("components/layout/DashboardShell.tsx", "utf8")).toContain("const locale = devLocale ?? normalizeLocale(business?.language);");
  });
  test("the FAQ's hours end with one period", () => {
    const e = faqEntries({ name: "HX", city: null, hours: ["Lunes: cerrado", "Domingo: 11:00 a.m. – 4:00 p.m."], parking: [], accessibility: [], payments: [], services: [], bookingUrl: null }, "es");
    expect(e[0].a).toBe("Lunes: cerrado; Domingo: 11:00 a.m. – 4:00 p.m.");
  });
});

describe("7. polish", () => {
  test("Spanish photos chip in months; the 'Since' table's short phone header; 'Posted today' once in the preview", () => {
    const lever = (months: number) => ({ id: "photos", status: "newest", params: { months }, tone: "warn", pill: "add3", href: "#x" }) as never;
    expect(leverShort(lever(2), "es")).toBe("Fotos · 2 meses");
    expect(leverShort(lever(1), "es")).toBe("Fotos · 1 mes");
    expect(leverShort(lever(2), "en")).toBe("Photos · 2 mo");
    const tab = readFileSync("components/gbp/GoogleProfileTab.tsx", "utf8");
    expect(tab).toContain('t(locale, K("since.windowShort"), { days: result.days })');
    expect(tab).toContain('t(locale, K(`since.per100Label.${c.dir}`))');
    expect(readFileSync("components/gbp/ThisWeekList.tsx", "utf8")).toContain("<PostPreview businessId={businessId} state={post} showBlocked={false} />");
  });
});

describe("last tweaks: 'Since' layout, the replies' detail line, Approve all while drafts load", () => {
  test("a card with numbers takes the full width; 'Check back on…' cards 2 per row below, stacked on phones", () => {
    const tab = readFileSync("components/gbp/GoogleProfileTab.tsx", "utf8");
    expect(tab).toContain('<div className="grid items-start gap-3 sm:grid-cols-2">');
    expect(tab).toContain('st.ready && "sm:col-span-2"');
  });
  test("the replies to-do says how many have a reply (EN + ES, real numbers)", async () => {
    const { recText } = await import("@/components/gbp/GoogleRecs");
    const { replyPlan } = await import("@/lib/googleRecommendations");
    const plan = replyPlan({ replied: 0, inWindow: 20 })!;
    expect(recText({ kind: "replies", plan }, "en", null).sub).toBe("0 of your last 20 reviews have a reply");
    expect(recText({ kind: "replies", plan }, "es", null).sub).toBe("0 de sus últimas 20 reseñas tienen respuesta");
    expect(recText({ kind: "replies", plan: replyPlan({ replied: 5, inWindow: 8 })! }, "en", null).sub).toBe("5 of your last 8 reviews have a reply");
  });
  test("while drafts load: disabled, 'Approve all (getting ready…)'; the final count once ready", async () => {
    const { ApproveAll } = await import("@/components/gbp/ApproveAll");
    const loadingPost = post({ status: "loading" });
    const html = wrap(<ApproveAll businessId="b1" post={loadingPost} canEdit practice={false} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-loading="1"[^>]*>Approve all \(getting ready…\)<\/button>/);
    expect(wrap(<ApproveAll businessId="b1" post={loadingPost} canEdit practice={false} />, "es")).toContain(">Aprobar todo (preparando…)<");
    const ready = wrap(<ApproveAll businessId="b1" post={post({})} canEdit practice={false} />);
    expect(ready).toMatch(/data-loading="0"[^>]*>Approve all \(1\)<\/button>/);
  });
});

