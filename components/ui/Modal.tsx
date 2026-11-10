"use client";

import { ReactNode, useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { t, useLocale } from "@/lib/i18n";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  sheet = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  /** On phones, a bottom sheet instead of a centred box. */
  sheet?: boolean;
}) {
  const locale = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    // Keyboard: focus moves into the dialog, and back where it was on close.
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      returnTo?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={cn("fixed inset-0 z-50 flex justify-center", sheet ? "items-end sm:items-center sm:p-4" : "items-center p-4")}>
      <div
        className="fixed inset-0 bg-ink/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[85vh] w-full max-w-lg flex-col border border-paper-deep bg-white shadow-card",
          sheet ? "rounded-t-xl sm:rounded-xl" : "rounded-xl",
          className
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-paper-line px-5 py-4">
          <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t(locale, "dashboard.common.close")}
            className="rounded-md p-1 text-ink-mute hover:bg-paper hover:text-ink"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
