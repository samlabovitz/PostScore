"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconArrowLeft,
  IconInfoCircle,
  IconLoader2,
  IconMessageChatbot,
  IconSend2,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { cn } from "@/lib/utils";
import {
  clearAssistantConversation,
  sendAssistantMessage,
  type AssistantMessageRow,
} from "@/app/actions/assistant";
import type { AssistantBusinessContext } from "@/lib/assistant";

const GENERAL_GUIDANCE_PREFIX = "general guidance:";

/**
 * Splits one assistant reply into paragraphs, pulling out any paragraph
 * the model has labeled "General guidance:" (see ASSISTANT_SYSTEM_RULES
 * in lib/assistant.ts) so it can render visibly distinct from the
 * data-grounded parts of the answer — the same labeling discipline the
 * Pricing page's "general estimate" badge uses, just for free-form text
 * instead of a fixed field.
 */
function splitAssistantContent(content: string): Array<{ general: boolean; text: string }> {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((paragraph) => {
      const lower = paragraph.toLowerCase();
      if (lower.startsWith(GENERAL_GUIDANCE_PREFIX)) {
        return { general: true, text: paragraph.slice(GENERAL_GUIDANCE_PREFIX.length).trim() };
      }
      return { general: false, text: paragraph };
    });
}

function AssistantMessageContent({ content }: { content: string }) {
  const parts = splitAssistantContent(content);
  return (
    <div className="flex flex-col gap-2.5">
      {parts.map((part, i) =>
        part.general ? (
          <div key={i} className="rounded-lg bg-ink/5 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-mute">
              <IconInfoCircle size={12} />
              General guidance
            </div>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">{part.text}</p>
          </div>
        ) : (
          <p key={i} className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
            {part.text}
          </p>
        )
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: AssistantMessageRow }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-4 py-3 sm:max-w-[75%]",
          isUser ? "bg-ink text-white" : "border border-paper-deep bg-white"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{message.content}</p>
        ) : (
          <AssistantMessageContent content={message.content} />
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-xl border border-paper-deep bg-white px-4 py-3 text-ink-mute">
        <IconLoader2 size={15} className="animate-spin" />
        <span className="text-[12.5px]">Thinking…</span>
      </div>
    </div>
  );
}

function EmptyState({
  businessName,
  starterPrompts,
  onPick,
}: {
  businessName: string | null;
  starterPrompts: string[];
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brass/10 text-brass">
        <IconMessageChatbot size={20} />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">Ask anything about {businessName ?? "your business"}&apos;s presence</p>
        <p className="mt-1 max-w-[42ch] text-[13px] text-ink-soft">
          Answers are grounded in your real PostScore data. General strategy tips are always labeled
          separately.
        </p>
      </div>
      <div className="flex max-w-xl flex-wrap justify-center gap-2">
        {starterPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="rounded-full border border-paper-deep bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-brass hover:text-ink"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AssistantView({
  businessId,
  businessName,
  context,
  starterPrompts,
  initialMessages,
}: {
  businessId: string;
  businessName: string | null;
  context: AssistantBusinessContext;
  starterPrompts: string[];
  initialMessages: AssistantMessageRow[];
}) {
  const [messages, setMessages] = useState<AssistantMessageRow[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    setDraft("");
    setSending(true);

    // Optimistic local echo — replaced by the real saved row once the
    // server responds, so a fast optimistic id never lingers as truth.
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", content: trimmed, created_at: new Date().toISOString() },
    ]);

    const result = await sendAssistantMessage(businessId, trimmed);
    setSending(false);

    if (result.status === "ok") {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        result.userMessage,
        result.reply,
      ]);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError(
        result.status === "error" ? result.message : "Couldn't reach the assistant — try again."
      );
      setDraft(trimmed);
    }
  }

  async function handleClear() {
    setClearing(true);
    const result = await clearAssistantConversation(businessId);
    setClearing(false);
    if (result.status === "ok") {
      setMessages([]);
      setError(null);
    } else {
      setError(result.status === "error" ? result.message : "Couldn't clear the conversation.");
    }
  }

  return (
    <div className="flex flex-col gap-8 nav:gap-10">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          Back to {businessName ?? "business"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            Ask about your presence
          </h1>
          <Pill variant="brass">Beta</Pill>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
          Ask questions about your real PostScore, score breakdown, action plan, and competitors —
          or ask for general local-marketing advice, clearly labeled as general.
        </p>
      </div>

      <Card className="flex items-start gap-3 p-4">
        <GradeBadge grade={context.score.grade} className="shrink-0" />
        <p className="text-[13px] text-ink-soft">
          Grounded in your real PostScore ({context.score.total}/100), score breakdown, action plan,
          and (when saved) your competitor scan. General strategy tips are always labeled{" "}
          <span className="font-medium text-ink">General guidance</span> — never presented as
          something found in your data. This assistant can&apos;t fabricate facts it wasn&apos;t
          given: it will say plainly when it doesn&apos;t have something (e.g. individual reviews or a
          Google search rank).
        </p>
      </Card>

      <Card className="flex flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-paper-line px-5 py-3">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-mute">
            <IconSparkles size={14} className="text-brass" />
            Conversation is saved to this business
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-mute hover:bg-red/10 hover:text-red disabled:opacity-50"
            >
              <IconTrash size={13} />
              Clear conversation
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex max-h-[520px] min-h-[320px] flex-col gap-3 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <EmptyState businessName={businessName} starterPrompts={starterPrompts} onPick={send} />
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {sending && <TypingIndicator />}
            </>
          )}
        </div>

        <div className="border-t border-paper-line p-4">
          {messages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {starterPrompts.slice(0, 3).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  disabled={sending}
                  className="rounded-full border border-paper-deep bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-brass hover:text-ink disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          {error && <p className="mb-2 text-[12px] text-red">{error}</p>}
          <form
            className="flex items-end gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Ask about your score, action plan, competitors, or general marketing advice…"
              rows={2}
              disabled={sending}
              className="min-w-0 flex-1 resize-none rounded-lg border border-paper-deep bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-ink-soft disabled:opacity-60"
            />
            <Button type="submit" variant="brass" disabled={sending || !draft.trim()} className="shrink-0">
              {sending ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend2 size={16} />}
              Send
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
