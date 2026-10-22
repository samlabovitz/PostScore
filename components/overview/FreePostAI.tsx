"use client";

// Free PostAI — a real tool on Free: 3 questions a week, counted on the
// server before any AI call (app/actions/assistant.ts,
// lib/freeAiUsage.server.ts), answered from the business's own data and
// never with the paid step-by-step fix advice. Its own file so pages and
// tests that only need the other Free cards don't load the AI action.

import { useState } from "react";
import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";
import { sendAssistantMessage } from "@/app/actions/assistant";
import { AssistantMessageContent } from "@/components/assistant/AssistantMessageContent";
import { FREE_AI_WEEKLY, type FreeAiAllowance } from "@/lib/freeAiAllowance";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";

/** Free PostAI — a real tool: 3 questions a week (counted on the server
 * before any AI call — app/actions/assistant.ts), answered from the
 * business's own data, never with the paid step-by-step fix advice. */
export function FreePostAI({ businessId, starterPrompts, initial }: { businessId: string; starterPrompts: string[]; initial: FreeAiAllowance }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Array<{ id: string; question: string; answer: string }>>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(initial.status === "unavailable" ? null : initial.left);
  const [resetsAt, setResetsAt] = useState<string | null>(initial.status === "unavailable" ? null : initial.resetsAt);
  const [pausedUntil, setPausedUntil] = useState<string | null>(initial.status === "paused" ? initial.until : null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string | null) => (iso ? formatShortDate(iso, locale, timeZone) : "");
  const usedUp = left !== null && left <= 0;
  const blocked = initial.status === "unavailable" || usedUp || pausedUntil !== null;

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
        if (result.free) {
          setLeft(result.free.left);
          setResetsAt(result.free.resetsAt);
        }
      } else if (result.status === "limit") {
        setLeft(0);
        setResetsAt(result.resetsAt);
      } else if (result.status === "paused") setPausedUntil(result.until);
      else setError(result.status === "error" ? result.message : t(locale, "dashboard.assistant.couldNotReachFallback"));
    } catch {
      setError(t(locale, "dashboard.assistant.couldNotReachFallback"));
    } finally {
      setSending(false);
    }
  }

  const plansLink = (
    <Link href={`/business/${businessId}/settings#compare-plans`} className="font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
      {t(locale, "dashboard.upgrade.box.seePlans")}
    </Link>
  );

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

      {left !== null && resetsAt && (
        <p data-testid="postai-left" className="w-fit rounded-full border border-paper-deep bg-paper px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft">
          {t(locale, "dashboard.free.postai.left", { left, total: FREE_AI_WEEKLY, date: date(resetsAt) })}
        </p>
      )}

      {answers.map((a) => (
        <div key={a.id} className="flex flex-col gap-2 rounded-xl bg-paper p-3" data-testid="postai-answer">
          <div className="self-end rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[13px] text-white">{a.question}</div>
          <div className="self-start rounded-2xl rounded-bl-md border border-paper-deep bg-white px-3 py-2 text-[13px] text-ink">
            <AssistantMessageContent content={a.answer} />
          </div>
        </div>
      ))}

      {pausedUntil ? (
        <p data-testid="postai-paused" className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-amber)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_8%,white)] p-3 text-[13px] text-ink">
          {t(locale, "dashboard.free.ai.paused", { date: date(pausedUntil) })} {plansLink}
        </p>
      ) : usedUp ? (
        <p data-testid="postai-used-up" className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)] p-3 text-[13px] text-ink">
          {t(locale, "dashboard.free.postai.usedUp", { date: date(resetsAt) })} {plansLink}
        </p>
      ) : initial.status === "unavailable" ? (
        <p data-testid="postai-unavailable" className="text-[13px] text-ink-soft">{t(locale, "dashboard.assistant.couldNotReachFallback")}</p>
      ) : (
        <>
          {answers.length === 0 && starterPrompts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {starterPrompts.slice(0, 3).map((prompt) => (
                <button key={prompt} type="button" onClick={() => setQuestion(prompt)} className="rounded-full border border-paper-deep bg-paper px-3 py-1 text-left text-[12.5px] text-ink hover:border-ink-soft">
                  {prompt}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder={t(locale, "dashboard.free.postaiPlaceholder")}
              aria-label={t(locale, "dashboard.free.postaiPlaceholder")}
              data-testid="postai-question"
              className="h-10 min-w-0 flex-1 rounded-lg border border-paper-deep bg-white px-3 text-[13px] text-ink outline-none focus:border-ink-soft"
            />
            <button type="submit" disabled={sending || !question.trim()} data-testid="postai-ask" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-semibold text-white disabled:opacity-50">
              {sending ? t(locale, "dashboard.free.postai.thinking") : t(locale, "dashboard.free.postaiSend")}
            </button>
          </form>
          {error && (
            <p role="alert" className="text-[12.5px] text-red">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
