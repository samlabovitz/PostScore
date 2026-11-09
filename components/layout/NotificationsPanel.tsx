"use client";

// The Account menu's notifications panel (lib/notifications.ts): a popover
// beside the sidebar on a desktop, a bottom sheet on a phone. Newest first,
// grouped by business when the owner has more than one; each with its
// urgency pill, one plain sentence, the button that goes straight to the
// fix, and when it was found (or fixed). Opening the panel marks nothing
// read: only clicking a notification does, that one alone. Unread ones
// have a dot and bolder text; read ones are quieter but stay listed.
// Keyboard: focus moves in, Tab stays inside, Esc closes and focus returns
// to the Account menu.

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { IconAlertTriangle, IconArrowRight, IconBell, IconCircleCheck, IconInfoCircle, IconX } from "@tabler/icons-react";
import { groupByBusiness, isUnread, notificationView, type NotificationRow, type NotificationSeverity } from "@/lib/notifications";
import { formatShortDate, t, useLocale, useTimeZone, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PILL: Record<NotificationSeverity, string> = {
  urgent: "bg-red text-white",
  high: "bg-ink text-paper",
  info: "border border-paper-deep bg-paper text-ink-soft",
};
const PILL_ICON = { urgent: IconAlertTriangle, high: IconAlertTriangle, info: IconInfoCircle } as const;

function SeverityPill({ severity }: { severity: NotificationSeverity }) {
  const locale = useLocale();
  const Icon = PILL_ICON[severity];
  return (
    <span data-severity={severity} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", PILL[severity])}>
      <Icon size={11} aria-hidden />
      {t(locale, `dashboard.notifications.severity.${severity}` as MessageKey)}
    </span>
  );
}

/** One notification, one link: clicking it (or its fix) goes to the fix —
 * or, once fixed, to the related check — and marks just this one read. */
export function NotificationItem({ row, onOpen }: { row: NotificationRow; onOpen?: (row: NotificationRow) => void }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const view = notificationView(row);
  if (!view) return null;
  const resolved = row.resolved_at !== null;
  const unread = isUnread(row);
  return (
    <li data-testid="notification" data-unread={unread || undefined} data-resolved={resolved || undefined}>
      <Link
        href={view.fixHref}
        onClick={() => onOpen?.(row)}
        className={cn(
          "flex gap-3 px-4 py-3 transition-colors hover:bg-paper focus-visible:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass",
          !unread && "opacity-75"
        )}
      >
        <span aria-hidden className="mt-1.5 flex h-2 w-2 shrink-0">
          {unread && <span data-testid="unread-dot" className="h-2 w-2 rounded-full bg-red" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            {resolved ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-green">
                <IconCircleCheck size={13} aria-hidden />
                {t(locale, "dashboard.notifications.fixed", { date: formatShortDate(row.resolved_at!, locale, timeZone) })}
              </span>
            ) : (
              <SeverityPill severity={row.severity} />
            )}
            {unread && <span className="sr-only">{t(locale, "dashboard.notifications.unread")}</span>}
            <span className="text-[11.5px] text-ink-mute">{t(locale, "dashboard.notifications.found", { date: formatShortDate(row.created_at, locale, timeZone) })}</span>
          </span>
          <span className={cn("text-[13px] leading-snug", unread ? "font-semibold text-ink" : "text-ink-soft", resolved && "line-through decoration-ink-mute/40")}>{t(locale, view.message)}</span>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-paper-deep bg-white px-3 py-1 text-[12.5px] font-semibold text-ink">
            {t(locale, resolved ? "dashboard.notifications.viewCheck" : view.fixLabel)}
            <IconArrowRight size={13} aria-hidden />
          </span>
        </span>
      </Link>
    </li>
  );
}

export function NotificationsPanel({
  items,
  loading,
  anchor,
  onClose,
  onOpen,
}: {
  items: NotificationRow[];
  loading: boolean;
  /** Desktop: the panel's bottom-left corner, beside the Account menu. */
  anchor: { left: number; bottom: number } | null;
  onClose: () => void;
  /** A notification was clicked: mark it read (the link goes to the fix). */
  onOpen: (row: NotificationRow) => void;
}) {
  const locale = useLocale();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const shown = items.filter((r) => notificationView(r) !== null);
  const groups = groupByBusiness(shown);
  const several = groups.length > 1;

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-[color:color-mix(in_srgb,var(--color-ink)_30%,transparent)] sm:bg-transparent" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="notifications-panel"
        style={anchor ? ({ "--np-left": `${anchor.left}px`, "--np-bottom": `${anchor.bottom}px` } as React.CSSProperties) : undefined}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-paper-deep bg-white shadow-card outline-none sm:inset-x-auto sm:bottom-[var(--np-bottom)] sm:left-[var(--np-left)] sm:max-h-[min(36rem,80vh)] sm:w-[24rem] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-paper-line px-4 py-3">
          <h2 id={titleId} className="flex items-center gap-2 font-serif text-[17px] font-semibold text-ink">
            <IconBell size={17} aria-hidden className="text-brass" />
            {t(locale, "dashboard.notifications.title")}
          </h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} aria-label={t(locale, "dashboard.notifications.close")} className="rounded-full p-1 text-ink-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass">
              <IconX size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-2">
          {loading && shown.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-mute">{t(locale, "dashboard.notifications.loading")}</p>
          ) : shown.length === 0 ? (
            <p data-testid="notifications-empty" className="px-4 py-6 text-[13px] text-ink-soft">
              {t(locale, "dashboard.notifications.empty")}
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.businessId} aria-label={several ? (g.businessName ?? undefined) : undefined}>
                {several && <h3 className="px-4 pb-0.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{g.businessName}</h3>}
                <ul className="divide-y divide-paper-line">
                  {g.items.map((row) => (
                    <NotificationItem key={row.id} row={row} onOpen={onOpen} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
