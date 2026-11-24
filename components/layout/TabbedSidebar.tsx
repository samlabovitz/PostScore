"use client";

// Day 25B step 4 (docs/plans/day25a-spec.md §1): the two-tab sidebar,
// shown only on the new-design preview (lib/routes.ts NEW_PAGES_LIVE).
// Presence (the saved scan's score) and Growth (the tier) — only the open
// tab's pages show — then a thin divider, PostStudio (Coming soon) and
// Reports directly under them; only Account is pinned to the bottom. The open tab follows the URL
// (lib/navTabs.ts). On phones the same sidebar is the menu's drawer, with
// a top bar and a scrolling row of the open tab's pages (PhoneNavBar).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  IconCalendarEvent,
  IconFileText,
  IconGift,
  IconGauge,
  IconLayoutDashboard,
  IconListCheck,
  IconLock,
  IconMapPin,
  IconMenu2,
  IconPalette,
  IconPrinter,
  IconSpeakerphone,
  IconStar,
  IconStarFilled,
  IconTag,
  IconTrendingUp,
  IconChartBar,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import type { BusinessSummary } from "@/app/actions/businesses";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { lastNavTab, markReportsSeen, rememberNavTab, reportsSeenFor } from "@/components/layout/shellMemory";
import type { ShellData } from "@/components/layout/ShellData";
import { AFTER_ITEMS, TAB_ITEMS, TIER_NAME_KEYS, activeItem, navItemLocked, tabForPath, type NavItem, type NavItemId, type NavTab } from "@/lib/navTabs";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ICONS: Record<NavItemId, typeof IconLayoutDashboard> = {
  overview: IconLayoutDashboard,
  fixPlan: IconListCheck,
  googleListing: IconMapPin,
  reviews: IconStar,
  website: IconWorld,
  competitors: IconUsers,
  pricing: IconTag,
  growthPlan: IconTrendingUp,
  googleResults: IconChartBar,
  getReviews: IconStarFilled,
  offers: IconGift,
  campaigns: IconSpeakerphone,
  printKit: IconPrinter,
  localEvents: IconCalendarEvent,
  postStudio: IconPalette,
  reports: IconFileText,
};

/** The open tab: from the URL; a shared page keeps the one open last. */
export function useOpenTab(): NavTab {
  const pathname = usePathname();
  const fromUrl = tabForPath(pathname);
  useEffect(() => {
    if (fromUrl) rememberNavTab(fromUrl);
  }, [fromUrl]);
  return fromUrl ?? lastNavTab();
}

/** The phone top bar's value: "78 C" / "Tier 1" / "Locked". */
export function tabValueText(tab: NavTab, shell: ShellData | null, locale: Locale): string {
  if (tab === "presence") return shell?.presence ? `${shell.presence.score} ${shell.presence.grade}` : "—";
  if (shell?.plan === "free") return t(locale, "dashboard.free.lockedLabel");
  return t(locale, "dashboard.nav.tierShort", { n: 1 });
}

/** The Presence/Growth switch: one outlined control, two equal halves at a
 * nav item's height, each an icon and the tab's name on one line (Presence =
 * gauge, Growth = trending; Free: a lock in place of Growth's icon). The open
 * half has a soft fill and the gold underline, never a bright card, so the gold
 * active page stays the one strong highlight; the other half reads as
 * clickable and lights up on hover. The score is on every Presence page; the
 * tier's name and the "Test account" tag are in the Growth pages' header line
 * (GrowthTierLine). */
function TabSwitch({ open, businessId, shell, onNavigate }: { open: NavTab; businessId: string | null; shell: ShellData | null; onNavigate?: () => void }) {
  const locale = useLocale();
  const locked = shell?.plan === "free";
  const tab = (id: NavTab) => {
    const href = businessId ? TAB_ITEMS[id][0].href(businessId) : null;
    const lock = id === "growth" && locked;
    const Icon = id === "presence" ? IconGauge : lock ? IconLock : IconTrendingUp;
    const cls = cn(
      "flex h-10 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] border-b-2 px-1.5 text-[13px] font-semibold transition-colors",
      open === id ? "border-brass bg-white/[.14] text-white" : "border-transparent text-[#D3DCEA] hover:bg-white/[.09] hover:text-white"
    );
    const body = (
      <>
        <Icon size={15} stroke={1.9} aria-hidden data-icon={lock ? "lock" : id} className={cn("shrink-0", open === id || lock ? "text-brass" : "")} />
        <span>{t(locale, `dashboard.nav.tab.${id}` as MessageKey)}</span>
        {lock && <span className="sr-only">{t(locale, "dashboard.free.lockedLabel")}</span>}
      </>
    );
    return href ? (
      <Link key={id} href={href} onClick={onNavigate} data-testid={`nav-tab-${id}`} data-open={open === id || undefined} data-locked={lock || undefined} aria-current={open === id ? "page" : undefined} className={cls}>
        {body}
      </Link>
    ) : (
      <span key={id} data-testid={`nav-tab-${id}`} className={cls}>
        {body}
      </span>
    );
  };
  return (
    <div className="mt-4 flex gap-0.5 rounded-[10px] border border-white/[.22] bg-white/[.04] p-0.5" role="tablist" data-testid="nav-tabs">
      {tab("presence")}
      {tab("growth")}
    </div>
  );
}

/** The Growth pages' header line (new design): "Growth · Tier 1 Starting out"
 * and the dev "Test account" tag; Free: "Growth · ? Locked". Everyone shows
 * Tier 1 until the tiers arrive (step 6). */
export function GrowthTierLine({ shell }: { shell: ShellData | null }) {
  const locale = useLocale();
  const free = shell?.plan === "free";
  return (
    <div data-testid="growth-tier-line" className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
      <span className="font-semibold uppercase tracking-[0.06em] text-brass">{t(locale, "dashboard.nav.tab.growth")}</span>
      <span aria-hidden>·</span>
      {free ? (
        <span className="inline-flex items-center gap-1 font-semibold text-ink">
          <IconLock size={12} aria-hidden className="text-brass" />
          {t(locale, "dashboard.overview.growthLine.locked")}
        </span>
      ) : (
        <span className="font-semibold text-ink">{t(locale, "dashboard.overview.growthLine.tier", { n: 1, name: t(locale, TIER_NAME_KEYS[0]) })}</span>
      )}
      {shell?.testAccount && (
        <span data-testid="nav-test-account" className="whitespace-nowrap rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_22%,white)] px-2 py-0.5 text-[11px] font-semibold text-ink">
          {t(locale, "dashboard.nav.testAccount")}
        </span>
      )}
    </div>
  );
}

function NavRow({ item, businessId, active, plan, dot = false, onNavigate }: { item: NavItem; businessId: string | null; active: boolean; plan: ShellData["plan"] | null; dot?: boolean; onNavigate?: () => void }) {
  const locale = useLocale();
  const Icon = ICONS[item.id];
  const label = <span className="whitespace-nowrap">{t(locale, item.labelKey)}</span>;
  const href = businessId ? item.href(businessId) : null;
  const locked = navItemLocked(plan, item.id);
  const cls = "flex h-10 items-center gap-2.5 rounded-[9px] px-3 text-left text-sm font-medium transition-colors";
  const tail = (
    <>
      {/* "Coming soon" on the label's line, as a small chip (every row the same height). */}
      {item.comingSoon && (
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-white/[.15] px-1.5 py-px text-[10px] font-semibold leading-tight text-[#9FB0C7]">{t(locale, "dashboard.nav.soon")}</span>
      )}
      {dot && (
        <span data-testid="nav-reports-new" className="ml-auto flex shrink-0 items-center">
          <span aria-hidden className="h-2 w-2 rounded-full bg-brass" />
          <span className="sr-only">{t(locale, "dashboard.nav.reportsNew")}</span>
        </span>
      )}
      {locked && (
        <>
          <IconLock size={13} stroke={2} aria-hidden data-testid="nav-lock" className={cn("ml-auto shrink-0", active ? "text-white" : "text-brass")} />
          <span className="sr-only">{t(locale, "dashboard.free.lockedLabel")}</span>
        </>
      )}
    </>
  );
  if (!href) {
    return (
      <span data-nav={item.id} className={cn(cls, "cursor-default text-[#7D8DA6]")}>
        <Icon size={18} stroke={1.75} />
        {label}
        {tail}
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      data-nav={item.id}
      aria-current={active ? "page" : undefined}
      className={cn(cls, active ? "bg-brass text-white" : "text-[#B7C4D8] hover:bg-white/[.07] hover:text-white")}
    >
      <Icon size={18} stroke={1.75} />
      {label}
      {tail}
    </Link>
  );
}

export function TabbedSidebar({
  business = null,
  userEmail = null,
  shell = null,
  className,
  onNavigate,
  onClose,
}: {
  business?: BusinessSummary | null;
  userEmail?: string | null;
  shell?: ShellData | null;
  className?: string;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const open = useOpenTab();
  const id = business?.id ?? null;
  const items = TAB_ITEMS[open];
  const active = id ? activeItem(pathname, id, [...items, ...AFTER_ITEMS]) : null;
  const plan = shell?.plan ?? null;
  // The Reports "New" dot: never on Free; off on Reports itself and once it was opened this session.
  const onReports = id !== null && pathname.startsWith(`/business/${id}/reports`);
  useEffect(() => {
    if (onReports && id) markReportsSeen(id);
  }, [onReports, id]);
  const reportsDot = !!shell?.reportsNew && plan !== "free" && id !== null && !onReports && !reportsSeenFor(id);

  return (
    <aside data-testid="tabbed-sidebar" data-open-tab={open} className={cn("flex h-full w-[250px] shrink-0 flex-col bg-ink px-4 py-5", className)}>
      <div className="flex items-center justify-between px-2">
        <Link href="/" onClick={onNavigate} className="font-serif text-[21px] font-semibold">
          <span className="text-white">Post</span>
          <span className="text-brass">Score</span>
        </Link>
        <button type="button" onClick={onClose} aria-label={t(locale, "dashboard.shell.closeMenuAriaLabel")} className="-mr-1.5 rounded-md p-1.5 text-[#9FB0C7] hover:bg-white/[.07] hover:text-white nav:hidden">
          <IconX size={20} />
        </button>
      </div>

      {business ? (
        <div className="mt-5 rounded-[11px] border border-white/[.09] bg-white/[.06] p-3">
          <div className="truncate text-[13.5px] font-semibold text-white">{business.name ?? t(locale, "dashboard.overview.untitledBusiness")}</div>
          <div className="mt-0.5 truncate text-[11px] text-[#9FB0C7]">{business.address ?? t(locale, "dashboard.overview.noAddressOnFile")}</div>
        </div>
      ) : (
        <Link href="/business/new" onClick={onNavigate} className="mt-5 block rounded-[11px] border border-dashed border-white/[.15] p-3 hover:border-white/[.3]">
          <div className="truncate text-[13.5px] font-semibold text-white">{t(locale, "dashboard.shell.noBusinessSelected")}</div>
          <div className="mt-0.5 truncate text-[11px] text-brass">{t(locale, "dashboard.shell.addBusinessToGetStarted")}</div>
        </Link>
      )}

      <TabSwitch open={open} businessId={id} shell={shell} onNavigate={onNavigate} />

      {/* The open tab's pages, then a thin divider and PostStudio + Reports
          directly under them; only Account is pinned to the bottom. */}
      <nav className="mt-5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-4" data-testid="nav-items">
        {items.map((item) => (
          <NavRow key={item.id} item={item} businessId={id} active={active === item.id} plan={plan} onNavigate={onNavigate} />
        ))}
        <div className="mx-3 my-1.5 border-t border-white/[.1]" aria-hidden data-testid="nav-divider" />
        {AFTER_ITEMS.map((item) => (
          <NavRow key={item.id} item={item} businessId={id} active={active === item.id} plan={plan} dot={item.id === "reports" && reportsDot} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* One divider only (above PostStudio and Reports): none above Account. */}
      <AccountMenu business={business} userEmail={userEmail} divider={false} />
    </aside>
  );
}

/** Phones (<860px): "PostScore · Presence · 78 C ☰", then the open tab's pages in one scrolling row. */
export function PhoneNavBar({ businessId, shell, onOpenMenu }: { businessId: string | null; shell: ShellData | null; onOpenMenu: () => void }) {
  const pathname = usePathname();
  const locale = useLocale();
  const open = useOpenTab();
  const items = TAB_ITEMS[open];
  const active = businessId ? activeItem(pathname, businessId, items) : null;
  return (
    <div className="sticky top-0 z-30 nav:hidden" data-testid="phone-nav">
      <div className="flex h-14 items-center justify-between gap-2 bg-ink px-4">
        <Link href="/" className="flex min-w-0 items-baseline gap-1.5 text-white">
          <span className="font-serif text-lg font-semibold">
            <span className="text-white">Post</span>
            <span className="text-brass">Score</span>
          </span>
          <span className="truncate text-[13px] text-[#B7C4D8]" data-testid="phone-nav-tab">
            · {t(locale, `dashboard.nav.tab.${open}` as MessageKey)} · <b className="text-white">{tabValueText(open, shell, locale)}</b>
          </span>
        </Link>
        <button type="button" onClick={onOpenMenu} aria-label={t(locale, "dashboard.shell.openMenuAriaLabel")} className="shrink-0 rounded-md p-1.5 text-white hover:bg-white/[.07]">
          <IconMenu2 size={22} />
        </button>
      </div>
      {businessId && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-paper-line bg-white px-3 py-2 [scrollbar-width:none]" data-testid="phone-nav-pages">
          {items.map((item) => {
            const href = item.href(businessId);
            const label = t(locale, item.labelKey);
            const locked = navItemLocked(shell?.plan ?? null, item.id);
            const cls = cn(
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-semibold",
              active === item.id ? "border-ink bg-ink text-white" : "border-paper-deep text-ink"
            );
            return href ? (
              <Link key={item.id} href={href} aria-current={active === item.id ? "page" : undefined} className={cls}>
                {label}
                {locked && <IconLock size={11} aria-hidden className="text-brass" />}
              </Link>
            ) : (
              <span key={item.id} className={cn(cls, "text-ink-mute")}>
                {label} · {t(locale, "dashboard.common.comingSoon")}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
