"use client";

// Split out from AssistantView.tsx so this pure parsing/rendering logic
// can be unit-tested without pulling in AssistantView's "use server"
// action imports (app/actions/assistant.ts) — those transitively import
// server-only modules that throw if evaluated outside Next's server
// build graph, which a plain Vitest render would otherwise hit.

import { IconInfoCircle } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";

// Deliberately NEVER locale-dependent — ASSISTANT_SYSTEM_RULES rule 2
// (lib/assistant.ts) explicitly instructs the model to always emit this
// exact English marker verbatim as a literal control token, even when
// the rest of its answer is in Spanish (see the "respond in {language}"
// directive in app/actions/assistant.ts). Only the VISIBLE heading
// rendered below the parsed marker is translated (see
// dashboard.assistant.generalGuidanceLabel — "Orientación general" in
// es); the marker string itself must stay this one stable English token
// on both sides (model output + parser) or detection breaks.
const GENERAL_GUIDANCE_PREFIX = "general guidance:";

/**
 * Splits one assistant reply into paragraphs, pulling out any paragraph
 * the model has labeled "General guidance:" (see ASSISTANT_SYSTEM_RULES
 * in lib/assistant.ts) so it can render visibly distinct from the
 * data-grounded parts of the answer — the same labeling discipline the
 * Pricing page's "general estimate" badge uses, just for free-form text
 * instead of a fixed field. The marker itself is always English (see
 * GENERAL_GUIDANCE_PREFIX above) regardless of the reply's own language
 * — `text` after stripping it can be in any language.
 */
export function splitAssistantContent(content: string): Array<{ general: boolean; text: string }> {
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

export function AssistantMessageContent({ content }: { content: string }) {
  const locale = useLocale();
  const parts = splitAssistantContent(content);
  return (
    <div className="flex flex-col gap-2.5">
      {parts.map((part, i) =>
        part.general ? (
          <div key={i} className="rounded-lg bg-ink/5 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-mute">
              <IconInfoCircle size={12} />
              {t(locale, "dashboard.assistant.generalGuidanceLabel")}
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
