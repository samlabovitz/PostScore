"use client";

// A properly-contained, centered modal for the assistant — floats over
// the Overview page's own content with a full backdrop behind it, but
// deliberately stops short of the sidebar (desktop) and the mobile top
// bar, so the app's own navigation stays visible and usable while the
// assistant is open. Positioned with fixed insets that mirror
// DashboardShell's own layout (sidebar width 250px at the `nav:`
// breakpoint, the h-14 mobile top bar below it) rather than covering the
// whole viewport like components/ui/Modal.tsx does — this is the one
// place in the app an overlay needs to leave chrome uncovered, so it gets
// its own component rather than reusing Modal.
//
// The outer fixed frame never scrolls — the backdrop and the centered
// dialog are both sized directly off it, and only the dialog's own body
// scrolls internally (max-h-[85vh] clamps its height, same convention as
// Modal.tsx). That's deliberate: an earlier version put overflow-y-auto
// on the same element as the backdrop, so a tall chat scrolled the
// backdrop along with it and left gaps of real page showing through.

import { ReactNode, useEffect } from "react";
import { IconX } from "@tabler/icons-react";

export function AssistantOverlay({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed left-0 right-0 top-14 bottom-0 z-20 nav:left-[250px] nav:top-0">
      {/* Backdrop + centering frame combined: clicking anywhere in this
          layer that isn't the dialog itself closes the assistant. */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px] sm:p-8"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-paper-deep bg-paper shadow-card"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-paper-line bg-white px-5 py-3.5">
            <span className="text-[13.5px] font-semibold text-ink">{title}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className="rounded-lg p-1.5 text-ink-mute transition-colors hover:bg-paper-deep hover:text-ink"
            >
              <IconX size={20} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
