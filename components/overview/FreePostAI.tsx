"use client";

// Free PostAI — a real tool on Free: 3 questions a week, counted on the
// server before any AI call (app/actions/assistant.ts,
// lib/freeAiUsage.server.ts), answered from the business's own data and
// never with the paid step-by-step fix advice. Its own file so pages and
// tests that only need the other Free cards don't load the AI action.
//
// The chat itself (FreePostAIChat) lives in the "Ask PostAI" panel on
// every page (components/assistant/PostAIDock.tsx); the Free Overview card
// shows the allowance and opens that same panel.

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";
import { sendAssistantMessage } from "@/app/actions/assistant";
import { AssistantMessageContent } from "@/components/assistant/AssistantMessageContent";
import { ChatInput, ChatScroll, useChatScroll } from "@/components/assistant/ChatPanelParts";
import { FREE_AI_WEEKLY, type FreeAiAllowance } from "@/lib/freeAiAllowance";
import { openPostAI, POSTAI_FREE_LEFT_EVENT } from "@/lib/postaiDock";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";

interface AllowanceState {
  left: number | null;
  resetsAt: string | null;
  pausedUntil: string | null;
  unavailable: boolean;
}

function fromInitial(initial: FreeAiAllowance): AllowanceState {
  return {
    left: initial.status === "unavailable" ? null : initial.left,
    resetsAt: initial.status === "unavailable" ? null : initial.resetsAt,
    pausedUntil: initial.status === "paused" ? initial.until : null,
    unavailable: initial.status === "unavailable",
  };
}

/** The counter, and why no question can be asked right now (used up,
 * paused, unavailable) — the caller hides its question box then. */
function AllowanceNotice({ businessId, state }: { businessId: string; state: AllowanceState }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const date = (iso: string | null) => (iso ? formatShortDate(iso, locale, timeZone) : "");
  const plansLink = (
    <Link href={`/business/${businessId}/settings#compare-plans`} className="font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
      {t(locale, "dashboard.upgrade.box.seePlans")}
    </Link>
  );
  const usedUp = state.left !== null && state.left <= 0;
  return (
    <>
      {state.left !== null && state.resetsAt && (
        <p data-testid="postai-left" className="w-fit rounded-full border border-paper-deep bg-paper px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft">
          {t(locale, "dashboard.free.postai.left", { left: state.left, total: FREE_AI_WEEKLY, date: date(state.resetsAt) })}
        </p>
      )}
      {state.pausedUntil ? (
        <p data-testid="postai-paused" className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-amber)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_8%,white)] p-3 text-[13px] text-ink">
          {t(locale, "dashboard.free.ai.paused", { date: date(state.pausedUntil) })} {plansLink}
        </p>
      ) : usedUp ? (
        <p data-testid="postai-used-up" className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)] p-3 text-[13px] text-ink">
          {t(locale, "dashboard.free.postai.usedUp", { date: date(state.resetsAt) })} {plansLink}
        </p>
      ) : state.unavailable ? (
        <p data-testid="postai-unavailable" className="text-[13px] text-ink-soft">{t(locale, "dashboard.assistant.couldNotReachFallback")}</p>
      ) : null}
    </>
  );
}

const isBlocked = (s: AllowanceState) => s.unavailable || s.pausedUntil !== null || (s.left !== null && s.left <= 0);

/** Free's chat: the counter, the answers so far, and the question box. */
export function FreePostAIChat({
  businessId,
  starterPrompts,
  initial,
  initialDraft,
}: {
  businessId: string;
  starterPrompts: string[];
  initial: FreeAiAllowance;
  initialDraft?: string;
}) {
  const locale = useLocale();
  const [question, setQuestion] = useState(initialDraft ?? "");
  const [answers, setAnswers] = useState<Array<{ id: string; question: string; answer: string }>>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [state, setState] = useState<AllowanceState>(() => fromInitial(initial));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = isBlocked(state);
  // To the newest answer — unless the owner scrolled up to read.
  const chatScroll = useChatScroll(`${answers.length}:${sending}`);

  useEffect(() => {
    if (initialDraft) setQuestion(initialDraft);
  }, [initialDraft]);

  function update(next: AllowanceState) {
    setState(next);
    // The Overview card shows the same counter.
    window.dispatchEvent(new CustomEvent(POSTAI_FREE_LEFT_EVENT, { detail: next }));
  }

  async function ask() {
    const q = question.trim();
    if (!q || sending || blocked) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendAssistantMessage(businessId, q, conversationId);
      if (result.status === "ok") {
        setConversationId(result.conversationId);
        setAnswers((prev) => [...prev, { id: result.reply.id, question: q, answer: result.reply.content }]);
        setQuestion("");
        if (result.free) update({ ...state, left: result.free.left, resetsAt: result.free.resetsAt });
      } else if (result.status === "limit") update({ ...state, left: 0, resetsAt: result.resetsAt });
      else if (result.status === "paused") update({ ...state, pausedUntil: result.until });
      else setError(result.status === "error" ? result.message : t(locale, "dashboard.assistant.couldNotReachFallback"));
    } catch {
      setError(t(locale, "dashboard.assistant.couldNotReachFallback"));
    } finally {
      setSending(false);
    }
  }

  // Sized to the "Ask PostAI" panel: the counter, questions and answers
  // scroll; the question box stays pinned at the bottom.
  return (
    <div data-testid="free-postai-chat" className="flex h-full min-h-0 flex-col">
      <ChatScroll ref={chatScroll.ref} onScroll={chatScroll.onScroll} hasNew={chatScroll.hasNew} onJump={chatScroll.jumpToNewest}>
        <AllowanceNotice businessId={businessId} state={state} />

        {answers.map((a) => (
          <div key={a.id} className="flex flex-col gap-2" data-testid="postai-answer">
            <div className="self-end rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[13px] text-white">{a.question}</div>
            <div className="self-start rounded-2xl rounded-bl-md border border-paper-deep bg-white px-3 py-2 text-[13px] text-ink">
              <AssistantMessageContent content={a.answer} />
            </div>
          </div>
        ))}

        {!blocked && answers.length === 0 && starterPrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="postai-suggestions">
            {starterPrompts.slice(0, 3).map((prompt) => (
              <button key={prompt} type="button" onClick={() => setQuestion(prompt)} className="rounded-full border border-paper-deep bg-white px-3 py-1 text-left text-[12.5px] text-ink hover:border-ink-soft">
                {prompt}
              </button>
            ))}
          </div>
        )}
      </ChatScroll>

      {!blocked && (
        <div className="shrink-0 border-t border-paper-line bg-white p-4" data-testid="postai-input-bar">
          {error && (
            <p role="alert" className="mb-2 text-[12.5px] text-red">
              {error}
            </p>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <ChatInput value={question} onChange={setQuestion} onSubmit={() => void ask()} maxLength={500} testId="postai-question" />
            <button type="submit" disabled={sending || !question.trim()} data-testid="postai-ask" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-semibold text-white disabled:opacity-50">
              {sending ? t(locale, "dashboard.free.postai.thinking") : t(locale, "dashboard.free.postaiSend")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** The Free Overview's PostAI card ("Free tools you can use now"): the
 * week's allowance and a few questions — each opens the "Ask PostAI"
 * panel, where the chat lives. */
export function FreePostAI({ businessId, starterPrompts, initial }: { businessId: string; starterPrompts: string[]; initial: FreeAiAllowance }) {
  const locale = useLocale();
  const [state, setState] = useState<AllowanceState>(() => fromInitial(initial));

  // Questions asked in the panel update this counter too.
  useEffect(() => {
    const onLeft = (e: Event) => setState((e as CustomEvent<AllowanceState>).detail);
    window.addEventListener(POSTAI_FREE_LEFT_EVENT, onLeft);
    return () => window.removeEventListener(POSTAI_FREE_LEFT_EVENT, onLeft);
  }, []);

  return (
    <section data-testid="free-postai" className="flex flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <IconSparkles size={17} />
        </span>
        <div className="min-w-0">
          <h3 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.free.postaiTitle")}</h3>
          <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.free.postai.line")}</p>
        </div>
      </div>

      <AllowanceNotice businessId={businessId} state={state} />

      {!isBlocked(state) && (
        <>
          {starterPrompts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {starterPrompts.slice(0, 3).map((prompt) => (
                <button key={prompt} type="button" onClick={() => openPostAI(prompt)} className="rounded-full border border-paper-deep bg-paper px-3 py-1 text-left text-[12.5px] text-ink hover:border-ink-soft">
                  {prompt}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => openPostAI()}
            data-testid="free-postai-open"
            className="inline-flex h-10 w-fit items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-white hover:bg-ink/90"
          >
            <IconSparkles size={15} aria-hidden />
            {t(locale, "dashboard.postaiDock.button")}
          </button>
        </>
      )}
    </section>
  );
}
