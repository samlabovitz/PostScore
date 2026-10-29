// PostAI everywhere: the floating "Ask PostAI" button and its panel on every
// dashboard page (components/assistant/PostAIDock.tsx). Pure: which page
// the owner is on, the three starter questions for it, and the browser
// events pages use to open the panel. The questions come from the
// plan-aware feature map (lib/postaiFeatureMap.ts), so a question never
// treats a locked feature as usable — it asks what the feature is instead.

import type { FeatureEntry } from "@/lib/postaiFeatureMap";
import { t, type Locale, type MessageKey } from "@/lib/i18n";

export type PostaiPage = "overview" | "reviews" | "website" | "competitors" | "pricing" | "growth" | "reports";

/** The dashboard page for a path, "other" for the rest (Settings,
 * Campaigns…), or null where the button is hidden: full-screen PostStudio
 * and the full-screen starter-site preview. */
export function postaiPageFromPath(pathname: string, businessId: string): PostaiPage | "other" | null {
  const base = `/business/${businessId}`;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const rest = pathname.slice(base.length).replace(/\/+$/, "");
  if (rest.startsWith("/studio") || rest.startsWith("/website/preview")) return null;
  if (rest === "") return "overview";
  const first = rest.split("/")[1];
  switch (first) {
    case "website-reviews":
      return "reviews";
    case "website":
    case "competitors":
    case "pricing":
    case "growth":
    case "reports":
      return first;
    default:
      return "other";
  }
}

interface Question {
  key: MessageKey;
  /** The feature it relies on (a FeatureEntry id); usable or preview → ask
   * it, otherwise (locked, coming soon, or not on this business) ask
   * `locked` instead. */
  needs?: string;
  locked?: MessageKey;
}

const Q = (page: string, n: string): MessageKey => `dashboard.postaiDock.q.${page}.${n}` as MessageKey;

export const POSTAI_PAGE_QUESTIONS: Record<PostaiPage, Question[]> = {
  overview: [{ key: Q("overview", "fixFirst") }, { key: Q("overview", "whyScore") }, { key: Q("overview", "compare"), needs: "competitors" }],
  reviews: [
    { key: Q("reviews", "more"), needs: "reviewLinkQr" },
    { key: Q("reviews", "reply"), needs: "replyDrafts" },
    { key: Q("reviews", "sign"), needs: "reviewSign", locked: Q("reviews", "whyMatter") },
  ],
  website: [
    { key: Q("website", "fixFirst"), needs: "websiteAudit" },
    { key: Q("website", "phones"), needs: "websiteAudit" },
    { key: Q("website", "starterSite"), needs: "starterSite" },
  ],
  competitors: [
    { key: Q("competitors", "compare"), needs: "competitors" },
    { key: Q("competitors", "ahead"), needs: "competitors" },
    { key: Q("competitors", "catchUp"), needs: "competitors" },
  ],
  pricing: [
    { key: Q("pricing", "competitive"), needs: "priceCheck", locked: Q("pricing", "whatIs") },
    { key: Q("pricing", "checkFirst"), needs: "priceCheck", locked: Q("pricing", "whichPlan") },
    { key: Q("pricing", "addItems"), needs: "priceCheck", locked: Q("pricing", "thinkAbout") },
  ],
  growth: [
    { key: Q("growth", "thisWeek"), needs: "fixSteps", locked: Q("overview", "fixFirst") },
    { key: Q("growth", "mostPoints"), needs: "fixSteps", locked: Q("growth", "whatsInPlan") },
    { key: Q("growth", "routine"), needs: "routine", locked: Q("growth", "whichPlan") },
  ],
  reports: [
    { key: Q("reports", "changed"), needs: "reports", locked: Q("reports", "scoreChanged") },
    { key: Q("reports", "read"), needs: "reports", locked: Q("reports", "whatsIn") },
    { key: Q("reports", "nextMonth") },
  ],
};

/** The three starter questions for a page on this plan (EN or ES). */
export function postaiPageQuestions(page: PostaiPage | "other", features: FeatureEntry[], locale: Locale): string[] {
  const usable = new Set(features.filter((f) => f.status === "usable" || f.status === "preview").map((f) => f.id));
  return POSTAI_PAGE_QUESTIONS[page === "other" ? "overview" : page].map((q) =>
    t(locale, !q.needs || usable.has(q.needs) ? q.key : (q.locked ?? q.key))
  );
}

/** Every page's questions at once — computed on the server, so the
 * browser never needs the feature map. */
export function postaiQuestionsByPage(features: FeatureEntry[], locale: Locale): Record<PostaiPage, string[]> {
  const pages = Object.keys(POSTAI_PAGE_QUESTIONS) as PostaiPage[];
  return Object.fromEntries(pages.map((p) => [p, postaiPageQuestions(p, features, locale)])) as Record<PostaiPage, string[]>;
}

/** Open the panel from anywhere on the page (the Free Overview card, a
 * "Confused? Ask PostAI" link), optionally with a question typed in. */
export const POSTAI_OPEN_EVENT = "postai:open";
/** Free: questions left changed (the panel tells the Overview card). */
export const POSTAI_FREE_LEFT_EVENT = "postai:free-left";

export function openPostAI(draft?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POSTAI_OPEN_EVENT, { detail: { draft } }));
}

/** The floating panel marks the page while it's mounted (every business
 * page's layout), so links can open it in place. */
export function markPostaiDockReady(ready: boolean) {
  if (typeof document === "undefined") return;
  if (ready) document.documentElement.dataset.postaiDock = "ready";
  else delete document.documentElement.dataset.postaiDock;
}

export function postaiDockReady(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.postaiDock === "ready";
}

/** An "Ask PostAI" link's click: with the panel on this page, open it in
 * place with the question typed in (never sent) — no navigation. Without
 * it (a page with no PostAI), the link's own address is followed. */
export function askPostAIInPlace(event: { preventDefault: () => void }, question?: string): boolean {
  if (!postaiDockReady()) return false;
  event.preventDefault();
  openPostAI(question);
  return true;
}

/** The one-time intro, remembered on this device too (the account flag
 * is the source of truth — user_metadata.postai_intro_seen). */
export const POSTAI_INTRO_STORAGE_KEY = "postscore:postai-intro-seen";
/** "Full screen" for the rest of the browser session (desktop). */
export const POSTAI_FULL_STORAGE_KEY = "postscore:postai-full";

/** First visit only: never again once dismissed on the account or here. */
export function shouldShowPostaiIntro(accountSeen: boolean, deviceSeen: boolean): boolean {
  return !accountSeen && !deviceSeen;
}

/** The side panel's width (PostAIDock, globals.css). */
export const POSTAI_PANEL_WIDTH = 400;
/** Below this much room for the page's own content, the side panel lies
 * over the page instead of narrowing it (no squeezed score card). */
export const POSTAI_MIN_PAGE_CONTENT = 1000;

/** Narrow the page for the panel only when the page's content would still
 * be at least POSTAI_MIN_PAGE_CONTENT wide: `mainWidth` is the page's main
 * area without the panel, `paddingX` its own left + right padding. */
export function postaiPanelNarrowsPage(mainWidth: number, paddingX: number): boolean {
  return mainWidth - paddingX - POSTAI_PANEL_WIDTH >= POSTAI_MIN_PAGE_CONTENT;
}

/** Within this many pixels of the bottom counts as "reading the newest". */
export const POSTAI_STICK_THRESHOLD = 48;

export function isNearBottom(el: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= POSTAI_STICK_THRESHOLD;
}

/** The question box: one line to start, growing to four, then it scrolls
 * inside itself. 20px lines + 10px padding top and bottom. */
export const POSTAI_INPUT_LINE_PX = 20;
export const POSTAI_INPUT_PADDING_Y_PX = 20;
export const POSTAI_INPUT_MAX_LINES = 4;

export function postaiInputHeight(contentHeight: number): { height: number; scrolls: boolean } {
  const min = POSTAI_INPUT_LINE_PX + POSTAI_INPUT_PADDING_Y_PX;
  const max = POSTAI_INPUT_LINE_PX * POSTAI_INPUT_MAX_LINES + POSTAI_INPUT_PADDING_Y_PX;
  return { height: Math.min(Math.max(contentHeight, min), max), scrolls: contentHeight > max };
}
