"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconHistory,
  IconInfoCircle,
  IconLoader2,
  IconMessageChatbot,
  IconMessages,
  IconPlus,
  IconSend2,
  IconSparkles,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/utils";
import {
  getConversationHistory,
  getConversationMessages,
  getCurrentConversation,
  sendAssistantMessage,
  type AssistantConversationSummary,
  type AssistantMessageRow,
} from "@/app/actions/assistant";
import type { AssistantBusinessContext } from "@/lib/assistant";
import { BusinessMemoryPanel } from "@/components/assistant/BusinessMemoryPanel";

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

function timeAgo(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function HistoryList({
  loading,
  error,
  conversations,
  onOpen,
}: {
  loading: boolean;
  error: string | null;
  conversations: AssistantConversationSummary[] | null;
  onOpen: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-10 text-ink-mute">
        <IconLoader2 size={18} className="animate-spin" />
      </div>
    );
  }
  if (error) {
    return <p className="p-5 text-[13px] text-red">{error}</p>;
  }
  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
        <IconMessages size={22} className="text-ink-mute" />
        <p className="text-[13px] text-ink-soft">No past conversations yet.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-paper-line">
      {conversations.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c.id)}
          className="flex flex-col gap-0.5 px-1 py-3 text-left transition-colors hover:bg-paper"
        >
          <span className="truncate text-[13px] font-medium text-ink">
            {c.preview || "New conversation"}
          </span>
          <span className="text-[11.5px] text-ink-mute">
            {timeAgo(c.startedAt)} · {c.messageCount} message{c.messageCount === 1 ? "" : "s"}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Which pane the chat card's body shows — "chat" is the live, editable
 * conversation (whichever one is current: resumed from last time, opened
 * from history, or freshly started); "history" lists past conversations
 * to resume. There's no read-only pane — opening a past conversation from
 * history makes it the live one, see resumeConversation. */
type Pane = { kind: "chat" } | { kind: "history" };

/**
 * "PostAI", the owner-facing assistant, opened from a compact entry
 * point on the Overview page (see AssistantLauncher) inside a modal
 * overlay (see AssistantOverlay). Opening it resumes whichever
 * conversation the owner was last actually active in (see
 * getCurrentConversation) rather than always starting blank — the owner
 * can keep typing into it exactly like they never left. Every message
 * sent belongs to a real `assistant_conversations` row, created lazily on
 * a genuinely new conversation's first message (see sendAssistantMessage).
 * Past conversations are never lost — every message is written to the
 * database as it's sent — and browsable from the History pane below;
 * opening one from there also makes it the live, resumed conversation
 * (see resumeConversation), not a read-only view. "New chat" (see
 * handleNewChat) is the one deliberate way to set the current
 * conversation aside and start a genuinely blank one — it never deletes
 * anything, so the conversation it leaves behind simply becomes ordinary
 * history.
 */
export function AssistantView({
  businessId,
  businessName,
  context,
  starterPrompts,
}: {
  businessId: string;
  businessName: string | null;
  context: AssistantBusinessContext;
  starterPrompts: string[];
}) {
  const [messages, setMessages] = useState<AssistantMessageRow[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [pane, setPane] = useState<Pane>({ kind: "chat" });
  const [history, setHistory] = useState<AssistantConversationSummary[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, resuming, pane]);

  // Resume the conversation the owner was last active in, once, on mount
  // — this component only mounts when the modal actually opens (see
  // AssistantOverlay), so this runs exactly once per open.
  useEffect(() => {
    let cancelled = false;
    async function loadCurrent() {
      const result = await getCurrentConversation(businessId);
      if (cancelled) return;
      if (result.status === "ok" && result.conversation) {
        setConversationId(result.conversation.id);
        setMessages(result.conversation.messages);
      }
      setResuming(false);
    }
    void loadCurrent();
    return () => {
      cancelled = true;
    };
    // businessId never changes for a mounted instance of this modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const trimmed = text.trim();
    // Guarding on `resuming` too avoids a race where a message sent
    // before the resumed conversation finishes loading would get
    // clobbered the instant that load resolves and overwrites local state.
    if (!trimmed || sending || resuming) return;

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

    const result = await sendAssistantMessage(businessId, trimmed, conversationId);
    setSending(false);

    if (result.status === "ok") {
      setConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        result.userMessage,
        result.reply,
      ]);
      // A new conversation now exists (or an existing one just grew) —
      // invalidate any cached history list so reopening it reflects it.
      setHistory(null);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError(
        result.status === "error" ? result.message : "Couldn't reach the assistant — try again."
      );
      setDraft(trimmed);
    }
  }

  /**
   * Sets the current conversation aside and starts a genuinely blank one
   * — a purely local reset, never a delete. The conversation left behind
   * keeps every message it already has and simply becomes ordinary
   * history (see the History pane); nothing is lost.
   */
  function handleNewChat() {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setPane({ kind: "chat" });
    // The just-set-aside conversation is no longer "current," so a
    // cached history list (which excludes whatever's current) would
    // wrongly still hide it — invalidate so reopening history shows it.
    setHistory(null);
  }

  async function openHistory() {
    setPane({ kind: "history" });
    if (history !== null) return;
    setHistoryLoading(true);
    setHistoryError(null);
    const result = await getConversationHistory(businessId);
    setHistoryLoading(false);
    if (result.status === "ok") {
      // The conversation in progress (if any) isn't "past" yet — it's
      // already saved as it's typed, so it would otherwise show up here
      // as a duplicate of the live chat.
      setHistory(result.conversations.filter((c) => c.id !== conversationId));
    } else {
      setHistoryError(
        result.status === "error" ? result.message : "Couldn't load past conversations."
      );
    }
  }

  /**
   * Opening a past conversation from history RESUMES it — it becomes the
   * live conversation, editable and appended to going forward, not a
   * read-only view of the past.
   */
  async function resumeConversation(id: string) {
    setError(null);
    const result = await getConversationMessages(businessId, id);
    if (result.status === "ok") {
      setConversationId(id);
      setMessages(result.messages);
      setPane({ kind: "chat" });
      // This conversation is now "current," so a cached history list
      // (fetched while a different one was current) would show it as
      // still-browsable past history — invalidate so it's excluded again.
      setHistory(null);
    } else {
      setHistoryError(result.status === "error" ? result.message : "Couldn't load this conversation.");
    }
  }

  const isChat = pane.kind === "chat";

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="PostAI" action={<Pill variant="brass">Beta</Pill>} />

      <Card className="flex items-center gap-3 p-4">
        <GradeBadge grade={context.score.grade} className="shrink-0" />
        <p className="text-[13px] text-ink-soft">
          Grounded in your real PostScore ({context.score.total}/100) — general tips are always
          labeled, nothing is fabricated.
        </p>
      </Card>

      <BusinessMemoryPanel businessId={businessId} profile={context.profile} />

      <Card className="flex flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-paper-line px-5 py-3">
          {isChat ? (
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-mute">
              <IconSparkles size={14} className="text-brass" />
              {conversationId ? "Continuing this conversation" : "New conversation — past chats are saved"}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPane({ kind: "chat" })}
              className="flex items-center gap-1.5 text-[12px] font-medium text-ink-mute hover:text-ink"
            >
              <IconArrowLeft size={14} />
              Back to chat
            </button>
          )}
          <div className="flex items-center gap-1">
            {isChat && (
              <button
                type="button"
                onClick={openHistory}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-mute hover:bg-paper-deep hover:text-ink"
              >
                <IconHistory size={13} />
                History
              </button>
            )}
            {isChat && messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-mute hover:bg-paper-deep hover:text-ink disabled:opacity-50"
              >
                <IconPlus size={13} />
                New chat
              </button>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex max-h-[520px] min-h-[320px] flex-col gap-3 overflow-y-auto p-5">
          {pane.kind === "history" ? (
            <HistoryList
              loading={historyLoading}
              error={historyError}
              conversations={history}
              onOpen={resumeConversation}
            />
          ) : resuming ? (
            <div className="flex flex-1 items-center justify-center text-ink-mute">
              <IconLoader2 size={18} className="animate-spin" />
            </div>
          ) : messages.length === 0 ? (
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

        {isChat && (
          <div className="border-t border-paper-line p-4">
            {messages.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {starterPrompts.slice(0, 3).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => send(prompt)}
                    disabled={sending || resuming}
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
                disabled={sending || resuming}
                className="min-w-0 flex-1 resize-none rounded-lg border border-paper-deep bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-ink-soft disabled:opacity-60"
              />
              <Button
                type="submit"
                variant="brass"
                disabled={sending || resuming || !draft.trim()}
                className="shrink-0"
              >
                {sending ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend2 size={16} />}
                Send
              </Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
