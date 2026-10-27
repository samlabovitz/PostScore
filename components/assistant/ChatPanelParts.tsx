"use client";

// Shared by both chats in the "Ask PostAI" panel (AssistantView on paid
// plans, FreePostAIChat on Free): the one scrolling conversation, its
// auto-scroll, and the question box that grows from one line to four.

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconArrowDown } from "@tabler/icons-react";
import { isNearBottom, postaiInputHeight } from "@/lib/postaiDock";
import { t, useLocale } from "@/lib/i18n";

/**
 * Follow the newest message — on open and whenever something new arrives —
 * unless the owner has scrolled up to read; then `hasNew` is true and the
 * "↓ New message" button shows instead of jumping. `contentKey` changes
 * whenever messages arrive (a count, an id).
 */
export function useChatScroll(contentKey: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [hasNew, setHasNew] = useState(false);

  const toBottom = useCallback((smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    following.current = true;
    setHasNew(false);
  }, []);

  useEffect(() => {
    if (following.current) toBottom(false);
    else setHasNew(true);
  }, [contentKey, toBottom]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    following.current = isNearBottom(el);
    if (following.current) setHasNew(false);
  }, []);

  return { ref, onScroll, hasNew, jumpToNewest: () => toBottom(true) };
}

/** The panel's one scroll area: the suggested questions and the
 * conversation. Its scrolling never reaches the page behind it. */
export const ChatScroll = forwardRef<
  HTMLDivElement,
  { onScroll: () => void; hasNew: boolean; onJump: () => void; children: ReactNode }
>(function ChatScroll({ onScroll, hasNew, onJump, children }, ref) {
  const locale = useLocale();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={onScroll}
        data-testid="postai-scroll"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
      >
        {children}
      </div>
      {hasNew && (
        <button
          type="button"
          onClick={onJump}
          data-testid="postai-new-message"
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg hover:bg-ink/90"
        >
          <IconArrowDown size={13} aria-hidden />
          {t(locale, "dashboard.postaiDock.newMessage")}
        </button>
      )}
    </div>
  );
});

/** The question box: one line, growing to four, then scrolling inside
 * itself. Enter sends; Shift+Enter is a new line. */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  maxLength,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  /** Free's questions are capped at 500 characters. */
  maxLength?: number;
  testId?: string;
}) {
  const locale = useLocale();
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const { height, scrolls } = postaiInputHeight(el.scrollHeight);
    el.style.height = `${height}px`;
    el.style.overflowY = scrolls ? "auto" : "hidden";
  }, [value]);
  const placeholder = t(locale, "dashboard.postaiDock.placeholder");
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
      rows={1}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={placeholder}
      disabled={disabled}
      data-testid={testId}
      className="block h-10 min-w-0 flex-1 resize-none overflow-y-hidden overscroll-contain rounded-lg border border-paper-deep bg-white px-3 py-2.5 text-sm leading-5 text-ink outline-none focus:border-ink-soft disabled:opacity-60"
    />
  );
}
