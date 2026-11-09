"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBell, IconChevronDown, IconLogout, IconSettings, IconUser } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import { getMyNotifications, markNotificationRead } from "@/app/actions/notifications";
import type { BusinessSummary } from "@/app/actions/businesses";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { badgeText, unreadCount, type NotificationRow } from "@/lib/notifications";
import { t, useLocale } from "@/lib/i18n";

/** The small red circle with the unread count (hidden at 0, "9+" above 9). */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  const locale = useLocale();
  const text = badgeText(count);
  if (!text) return null;
  return (
    <span
      data-testid="unread-badge"
      aria-label={t(locale, "dashboard.notifications.badgeLabel", { count })}
      className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10.5px] font-bold leading-none text-white", className)}
    >
      {text}
    </span>
  );
}

/**
 * The sidebar's collapsed account menu — a real popup anchored above its
 * trigger button (not an inline-expanding section), closing on outside
 * click, Escape, or navigating to Settings (the language toggle now
 * lives only on the Settings page, not here). Settings navigates away,
 * which naturally closes the menu; Logout submits its form unchanged.
 *
 * Notifications (lib/notifications.ts): the unread count is a red circle on
 * the Account button and on the menu's "Notifications" item, read on every
 * page (no Google call — one database read). It only goes down when the
 * owner clicks a notification — opening the panel marks nothing read.
 * `initialNotifications`: tests only.
 */
export function AccountMenu({
  business,
  userEmail,
  initialNotifications,
}: {
  business: BusinessSummary | null;
  /** The logged-in user's email, if known yet — see DashboardShell's own
   * doc comment for why this is fetched client-side rather than
   * threaded down from every page. Shown under "Account" when present;
   * shown as nothing (no placeholder dash) while unknown. */
  userEmail: string | null;
  initialNotifications?: NotificationRow[];
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications ?? []);
  const [loading, setLoading] = useState(!initialNotifications);
  const [panel, setPanel] = useState<{ anchor: { left: number; bottom: number } | null } | null>(null);
  const count = unreadCount(items);

  // Every page: the latest notifications (scans create and resolve them).
  useEffect(() => {
    if (initialNotifications) return;
    let live = true;
    getMyNotifications()
      .then((r) => live && r.status === "ok" && setItems(r.items))
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [pathname, initialNotifications]);

  function openPanel() {
    setOpen(false);
    const rect = buttonRef.current?.getBoundingClientRect();
    setPanel({ anchor: rect && typeof window !== "undefined" ? { left: rect.right + 8, bottom: Math.max(16, window.innerHeight - rect.bottom) } : null });
  }

  const closePanel = useCallback(() => {
    setPanel(null);
    buttonRef.current?.focus();
  }, []);

  /** Clicked: just this one is read; the link goes to the fix. */
  function openNotification(row: NotificationRow) {
    setPanel(null);
    if (row.read_at) return;
    const now = new Date().toISOString();
    setItems((rows) => rows.map((r) => (r.id === row.id ? { ...r, read_at: now } : r)));
    void markNotificationRead(row.id).catch(() => undefined);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative mt-3 border-t border-white/10 pt-3">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left hover:bg-white/[.07]"
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-brass text-white">
          <IconUser size={16} />
          <UnreadBadge count={count} className="absolute -right-1.5 -top-1.5 ring-2 ring-[color:var(--color-ink)]" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-white">{t(locale, "dashboard.nav.account")}</span>
          {userEmail && <span className="block truncate text-[11px] text-[#9FB0C7]">{userEmail}</span>}
        </span>
        <IconChevronDown
          size={16}
          className={cn("text-[#9FB0C7] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-2 w-full rounded-xl border border-paper-deep bg-white p-1.5 shadow-card"
        >
          <button
            type="button"
            role="menuitem"
            onClick={openPanel}
            data-testid="notifications-item"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-paper nav:py-2"
          >
            <IconBell size={16} />
            <span className="flex-1">{t(locale, "dashboard.notifications.title")}</span>
            <UnreadBadge count={count} />
          </button>
          <div className="my-1 border-t border-paper-line" />
          {business && (
            <>
              <Link
                href={`/business/${business.id}/settings`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-paper nav:py-2"
              >
                <IconSettings size={16} />
                {t(locale, "dashboard.nav.settings")}
              </Link>
              <div className="my-1 border-t border-paper-line" />
            </>
          )}
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red hover:bg-red/5 nav:py-2"
            >
              <IconLogout size={16} />
              {t(locale, "dashboard.nav.logOut")}
            </button>
          </form>
        </div>
      )}

      {panel && (
        <NotificationsPanel items={items} loading={loading} anchor={panel.anchor} onClose={closePanel} onOpen={openNotification} />
      )}
    </div>
  );
}
