"use client";

import { useState } from "react";
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

const NAV_ITEMS = [
  { label: "Overview", icon: IconLayoutDashboard },
  { label: "Growth", icon: IconTrendingUp },
  { label: "Reviews", icon: IconStar },
  { label: "Website", icon: IconWorld },
  { label: "Competitors", icon: IconUsers },
  { label: "Pricing", icon: IconTag },
  { label: "Reports", icon: IconFileText },
];

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
  onClose?: () => void;
}

export function Sidebar({ className, onNavigate, onClose }: SidebarProps) {
  const [active, setActive] = useState("Overview");
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
        <div className="text-[13.5px] font-semibold text-white">Business name</div>
        <div className="mt-0.5 text-[11px] text-[#9FB0C7]">Location</div>
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(({ label, icon: Icon }) => {
          const isActive = active === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setActive(label);
                onNavigate?.();
              }}
              className={cn(
                "flex items-center gap-[11px] rounded-[9px] px-3 py-3 text-left text-sm font-medium transition-colors nav:py-2.5",
                isActive
                  ? "bg-brass text-white"
                  : "text-[#B7C4D8] hover:bg-white/[.07] hover:text-white"
              )}
            >
              <Icon size={18} stroke={1.75} />
              {label}
            </button>
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
