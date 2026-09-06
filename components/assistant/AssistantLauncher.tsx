"use client";

// The Overview page's footprint for the assistant: a small, always-visible
// entry point (see AssistantEntryPoint below) rather than the full chat
// taking up a large block of the page. Clicking it opens the exact same
// AssistantView — unmodified, same component the assistant always used —
// inside AssistantOverlay, so the "what I know about your business" memory
// panel, cost-controlled Haiku, and every honesty guardrail keep working
// exactly as before; only where the chat physically lives on the page has
// changed. AssistantView always starts from a blank, fresh conversation —
// see its own doc comment — so this only ever needs a COUNT of past
// conversations for the entry point's subtitle, never their content.

import { useState } from "react";
import { IconChevronRight, IconSparkles } from "@tabler/icons-react";
import { Pill } from "@/components/ui/Pill";
import { AssistantView } from "@/components/assistant/AssistantView";
import { AssistantOverlay } from "@/components/assistant/AssistantOverlay";
import type { AssistantBusinessContext } from "@/lib/assistant";

/**
 * Deliberately reads as an AI presence coach at a glance — a gradient
 * "AI" badge, an inviting headline distinct from generic chat copy, and
 * button-like hover/press states — rather than a plain settings-style
 * row, so a busy owner recognizes this as something worth clicking
 * before they've opened it.
 */
function AssistantEntryPoint({
  conversationCount,
  starterPrompts,
  onOpen,
}: {
  conversationCount: number;
  starterPrompts: string[];
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-paper-deep bg-white p-4 shadow-card">
      <button
        type="button"
        onClick={onOpen}
        className="group -m-1.5 flex items-center gap-3.5 rounded-lg p-1.5 text-left transition-colors hover:bg-paper"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brass to-[#a5772a] text-white shadow-card">
          <IconSparkles size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">Ask PostScore AI</span>
            <Pill variant="brass">Beta</Pill>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-soft">
            Ask anything about your score, competitors, or what to fix next.
            {conversationCount > 0 &&
              ` ${conversationCount} past conversation${conversationCount === 1 ? "" : "s"} saved.`}
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-mute transition-colors group-hover:bg-brass/10 group-hover:text-brass">
          <IconChevronRight size={16} />
        </span>
      </button>

      <div className="flex flex-wrap gap-2 pl-[58px]">
        {starterPrompts.slice(0, 3).map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={onOpen}
            className="rounded-full border border-paper-deep bg-paper px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-brass hover:text-ink"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AssistantLauncher({
  businessId,
  businessName,
  context,
  starterPrompts,
  conversationCount,
}: {
  businessId: string;
  businessName: string | null;
  context: AssistantBusinessContext;
  starterPrompts: string[];
  conversationCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AssistantEntryPoint
        conversationCount={conversationCount}
        starterPrompts={starterPrompts}
        onOpen={() => setOpen(true)}
      />

      <AssistantOverlay open={open} onClose={() => setOpen(false)} title="PostScore Assistant">
        <AssistantView
          businessId={businessId}
          businessName={businessName}
          context={context}
          starterPrompts={starterPrompts}
        />
      </AssistantOverlay>
    </>
  );
}
