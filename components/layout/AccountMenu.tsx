"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconLogout, IconSettings, IconUser } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import type { BusinessSummary } from "@/app/actions/businesses";
import { t, useLocale } from "@/lib/i18n";

/**
 * The sidebar's collapsed account menu — a real popup anchored above its
 * trigger button (not an inline-expanding section), closing on outside
 * click, Escape, or navigating to Settings (the language toggle now
 * lives only on the Settings page, not here). Settings navigates away,
 * which naturally closes the menu; Logout submits its form unchanged.
 */
export function AccountMenu({
  business,
  userEmail,
}: {
  business: BusinessSummary | null;
  /** The logged-in user's email, if known yet — see DashboardShell's own
   * doc comment for why this is fetched client-side rather than
   * threaded down from every page. Shown under "Account" when present;
   * shown as nothing (no placeholder dash) while unknown. */
  userEmail: string | null;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left hover:bg-white/[.07]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brass text-white">
          <IconUser size={16} />
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
    </div>
  );
}
