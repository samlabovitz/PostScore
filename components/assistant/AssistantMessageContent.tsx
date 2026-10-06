"use client";

// Split out from AssistantView.tsx so this pure parsing/rendering logic
// can be unit-tested without pulling in AssistantView's "use server"
// action imports (app/actions/assistant.ts) — those transitively import
// server-only modules that throw if evaluated outside Next's server
// build graph, which a plain Vitest render would otherwise hit.

import { IconInfoCircle } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";

// ASSISTANT_SYSTEM_RULES rule 2 (lib/assistant.ts) instructs the model
// to emit a literal control-token marker verbatim at the start of any
// general-guidance paragraph — English "General guidance:" for an
// English answer, but exactly "Consejo general:" for a Spanish one
// (see buildAssistantLanguageDirective's own es-specific override) —
// never a translation/paraphrase of whichever one applies. Both are
// recognized here, case-insensitively — this never needs to know which
// locale the content itself is in, only to recognize either literal
// token. The VISIBLE heading rendered below the parsed marker is a
// separate, always-translated label (see
// dashboard.assistant.generalGuidanceLabel — "Orientación general" in
// es) — independent of which raw marker was actually stripped.
const GENERAL_GUIDANCE_PREFIXES = ["general guidance:", "consejo general:"];

/**
 * Splits one assistant reply into paragraphs, pulling out any paragraph
 * the model has labeled with the real general-guidance marker for
 * whichever language it answered in (see GENERAL_GUIDANCE_PREFIXES
 * above) so it can render visibly distinct from the data-grounded parts
 * of the answer — the same labeling discipline the Pricing page's
 * "general estimate" badge uses, just for free-form text instead of a
 * fixed field. `text` after stripping the marker can be in any
 * language.
 */
export function splitAssistantContent(content: string): Array<{ general: boolean; text: string }> {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((paragraph) => {
      const lower = paragraph.toLowerCase();
      const prefix = GENERAL_GUIDANCE_PREFIXES.find((p) => lower.startsWith(p));
      if (prefix) {
        return { general: true, text: paragraph.slice(prefix.length).trim() };
      }
      return { general: false, text: paragraph };
    });
}

/**
 * Splits one paragraph's real text into plain/bold runs wherever the
 * model used `**markdown bold**` — the model is never instructed to
 * produce markdown, but it does anyway (e.g. bolding a page name), and
 * until now nothing here ever parsed it: this component rendered the
 * raw string as-is, literal asterisks included, since there was no
 * bold-rendering logic at all. Non-greedy (`.+?`) so two separate bold
 * spans in one paragraph don't collapse into one; the `s` flag lets a
 * bold span cross a soft line break within the same paragraph (a
 * paragraph can itself contain real newlines — see the whitespace-pre-
 * wrap rendering below). A genuinely unmatched `**` (no real closing
 * pair) is left as literal text rather than guessed at.
 *
 * Uses `[^]+?` rather than `.+?` with the `s` (dotAll) flag — this
 * project's configured TS target doesn't support that flag, and `[^]`
 * (an empty negated character class, matching literally any character)
 * is a long-standing, widely-supported way to get the same
 * "dot matches newlines too" behavior without it.
 */
export function parseInlineBold(text: string): Array<{ bold: boolean; text: string }> {
  const parts: Array<{ bold: boolean; text: string }> = [];
  const pattern = /\*\*([^]+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ bold: false, text: text.slice(lastIndex, match.index) });
    }
    parts.push({ bold: true, text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ bold: false, text: text.slice(lastIndex) });
  }
  return parts;
}

/** Renders one paragraph's real text with any `**bold**` spans as real
 * `<strong>` elements (see parseInlineBold above) — shared by both the
 * normal and general-guidance paragraph styles below so bold renders
 * identically in either. */
function FormattedText({ text }: { text: string }) {
  return (
    <>
      {parseInlineBold(text).map((run, i) =>
        run.bold ? <strong key={i}>{run.text}</strong> : <span key={i}>{run.text}</span>
      )}
    </>
  );
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
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">
              <FormattedText text={part.text} />
            </p>
          </div>
        ) : (
          <p key={i} className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
            <FormattedText text={part.text} />
          </p>
        )
      )}
    </div>
  );
}
