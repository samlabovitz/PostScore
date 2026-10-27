import { beforeEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
let pathname = "/business/b1";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/postaiDock", () => ({ loadPostaiDock: vi.fn(), markPostaiIntroSeen: vi.fn() }));
vi.mock("@/app/actions/assistant", () => ({ sendAssistantMessage: vi.fn() }));
// The paid chat is the existing AssistantView (its own tests cover it);
// here only what the panel hands it.
vi.mock("@/components/assistant/AssistantView", () => ({
  AssistantView: (p: { starterPrompts: string[]; monthly: unknown; initialDraft?: string }) => (
    <div data-testid="assistant-view" data-monthly={JSON.stringify(p.monthly)} data-starters={p.starterPrompts.join("|")} data-draft={p.initialDraft ?? ""} />
  ),
}));

import { LocaleProvider, t, type Locale } from "@/lib/i18n";
import { featureMapFor } from "@/lib/postaiFeatureMap";
import {
  isNearBottom,
  POSTAI_MIN_PAGE_CONTENT,
  POSTAI_PAGE_QUESTIONS,
  postaiInputHeight,
  postaiPageFromPath,
  postaiPageQuestions,
  postaiPanelNarrowsPage,
  postaiQuestionsByPage,
  shouldShowPostaiIntro,
  type PostaiPage,
} from "@/lib/postaiDock";
import { ChatInput } from "@/components/assistant/ChatPanelParts";
import { PostAIDock, PostAIIntro, PostAIPanelBody } from "@/components/assistant/PostAIDock";
import type { Plan } from "@/lib/plan";

const OPTS = { couponsOk: true, referralOk: true, pricingOk: true, hasWebsite: true, monthlyReportsLive: true };
const features = (plan: Plan) => featureMapFor(plan, OPTS);
const wrap = (node: React.ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);
const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const RESET = "2026-11-02T15:00:00.000Z";

beforeEach(() => {
  pathname = "/business/b1";
});

describe("the button on every dashboard page", () => {
  test("every business page shares the layout that renders the dock — so it (and an open chat) persists while navigating", () => {
    const layout = fs.readFileSync("app/business/[id]/layout.tsx", "utf8");
    expect(layout).toContain("{children}");
    expect(layout).toContain("<PostAIDock");
    // Website-only businesses have no PostAI.
    expect(layout).toContain('listingMode === "website_only"');
  });

  test.each([
    ["/business/b1", "overview"],
    ["/business/b1/website-reviews", "reviews"],
    ["/business/b1/website", "website"],
    ["/business/b1/competitors", "competitors"],
    ["/business/b1/pricing", "pricing"],
    ["/business/b1/growth", "growth"],
    ["/business/b1/reports", "reports"],
    ["/business/b1/settings", "other"],
    ["/business/b1/campaigns", "other"],
    ["/business/b1/google-profile", "other"],
  ])("%s → %s, with the button", (path, page) => {
    expect(postaiPageFromPath(path, "b1")).toBe(page);
    pathname = path;
    const html = wrap(<PostAIDock businessId="b1" businessName="Shop" questions={postaiQuestionsByPage(features("grow"), "en")} introSeen={false} />);
    expect(html).toContain('data-testid="postai-button"');
    expect(html).toContain('aria-label="Ask PostAI"');
  });

  test("hidden on full-screen PostStudio and the starter-site preview (and login/signup are outside the business pages)", () => {
    for (const path of ["/business/b1/studio", "/business/b1/studio/sign", "/business/b1/website/preview", "/login", "/signup"]) {
      expect(postaiPageFromPath(path, "b1"), path).toBeNull();
      pathname = path;
      expect(wrap(<PostAIDock businessId="b1" businessName="Shop" questions={postaiQuestionsByPage(features("grow"), "en")} introSeen />)).toBe("");
    }
  });

  test("bottom-right, clear of the plan pill and toasts; a round icon on phones with the label for screen readers; EN + ES", () => {
    const html = wrap(<PostAIDock businessId="b1" businessName="Shop" questions={postaiQuestionsByPage(features("free"), "en")} introSeen />);
    expect(html).toContain('class="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6" data-testid="postai-dock"');
    // Phones: a 48px circle; the text only from sm up.
    expect(html).toMatch(/data-testid="postai-button" class="[^"]*h-12 w-12[^"]*rounded-full[^"]*sm:w-auto/);
    expect(html).toMatch(/<span class="hidden [^"]*sm:inline">Ask PostAI<\/span>/);
    const es = decode(wrap(<PostAIDock businessId="b1" businessName="Shop" questions={postaiQuestionsByPage(features("free"), "es")} introSeen />, "es"));
    expect(es).toContain('aria-label="Pregunte a PostAI"');
    // The dev "locale: en" badge is gone (dev and production).
    const shell = fs.readFileSync("components/layout/DashboardShell.tsx", "utf8");
    expect(shell).not.toContain("locale: {locale}");
    expect(shell).not.toMatch(/fixed bottom-3 right-3/);
    // Toasts stay bottom-center and the plan pill bottom-left.
    expect(fs.readFileSync("components/dev/DevPlanPill.tsx", "utf8")).toContain("fixed bottom-3 left-3");
  });

  test("the panel: a 400px side panel on desktop, full screen on phones; Esc closes", () => {
    const dock = fs.readFileSync("components/assistant/PostAIDock.tsx", "utf8");
    expect(dock).toContain('"fixed inset-0 z-[55] flex flex-col overscroll-contain bg-paper nav:inset-y-0 nav:left-auto nav:right-0 nav:z-30 nav:w-[400px]');
    expect(dock).toContain('if (e.key === "Escape") close();');
    expect(dock).toContain("aria-modal={!desktop}");
  });

  test("page squeeze: the page narrows only when its own content keeps ~1000px; otherwise the panel overlays it", () => {
    // The page's main area beside the 250px sidebar, with 40px padding each side.
    const main = (viewport: number) => viewport - 250;
    expect(postaiPanelNarrowsPage(main(1440), 80)).toBe(false); // 710px left → overlay
    expect(postaiPanelNarrowsPage(main(1600), 80)).toBe(false); // 870px → overlay
    expect(postaiPanelNarrowsPage(main(1730), 80)).toBe(true); // exactly 1000px → narrow
    expect(postaiPanelNarrowsPage(main(1920), 80)).toBe(true);
    expect(POSTAI_MIN_PAGE_CONTENT).toBe(1000);
    const dock = fs.readFileSync("components/assistant/PostAIDock.tsx", "utf8");
    // Measured on open, on resize and on every page; full screen never narrows (it covers).
    expect(dock).toContain("if (postaiPanelNarrowsPage(width, paddingX)) document.body.dataset.postaiPanel = \"open\";");
    expect(dock).toContain('window.addEventListener("resize", sync);');
    expect(dock).toContain("}, [visible, desktop, expanded, pathname]);");
    expect(dock).toContain("if (desktop && !expanded) {");
    // No fixed 1440px breakpoint anymore.
    expect(fs.readFileSync("app/globals.css", "utf8")).not.toContain("1440px");
  });

  test("full screen and phones lock the page behind the panel", () => {
    const dock = fs.readFileSync("components/assistant/PostAIDock.tsx", "utf8");
    const effect = dock.slice(dock.indexOf("if (desktop && !expanded) {"));
    expect(effect).toContain('document.body.style.overflow = "hidden";');
  });

  test("full screen: an expand button (desktop only) that covers the dashboard content — the sidebar stays — and a collapse back; remembered for the session", () => {
    const dock = fs.readFileSync("components/assistant/PostAIDock.tsx", "utf8");
    expect(dock).toContain('"fixed inset-0 z-[55] flex flex-col overscroll-contain bg-paper nav:inset-y-0 nav:left-[250px] nav:right-0 nav:z-30"');
    // Hidden on phones (already full screen).
    expect(dock).toMatch(/data-testid="postai-expand"\s+className="hidden [^"]*nav:inline-flex"/);
    expect(dock).toContain('full ? "dashboard.postaiDock.collapse" : "dashboard.postaiDock.expand"');
    expect(dock).toContain("window.sessionStorage.setItem(POSTAI_FULL_STORAGE_KEY");
    expect(t("en", "dashboard.postaiDock.expand")).toBe("Full screen");
    expect(t("en", "dashboard.postaiDock.collapse")).toBe("Back to side panel");
    expect(t("es", "dashboard.postaiDock.expand")).toBe("Pantalla completa");
  });

  test("one header only: sparkle + PostAI + Beta, then expand and close — no second heading or grade letter inside", () => {
    pathname = "/business/b1";
    const dock = fs.readFileSync("components/assistant/PostAIDock.tsx", "utf8");
    const header = dock.slice(dock.indexOf("{/* The one header"), dock.indexOf('data-testid="postai-close"'));
    expect(header).toContain('"dashboard.postaiDock.panelTitle"');
    expect(header).toContain('"dashboard.overview.betaLabel"');
    expect(header.indexOf("postai-expand")).toBeGreaterThan(header.indexOf("betaLabel"));
    const view = fs.readFileSync("components/assistant/AssistantView.tsx", "utf8");
    for (const gone of ["<SectionHeading", "<GradeBadge", "postAiOverlayTitle", "betaLabel", "<Card"]) expect(view, gone).not.toContain(gone);
  });
});

describe("compact panel layout", () => {
  test("the grounding note is one short muted line (EN + ES), on every plan", () => {
    const free = decode(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "free", allowance: { status: "ok", left: 2, resetsAt: RESET } }} starters={[]} draft={null} />));
    expect(free).toMatch(/<p data-testid="postai-grounding" class="[^"]*text-\[12px\] text-ink-mute">Answers use your real PostScore data. General tips are labeled.<\/p>/);
    const paidEs = decode(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "paid", context: {} as never, monthly: null }} starters={[]} draft={null} />, "es"));
    expect(paidEs).toContain("Las respuestas usan sus datos reales de PostScore. Los consejos generales van marcados.");
  });

  test("exactly one scroll area — the conversation; header, grounding line, memory row and input never scroll", () => {
    const view = fs.readFileSync("components/assistant/AssistantView.tsx", "utf8");
    const order = ["<BusinessMemoryPanel", "<ChatScroll", 'data-testid="postai-input-bar"', 'data-testid="postai-bottom-bar"'].map((m) => view.indexOf(m));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The memory row and the input bar are fixed (shrink-0); only ChatScroll scrolls.
    expect(view).toContain('className="relative z-10 shrink-0 border-b border-paper-line px-4"');
    expect(view).toContain('className="shrink-0 border-t border-paper-line bg-white p-4"');
    expect(view).not.toMatch(/overflow-y-auto|overflow-auto/);
    const parts = fs.readFileSync("components/assistant/ChatPanelParts.tsx", "utf8");
    expect(parts).toContain('className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"');
    // The dock's header and body never scroll themselves.
    const dock = fs.readFileSync("components/assistant/PostAIDock.tsx", "utf8");
    expect(dock).not.toMatch(/overflow-y-auto|overflow-auto/);
    // Free, rendered: one scroll container, and the input after it.
    const free = wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "free", allowance: { status: "ok", left: 2, resetsAt: RESET } }} starters={["What should I fix first?"]} draft={null} />);
    expect(free.match(/overflow-y-auto/g)).toHaveLength(1);
    expect(free).toMatch(/data-testid="postai-scroll" class="[^"]*overflow-y-auto overscroll-contain/);
    expect(free.indexOf('data-testid="postai-grounding"')).toBeLessThan(free.indexOf('data-testid="postai-scroll"'));
    // "Continuing this conversation" is only a tiny label above the input.
    expect(view).toMatch(/text-\[11px\] text-ink-mute">\{t\(locale, "dashboard\.assistant\.continuingConversation"\)\}/);
    expect(view).not.toContain("newConversationSavedNote");
    // Free: the same shape.
    const freeText = decode(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "free", allowance: { status: "ok", left: 2, resetsAt: RESET } }} starters={["What should I fix first?"]} draft={null} />));
    expect(freeText.indexOf('data-testid="postai-scroll"')).toBeLessThan(freeText.indexOf('data-testid="postai-input-bar"'));
    expect(freeText.indexOf("What should I fix first?")).toBeLessThan(freeText.indexOf('data-testid="postai-input-bar"'));
  });
});

describe("the one-time intro", () => {
  test("shown only until dismissed — on the account or on this device", () => {
    expect(shouldShowPostaiIntro(false, false)).toBe(true);
    expect(shouldShowPostaiIntro(true, false)).toBe(false);
    expect(shouldShowPostaiIntro(false, true)).toBe(false);
  });

  test("the bubble's words and its 'Got it' (EN + ES); never in the server HTML", () => {
    const en = decode(wrap(<PostAIIntro onDismiss={() => {}} />));
    expect(en).toContain("Meet PostAI — ask anything about your score, reviews, competitors or what to do next. It answers using your real PostScore data.");
    expect(en).toContain(">Got it<");
    expect(decode(wrap(<PostAIIntro onDismiss={() => {}} />, "es"))).toContain(">Entendido<");
    // Decided after mount, so a first render never flashes it.
    expect(wrap(<PostAIDock businessId="b1" businessName="Shop" questions={postaiQuestionsByPage(features("grow"), "en")} introSeen={false} />)).not.toContain("postai-intro");
  });

  test("'Got it' (or opening the panel) is remembered per user, on the account", () => {
    const action = fs.readFileSync("app/actions/postaiDock.ts", "utf8");
    expect(action).toContain("supabase.auth.updateUser({ data: { postai_intro_seen: true } })");
    expect(fs.readFileSync("app/business/[id]/layout.tsx", "utf8")).toContain("introSeen={auth.data.user?.user_metadata?.postai_intro_seen === true}");
    const dock = fs.readFileSync("components/assistant/PostAIDock.tsx", "utf8");
    const openPanel = dock.slice(dock.indexOf("const openPanel"), dock.indexOf("const close = "));
    expect(openPanel).toContain("dismissIntro()");
  });
});

describe("page-aware starter questions", () => {
  const PAGES = Object.keys(POSTAI_PAGE_QUESTIONS) as PostaiPage[];

  test("three short questions on every page, every plan, EN + ES", () => {
    for (const plan of ["free", "grow", "premium", "multi"] as Plan[]) {
      for (const locale of ["en", "es"] as const) {
        const byPage = postaiQuestionsByPage(features(plan), locale);
        for (const page of PAGES) {
          expect(byPage[page], `${plan} ${page}`).toHaveLength(3);
          for (const q of byPage[page]) expect(q.length, q).toBeLessThan(60);
        }
      }
    }
    expect(postaiPageQuestions("overview", features("grow"), "en")).toEqual(["What should I fix first?", "Why is my score what it is?", "How do I compare to businesses nearby?"]);
    expect(postaiPageQuestions("reviews", features("grow"), "en")).toEqual(["How do I get more reviews?", "How should I reply to a review?", "Where should I put my review sign?"]);
    expect(postaiPageQuestions("other", features("grow"), "en")).toEqual(postaiPageQuestions("overview", features("grow"), "en"));
  });

  test("never treats a locked feature as usable — it asks what it is instead", () => {
    for (const plan of ["free", "grow", "premium", "multi"] as Plan[]) {
      const status = new Map(features(plan).map((f) => [f.id, f.status]));
      for (const page of PAGES) {
        const asked = postaiPageQuestions(page, features(plan), "en");
        POSTAI_PAGE_QUESTIONS[page].forEach((q, i) => {
          const usable = !q.needs || status.get(q.needs) === "usable" || status.get(q.needs) === "preview";
          // A locked feature's own question is never asked; its "what is it" one is.
          if (!usable && q.locked) {
            expect(asked[i], `${plan} ${page} ${q.key}`).not.toBe(t("en", q.key));
            expect(asked[i]).toBe(t("en", q.locked));
          }
          if (usable) expect(asked[i]).toBe(t("en", q.key));
        });
      }
    }
    // Free: the step-by-step plan, the review sign, Price check and Reports are locked.
    expect(postaiPageQuestions("growth", features("free"), "en")).toEqual(["What should I fix first?", "What's in the step-by-step plan?", "Which plan has the weekly plan?"]);
    expect(postaiPageQuestions("reviews", features("free"), "en")[2]).toBe("Why do reviews matter for my score?");
    expect(postaiPageQuestions("pricing", features("free"), "en")).toEqual(["What does Price check show?", "Which plan includes Price check?", "How should I think about my prices?"]);
    expect(postaiPageQuestions("reports", features("free"), "en")).toEqual(["How has my score changed?", "What's in the reports?", "What should I focus on next month?"]);
    // Grow: they work.
    expect(postaiPageQuestions("growth", features("grow"), "en")).toEqual(["What should I do this week?", "Which fix adds the most points?", "How does the weekly routine work?"]);
    expect(postaiPageQuestions("pricing", features("grow"), "en")[0]).toBe("Are my prices competitive?");
    // A business type without Price check is never told to use it.
    expect(postaiPageQuestions("pricing", featureMapFor("premium", { ...OPTS, pricingOk: false }), "en")[0]).toBe("What does Price check show?");
  });

  test("the panel shows the current page's questions", () => {
    pathname = "/business/b1/competitors";
    const questions = postaiQuestionsByPage(features("premium"), "en");
    const body = wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "paid", context: {} as never, monthly: null }} starters={questions.competitors} draft={null} />);
    expect(decode(body)).toContain('data-starters="How do I compare to my competitors?|Who\'s ahead of me, and why?|How can I catch up on reviews?"');
  });
});

describe("plan limits in the panel (enforced on the server, as before)", () => {
  const starters = ["What should I fix first?"];

  test("Free: the weekly counter, used-up and paused — EN + ES", () => {
    const ok = decode(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "free", allowance: { status: "ok", left: 2, resetsAt: RESET } }} starters={starters} draft={null} />));
    expect(ok).toContain("2 of 3 free questions left · resets Nov 2, 2026");
    expect(ok).toContain('data-testid="postai-question"');
    expect(ok).toContain("What should I fix first?");
    const used = decode(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "free", allowance: { status: "ok", left: 0, resetsAt: RESET } }} starters={starters} draft={null} />));
    expect(used).toContain("You've used this week's free questions.");
    expect(used).not.toContain('data-testid="postai-question"');
    const paused = decode(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "free", allowance: { status: "paused", left: 2, resetsAt: RESET, until: "2026-11-01T00:00:00.000Z" } }} starters={starters} draft={null} />));
    expect(paused).toContain("Free AI answers are paused until");
    expect(paused).not.toContain('data-testid="postai-question"');
    expect(decode(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "free", allowance: { status: "ok", left: 1, resetsAt: RESET } }} starters={starters} draft={null} />, "es"))).toContain("Le quedan 1 de 3 preguntas gratis");
  });

  test("Grow gets its monthly allowance; Premium/Multi none (unlimited); a typed-in question is passed along", () => {
    const grow = wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "paid", context: {} as never, monthly: { left: 97, total: 100, resetsAt: RESET } }} starters={starters} draft={{ text: "Why is my score 72?", n: 1 }} />);
    expect(decode(grow)).toContain(`data-monthly="{"left":97,"total":100,"resetsAt":"${RESET}"}"`);
    expect(decode(grow)).toContain('data-draft="Why is my score 72?"');
    const premium = wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "paid", context: {} as never, monthly: null }} starters={starters} draft={null} />);
    expect(premium).toContain('data-monthly="null"');
  });

  test("the panel's data loads on open, with the limits and checks still on the server", () => {
    const action = fs.readFileSync("app/actions/postaiDock.ts", "utf8");
    expect(action).toContain('freeAiAllowance(businessId, "postai")');
    expect(action).toContain("getPostaiMonthlyStatus(businessId)");
    // Ownership first.
    expect(action.indexOf("getBusinessSummary(businessId)")).toBeLessThan(action.indexOf("getPlan()"));
    const send = fs.readFileSync("app/actions/assistant.ts", "utf8");
    expect(send).toContain("answerWithFactCheck(");
    expect(fs.readFileSync("components/assistant/PostAIDock.tsx", "utf8")).toContain("if (!open || data || loading.current) return;");
    // Loading / unavailable states.
    expect(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={null} starters={starters} draft={null} />)).toContain("Loading PostAI…");
    expect(decode(wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "unavailable" }} starters={starters} draft={null} />))).toContain("Couldn't reach the assistant");
  });
});

describe("the Free Overview card opens the same panel", () => {
  test("its questions and 'Ask PostAI' open the panel; the counter stays on the card", async () => {
    const { FreePostAI } = await import("@/components/overview/FreePostAI");
    const html = decode(wrap(<FreePostAI businessId="b1" starterPrompts={["What should I fix first?"]} initial={{ status: "ok", left: 2, resetsAt: RESET }} />));
    expect(html).toContain('data-testid="free-postai-open"');
    expect(html).toContain("2 of 3 free questions left");
    expect(html).not.toContain('data-testid="postai-question"');
    const src = fs.readFileSync("components/overview/FreePostAI.tsx", "utf8");
    expect(src).toContain("onClick={() => openPostAI(prompt)}");
    expect(src).toContain("onClick={() => openPostAI()}");
  });
});

describe("auto-scroll to the newest message", () => {
  test("follows the newest only while the owner is at (or near) the bottom", () => {
    expect(isNearBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    expect(isNearBottom({ scrollTop: 560, scrollHeight: 1000, clientHeight: 400 })).toBe(true); // 40px away
    expect(isNearBottom({ scrollTop: 300, scrollHeight: 1000, clientHeight: 400 })).toBe(false); // reading back
  });

  test("on open and on each new message it jumps down — unless scrolled up, then '↓ New message' (EN + ES)", () => {
    const parts = fs.readFileSync("components/assistant/ChatPanelParts.tsx", "utf8");
    expect(parts).toContain("if (following.current) toBottom(false);\n    else setHasNew(true);");
    expect(parts).toContain('data-testid="postai-new-message"');
    expect(t("en", "dashboard.postaiDock.newMessage")).toBe("New message");
    expect(t("es", "dashboard.postaiDock.newMessage")).toBe("Mensaje nuevo");
    // Both chats re-check whenever a message or answer arrives.
    expect(fs.readFileSync("components/assistant/AssistantView.tsx", "utf8")).toContain("useChatScroll(`${messages.length}:${sending}:${resuming}`)");
    expect(fs.readFileSync("components/overview/FreePostAI.tsx", "utf8")).toContain("useChatScroll(`${answers.length}:${sending}`)");
  });
});

describe("the question box", () => {
  test("one line to start, growing to four, then it scrolls inside itself", () => {
    expect(postaiInputHeight(20)).toEqual({ height: 40, scrolls: false }); // 1 line
    expect(postaiInputHeight(40)).toEqual({ height: 40, scrolls: false });
    expect(postaiInputHeight(60)).toEqual({ height: 60, scrolls: false }); // 2 lines
    expect(postaiInputHeight(100)).toEqual({ height: 100, scrolls: false }); // 4 lines
    expect(postaiInputHeight(160)).toEqual({ height: 100, scrolls: true }); // 7 lines → capped
  });

  test("a one-row textarea with a short placeholder that fits (EN + ES); the Send button stays aligned at the bottom", () => {
    const en = decode(wrap(<ChatInput value="" onChange={() => {}} onSubmit={() => {}} testId="postai-input" />));
    expect(en).toMatch(/<textarea[^>]*rows="1"/);
    expect(en).toContain('placeholder="Ask PostAI anything…"');
    expect(en).toMatch(/class="block h-10 [^"]*leading-5/);
    expect(decode(wrap(<ChatInput value="" onChange={() => {}} onSubmit={() => {}} />, "es"))).toContain('placeholder="Pregunte lo que quiera a PostAI…"');
    // Free's box keeps its 500-character cap; the paid one has none.
    expect(wrap(<ChatInput value="" onChange={() => {}} onSubmit={() => {}} maxLength={500} />)).toContain('maxLength="500"');
    const free = wrap(<PostAIPanelBody businessId="b1" businessName="Shop" data={{ status: "ok", kind: "free", allowance: { status: "ok", left: 2, resetsAt: RESET } }} starters={[]} draft={null} />);
    expect(free).toMatch(/<form class="flex items-end gap-2">/);
    expect(free).toMatch(/data-testid="postai-ask" class="[^"]*h-10/);
    expect(fs.readFileSync("components/assistant/AssistantView.tsx", "utf8")).toContain('className="h-10 shrink-0"');
  });
});
