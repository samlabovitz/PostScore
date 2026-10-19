"use client";

// "Customize design": one row under a designer's main form, with a
// one-line summary of the current look. It opens a compact panel — a
// dropdown panel on desktop, a bottom sheet on phones — with small icon
// tabs across the top; one tab's options show at a time. Shared by the
// coupon, referral card and review sign designers. The last open tab is
// remembered on this device.

import { useEffect, useId, useState, type ReactNode } from "react";
import { IconChevronDown, IconLock, IconRefresh, IconX, type Icon } from "@tabler/icons-react";
import { readStorage, writeStorage } from "@/lib/signStudio/design";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PremiumChip } from "./StudioControls";

export interface DesignTab {
  id: string;
  label: string;
  icon: Icon;
  /** The whole tab is Premium-only (shows a lock). */
  locked?: boolean;
  content: ReactNode;
}

export function CustomizeDesign({
  summary,
  tabs,
  storageKey,
  onReset,
  readOnlyNote,
  onOpenLockedTab,
  alwaysOpen = false,
  initialTab,
}: {
  /** The tab shown first (before the remembered one loads). */
  initialTab?: string;
  /** Shown open inline, with no summary row (the sign designer dialog). */
  alwaysOpen?: boolean;
  summary: string;
  tabs: DesignTab[];
  /** Where the last open tab is remembered (per designer). */
  storageKey: string;
  onReset?: (() => void) | null;
  /** Free: the panel is read-only, with this note. */
  readOnlyNote?: string | null;
  /** Grow: opening a locked tab previews a sample of it. */
  onOpenLockedTab?: (tabId: string) => void;
}) {
  const locale = useLocale();
  const panelId = useId();
  const [open, setOpen] = useState(alwaysOpen);
  const [tab, setTab] = useState(initialTab ?? tabs[0]?.id ?? "");
  // The remembered tab is read after mount (no hydration mismatch).
  useEffect(() => {
    const saved = readStorage(storageKey);
    if (saved && tabs.some((x) => x.id === saved)) setTab(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const pick = (id: string) => {
    setTab(id);
    writeStorage(storageKey, id);
    const picked = tabs.find((x) => x.id === id);
    if (picked?.locked && !readOnlyNote) onOpenLockedTab?.(id);
  };
  const current = tabs.find((x) => x.id === tab) ?? tabs[0];

  return (
    <div className="flex flex-col">
      {!alwaysOpen && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          data-testid="customize-design"
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-paper-deep bg-paper px-3.5 py-2.5 text-left transition-colors hover:border-ink-mute"
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-[13.5px] font-semibold text-ink">{t(locale, "dashboard.studio.customize")}</span>
            <span data-testid="design-summary" className="truncate text-[12px] text-ink-soft">
              {summary}
            </span>
          </span>
          <IconChevronDown size={18} aria-hidden className={cn("shrink-0 text-ink-mute transition-transform", open && "rotate-180")} />
        </button>
      )}

      {open && (
        <>
          {/* Phones: a bottom sheet over the page (the preview stays above it). */}
          {!alwaysOpen && (
            <div
              aria-hidden
              className="fixed inset-0 z-30 bg-[color:color-mix(in_srgb,var(--color-ink)_25%,transparent)] nav:hidden"
              onClick={() => setOpen(false)}
            />
          )}
          <div
            id={panelId}
            role="region"
            aria-label={t(locale, "dashboard.studio.customize")}
            className={cn(
              "flex flex-col overflow-hidden border border-paper-deep bg-white",
              alwaysOpen
                ? "mt-2 rounded-xl"
                : "fixed inset-x-0 bottom-0 z-40 max-h-[62vh] rounded-t-2xl shadow-card nav:static nav:z-auto nav:mt-2 nav:max-h-none nav:rounded-xl",
            )}
          >
            <div className="flex items-center gap-1 border-b border-paper-line px-2 pt-2">
              <div role="tablist" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto pb-2">
                {tabs.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    aria-selected={x.id === current?.id}
                    data-tab={x.id}
                    data-locked={x.locked ? "true" : undefined}
                    onClick={() => pick(x.id)}
                    className={cn(
                      "relative flex min-w-[3.6rem] shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold",
                      x.id === current?.id ? "bg-[color:color-mix(in_srgb,var(--color-brass)_12%,white)] text-ink" : "text-ink-soft hover:bg-paper",
                    )}
                  >
                    <x.icon size={17} aria-hidden />
                    {x.label}
                    {x.locked && <IconLock size={10} aria-hidden className="absolute right-1 top-1 text-brass" />}
                  </button>
                ))}
              </div>
              {!alwaysOpen && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t(locale, "dashboard.websiteReviews.studio.close")}
                  className="mb-2 rounded-lg p-1.5 text-ink-mute hover:bg-paper hover:text-ink nav:hidden"
                >
                  <IconX size={16} />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto p-3.5" role="tabpanel">
              {readOnlyNote && (
                <p data-testid="panel-read-only" className="flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1.5 text-[12px] font-medium text-ink">
                  <IconLock size={13} className="text-brass" aria-hidden />
                  {readOnlyNote}
                </p>
              )}
              {current?.locked && !readOnlyNote && (
                <p className="flex items-center gap-1.5 text-[12px] text-ink-soft">
                  <PremiumChip />
                  {t(locale, "dashboard.studio.lockedTab")}
                </p>
              )}
              {/* Free: everything visible, nothing changeable. */}
              <fieldset disabled={!!readOnlyNote} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
                {current?.content}
              </fieldset>
              {onReset && !readOnlyNote && (
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-ink-soft underline hover:text-ink"
                >
                  <IconRefresh size={14} aria-hidden />
                  {t(locale, "dashboard.websiteReviews.studio.reset")}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
