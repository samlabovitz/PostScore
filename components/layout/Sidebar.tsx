"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconLayoutDashboard,
  IconTrendingUp,
  IconStar,
  IconWorld,
  IconUsers,
  IconTag,
  IconFileText,
  IconChevronDown,
  IconLogout,
  IconSettings,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import type { BusinessSummary } from "@/app/actions/businesses";

const NAV_ITEMS: Array<{
  label: string;
  icon: typeof IconLayoutDashboard;
  path: (businessId: string) => string;
}> = [
  { label: "Overview", icon: IconLayoutDashboard, path: (id) => `/business/${id}` },
  { label: "Growth", icon: IconTrendingUp, path: (id) => `/business/${id}/growth` },
  { label: "Reviews", icon: IconStar, path: (id) => `/business/${id}/website-reviews` },
  { label: "Website", icon: IconWorld, path: (id) => `/business/${id}/website` },
  { label: "Competitors", icon: IconUsers, path: (id) => `/business/${id}/competitors` },
  { label: "Pricing", icon: IconTag, path: (id) => `/business/${id}/pricing` },
  { label: "Reports", icon: IconFileText, path: (id) => `/business/${id}/reports` },
];

interface SidebarProps {
  /** The business the current page is scoped to, if any. Nav links are
   * only real (and highlightable) when this is set — there's nothing
   * to route to otherwise. */
  business?: BusinessSummary | null;
  className?: string;
  onNavigate?: () => void;
  onClose?: () => void;
}

/** Overview's own href (`/business/{id}`) must match exactly — every
 * other business subpage also starts with that string, so a naive
 * prefix check would light up Overview on every page. */
function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href.split("/").length > 3 && pathname.startsWith(`${href}/`);
}

export function Sidebar({ business = null, className, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-full w-[250px] shrink-0 flex-col bg-ink px-4 py-5",
        className
      )}
    >
      <div className="flex items-center justify-between px-2">
        <div className="font-serif text-[21px] font-semibold">
          <span className="text-white">Post</span>
          <span className="text-brass">Score</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="-mr-1.5 rounded-md p-1.5 text-[#9FB0C7] hover:bg-white/[.07] hover:text-white nav:hidden"
        >
          <IconX size={20} />
        </button>
      </div>

      <div className="mt-5 rounded-[11px] border border-white/[.09] bg-white/[.06] p-3">
        <div className="truncate text-[13.5px] font-semibold text-white">
          {business ? (business.name ?? "Untitled business") : "No business selected"}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[#9FB0C7]">
          {business ? (business.address ?? "No address on file") : "Save a business to get started"}
        </div>
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
          if (!business) {
            return (
              <span
                key={label}
                className="flex cursor-not-allowed items-center gap-[11px] rounded-[9px] px-3 py-3 text-left text-sm font-medium text-[#5C6B82] nav:py-2.5"
              >
                <Icon size={18} stroke={1.75} />
                {label}
              </span>
            );
          }

          const href = path(business.id);
          const isActive = isNavActive(pathname, href);
          return (
            <Link
              key={label}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-[11px] rounded-[9px] px-3 py-3 text-left text-sm font-medium transition-colors nav:py-2.5",
                isActive
                  ? "bg-brass text-white"
                  : "text-[#B7C4D8] hover:bg-white/[.07] hover:text-white"
              )}
            >
              <Icon size={18} stroke={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="relative mt-3 border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => setProfileOpen((open) => !open)}
          className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left hover:bg-white/[.07]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brass text-white">
            <IconUser size={16} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-white">Account</span>
            <span className="block text-[11px] text-[#9FB0C7]">—</span>
          </span>
          <IconChevronDown
            size={16}
            className={cn(
              "text-[#9FB0C7] transition-transform",
              profileOpen && "rotate-180"
            )}
          />
        </button>

        {profileOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl border border-paper-deep bg-white p-1.5 shadow-card">
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-paper nav:py-2">
              <IconSettings size={16} />
              Settings
            </button>
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red hover:bg-red/5 nav:py-2"
              >
                <IconLogout size={16} />
                Log out
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
