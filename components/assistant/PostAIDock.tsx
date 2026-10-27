"use client";

// "Ask PostAI" on every dashboard page, every plan: a floating button
// (bottom-right; a round icon on phones), a one-time intro, and the chat
// in a side panel (desktop) or a full-screen sheet (phones). It lives in
// app/business/[id]/layout.tsx, so it — and the conversation in it — stays
// open while the owner moves between pages, until they close it.
//
// The chat is the existing one: AssistantView on Grow/Premium/Multi,
// FreePostAIChat on Free. Every limit and check stays on the server
// (app/actions/assistant.ts). Its data loads on first open, never on page
// load (app/actions/postaiDock.ts). Hidden on full-screen PostStudio and
// the starter-site preview (postaiPageFromPath).

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IconArrowsMaximize, IconArrowsMinimize, IconSparkles, IconX } from "@tabler/icons-react";
import { Pill } from "@/components/ui/Pill";
import { AssistantView } from "@/components/assistant/AssistantView";
import { FreePostAIChat } from "@/components/overview/FreePostAI";
import { loadPostaiDock, markPostaiIntroSeen, type PostaiDockData } from "@/app/actions/postaiDock";
import { POSTAI_ASK_QUESTIONS, isPostaiAskId } from "@/lib/postaiAsk";
import {
  POSTAI_FULL_STORAGE_KEY,
  POSTAI_INTRO_STORAGE_KEY,
  POSTAI_OPEN_EVENT,
  POSTAI_PANEL_WIDTH,
  postaiPageFromPath,
  postaiPanelNarrowsPage,
  shouldShowPostaiIntro,
  type PostaiPage,
} from "@/lib/postaiDock";
import { t, useLocale } from "@/lib/i18n";

/** Desktop = the app's own `nav` breakpoint (tailwind.config). */
const DESKTOP_QUERY = "(min-width: 860px)";

function introSeenOnDevice(): boolean {
  try {
    return window.localStorage.getItem(POSTAI_INTRO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function PostAIDock({
  businessId,
  businessName,
  questions,
  introSeen,
}: {
  businessId: string;
  businessName: string | null;
  /** Each page's three starter questions (lib/postaiDock.ts, plan-aware). */
  questions: Record<PostaiPage, string[]>;
  /** The account already dismissed the intro (user_metadata). */
  introSeen: boolean;
}) {
  const locale = useLocale();
  const pathname = usePathname() ?? "";
  const page = postaiPageFromPath(pathname, businessId);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PostaiDockData | null>(null);
  const [draft, setDraft] = useState<{ text: string; n: number } | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  // Desktop only: the panel covers the dashboard content (the sidebar
  // stays). Remembered for this browser session.
  const [full, setFull] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const loading = useRef(false);

  // After mount only: the server render never guesses the device.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    setShowIntro(shouldShowPostaiIntro(introSeen, introSeenOnDevice()));
  }, [introSeen]);
  useEffect(() => {
    try {
      setFull(window.sessionStorage.getItem(POSTAI_FULL_STORAGE_KEY) === "1");
    } catch {
      // No storage: the side panel.
    }
  }, []);
  const toggleFull = useCallback(() => {
    setFull((f) => {
      try {
        window.sessionStorage.setItem(POSTAI_FULL_STORAGE_KEY, f ? "0" : "1");
      } catch {
        // Not remembered — still switches.
      }
      return !f;
    });
  }, []);
  const expanded = desktop && full;

  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    try {
      window.localStorage.setItem(POSTAI_INTRO_STORAGE_KEY, "1");
    } catch {
      // Private mode: the account flag still remembers it.
    }
    void markPostaiIntroSeen();
  }, []);

  const openPanel = useCallback(
    (text?: string) => {
      if (text) setDraft((d) => ({ text, n: (d?.n ?? 0) + 1 }));
      setOpen(true);
      dismissIntro();
    },
    [dismissIntro]
  );

  const close = useCallback(() => {
    setOpen(false);
    setDraft(null);
    // Back to the button that opened it.
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  // Load once, on first open.
  useEffect(() => {
    if (!open || data || loading.current) return;
    loading.current = true;
    void loadPostaiDock(businessId).then((d) => {
      setData(d);
      loading.current = false;
    });
  }, [open, data, businessId]);

  // Any page can open it (the Free Overview card, designers' links).
  useEffect(() => {
    const onOpen = (e: Event) => openPanel((e as CustomEvent<{ draft?: string }>).detail?.draft);
    window.addEventListener(POSTAI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(POSTAI_OPEN_EVENT, onOpen);
  }, [openPanel]);

  // "Confused? Ask PostAI →": ?ask=<allowlisted id> opens it with that
  // question typed in, then leaves the address.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ask = url.searchParams.get("ask");
      if (!isPostaiAskId(ask)) return;
      openPanel(t(locale, POSTAI_ASK_QUESTIONS[ask]));
      url.searchParams.delete("ask");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch {
      // No URL access: nothing to open.
    }
  }, [pathname, locale, openPanel]);

  // Esc closes; focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // The desktop side panel narrows the page only when the page's own
  // content would still be at least ~1000px wide (measured, on open, on
  // resize and on each page) — otherwise it lies over the page, so the
  // score card never squeezes. Full screen and the phone sheet cover the
  // page, which stops scrolling behind them.
  const visible = open && page !== null;
  useEffect(() => {
    if (!visible) return;
    if (desktop && !expanded) {
      const sync = () => {
        const main = document.querySelector("main");
        if (!main) return;
        const style = window.getComputedStyle(main);
        const narrowed = document.body.dataset.postaiPanel === "open";
        const width = main.getBoundingClientRect().width + (narrowed ? POSTAI_PANEL_WIDTH : 0);
        const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        if (postaiPanelNarrowsPage(width, paddingX)) document.body.dataset.postaiPanel = "open";
        else delete document.body.dataset.postaiPanel;
      };
      sync();
      window.addEventListener("resize", sync);
      return () => {
        window.removeEventListener("resize", sync);
        delete document.body.dataset.postaiPanel;
      };
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
    // `pathname`: a new page has its own main area to measure.
  }, [visible, desktop, expanded, pathname]);

  if (page === null) return null;
  const starters = questions[page === "other" ? "overview" : page];
  const label = t(locale, "dashboard.postaiDock.button");

  return (
    <>
      {!open && (
        // Bottom-right, clear of the dev plan pill (bottom-left) and the
        // toasts (bottom-center) — raised above them on phones.
        <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6" data-testid="postai-dock">
          {showIntro && <PostAIIntro onDismiss={dismissIntro} />}
          <button
            ref={buttonRef}
            type="button"
            onClick={() => openPanel()}
            aria-label={label}
            aria-haspopup="dialog"
            data-testid="postai-button"
            className="flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-ink text-white shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass motion-reduce:transition-none sm:h-11 sm:w-auto sm:px-4"
          >
            <IconSparkles size={19} aria-hidden className="text-brass" />
            <span className="hidden text-[13.5px] font-semibold sm:inline">{label}</span>
          </button>
        </div>
      )}

      {visible && (
        <div
          role="dialog"
          aria-modal={!desktop}
          aria-label={t(locale, "dashboard.postaiDock.panelTitle")}
          data-testid="postai-panel"
          data-expanded={expanded || undefined}
          className={
            expanded
              ? "fixed inset-0 z-[55] flex flex-col overscroll-contain bg-paper nav:inset-y-0 nav:left-[250px] nav:right-0 nav:z-30"
              : "fixed inset-0 z-[55] flex flex-col overscroll-contain bg-paper nav:inset-y-0 nav:left-auto nav:right-0 nav:z-30 nav:w-[400px] nav:border-l nav:border-paper-deep nav:shadow-[-12px_0_32px_-20px_rgba(20,33,61,0.35)]"
          }
        >
          {/* The one header: PostAI · Beta, then full screen and close. */}
          <div className="flex shrink-0 items-center gap-2 border-b border-paper-line bg-white px-4 py-3">
            <IconSparkles size={16} aria-hidden className="shrink-0 text-brass" />
            <span className="text-[14px] font-semibold text-ink">{t(locale, "dashboard.postaiDock.panelTitle")}</span>
            <Pill variant="brass">{t(locale, "dashboard.overview.betaLabel")}</Pill>
            <span className="flex-1" />
            {/* Phones are already full screen. */}
            <button
              type="button"
              onClick={toggleFull}
              aria-label={t(locale, full ? "dashboard.postaiDock.collapse" : "dashboard.postaiDock.expand")}
              title={t(locale, full ? "dashboard.postaiDock.collapse" : "dashboard.postaiDock.expand")}
              aria-pressed={full}
              data-testid="postai-expand"
              className="hidden rounded-lg p-1.5 text-ink-mute transition-colors hover:bg-paper-deep hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass nav:inline-flex"
            >
              {full ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={t(locale, "dashboard.postaiDock.close")}
              data-testid="postai-close"
              className="rounded-lg p-1.5 text-ink-mute transition-colors hover:bg-paper-deep hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
            >
              <IconX size={20} />
            </button>
          </div>
          <div className={expanded ? "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col" : "flex min-h-0 flex-1 flex-col"}>
            <PostAIPanelBody
              businessId={businessId}
              businessName={businessName}
              data={data}
              starters={starters}
              draft={draft}
              // A link in a reply: the sheet covers the page on phones, so it
              // closes; the desktop panel stays beside the new page.
              onNavigate={desktop ? undefined : close}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** The one-time intro bubble above the button. */
export function PostAIIntro({ onDismiss }: { onDismiss: () => void }) {
  const locale = useLocale();
  return (
    <div role="dialog" aria-label={t(locale, "dashboard.postaiDock.button")} data-testid="postai-intro" className="w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-paper-deep bg-white p-3.5 text-[13px] leading-snug text-ink shadow-card">
      <p>{t(locale, "dashboard.postaiDock.intro")}</p>
      <button type="button" onClick={onDismiss} data-testid="postai-intro-ok" className="mt-2.5 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink/90">
        {t(locale, "dashboard.postaiDock.gotIt")}
      </button>
    </div>
  );
}

/** What's inside the panel, by plan. Exported for tests. */
export function PostAIPanelBody({
  businessId,
  businessName,
  data,
  starters,
  draft,
  onNavigate,
}: {
  businessId: string;
  businessName: string | null;
  data: PostaiDockData | null;
  starters: string[];
  draft: { text: string; n: number } | null;
  onNavigate?: () => void;
}) {
  const locale = useLocale();
  if (data === null) {
    return (
      <p role="status" className="p-4 py-10 text-center text-[13px] text-ink-mute">
        {t(locale, "dashboard.postaiDock.loading")}
      </p>
    );
  }
  if (data.status !== "ok") {
    return <p className="p-4 text-[13px] text-ink-soft">{t(locale, "dashboard.assistant.couldNotReachFallback")}</p>;
  }
  return (
    <>
      <p data-testid="postai-grounding" className="shrink-0 px-4 pt-3 text-[12px] text-ink-mute">
        {t(locale, "dashboard.postaiDock.grounding")}
      </p>
      <div className="flex min-h-0 flex-1 flex-col">
        <PostAIChat businessId={businessId} businessName={businessName} data={data} starters={starters} draft={draft} onNavigate={onNavigate} />
      </div>
    </>
  );
}

function PostAIChat({
  businessId,
  businessName,
  data,
  starters,
  draft,
  onNavigate,
}: {
  businessId: string;
  businessName: string | null;
  data: Extract<PostaiDockData, { status: "ok" }>;
  starters: string[];
  draft: { text: string; n: number } | null;
  onNavigate?: () => void;
}) {
  if (data.kind === "free") {
    // A new question from the page re-opens the box with it typed in.
    return <FreePostAIChat key={draft?.n ?? 0} businessId={businessId} starterPrompts={starters} initial={data.allowance} initialDraft={draft?.text} />;
  }
  return (
    <AssistantView
      key={draft?.n ?? 0}
      businessId={businessId}
      businessName={businessName}
      context={data.context}
      starterPrompts={starters}
      initialDraft={draft?.text}
      onNavigate={onNavigate}
      monthly={data.monthly}
    />
  );
}
