"use client";

// One numbered section card in the starter-site designer ("1 · Language").
// The whole header row opens and closes it (a real button with
// aria-expanded); open/closed is remembered per device. The server and the
// first render use the default, so there's no hydration mismatch.
// Collapsed content stays in the page, hidden.

import { useEffect, useId, useState, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { readRememberedOpen, rememberOpen } from "@/lib/rememberedToggle";

/** The shared look of the designer's controls. */
export const DESIGNER_LABEL = "block text-[13px] font-semibold text-ink";
export const DESIGNER_HELP = "text-[12px] leading-snug text-ink-mute";
export const DESIGNER_INPUT = "h-10 w-full rounded-lg border border-paper-deep bg-white px-3 text-sm text-ink outline-none focus:border-ink-soft";
export const DESIGNER_COLOR_INPUT = "h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-paper-deep bg-white p-1";
/** Every choice chip (language, fonts, sizes, accents…): one size. */
export const designerChip = (selected: boolean) =>
  cn(
    "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-left text-[12.5px] font-medium leading-tight transition-colors",
    selected ? "border-brass bg-brass/10 text-brass" : "border-paper-deep bg-white text-ink-soft hover:border-ink-soft hover:text-ink"
  );

export const designerSectionKey = (id: string) => `postscore.starterDesigner.${id}.open`;

export function DesignerSection({
  id,
  number,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  number: number;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  useEffect(() => {
    setOpen(readRememberedOpen(designerSectionKey(id), defaultOpen));
  }, [id, defaultOpen]);
  function toggle() {
    const next = !open;
    setOpen(next);
    rememberOpen(designerSectionKey(id), next);
  }

  return (
    <section className="rounded-xl border border-paper-deep bg-white shadow-card" data-testid={`designer-section-${id}`} data-open={open ? "true" : "false"}>
      <h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          data-testid={`designer-toggle-${id}`}
          className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-[12px] font-semibold text-ink-soft">
            {number}
          </span>
          <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">{title}</span>
          <IconChevronDown size={18} aria-hidden className={cn("shrink-0 text-ink-soft transition-transform", open && "rotate-180")} />
        </button>
      </h3>
      <div id={contentId} hidden={!open} data-testid={`designer-content-${id}`} className={cn("flex-col gap-3 border-t border-paper-line px-4 pb-4 pt-3", open && "flex")}>
        {children}
      </div>
    </section>
  );
}
