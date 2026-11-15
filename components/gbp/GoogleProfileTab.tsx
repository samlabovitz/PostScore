"use client";

// The Growth page's Google Profile tab for Premium (Day 22B step 1; design:
// docs/mockups/google-profile-mockup.html). Six sections under a pinned
// "On this page" menu:
//   1 Last month on Google — the conversion rate (monthly Google insights
//     arrive in step 2: an empty state until then, the mockup's sample in
//     practice mode only), the five levers that raise it (real data), and
//     "Last month you: …" from the real logs;
//   2 Searches → customers, 3 What people searched, 5 Show up for more —
//     the same: empty until the first monthly Google report;
//   4 Your listing — the saved listing, row by row, each opening the
//     existing editor (preview → approve → read back → 7-day undo, the
//     GOOGLE_WRITES_LIVE_PLACES lock and wording all their own);
//   6 Protection & changes — what changed between scans that PostScore
//     didn't do, and the latest changes made from PostScore.
// Not connected (and not practice): one card, what connecting unlocks.
// The wording never says PostScore caused a change in the rate.

import Link from "next/link";
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { syncGoogleNumbers } from "@/app/actions/gbpInsights";
import { changeGoogleEditBack, checkGoogleEditsNow, keepAllGoogleVersions, keepGoogleVersion, reopenGoogleEditAction, undoMadeChange, type ChangeBackResult } from "@/app/actions/gbpGoogleEdits";
import { CompareVersions } from "@/components/gbp/CompareVersions";
import { codedToWeek, shortWeek, versionsOfEdit, versionsOfHours, watchedSummary } from "@/lib/compareVersions";
import { sameWeek } from "@/lib/gbpProfileEdits";
import { bannerEdits, bannerSerious, canChangeBack, isInfoOnly, joinFields, PLURAL_FIELDS, type GoogleEditRow } from "@/lib/gbpGoogleEdits";
import { specialFor, timeText, upcomingHolidays } from "@/lib/gbpListingFields";
import { isFresh } from "@/lib/gbpMediaPosts";
import { doneSinceScan, ideaTypeOf, listingIdeas, MAX_IDEAS, prefillFromHash, type Idea } from "@/lib/listingIdeas";
import { IconArrowUpRight, IconBuildingStore, IconDiscount2, IconPencil, IconPhoto, IconStar } from "@tabler/icons-react";
import { ProfileEditsOnGoogle, type StartHours } from "@/components/gbp/ProfileEditsOnGoogle";
import { FixGoogle, FixWebsite, HoursComparePanel, HoursMismatchChooser } from "@/components/hours/HoursMismatchChooser";
import type { WeeklyHours } from "@/lib/gbpProfileEdits";
import type { WebsiteBuilderId } from "@/lib/websiteBuilder";
import { PhotoUpload } from "@/components/gbp/PhotoUpload";
import { ownHoursKey, startHoursFromHash } from "@/lib/hoursChooser";
import { WebsiteLinkFix } from "@/components/gbp/WebsiteLinkFix";
import { CustomerDetailsGoogleEdit, useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { GbpMessagingStep } from "@/components/gbp/GbpMessagingStep";
import { gbpResultText } from "@/components/gbp/GbpResultMessage";
import { openProfileEdits } from "@/app/actions/gbpProfileEdits";
import { openOrderLink } from "@/app/actions/gbpOrderLink";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import { GBP_PROFILE_ANCHOR, gbpConnectHref, type GbpConnectResult } from "@/lib/gbpLanding";
import { googleWritesCopy, GOOGLE_WRITES_FOR_EVERYONE } from "@/lib/googleWritesLaunch";
import { formatCount, formatMonthDayTime, formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import {
  conversionRate,
  editorFromHash,
  formatRate,
  activeJumpSection,
  JUMP_LINE_SLACK,
  JUMP_SECTIONS,
  jumpIdFromHash,
  levers,
  listingCounts,
  listingGroups,
  nextMonthlyUpdate,
  per100Change,
  rateTrend,
  sampleIdeas,
  deviceAdvice,
  deviceSplit,
  SHORT_DESCRIPTION,
  SAMPLE_AVERAGE_VISIT,
  SAMPLE_INSIGHTS,
  lastSixMonths,
  lastTwo,
  syncedAgo,
  rateChart,
  type Editor,
  type GoogleTabSaved,
  type MadeChange,
  type MadeValue,
  type BookingState,
  type JumpPart,
  type ListingExtras,
  type JumpSectionId,
  type Lever,
  type LeverId,
  type ListingRow,
  type RowStatus,
  type Tone,
} from "@/lib/googleProfileTab";
import type { CheckResult } from "@/lib/scoring";
import type { BookingTracking } from "@/lib/bookingPartners";
import type { MediaPostsState } from "@/lib/gbpMediaPosts";
import { BookingStepsPanel } from "@/components/gbp/BookingSteps";
import { HolidayHoursEditor, ServicesEditor } from "@/components/gbp/ListingFieldEditors";
import { actions, audience, type InsightsState, callsByDays, isSmallMonth, leftOnTable, SAMPLE_AUDIENCE, sixMonthSpan, totalViews, worthRange, whoTable, type Audience, type InsightsMonth, type WhoRow } from "@/lib/gbpInsights";
import type { GbpReplyCounts } from "@/lib/gbpReviewReplies";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.googleTab.${key}` as MessageKey;

export interface GoogleTabListing {
  rating: number | null;
  reviewCount: number | null;
  photoCount: number | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  /** All the listing's categories (the primary first), when known. */
  categories?: string[] | null;
  openingHours: string[] | null;
  googleMapsUri: string | null;
}

export interface GoogleProfileTabProps {
  businessId: string;
  connected: boolean;
  practice: boolean;
  needsReconnect: boolean;
  canStart: boolean;
  result: GbpConnectResult | null;
  business: { name: string | null; address: string | null };
  listing: GoogleTabListing;
  checks: CheckResult[];
  /** The website category's points and the checks losing them; null: no website. */
  website: { earned: number; of: number; fixes: number } | null;
  replyCounts: GbpReplyCounts | null;
  messagingOn: boolean | null;
  saved: GoogleTabSaved | null;
  lastScanAt: string | null;
  /** The stored monthly Google numbers (gbp_monthly_insights), oldest first. */
  insights?: InsightsMonth[];
  /** The owner's average visit value (Settings), for "What that could be worth". */
  averageVisit?: number | null;
  /** The real Book online button and whether Google counts its bookings. */
  booking?: BookingState | null;
  /** Photos and Google posts, read from Google (lib/gbpMediaPosts.ts). */
  media?: MediaPostsState | null;
  /** From the real listing read: special hours, service names, categories. */
  extras?: ListingExtras | null;
  /** Practice mode: the fake Google is a copy of the real listing ("real"),
   * the sample ("sample"), or the sample because the real read failed. */
  practiceSource?: "real" | "sample" | "fallback" | null;
  /** Connected: shown / sync needed / Google had nothing (lib/gbpInsights.ts insightsStateFor). */
  insightsState?: InsightsState;
  /** The website's hours from the last scan (null week: none could be read), its builder, and "Ask Sam". */
  websiteHours?: { week: WeeklyHours | null; builder: { id: WebsiteBuilderId; name: string } | null; siteUrl: string | null; managedEmail: string | null; hasPhoneLink?: boolean | null } | null;
  /** The last scan found the website's hours differ from Google's (undefined: no website compared). */
  hoursMismatch?: boolean;
  /** The business type (businesses.niche_id), for section 5's search-term → service maps. */
  nicheId?: string | null;
  /** Writes from PostScore allowed (practice, or GOOGLE_WRITES_LIVE_PLACES). */
  canEditGoogle?: boolean;
}

/** Gold-on-navy and the mockup's soft tones, from the app's own colors. */
const GOLD_LIGHT = "text-[color:color-mix(in_srgb,var(--color-brass)_55%,white)]";
const NAVY_2 = "bg-[color:color-mix(in_srgb,var(--color-ink)_88%,white)]";
const NAVY_LINE = "border-[color:color-mix(in_srgb,var(--color-ink)_70%,white)]";
const CREAM = "bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)]";
const TONE_PILL: Record<Tone, string> = {
  ok: "bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] text-green",
  warn: "bg-[color:color-mix(in_srgb,var(--color-amber)_14%,white)] text-amber",
  bad: "bg-[color:color-mix(in_srgb,var(--color-red)_10%,white)] text-red",
  neutral: "bg-paper text-ink-mute",
};
const STATUS_DOT: Record<RowStatus, { cls: string; mark: string }> = {
  ok: { cls: "bg-green text-white", mark: "✓" },
  warn: { cls: "bg-amber text-white", mark: "!" },
  bad: { cls: "bg-red text-white", mark: "✕" },
  neutral: { cls: "bg-paper-deep text-ink-mute", mark: "–" },
  soon: { cls: "bg-paper-deep text-ink-mute", mark: "…" },
};

export function GoogleProfileTab(props: GoogleProfileTabProps) {
  if (!props.connected && !props.practice) return <NotConnectedCard {...props} />;
  return <ConnectedTab {...props} />;
}

/** Where the Google numbers stand: shown, loading (a sync is running),
 * failed (with "Try again"), or none (Google has nothing yet). */
type SyncStatus = "ready" | "loading" | "failed" | "none";
const SyncContext = createContext<{ status: SyncStatus; retry: () => void }>({ status: "ready", retry: () => undefined });

function useSync(businessId: string, state: InsightsState | undefined): { status: SyncStatus; retry: () => void } {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus>(state === "sync" ? "loading" : state === "none" ? "none" : "ready");
  const run = useCallback(async () => {
    setStatus("loading");
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await syncGoogleNumbers(businessId).catch(() => ({ status: "failed" }) as const);
      if (result.status === "ok") {
        if (result.hasLastMonth) router.refresh();
        else setStatus("none");
        return;
      }
      if (result.status === "failed") {
        setStatus("failed");
        return;
      }
      // Busy: another tab or the monthly job is already loading them.
      await new Promise((r) => setTimeout(r, 4000));
    }
    router.refresh();
  }, [businessId, router]);
  const started = useRef(false);
  useEffect(() => {
    if (state !== "sync" || started.current) return;
    started.current = true;
    void run();
  }, [state, run]);
  return { status, retry: () => void run() };
}

function ConnectedTab(props: GoogleProfileTabProps) {
  const locale = useLocale();
  const sync = useSync(props.businessId, props.connected ? props.insightsState : undefined);
  const sample = props.practice && !(props.insights && props.insights.length > 0);
  const months = props.insights && props.insights.length > 0 ? props.insights : sample ? SAMPLE_INSIGHTS : [];
  const who = sample ? SAMPLE_AUDIENCE : audience(months);
  return (
    // Bottom room for the floating "Ask PostAI" button (44px + 24px), so the
    // last rows scroll above it — rows themselves have no right margin.
    <SyncContext.Provider value={sync}>
    <div className="flex flex-col pb-[68px]" data-testid="google-profile-tab" data-sync={sync.status}>
      {props.result && (
        <p id={GBP_PROFILE_ANCHOR} role="status" className={cn("mb-3 scroll-mt-20 text-[13px] font-medium", props.result === "connected" ? "text-green" : "text-red")}>
          {gbpResultText(locale, props.result, props.business)}
        </p>
      )}
      <GoogleEditsBanner businessId={props.businessId} saved={props.saved} scan={{ website: props.listing.website, phone: props.listing.phone }} />
      <JumpMenu sample={sample} />
      <PartHeader part="performance" />
      <LastMonthSection {...props} months={months} sample={sample} />
      <FunnelSection months={months} sample={sample} who={who} props={props} />
      <SearchesSection months={months} sample={sample} />
      <PartHeader part="edit" />
      <ListingSection {...props} />
      <NextSection {...props} sample={sample} />
      <PartHeader part="protection" />
      <ProtectionSection {...props} />
    </div>
    </SyncContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Not connected
// ---------------------------------------------------------------------------

function NotConnectedCard({ businessId, needsReconnect, canStart, result, business }: GoogleProfileTabProps) {
  const locale = useLocale();
  const beta = GOOGLE_WRITES_FOR_EVERYONE ? "" : ` (${t(locale, "dashboard.fixWithPostScore.beta")})`;
  const button = "inline-flex w-fit items-center rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-paper hover:bg-ink/90";
  return (
    <Box id={GBP_PROFILE_ANCHOR} data-testid="google-tab-not-connected" className="flex scroll-mt-20 flex-col gap-3 p-3.5">
      {result && (
        <p role="status" className={result === "connected" ? "text-[13px] font-medium text-green" : "text-[13px] font-medium text-red"}>
          {gbpResultText(locale, result, business)}
        </p>
      )}
      <h2 className="font-serif text-xl font-semibold text-ink">{t(locale, K("notConnected.title"))}</h2>
      <p className="text-[13.5px] text-ink-soft">{t(locale, K("notConnected.lead"))}</p>
      <ul className="flex flex-col gap-1.5 text-[13.5px] text-ink">
        <li>• {t(locale, K("notConnected.rate"))}</li>
        <li>• {t(locale, K("notConnected.searches"))}</li>
        <li>
          • {t(locale, K("notConnected.edit"))}
          {beta}
        </li>
      </ul>
      <p className="text-[12.5px] text-ink-mute">{needsReconnect ? t(locale, "dashboard.gbp.reconnectBody") : t(locale, googleWritesCopy("connectBody"))}</p>
      {canStart ? (
        <a href={gbpConnectHref(businessId, "profile")} className={button} data-testid="google-tab-connect">
          {needsReconnect ? t(locale, "dashboard.gbp.reconnect") : t(locale, "dashboard.googleProfile.connectLink")}
        </a>
      ) : (
        <Link href={`/business/${businessId}/connect-gbp`} className={button} data-testid="google-tab-connect">
          {t(locale, "dashboard.googleProfile.connectLink")}
        </Link>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The pinned menu
// ---------------------------------------------------------------------------

/** Where the menu pins: the top of the scrolling area (under the phone top
 * bar below `nav`). The menu (40px) sits 4px down in its page-colored
 * band, so a jumped-to title lands 12px under it: 4 + 40 + 12 = 56px. */
const MENU_TOP = "top-14 nav:top-0";
const SCROLL_MT = "scroll-mt-[112px] nav:scroll-mt-14";
/** The "Sample data" pill, the same everywhere on the tab. */
const SAMPLE_PILL = "rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_14%,white)] px-2 py-0.5 text-[10.5px] font-semibold text-brass";

function JumpMenu({ sample = false }: { sample?: boolean }) {
  const locale = useLocale();
  const [active, setActive] = useState<JumpSectionId>(JUMP_SECTIONS[0].id);
  const [pinned, setPinned] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // A click or a #hash holds its item until the owner scrolls themselves.
  const held = useRef(false);
  // The URL follows the active section only once the owner has scrolled.
  const scrolled = useRef(false);

  useEffect(() => {
    const compute = () => {
      if (held.current || !nav.current) return;
      const line = nav.current.getBoundingClientRect().bottom + JUMP_LINE_SLACK;
      const tops = JUMP_SECTIONS.flatMap((s) => {
        const el = document.getElementById(s.id);
        return el ? [{ id: s.id, top: el.getBoundingClientRect().top }] : [];
      });
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActive(activeJumpSection(tops, line, atBottom));
    };
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    };
    // The owner's own scrolling (wheel, touch, keys) releases a held item.
    const release = () => {
      held.current = false;
      scrolled.current = true;
    };
    // Sections crossing the line under the menu (its height included) trigger a recompute.
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(onScroll, { rootMargin: `-${(nav.current?.getBoundingClientRect().height ?? 36) + 20}px 0px -40% 0px`, threshold: [0, 1] });
    for (const s of JUMP_SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io?.observe(el);
    }
    // Pinned: the spot just above the menu has scrolled away.
    const pin = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 80), { threshold: 0 });
    if (sentinel.current) pin?.observe(sentinel.current);
    window.addEventListener("scroll", onScroll, { passive: true });
    for (const ev of ["wheel", "touchmove", "keydown"]) window.addEventListener(ev, release, { passive: true });
    // ?tab=google#protection: go there, that item highlighted.
    const fromHash = jumpIdFromHash(window.location.hash);
    if (fromHash) {
      held.current = true;
      setActive(fromHash);
      if (window.location.hash === `#${fromHash}`) requestAnimationFrame(() => document.getElementById(fromHash)?.scrollIntoView({ block: "start" }));
    } else compute();
    return () => {
      io?.disconnect();
      pin?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      for (const ev of ["wheel", "touchmove", "keydown"]) window.removeEventListener(ev, release);
    };
  }, []);

  // The URL's #hash follows the section in view (replaced, never a new history entry).
  useEffect(() => {
    if (!scrolled.current || window.location.hash === `#${active}`) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${active}`);
  }, [active]);

  // Phones: keep the active item in view in the sideways-scrolling row.
  useEffect(() => {
    const row = nav.current;
    const item = row?.querySelector<HTMLElement>(`[data-jump="${active}"]`);
    if (!row || !item || row.scrollWidth <= row.clientWidth) return;
    const left = item.offsetLeft - 8;
    const right = item.offsetLeft + item.offsetWidth + 8;
    if (left < row.scrollLeft) row.scrollTo({ left, behavior: "smooth" });
    else if (right > row.scrollLeft + row.clientWidth) row.scrollTo({ left: right - row.clientWidth, behavior: "smooth" });
  }, [active]);

  const jump = (id: JumpSectionId) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    held.current = true;
    scrolled.current = true;
    setActive(id);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${id}`);
  };

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-0" />
      {/* A page-colored band from the very top edge, so nothing shows above or behind the pinned menu. */}
      <div className={cn("sticky z-20 bg-paper py-1 transition-shadow", MENU_TOP, pinned && "shadow-[0_6px_12px_-8px_rgba(20,36,63,0.25)]")} data-pinned={pinned ? "true" : undefined} data-testid="google-tab-jump-band">
        <nav
          ref={nav}
          aria-label={t(locale, K("jump.label"))}
          data-testid="google-tab-jump"
          className="flex h-10 items-center gap-0.5 overflow-x-auto scroll-px-2 rounded-xl border border-paper-line bg-white px-1 [scrollbar-width:none] min-[1000px]:justify-evenly"
        >
          {JUMP_SECTIONS.map((s, i) => (
            <Fragment key={s.id}>
              {/* Thin lines between the three parts (after 3 and 5). */}
              {i > 0 && JUMP_SECTIONS[i - 1].part !== s.part && <span aria-hidden className="h-5 w-px shrink-0 bg-paper-line" data-testid="google-tab-jump-divider" />}
              <a
                href={`#${s.id}`}
                data-jump={s.id}
                onClick={jump(s.id)}
                aria-current={active === s.id ? "location" : undefined}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-2.5 py-[5px] text-[13px] font-semibold leading-4 outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-1",
                  active === s.id ? "bg-ink text-white" : "text-ink-soft hover:bg-paper"
                )}
              >
                <b className={cn("mr-1", active === s.id ? GOLD_LIGHT : "text-brass")}>{i + 1}</b>
                {t(locale, K(`jump.${s.key}`))}
              </a>
            </Fragment>
          ))}
          {sample && (
            <span title={t(locale, K("sampleNote"))} data-testid="google-tab-sample-note" className={cn("shrink-0 whitespace-nowrap", SAMPLE_PILL)}>
              <span className="hidden xl:inline">{t(locale, K("samplePill"))}</span>
              <span className="xl:hidden">{t(locale, K("sample"))}</span>
            </span>
          )}
        </nav>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** A part's one-line header: a thin line, the gold label and (except
 * "Edit your listing", whose section says it) a grey line. */
function PartHeader({ part }: { part: JumpPart }) {
  const locale = useLocale();
  return (
    <p className={cn("mt-5 flex flex-wrap items-baseline gap-x-1.5 border-t border-paper-line pt-2", SCROLL_MT)} id={`part-${part}`} data-testid={`google-tab-part-${part}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brass">{t(locale, K(`parts.${part}.label`))}</span>
      {part !== "edit" && <span className="text-[12.5px] text-ink-mute">· {t(locale, K(`parts.${part}.subtitle`))}</span>}
    </p>
  );
}

function SectionHead({ n, id, title, meta, children }: { n: number; id: string; title: string; meta?: string; children?: ReactNode }) {
  return (
    // The first section of a part sits just under the part's header.
    <section id={id} className={cn(SCROLL_MT, JUMP_SECTIONS.find((s) => s.part === JUMP_SECTIONS.find((x) => x.id === id)?.part)?.id === id ? "mt-2" : "mt-8")} data-testid={`google-tab-${id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold", GOLD_LIGHT)}>{n}</span>
        <h2 className="font-serif text-[20px] font-semibold leading-tight text-ink">{title}</h2>
        {meta && <p className="text-[12.5px] text-ink-mute sm:ml-auto">{meta}</p>}
      </div>
      {children}
    </section>
  );
}

/** The app's card look (border, white, shadow) with this tab's own compact
 * padding and 12px radius — ui/Card's fixed padding would win over it. */
function Box({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-paper-deep bg-white shadow-card", className)} {...rest} />;
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-bold uppercase tracking-[0.14em] text-brass", className)}>{children}</div>;
}

function SampleTag({ className }: { className?: string }) {
  const locale = useLocale();
  return <span className={cn("inline-block align-middle normal-case tracking-normal", SAMPLE_PILL, className)}>{t(locale, K("sample"))}</span>;
}

/** The Google numbers' state in words: loading, couldn't load (with
 * "Try again"), or Google has nothing yet. */
function SyncMessage({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const locale = useLocale();
  const { status, retry } = useContext(SyncContext);
  if (status === "loading")
    return (
      <p role="status" data-testid="google-tab-loading" className={className}>
        {t(locale, K("rate.loading"))}
      </p>
    );
  if (status === "failed")
    return (
      <p role="alert" data-testid="google-tab-load-failed" className={className}>
        {t(locale, K("rate.failed"))}{" "}
        <button type="button" onClick={retry} data-testid="google-tab-retry" className={cn("ml-1 rounded-lg border px-2.5 py-1 align-middle font-sans text-[12.5px] font-semibold", onDark ? "border-white/40 text-white hover:bg-white/10" : "border-paper-line text-ink hover:border-ink-soft")}>
          {t(locale, K("rate.retry"))}
        </button>
      </p>
    );
  return (
    <p data-testid="google-tab-none" className={className}>
      {t(locale, K("rate.empty"))}
    </p>
  );
}

function ComingCard({ body, title, sync = false }: { body: string; title?: string; sync?: boolean }) {
  const locale = useLocale();
  return (
    <Box className="mt-3 flex flex-col gap-1 p-3.5" data-testid="google-tab-coming">
      {sync ? <SyncMessage className="text-[14px] font-semibold text-ink" /> : <p className="text-[14px] font-semibold text-ink">{title ?? t(locale, K("coming"))}</p>}
      <p className="text-[13px] text-ink-soft">{body}</p>
    </Box>
  );
}

const monthName = (month: string, locale: Locale, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
/** "May–Oct 2026" (or "Nov 2025–Apr 2026"): the 6 months ending `last`. */
/** The hero's "How it's calculated" line: only with views to divide by. */
export function howCalculated(interactions: number, views: number): { interactions: number; views: number } | null {
  return views > 0 ? { interactions, views } : null;
}

function spanLabel(last: string, locale: Locale): string {
  const { from, to } = sixMonthSpan(last);
  const y = (m: string) => m.slice(0, 4);
  return y(from) === y(to) ? `${monthName(from, locale, "short")}–${monthName(to, locale, "short")} ${y(to)}` : `${monthName(from, locale, "short")} ${y(from)}–${monthName(to, locale, "short")} ${y(to)}`;
}

const monthYear = (month: string, locale: Locale) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));

// ---------------------------------------------------------------------------
// 1 Last month on Google
// ---------------------------------------------------------------------------

const LEVER_ICON: Record<LeverId, ReactNode> = {
  reviews: <IconStar size={15} aria-hidden />,
  photos: <IconPhoto size={15} aria-hidden />,
  posts: <IconPencil size={15} aria-hidden />,
  deals: <IconDiscount2 size={15} aria-hidden />,
  website: <IconBuildingStore size={15} aria-hidden />,
};

/** The lever's grey status and its pill, in words. */
export function leverText(lever: Lever, locale: Locale): { status: string; pill: string } {
  const p = lever.params;
  const status =
    lever.id === "deals" && lever.status === "running" && p.count === 1
      ? t(locale, K("lever.deals.status.runningOne"))
      : t(locale, K(`lever.${lever.id}.status.${lever.status}`), p);
  const pill = lever.pill === "fixes" ? t(locale, K(p.count === 1 ? "lever.pill.fixesOne" : "lever.pill.fixes"), p) : t(locale, K(`lever.pill.${lever.pill}`), p);
  return { status, pill };
}

/** The last 6 full months' conversion rate: a 0-based scale with faint
 * gridlines, a month under every point, the latest value labelled, the
 * rest on hover/tap, gaps for months with no data. Lines are drawn in a
 * stretched SVG (strokes keep their width); dots and labels are positioned
 * over it so they stay round and sharp at any width. */
const CHART_H = 84;
function RateChartBox({ trend, months }: { trend: Array<{ month: string; rate: number | null }>; months: InsightsMonth[] }) {
  const locale = useLocale();
  const chart = rateChart(trend, CHART_H);
  if (!chart) return null;
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const lastIndex = chart.points.map((p) => p.rate !== null).lastIndexOf(true);
  const summary = chart.points.map((p) => `${monthName(p.month, locale, "short")} ${p.rate === null ? "—" : formatRate(p.rate, locale)}`).join(", ");
  return (
    <div className={cn("rounded-xl border px-3.5 py-3", NAVY_2, NAVY_LINE)} data-testid="google-tab-trend">
      <div className="flex items-baseline justify-between gap-2 text-[11.5px] leading-tight">
        <span className="text-white/65">{trend.length ? spanLabel(trend[trend.length - 1].month, locale) : t(locale, K("rate.trend"))}</span>
        {chart.best && (
          <span className="text-white/80" data-testid="google-tab-trend-best">
            {t(locale, K("rate.best"), { month: monthName(chart.best.month, locale, "short"), rate: formatRate(chart.best.rate, locale) })}
          </span>
        )}
      </div>
      <div className="mt-2 flex" role="img" aria-label={t(locale, K("rate.trendAria"), { values: summary })}>
        {/* Y labels: 0% at the bottom, the top of the scale at the top. */}
        <div className="relative w-7 shrink-0 text-[10px] text-white/45" style={{ height: CHART_H }} aria-hidden>
          {chart.grid.map((g) => (
            <span key={g} className="absolute right-1 -translate-y-1/2" style={{ top: CHART_H - (g / chart.yMax) * CHART_H }}>
              {g}%
            </span>
          ))}
        </div>
        {/* Inset so the first and last month labels don't touch the edges. */}
        <div className="relative min-w-0 flex-1 px-3" aria-hidden>
          <div className="relative" style={{ height: CHART_H }}>
            <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" width="100%" height={CHART_H} className="absolute inset-0 overflow-visible">
              <defs>
                <linearGradient id="rate-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brass)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--color-brass)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {chart.grid.map((g) => (
                <line key={g} x1="0" x2="100" y1={CHART_H - (g / chart.yMax) * CHART_H} y2={CHART_H - (g / chart.yMax) * CHART_H} stroke="white" strokeOpacity={g === 0 ? 0.18 : 0.08} vectorEffect="non-scaling-stroke" />
              ))}
              {chart.segments.map((seg, i) => (
                <g key={i}>
                  <path d={seg.area} fill="url(#rate-area)" />
                  <path d={seg.line} fill="none" stroke="color-mix(in srgb, var(--color-brass) 70%, white)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                </g>
              ))}
            </svg>
            {chart.points.map((p, i) => {
              if (p.y === null || p.rate === null) return null;
              const latest = i === lastIndex;
              const m = byMonth.get(p.month);
              const tip = t(locale, K("rate.tooltip"), { month: monthName(p.month, locale, "short"), rate: formatRate(p.rate, locale), actions: formatCount(m ? actions(m) : 0, locale), viewers: formatCount(m ? totalViews(m) : 0, locale) });
              return (
                <span key={p.month} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: p.y }} data-testid={latest ? "google-tab-trend-latest" : "google-tab-trend-dot"}>
                  {latest && (
                    <span className={cn("absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold", GOLD_LIGHT)}>{formatRate(p.rate, locale)}</span>
                  )}
                  <span
                    tabIndex={latest ? -1 : 0}
                    title={tip}
                    className={cn("block rounded-full outline-none", latest ? "h-2.5 w-2.5 bg-brass ring-2 ring-[color:color-mix(in_srgb,var(--color-ink)_88%,white)]" : "h-1.5 w-1.5 bg-[color:color-mix(in_srgb,var(--color-brass)_70%,white)] focus-visible:ring-2 focus-visible:ring-white/60")}
                  />
                  {!latest && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 text-[11px] text-ink shadow group-hover:block group-focus-within:block">{tip}</span>
                  )}
                </span>
              );
            })}
          </div>
          {/* A month under every point; the latest bold. */}
          <div className="relative mt-1 h-3.5 text-[10.5px] leading-none text-white/50">
            {chart.points.map((p, i) => (
              <span key={p.month} className={cn("absolute -translate-x-1/2", i === lastIndex && "font-semibold text-white/85")} style={{ left: `${p.x}%` }}>
                {monthName(p.month, locale, "short")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The change in plain words, per 100 people: "▼ 3 fewer customers per
 * 100 people than September" — red down, green up; under half a customer
 * per 100 is "About the same as September". Never "points" or "%". */
function PointsChange({ now, before, month }: { now: number; before: number; month: string }) {
  const locale = useLocale();
  const change = per100Change(now, before);
  return (
    <span data-testid="google-tab-points" data-dir={change.dir} className={cn("font-semibold", change.dir === "up" ? "text-[#7fd3a0]" : change.dir === "down" ? "text-[#e8a59b]" : "text-white/70")}>
      {t(locale, K(`rate.per100.${change.dir}`), { count: change.count, month })}
    </span>
  );
}

/** "What that could be worth", honestly: a range (a third to all of last
 * month's customer actions as visits) and what last month's viewers would
 * have meant at the best rate of the last 6 months. Both estimates. */
function WorthBox({ businessId, months, last, averageVisit }: { businessId: string; months: InsightsMonth[]; last: InsightsMonth; averageVisit: number | null }) {
  const locale = useLocale();
  const range = worthRange(actions(last), averageVisit);
  const left = leftOnTable(months, averageVisit);
  const money = (v: number) => `$${formatCount(v, locale)}`;
  const box = "rounded-xl border border-brass px-3.5 py-2.5";
  const style = { backgroundColor: "color-mix(in srgb, var(--color-ink) 88%, white)" };
  if (averageVisit === null || !range) {
    return (
      <div className={cn("mt-2.5", box)} style={style} data-testid="google-tab-worth">
        <Eyebrow className={cn("text-[10.5px]", GOLD_LIGHT)}>{t(locale, K("worth.label"))}</Eyebrow>
        <Link href={`/business/${businessId}/settings#average-visit`} data-testid="google-tab-worth-set" className="text-[12.5px] font-semibold text-white underline decoration-brass underline-offset-2">
          {t(locale, K("worth.setIt"))}
        </Link>
      </div>
    );
  }
  const pills = (
    <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
      <span className="rounded-[5px] bg-white/10 px-1.5 py-0.5 text-[10.5px] text-white/80">{t(locale, K("worth.estimate"))}</span>
      <span tabIndex={0} title={t(locale, K("worth.info"))} aria-label={t(locale, K("worth.info"))} className="cursor-help text-[12px] text-white/60 outline-none focus-visible:ring-1 focus-visible:ring-white/60">
        ⓘ
      </span>
    </span>
  );
  return (
    <div className={cn("mt-2.5 grid gap-x-5 gap-y-2.5 sm:grid-cols-2", box)} style={style} data-testid="google-tab-worth">
      <div>
        <p className="text-[13px] font-semibold leading-snug text-white">
          {t(locale, K("worth.brought"), { low: money(range.low), high: money(range.high) })}
          {pills}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-white/70">{t(locale, K("worth.broughtSub"), { actions: formatCount(actions(last), locale), avg: formatCount(averageVisit, locale) })}</p>
      </div>
      <div data-testid="google-tab-left">
        {left?.kind === "missed" && left.missed !== null ? (
          <>
            <p className="text-[13px] font-semibold leading-snug text-white">
              {t(locale, K("worth.left"), { missed: money(left.missed) })}
              {pills}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-white/70">
              {t(locale, K("worth.leftSub"), { month: monthName(left.best.month, locale), best: formatRate(left.best.rate, locale), views: formatCount(totalViews(last), locale), extra: left.extra })}{" "}
              <a href="#google-tab-levers" className="underline decoration-brass underline-offset-2">
                {t(locale, K("worth.leversLink"))}
              </a>
            </p>
          </>
        ) : left?.kind === "matched" ? (
          <p className="text-[13px] font-semibold leading-snug text-white">{t(locale, K("worth.matched"))}</p>
        ) : null}
      </div>
    </div>
  );
}

function LastMonthSection(props: GoogleProfileTabProps & { months: InsightsMonth[]; sample: boolean }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const { months, sample } = props;
  const { last, prev } = lastTwo(months);
  const rate = last ? conversionRate(actions(last), totalViews(last)) : null;
  const prevRate = prev ? conversionRate(actions(prev), totalViews(prev)) : null;
  const small = isSmallMonth(last);
  const trend = rateTrend(months);
  const next = formatShortDate(nextMonthlyUpdate(new Date(), timeZone), locale, "UTC").replace(/,? \d{4}$/, "");
  const ls = levers({
    businessId: props.businessId,
    replies: props.replyCounts ? { replied: props.replyCounts.replied, inWindow: props.replyCounts.reviewsInWindow } : null,
    couponsRunning: props.saved?.couponsRunning ?? 0,
    website: props.website,
    media: props.media ?? null,
  });
  const meta = last && prev ? t(locale, K("s1.meta"), { month: monthYear(last.month, locale), previous: monthName(prev.month, locale) }) : last ? monthYear(last.month, locale) : t(locale, K("monthly"));
  const averageVisit = sample ? SAMPLE_AVERAGE_VISIT : (props.averageVisit ?? null);
  const of = last ? { actions: formatCount(actions(last), locale), viewers: formatCount(totalViews(last), locale) } : null;

  return (
    <SectionHead n={1} id="last-month" title={t(locale, K("s1.title"))} meta={meta}>
      <div className="mt-3 rounded-2xl bg-ink px-3.5 py-3 text-white sm:px-[18px] sm:py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow className={GOLD_LIGHT}>
            {t(locale, K("rate.label"))}
            {sample && <SampleTag className="ml-2" />}
          </Eyebrow>
          <span className={cn("rounded-full border px-2.5 py-1 text-[12px] text-white/80", NAVY_LINE)}>{t(locale, K("rate.pill"), { date: next })}</span>
        </div>

        {rate !== null && last && of ? (
          <div className="mt-2 grid items-center gap-4 sm:grid-cols-[1.3fr_1fr]" data-testid="google-tab-rate">
            <div>
              <div className={cn("font-serif text-[40px] font-semibold leading-none sm:text-[46px]", GOLD_LIGHT)}>{formatRate(rate, locale)}</div>
              <p className="mt-1.5 max-w-[520px] text-[13px] leading-snug text-white/85">{t(locale, K("rate.sentence"))}</p>
              {howCalculated(actions(last), totalViews(last)) && (
                <p data-testid="google-tab-rate-how" className={cn("mt-1.5 w-fit max-w-[560px] rounded-lg px-2.5 py-1 text-[12.5px] leading-snug text-white/85", NAVY_2)}>
                  {t(locale, K("rate.how"), { interactions: formatCount(actions(last), locale), views: formatCount(totalViews(last), locale) })}{" "}
                  <span title={t(locale, K("rate.howTip"))} aria-label={t(locale, K("rate.howTip"))} className="cursor-help text-white/70">
                    ⓘ
                  </span>
                </p>
              )}
              {/* Both months' own ratios, and the change in percentage points. */}
              <div data-testid="google-tab-rate-change" className="mt-1.5 text-[12.5px] leading-snug">
                <p className="font-semibold text-white/90">{t(locale, K("rate.monthLine"), { month: monthName(last.month, locale), rate: formatRate(rate, locale), ...of })}</p>
                {prev && prevRate !== null && (
                  <p className="text-white/70">{t(locale, K("rate.monthLine"), { month: monthName(prev.month, locale), rate: formatRate(prevRate, locale), actions: formatCount(actions(prev), locale), viewers: formatCount(totalViews(prev), locale) })}</p>
                )}
                {/* The change, on its own line. */}
                {prev && prevRate !== null && !small && (
                  <p>
                    <PointsChange now={rate} before={prevRate} month={monthName(prev.month, locale)} />
                  </p>
                )}
                {small && <p className="text-white/70">{t(locale, K("rate.small"))}</p>}
              </div>
            </div>
            <RateChartBox trend={trend} months={months} />
          </div>
        ) : (
          <div className="mt-2.5" data-testid="google-tab-rate-empty">
            <SyncMessage className={cn("font-serif text-[22px] font-semibold leading-snug", GOLD_LIGHT)} onDark />
            <p className="mt-1.5 max-w-[620px] text-[13px] leading-snug text-white/75">{t(locale, K("rate.emptyBody"))}</p>
          </div>
        )}

        <div id="google-tab-levers" className="mt-3 scroll-mt-20 rounded-xl bg-white px-[13px] py-[11px] text-ink" data-testid="google-tab-levers">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
            <b className="text-[14px]">{t(locale, K("raise.title"))}</b>
            <span className="text-[12px] text-ink-mute">{t(locale, K("raise.sub"))}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-[repeat(5,minmax(0,1fr))]">
            {ls.map((lever) => (
              <LeverBox key={lever.id} lever={lever} />
            ))}
          </div>
          <RecapLine saved={props.saved} />
          <p className="mt-1.5 text-[10.5px] text-ink-mute">{t(locale, K("sources"))}</p>
        </div>

        {last ? (
          <>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="google-tab-kpis">
              {(["calls", "directions", "bookings", "websiteClicks"] as const).map((k) => {
                const d = prev ? last[k] - prev[k] : null;
                return (
                  <div key={k} className={cn("rounded-xl border px-3 py-2", NAVY_2, NAVY_LINE)}>
                    <small className="block truncate text-[11.5px] leading-tight text-white/65">{t(locale, K(`kpi.${k}`))}</small>
                    <span className="mt-0.5 flex items-baseline gap-1.5">
                      <b className="font-serif text-[22px] font-semibold leading-none">{formatCount(last[k], locale)}</b>
                      {d !== null && d !== 0 && prev && (
                        <em className={cn("text-[12px] not-italic", d > 0 ? "text-[#7fd3a0]" : "text-[#e8a59b]")}>
                          {d > 0 ? `▲${d}` : `▼${-d}`} <span className="text-white/60">{t(locale, K("kpi.vsMonth"), { month: monthName(prev.month, locale, "short") })}</span>
                        </em>
                      )}
                    </span>
                    {/* Booked in Google at 0: why (case A), or what to turn on (case B). */}
                    {k === "bookings" && last.bookings === 0 && props.booking?.tracking.kind === "partner_not_counted" && (
                      <small data-testid="booking-tile-note" className="mt-1 block text-[11px] leading-snug text-white/65">
                        {t(locale, K("booking.notCountedA"), { provider: props.booking.tracking.provider })}
                      </small>
                    )}
                    {k === "bookings" && last.bookings === 0 && props.booking?.tracking.kind === "turn_on" && (
                      <a href="#edit-booking-steps" data-testid="booking-tile-note" className="mt-1 block text-[11px] leading-snug text-[#f2d49a] underline underline-offset-2">
                        {t(locale, K("booking.tileB"), { partner: props.booking.tracking.provider })}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <WorthBox businessId={props.businessId} months={months} last={last} averageVisit={averageVisit} />
          </>
        ) : (
          <div className={cn("mt-2.5 rounded-xl border px-3 py-2 text-[12.5px] text-white/75", NAVY_2, NAVY_LINE)} data-testid="google-tab-kpis-empty">
            {t(locale, K("kpi.empty"))}
          </div>
        )}
      </div>
    </SectionHead>
  );
}

function LeverBox({ lever }: { lever: Lever }) {
  const locale = useLocale();
  const text = leverText(lever, locale);
  const inner = (
    <>
      <span className="flex items-center gap-[7px]">
        <span className={cn("hidden h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-brass xl:flex", CREAM)}>{LEVER_ICON[lever.id]}</span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <b className="truncate text-[12.5px]">{t(locale, K(`lever.${lever.id}.title`))}</b>
          <small className="line-clamp-2 text-[11px] leading-tight text-ink-mute">{text.status}</small>
        </span>
        <span data-testid={`lever-pill-${lever.id}`} data-tone={lever.tone} className={cn("shrink-0 self-start whitespace-nowrap rounded-full px-1.5 py-px text-[10.5px] font-bold", TONE_PILL[lever.tone])}>
          {text.pill}
        </span>
      </span>
      <span className="line-clamp-2 border-t border-dashed border-paper-line pt-1 text-[10.5px] leading-snug text-ink-mute">{t(locale, K(`lever.${lever.id}.why`))}</span>
    </>
  );
  const cls = "flex min-w-0 flex-col gap-1 rounded-[10px] border border-paper-line px-2 py-1.5 text-ink hover:border-brass hover:bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)]";
  return lever.href.startsWith("#") ? (
    <a href={lever.href} className={cls} data-testid={`lever-${lever.id}`}>
      {inner}
    </a>
  ) : (
    <Link href={lever.href} className={cls} data-testid={`lever-${lever.id}`}>
      {inner}
    </Link>
  );
}

/** "Last month you: … Not yet: …" from the real logs. */
export function recapSentence(saved: GoogleTabSaved | null, locale: Locale): { did: string; notYet: string | null } {
  const did = saved?.recap.did ?? [];
  const parts = did.map((d) => (d.count !== undefined ? t(locale, K(`recap.${d.key}${d.count === 1 ? "One" : ""}`), { count: d.count }) : t(locale, K(`recap.${d.key}`))));
  const notYet = (saved?.recap.notYet ?? []).map((k) => t(locale, K(`recap.not.${k}`)));
  return { did: parts.length > 0 ? parts.join(" · ") : t(locale, K("recap.nothing")), notYet: notYet.length > 0 ? notYet.join(", ") : null };
}

function RecapLine({ saved }: { saved: GoogleTabSaved | null }) {
  const locale = useLocale();
  const s = recapSentence(saved, locale);
  return (
    <p data-testid="google-tab-recap" className={cn("mt-2 rounded border-l-[3px] border-brass px-2.5 py-1.5 text-[12.5px] leading-snug text-ink-soft", CREAM)}>
      <b className="text-ink">{t(locale, K("recap.did"))}</b> {s.did}.{" "}
      {s.notYet && (
        <>
          <b className="text-ink">{t(locale, K("recap.notYetLabel"))}</b> {s.notYet}.{" "}
        </>
      )}
      {t(locale, K("recap.tail"))}
    </p>
  );
}

// ---------------------------------------------------------------------------
// 2 How searches became customers · 3 What people searched · 5 Show up for more
// ---------------------------------------------------------------------------

function Bar({ share, navy = false, thin = false }: { share: number; navy?: boolean; thin?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded bg-paper-deep", thin ? "h-2" : "h-[14px]")}>
      <i className={cn("absolute inset-y-0 left-0 rounded", navy ? "bg-ink" : "bg-brass")} style={{ width: `${Math.max(1, Math.min(100, share * 100))}%` }} />
    </div>
  );
}

/** The donut's colors, in AUDIENCE_ROWS order: navy, gold, light gold, grey. */
const AUDIENCE_COLORS = ["var(--color-ink)", "var(--color-brass)", "color-mix(in srgb, var(--color-brass) 50%, white)", "color-mix(in srgb, var(--color-ink-mute) 45%, white)"];

function Donut({ parts }: { parts: number[] }) {
  const total = parts.reduce((a, b) => a + b, 0) || 1;
  const r = 15.9155; // circumference 100
  let offset = 25;
  return (
    <svg viewBox="0 0 42 42" width="90" height="90" aria-hidden className="shrink-0">
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--color-paper-deep)" strokeWidth="7" />
      {parts.map((p, i) => {
        const len = (p / total) * 100;
        const el = <circle key={i} cx="21" cy="21" r={r} fill="none" stroke={AUDIENCE_COLORS[i]} strokeWidth="7" strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={offset} />;
        offset -= len;
        return el;
      })}
    </svg>
  );
}

/** A card header: the title, and the time period its numbers cover. */
function CardHead({ title, period, extra }: { title: string; period: string; extra?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h4 className="text-[13px] font-semibold">
        {title}
        {extra}
      </h4>
      <span className="shrink-0 text-[11.5px] text-ink-mute" data-testid="card-period">
        {period}
      </span>
    </div>
  );
}

/** "Who saw you": people and interactions over the last 6 months. */
/** "Who saw you": this period vs the same 6 calendar months a year
 * earlier, as a small table (views, interactions, customers per 100
 * viewers), then one fixed takeaway from the two directions. */
function WhoCard({ a, sample, span }: { a: Audience; sample: boolean; span: string }) {
  const locale = useLocale();
  const table = whoTable(a);
  if (!table) return null;
  const lastSpan = spanLabel(table.lastTo, locale);
  const history = table.rows[0].last !== null;
  const cell = "px-1.5 py-1 text-right tabular-nums";
  const changeText = (r: WhoRow) => {
    if (!r.change) return t(locale, K("who.noHistory"));
    if (r.change.kind === "more") return r.change.value === 0 ? t(locale, K("who.same")) : t(locale, K(r.change.value > 0 ? "who.more" : "who.fewer"), { count: Math.abs(r.change.value) });
    return r.change.value === 0 ? "0%" : `${Math.abs(r.change.value)}%`;
  };
  return (
    <div className="rounded-xl border border-paper-line p-3" data-testid="google-tab-who">
      <CardHead title={t(locale, K("s2.whoTitle"))} period={history ? t(locale, K("who.vs"), { now: span, last: lastSpan }) : span} extra={sample ? <SampleTag className="ml-2" /> : undefined} />
      <table className="mt-2 w-full text-[12.5px]" data-testid="google-tab-who-table">
        <thead>
          <tr className="text-[11px] text-ink-mute">
            <th className="py-1 pr-1.5 text-left font-semibold" />
            <th className={cn(cell, "font-semibold")}>{span}</th>
            <th className={cn(cell, "font-semibold")}>{lastSpan}</th>
            <th className={cn(cell, "pr-0 font-semibold")}>{t(locale, K("who.change"))}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => {
            const up = r.change && r.change.value > 0;
            const down = r.change && r.change.value < 0;
            return (
              <tr key={r.id} className="border-t border-paper-line/60" data-testid={`who-row-${r.id}`}>
                <td className="py-1 pr-1.5 text-ink-soft">
                  {r.id === "interactions" ? (
                    <span title={t(locale, K("who.interactionsTip"))} className="cursor-help underline decoration-dotted underline-offset-2">
                      {t(locale, K("who.interactions"))}
                    </span>
                  ) : (
                    t(locale, K(`who.${r.id}`))
                  )}
                </td>
                <td className={cn(cell, "font-semibold text-ink")}>{formatCount(r.now, locale)}</td>
                <td className={cn(cell, "text-ink-soft")}>{r.last === null ? "—" : formatCount(r.last, locale)}</td>
                <td className={cn(cell, "whitespace-nowrap pr-0 font-semibold", !r.change ? "font-normal text-ink-mute" : up ? "text-green" : down ? "text-red" : "text-ink-mute")} data-testid={`who-change-${r.id}`}>
                  {r.change && (up || down) && <span aria-hidden>{up ? "▲ " : "▼ "}</span>}
                  {changeText(r)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {a.small && <p className="mt-1.5 text-[12px] text-ink-mute">{t(locale, K("rate.small"))}</p>}
      {table.takeaway && !a.small && (
        <p className="mt-1.5 text-[12.5px] text-ink" data-testid="google-tab-who-takeaway">
          {t(locale, K(`who.takeaway.${table.takeaway}`))}
        </p>
      )}
      <p className="mt-1.5 text-[11.5px] text-ink-mute">{t(locale, K("s2.counted"))}</p>
      <p className="mt-0.5 text-[11.5px] text-ink-mute">{t(locale, K("s2.otherRange"))}</p>
    </div>
  );
}

/** "Devices and platforms": the same 6 months' views in 4 parts (adding up
 * to the "Who saw you" total, labels never cut off), the phone / computer
 * and Search / Maps split, and "What this means for you" from the real
 * numbers and checks. */
function DevicesCard({ a, className, span, props }: { a: Audience; className?: string; span: string; props: GoogleProfileTabProps }) {
  const locale = useLocale();
  const split = deviceSplit(a.rows);
  const now = Date.now();
  const extras = props.extras ?? null;
  const holiday = extras ? upcomingHolidays(new Date(now)).find((h) => !specialFor(extras.specialPeriods, h.date)) : undefined;
  const speed = props.checks.find((c) => c.id === "website.performance_mobile");
  const advice = deviceAdvice(split, {
    businessId: props.businessId,
    tapToCall: props.websiteHours?.hasPhoneLink ?? null,
    mobileSlow: speed && speed.earnedPoints !== null ? speed.earnedPoints < speed.maxPoints : null,
    bookingLink: !!props.booking && props.booking.link.kind !== "none",
    descriptionLength: extras && extras.description !== undefined ? (extras.description ?? "").trim().length : null,
    photosFresh: props.media?.photos ? !!props.media.photos.newestAt && isFresh(props.media.photos.newestAt, now) : null,
    holidayUnset: holiday?.id ?? null,
    listingRead: !!extras,
  });
  return (
    <div className={cn("flex flex-col rounded-xl border border-paper-line p-3", className)} data-testid="google-tab-devices">
      <CardHead title={t(locale, K("s2.devices"))} period={span} />
      <div className="mt-1.5 flex flex-col items-center gap-3 lg:flex-row lg:items-start">
        <Donut parts={a.rows.map((r) => r.count)} />
        <ul className="w-full min-w-0 flex-1 text-[12.5px]">
          {a.rows.map((r, i) => (
            <li key={r.id} data-testid={`google-tab-device-${r.id}`} className="flex items-start justify-between gap-2 py-0.5">
              <span className="flex min-w-0 items-start gap-1.5">
                <i className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: AUDIENCE_COLORS[i] }} />
                <span className="leading-tight">
                  <b className="block font-semibold text-ink">{t(locale, K(`s2.platform.${r.id.startsWith("search") ? "search" : "maps"}`))}</b>
                  <span className="text-[11.5px] text-ink-mute">{t(locale, K(`s2.device.${r.id.endsWith("Phone") ? "phone" : "computer"}`))}</span>
                </span>
              </span>
              <b className="whitespace-nowrap text-right font-semibold">
                {formatCount(r.count, locale)} · {r.percent}%
              </b>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-paper px-2.5 py-2 text-[12px]" data-testid="google-tab-device-split">
        <p>
          <b className="font-serif text-[17px] font-semibold text-ink">{split.phone}%</b> {t(locale, K("s2.split.phone"))}
          <span className="block text-ink-mute">{t(locale, K("s2.split.computer"), { percent: split.computer })}</span>
        </p>
        <p>
          <b className="font-serif text-[17px] font-semibold text-ink">{split.search}%</b> {t(locale, K("s2.split.search"))}
          <span className="block text-ink-mute">{t(locale, K("s2.split.maps"), { percent: split.maps })}</span>
        </p>
      </div>
      {advice.length === 0 && (split.phone >= 60 || split.search >= 50 || split.maps >= 25) && (
        // Nothing to check yet (no listing or website read): the plain facts.
        <div className="mt-2.5 flex-1" data-testid="google-tab-advice">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brass">{t(locale, K("s2.means"))}</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-ink-soft">
            {(["phone", "search", "maps"] as const)
              .filter((g) => (g === "phone" ? split.phone >= 60 : g === "search" ? split.search >= 50 : split.maps >= 25))
              .map((g) => (
                <li key={g}>{t(locale, K(`s2.lead.${g}`), { tenths: Math.round(split.maps / 10) })}</li>
              ))}
          </ul>
        </div>
      )}
      {advice.length > 0 && (
        <div className="mt-2.5 flex-1" data-testid="google-tab-advice">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brass">{t(locale, K("s2.means"))}</p>
          <ul className="mt-1 flex flex-col gap-1.5 text-[12.5px]">
            {advice.map((it, i) => {
              const firstOfGroup = advice.findIndex((x) => x.group === it.group) === i;
              const text = t(locale, K(`s2.advice.${it.key}`), it.holiday ? { holiday: t(locale, K(`fields.holiday.${it.holiday}`)) } : undefined);
              return (
                <li key={`${it.group}-${it.key}`} data-testid={`advice-${it.key}`} data-status={it.status}>
                  {firstOfGroup && <span className="block text-ink-soft">{t(locale, K(`s2.lead.${it.group}`), { tenths: Math.round(split.maps / 10) })}</span>}
                  <span className="flex items-start gap-1.5">
                    <span aria-hidden className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", it.status === "ok" ? "bg-green" : "bg-amber")}>
                      {it.status === "ok" ? "✓" : "!"}
                    </span>
                    {it.href ? (
                      it.href.startsWith("#") ? (
                        <a href={it.href} className="font-semibold text-ink underline underline-offset-2">
                          {text}
                        </a>
                      ) : (
                        <Link href={it.href} className="font-semibold text-ink underline underline-offset-2">
                          {text}
                        </Link>
                      )
                    ) : (
                      <span className="font-semibold text-ink">{text}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function FunnelSection({ months, sample, who, props }: { months: InsightsMonth[]; sample: boolean; who: Audience | null; props: GoogleProfileTabProps }) {
  const locale = useLocale();
  const { last } = lastTwo(months);
  if (!last) {
    return (
      <SectionHead n={2} id="funnel" title={t(locale, K("s2.title"))} meta={t(locale, K("monthly"))}>
        <ComingCard body={t(locale, K("s2.empty"))} sync />
      </SectionHead>
    );
  }
  const views = totalViews(last);
  const acted = actions(last);
  const span = spanLabel(last.month, locale);
  const six = lastSixMonths(months);
  const max = Math.max(1, ...six.map(actions));
  const days = callsByDays(six);
  const share = (v: number, of: number) => (of > 0 ? v / of : 0);
  return (
    <SectionHead n={2} id="funnel" title={t(locale, K("s2.title"))} meta={`${monthYear(last.month, locale)} · ${t(locale, K("monthly"))}`}>
      <Box className="mt-3 p-3.5">
        <CardHead title={t(locale, K("s2.funnel"))} period={monthYear(last.month, locale)} extra={sample ? <SampleTag className="ml-2" /> : undefined} />
        {[
          { label: t(locale, K("s2.saw")), sub: t(locale, K("s2.sawSub")), value: views, share: 1, navy: false },
          { label: t(locale, K("s2.acted")), sub: t(locale, K("s2.actedSub")), value: acted, share: share(acted, views), navy: true },
          { label: t(locale, K("s2.called")), sub: t(locale, K("s2.calledSub"), { percent: Math.round(share(last.calls, acted) * 100) }), value: last.calls, share: share(last.calls, views), navy: true },
        ].map((s) => (
          <div key={s.label} className="my-2 grid grid-cols-[1fr_60px] items-center gap-x-3 gap-y-1 sm:grid-cols-[170px_1fr_70px]">
            <span className="text-[13px] font-semibold leading-tight">
              {s.label}
              <small className="block text-[11.5px] font-normal text-ink-mute">{s.sub}</small>
            </span>
            <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
              <Bar share={s.share} navy={s.navy} />
            </div>
            <b className="text-right font-serif text-[18px] leading-none">{formatCount(s.value, locale)}</b>
          </div>
        ))}

        {/* Left: who saw you, then which days they call; right: devices — same height, no gaps. */}
        <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-2">
          {/* The left column's last card stretches, so both columns end together. */}
          <div className="flex flex-col gap-3 [&>*:last-child]:flex-1">
            {who && <WhoCard a={who} sample={sample} span={span} />}
            <div className="flex-1 rounded-xl border border-paper-line p-3" data-testid="google-tab-days">
              <CardHead title={t(locale, K("s2.days"))} period={span} />
              {days ? (
                <div className="mt-1.5">
                  {(["midweek", "weekend", "sunMon"] as const).map((g) => (
                    <div key={g} className="my-1 grid grid-cols-[96px_1fr_44px] items-center gap-2 text-[12.5px]">
                      <span className="text-ink-soft">{t(locale, K(`s2.dayGroup.${g}`))}</span>
                      <Bar share={share(days.groups[g], days.groups.midweek + days.groups.weekend + days.groups.sunMon)} thin />
                      <b className="text-right">{formatCount(days.groups[g], locale)}</b>
                    </div>
                  ))}
                  <p className="mt-1.5 text-[12px] text-ink-mute">{t(locale, K(`s2.dayTip.${days.top}`))}</p>
                </div>
              ) : (
                <p className="mt-1.5 text-[12.5px] text-ink-mute">{t(locale, K("s2.noCalls"))}</p>
              )}
            </div>
          </div>
          {who && <DevicesCard a={who} className="h-full" span={span} props={props} />}
        </div>

        <div className="mt-3 rounded-xl border border-paper-line p-3">
          <CardHead title={t(locale, K("s2.trendTitle"))} period={span} />
          <div className="mt-1 flex h-[110px] items-end gap-3 border-b border-paper-line px-1.5 pt-2 sm:gap-[22px]">
            {six.map((m) => {
              const h = (v: number) => Math.round((v / max) * 98);
              return (
                <div key={m.month} className="flex flex-1 flex-col items-center">
                  <div className="flex w-full max-w-[22px] flex-col-reverse overflow-hidden rounded-t-md" style={{ height: h(actions(m)) }}>
                    <i className="block bg-ink" style={{ height: h(m.calls) }} />
                    <i className="block bg-brass" style={{ height: h(m.directions) }} />
                    <i className="block bg-[color:color-mix(in_srgb,var(--color-brass)_55%,white)]" style={{ height: h(m.bookings + m.websiteClicks) }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 px-1.5 pt-1.5 sm:gap-[22px]">
            {six.map((m) => (
              <span key={m.month} className="flex-1 text-center text-[12px] text-ink-mute">
                {monthName(m.month, locale, "short")}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-ink-mute">
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-ink align-[-1px]" />
              {t(locale, K("kpi.calls"))}
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-brass align-[-1px]" />
              {t(locale, K("kpi.directions"))}
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-[color:color-mix(in_srgb,var(--color-brass)_55%,white)] align-[-1px]" />
              {t(locale, K("s2.otherActions"))}
            </span>
          </div>
        </div>
      </Box>
    </SectionHead>
  );
}

function SearchesSection({ months, sample }: { months: InsightsMonth[]; sample: boolean }) {
  const locale = useLocale();
  const { last } = lastTwo(months);
  if (!last) {
    return (
      <SectionHead n={3} id="searches" title={t(locale, K("s3.title"))} meta={t(locale, K("monthly"))}>
        <ComingCard body={t(locale, K("s3.empty"))} sync />
      </SectionHead>
    );
  }
  const terms = (last.topKeywords ?? []).slice(0, 5);
  const max = terms[0]?.count ?? 1;
  return (
    <SectionHead n={3} id="searches" title={t(locale, K("s3.title"))} meta={t(locale, K("s3.meta"), { month: monthYear(last.month, locale) })}>
      <Box className="mt-3 p-3.5" data-testid="google-tab-terms">
        {sample && <SampleTag className="mb-1" />}
        {terms.length === 0 ? (
          <p className="text-[13px] text-ink-soft">{t(locale, K("s3.none"), { month: monthYear(last.month, locale) })}</p>
        ) : (
          terms.map((s, i) => (
            <div key={s.term} className="grid grid-cols-[28px_1fr_70px] items-center gap-2.5 border-t border-paper-line/70 py-1.5 text-[13px] leading-5 first:border-t-0 sm:grid-cols-[28px_1fr_120px_70px]">
              <span className="text-ink-mute">{i + 1}</span>
              <span className="min-w-0 break-words">{s.term}</span>
              <div className="hidden h-2 overflow-hidden rounded bg-paper-deep sm:block">
                <i className="block h-full bg-brass" style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
              <b className="text-right">{formatCount(s.count, locale)}</b>
            </div>
          ))
        )}
        <p className="mt-2 text-[12px] text-ink-mute">{t(locale, K("s3.noteReal"))}</p>
      </Box>
    </SectionHead>
  );
}

function ideaText(idea: Idea, locale: Locale): { title: string; pill: string; reason: string; button: string } {
  const k = (s: string, p?: Record<string, string | number>) => t(locale, K(`ideas.${idea.id}.${s}`), p);
  switch (idea.id) {
    case "services": {
      const names = idea.missing.map((m) => m.service).join(", ");
      const terms = idea.missing.flatMap((m) => m.terms).slice(0, 3).map((x) => `“${x}”`).join(", ");
      return { title: k("title", { list: names }), pill: t(locale, K("ideas.reach"), { count: formatCount(idea.searches, locale) }), reason: k("reason", { terms, count: formatCount(idea.searches, locale) }), button: k("button") };
    }
    case "description":
      return { title: k("title"), pill: k("pill"), reason: idea.length === 0 ? k("reasonNone") : k("reason", { count: idea.length, text: idea.text.length > 60 ? `${idea.text.slice(0, 59)}…` : idea.text }), button: k("button") };
    case "holiday": {
      const name = t(locale, K(`fields.holiday.${idea.holiday}`));
      const date = formatShortDate(`${idea.date}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "");
      return { title: k("title", { holiday: name }), pill: k("pill"), reason: k(idea.daysAway === 1 ? "reasonOne" : "reason", { holiday: name, date, count: idea.daysAway }), button: k("button") };
    }
    case "posts":
      return { title: k("title"), pill: k("pill"), reason: k("reason", { topic: t(locale, K(`ideas.posts.topic.${idea.topic}`)) }), button: k("button") };
    case "photos":
      return { title: k("title"), pill: k("pill"), reason: idea.monthsOld === null ? k("reasonNone") : k(idea.monthsOld === 1 ? "reasonOne" : "reason", { count: idea.monthsOld }), button: k("button") };
    case "details": {
      const which = idea.missing.length === 2 ? "both" : idea.missing[0];
      return { title: k(`title.${which}`), pill: k("pill"), reason: k(`reason.${which}`), button: k("button") };
    }
    case "messaging":
      return { title: k("title"), pill: k("pill"), reason: k("reason"), button: k("button") };
    case "extras":
      return { title: k("title"), pill: k("pill"), reason: k("reason", { list: idea.names.map((n) => n.toLowerCase()).join(", ") }), button: k("button") };
    case "category":
      return { title: k("title", { category: idea.category }), pill: t(locale, K("ideas.reach"), { count: formatCount(idea.searches, locale) }), reason: k("reason", { terms: idea.terms.slice(0, 2).map((x) => `“${x}”`).join(", "), category: idea.category }), button: k("button") };
    case "booking":
      return { title: t(locale, K("booking.ideaTitle")), pill: t(locale, K("booking.ideaPill")), reason: t(locale, K("booking.ideaBody"), { partner: idea.provider }), button: t(locale, K("action.turnOnBooking")) };
  }
}

function IdeaCard({ idea, n }: { idea: Idea; n: number }) {
  const locale = useLocale();
  const x = ideaText(idea, locale);
  const a = idea.action;
  const cls = "inline-flex h-[30px] items-center whitespace-nowrap rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper";
  return (
    <Box className="grid items-start gap-3 px-3.5 py-3 sm:grid-cols-[24px_1fr_auto]" data-testid={`google-tab-idea-${idea.id}`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-brass text-[11.5px] font-bold text-brass">{n}</span>
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold leading-snug">
          {x.title}
          <span className="rounded-full bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] px-2 py-0.5 text-[11px] font-bold text-green">{x.pill}</span>
        </h3>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">{x.reason}</p>
      </div>
      {a.kind === "editor" ? (
        <a href={a.hash} className={cls}>
          {x.button}
        </a>
      ) : a.external ? (
        <a href={a.href} target="_blank" rel="noopener noreferrer" className={cls}>
          {x.button}
        </a>
      ) : (
        <Link href={a.href} className={cls}>
          {x.button}
        </Link>
      )}
    </Box>
  );
}

function NextSection(props: GoogleProfileTabProps & { sample: boolean }) {
  const locale = useLocale();
  const [more, setMore] = useState(false);
  const sampleList = sampleIdeas(props.listing.categories ?? null);
  const extras = props.extras ?? null;
  const ideas = listingIdeas({
    businessId: props.businessId,
    now: Date.now(),
    type: ideaTypeOf(props.nicheId ?? null, extras?.categories ?? props.listing.categories ?? []),
    months: props.insights ?? [],
    listing: extras ? { services: extras.services, categories: extras.categories, description: extras.description ?? null, specialPeriods: extras.specialPeriods, attributeIds: extras.attributeIds ?? null, details: extras.details ?? null } : null,
    photos: props.media?.photos ?? null,
    posts: props.media?.posts ?? null,
    messagingOn: props.messagingOn,
    bookingTurnOn: props.booking?.tracking.kind === "turn_on" ? { provider: props.booking.tracking.provider } : null,
  });
  const done = doneSinceScan(props.saved?.made ?? [], props.lastScanAt);
  const open = ideas.filter((i) => !done.includes(i.id));
  const shown = more ? open : open.slice(0, MAX_IDEAS);
  // Practice mode with no real numbers yet: the labelled samples.
  const sample = props.sample && !extras && open.length === 0;
  return (
    <SectionHead n={5} id="next" title={t(locale, K("s5.title"))} meta={t(locale, K("s5.meta"))}>
      {sample && sampleList.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2" data-testid="google-tab-ideas">
          {sampleList.map((n, i) => (
            <Box key={n} className="grid items-start gap-3 px-3.5 py-3 sm:grid-cols-[24px_1fr]" data-testid={`google-tab-idea-${n}`}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-brass text-[11.5px] font-bold text-brass">{i + 1}</span>
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold leading-snug">
                  {t(locale, K(`s5.sample${n}.title`))}
                  <span className="rounded-full bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] px-2 py-0.5 text-[11px] font-bold text-green">{t(locale, K(`s5.sample${n}.tag`))}</span>
                  <SampleTag />
                </h3>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">
                  {t(locale, K(`s5.sample${n}.body`))} {t(locale, K(`s5.sample${n}.why`))}
                </p>
              </div>
            </Box>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2" data-testid="google-tab-ideas">
          {shown.map((idea, i) => (
            <IdeaCard key={idea.id} idea={idea} n={i + 1} />
          ))}
          {done.map((id) => (
            <Box key={`done-${id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]" data-testid={`google-tab-idea-done-${id}`}>
              <span className="text-ink-soft">{t(locale, K(`ideas.done.${id}`))}</span>
              <b className="text-green">{t(locale, K("ideas.doneMark"))}</b>
            </Box>
          ))}
          {open.length > MAX_IDEAS && (
            <button type="button" onClick={() => setMore(!more)} className="w-fit text-[12.5px] font-semibold text-ink underline underline-offset-2" data-testid="ideas-more">
              {more ? t(locale, K("ideas.fewer")) : t(locale, K("ideas.more"), { count: open.length - MAX_IDEAS })}
            </button>
          )}
          {open.length === 0 && done.length === 0 && (
            <Box className="px-3.5 py-3 text-[13px] text-ink-soft" data-testid="google-tab-ideas-none">
              {t(locale, K(extras ? "ideas.none" : "ideas.noRead"))}
            </Box>
          )}
          <p className="text-[12px] text-ink-mute">{t(locale, K("ideas.recapLink.before"))} <Link href={`/business/${props.businessId}/growth`} className="font-semibold text-ink underline underline-offset-2">{t(locale, K("ideas.recapLink.link"))}</Link></p>
        </div>
      )}
    </SectionHead>
  );
}

// ---------------------------------------------------------------------------
// 4 Your listing
// ---------------------------------------------------------------------------

const EDITOR_ROW: Record<Editor, string> = {
  holiday: "holiday",
  services: "services",
  photos: "photos",
  booking_steps: "booking",
  booking_partner: "booking",
  hours: "hours",
  phone: "phone",
  description: "description",
  website: "website",
  customer_details: "customerDetails",
  booking: "booking",
  messaging: "messaging",
};

type LiveValue = { kind: "loading" } | { kind: "error" } | { kind: "none" } | { kind: "notOffered" } | { kind: "value"; value: string };
export type LiveValues = { description: LiveValue; booking: LiveValue };

/** The description and booking link, read from Google after the page loads
 * (the editors' own read-only open calls; practice mode: the sample Google). */
function useLiveValues(businessId: string): LiveValues {
  const [live, setLive] = useState<LiveValues>({ description: { kind: "loading" }, booking: { kind: "loading" } });
  useEffect(() => {
    let alive = true;
    void (async () => {
      // Any failure, even one thrown before a call returns, is "couldn't load" — never an endless shimmer.
      const safe = async <T,>(read: () => Promise<T>): Promise<T | null> => {
        try {
          return await read();
        } catch {
          return null;
        }
      };
      const [profile, order] = await Promise.all([safe(() => openProfileEdits(businessId)), safe(() => openOrderLink(businessId))]);
      if (!alive) return;
      const description: LiveValue = profile?.status === "ok" ? (profile.description ? { kind: "value", value: profile.description } : { kind: "none" }) : { kind: "error" };
      const own = order?.status === "ok" ? (order.links.find((l) => l.editable) ?? order.links[0] ?? null) : null;
      const booking: LiveValue = order?.status === "none" ? { kind: "notOffered" } : order?.status === "ok" ? (own ? { kind: "value", value: own.uri } : { kind: "none" }) : { kind: "error" };
      setLive({ description, booking });
    })();
    return () => {
      alive = false;
    };
  }, [businessId]);
  return live;
}

function ListingSection(props: GoogleProfileTabProps) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const groups = listingGroups({
    businessId: props.businessId,
    checks: props.checks,
    phone: props.listing.phone,
    website: props.listing.website,
    category: props.listing.category,
    openingHours: props.listing.openingHours,
    photoCount: props.listing.photoCount,
    rating: props.listing.rating,
    reviewCount: props.listing.reviewCount,
    messagingOn: props.messagingOn,
    replies: props.replyCounts ? { replied: props.replyCounts.replied, inWindow: props.replyCounts.reviewsInWindow } : null,
    booking: props.booking ?? null,
    media: props.media ?? null,
    extras: props.extras ?? null,
  });
  const counts = listingCounts(groups);
  const live = useLiveValues(props.businessId);
  const [open, setOpen] = useState<Editor | null>(null);
  // "#edit-services?add=Balayage": section 5's missing services, pre-filled.
  const [prefill, setPrefill] = useState<string[]>([]);
  // "#edit-hours?use=website|own": the hours-mismatch chooser's hours, pre-filled.
  const [startHours, setStartHours] = useState<StartHours>(null);
  // "#compare-hours" (the Overview's "Compare your hours"): the Hours row's compare panel.
  const [compareRequest, setCompareRequest] = useState(0);
  const businessId = props.businessId;
  // ?tab=google#edit-hours (the "Fix it with PostScore" links, the levers,
  // section 5's ideas) opens that row's editor — on load and while on the
  // page. No "run once" guard: under StrictMode (next dev) the effect runs,
  // cleans up and runs again, and a guard left the page with no listener.
  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash.startsWith("#compare-hours")) {
        setCompareRequest((n) => n + 1);
        requestAnimationFrame(() => document.getElementById("listing-hours")?.scrollIntoView({ block: "start" }));
        return;
      }
      const editor = editorFromHash(window.location.hash);
      if (!editor) return;
      setOpen(editor);
      setPrefill(prefillFromHash(window.location.hash));
      setStartHours(
        startHoursFromHash(window.location.hash, () => {
          try {
            return window.sessionStorage.getItem(ownHoursKey(businessId));
          } catch {
            return null;
          }
        })
      );
      requestAnimationFrame(() => document.getElementById(`listing-${EDITOR_ROW[editor]}`)?.scrollIntoView({ block: "start" }));
    };
    // A link to the hash the address bar already shows fires no
    // "hashchange" (the second click on "Add photos"): open it from the click.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='#edit-'], a[href^='#compare-']") as HTMLAnchorElement | null;
      if (a && a.getAttribute("href") === window.location.hash) openFromHash();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      document.removeEventListener("click", onClick);
    };
  }, [businessId]);
  const ago = syncedAgo(props.replyCounts?.checkedAt ?? props.lastScanAt, Date.now());
  const agoText = ago ? t(locale, K(ago.unit === "days" && ago.count === 1 ? "ago.daysOne" : `ago.${ago.unit}`), { count: ago.count }) : null;
  const beta = GOOGLE_WRITES_FOR_EVERYONE ? "" : ` · ${t(locale, "dashboard.fixWithPostScore.beta")}`;

  return (
    <SectionHead n={4} id="listing" title={t(locale, K("s4.title"))} meta={`${t(locale, K("s4.meta"))}${beta}`}>
      <Box className="mt-3 overflow-hidden p-0" data-testid="google-tab-listing">
        <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-paper-line/70 px-3 py-2 text-[12.5px]", CREAM)}>
          <span className="whitespace-nowrap rounded-full border border-paper-line bg-white px-2.5 py-1 text-[12.5px] font-semibold text-green">
            ● {props.practice ? t(locale, K(props.practiceSource === "real" ? "strip.practiceReal" : "strip.practice")) : agoText ? t(locale, K("strip.synced"), { ago: agoText }) : t(locale, K("strip.connected"))}
          </span>
          {props.practice && props.practiceSource === "fallback" && (
            <span data-testid="google-tab-practice-fallback" className="text-[12px] text-amber">
              {t(locale, K("strip.practiceFallback"))}
            </span>
          )}
          <span className="text-[12.5px] text-ink-mute" data-testid="google-tab-counts">
            {t(locale, K("count.ok"), { count: counts.ok })} · <b className="text-red">{t(locale, K("count.fix"), { count: counts.fix })}</b> ·{" "}
            <b className="text-amber">{t(locale, K("count.improve"), { count: counts.improve })}</b>
          </span>
          {props.listing.googleMapsUri && /^https:\/\//.test(props.listing.googleMapsUri) && (
            <a href={props.listing.googleMapsUri} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-paper-line bg-white px-2.5 text-[12.5px] font-semibold text-ink">
              {t(locale, K("strip.open"))}
            </a>
          )}
        </div>
        {groups.map((g, gi) => (
          <div key={g.id}>
            <div className={cn("px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-mute", CREAM, gi > 0 && "border-t border-paper-line/70")}>{t(locale, K(`group.${g.id}`))}</div>
            {g.rows.map((row) => (
              <ListingRowView key={row.id} row={row} props={props} live={live} prefill={prefill} startHours={startHours} compareRequest={compareRequest} open={row.action?.kind === "editor" && open === row.action.editor} onToggle={(e) => setOpen((cur) => (cur === e ? null : e))} />
            ))}
          </div>
        ))}
        <div className="border-t border-paper-line/70 px-3 pb-2">
          <GoogleMapsAttribution>
            <p className="text-[12px] text-ink-mute">
              {props.lastScanAt ? t(locale, "dashboard.googleProfile.listingAsOf", { date: formatShortDate(props.lastScanAt, locale, timeZone) }) : t(locale, "dashboard.googleProfile.listingNoScan")}
            </p>
          </GoogleMapsAttribution>
        </div>
      </Box>
    </SectionHead>
  );
}

/** The row's value and fixed note in words (the check's own note wins). */
export function rowText(row: ListingRow, locale: Locale, extra: { replyNote?: string | null; live?: LiveValues } = {}): { label: string; value: string; note: string | null; action: string | null } {
  const label = t(locale, K(`row.${row.id}.label`));
  const missing = t(locale, K("row.missing"));
  let value: string;
  let note: string | null = row.note;
  switch (row.id) {
    case "booking":
      // From the real link (the page's read): none / via {provider}, and whose it is.
      if (row.meta) {
        const m = row.meta;
        if (m.kind === "none") {
          value = t(locale, K("row.booking.none"));
          note = null;
        } else {
          value = t(locale, K("row.booking.via"), { provider: m.provider });
          note = m.tracking === "turn_on" ? t(locale, K("row.booking.notCounted"), { partner: m.provider }) : t(locale, K("row.booking.button"));
        }
        break;
      }
    // falls through: no read yet — the editor's live read
    case "description": {
      // Read from Google in the background (useLiveValues); "" while loading.
      const v = extra.live?.[row.id];
      note = t(locale, K(`row.${row.id}.note`));
      if (!v || v.kind === "loading") value = "";
      else if (v.kind === "error") {
        value = t(locale, K("row.liveFailed"));
        note = null;
      } else if (v.kind === "none") value = t(locale, K(`row.${row.id}.none`));
      else if (v.kind === "notOffered") value = t(locale, K("row.booking.notOffered"));
      else if (row.id === "description") {
        value = `“${v.value.length > 90 ? `${v.value.slice(0, 90).trimEnd()}…` : v.value}”`;
        note = v.value.trim().length < SHORT_DESCRIPTION ? t(locale, K("row.description.short"), { count: v.value.length }) : t(locale, K("row.description.chars"), { count: v.value.length });
      } else value = v.value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      break;
    }
    case "messaging":
      value = t(locale, K(row.status === "ok" ? "row.messaging.on" : row.status === "warn" ? "row.messaging.off" : "row.messaging.unknown"));
      note = t(locale, K("row.messaging.note"));
      break;
    case "posts":
      // Read from Google: "{N} in the last 30 days · last one {date}" or "None in 30+ days".
      if (row.meta) {
        value = row.meta.kind === "none" ? t(locale, K("row.posts.none")) : t(locale, K(Number(row.value) === 1 ? "row.posts.countOne" : "row.posts.count"), { count: row.value ?? "0" });
        note = row.meta.lastAt ? t(locale, K("row.posts.last"), { date: formatShortDate(row.meta.lastAt, locale) }) : t(locale, K("row.posts.never"));
        break;
      }
      value = t(locale, K("row.soon"));
      note = t(locale, K("row.posts.note"));
      break;
    case "holiday":
      if (row.meta?.kind === "none") {
        value = t(locale, K("row.holiday.noneSoon"));
        note = null;
        break;
      }
      if (row.meta?.kind === "list") {
        // "Thanksgiving (Nov 26): not set · Christmas Eve (Dec 24): set".
        const list = JSON.parse(row.meta.list) as Array<{ id: string; date: { year: number; month: number; day: number }; set: boolean }>;
        value = list.map((h) => `${t(locale, K(`fields.holiday.${h.id}`))} (${formatShortDate(`${h.date.year}-${String(h.date.month).padStart(2, "0")}-${String(h.date.day).padStart(2, "0")}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "")}): ${t(locale, K(h.set ? "row.holiday.set" : "row.holiday.notSet"))}`).join(" · ");
        note = t(locale, K("row.holiday.note"));
        break;
      }
      value = t(locale, K("row.soon"));
      note = t(locale, K(`row.${row.id}.note`));
      break;
    case "services": {
      const names = JSON.parse(row.meta?.names ?? "[]") as string[];
      value = names.length === 0 ? t(locale, K("row.services.none")) : names.length > 6 ? t(locale, K("row.services.more"), { list: names.slice(0, 6).join(", "), count: names.length - 6 }) : names.join(", ");
      note = t(locale, K("row.services.note"));
      break;
    }
    case "customerDetails":
      if (row.meta?.open !== undefined) {
        const mark = (part: "payment" | "parking" | "accessibility") => `${t(locale, `dashboard.gbpEdit.groupShort.${part}` as MessageKey)} ${row.meta![part] === "1" ? "✓" : "✗"}`;
        const open = Number(row.meta.open);
        value = [mark("payment"), mark("parking"), mark("accessibility")].join(" · ");
        note = [t(locale, K("row.customerDetails.scored")), ...(open > 0 ? [t(locale, K(open === 1 ? "row.customerDetails.moreOne" : "row.customerDetails.more"), { count: open })] : [])].join(" · ");
        break;
      }
      value = t(locale, K("row.customerDetails.value"));
      break;
    case "photos":
      if (row.meta?.kind === "read") {
        // "{N} photos · newest {X} months ago".
        value = t(locale, K("row.photos.read"), { count: row.value ?? "0", ago: Number(row.meta.months) === 0 ? t(locale, K("row.photos.thisMonth")) : t(locale, K(Number(row.meta.months) === 1 ? "row.photos.monthAgo" : "row.photos.monthsAgo"), { count: row.meta.months }) });
        note = t(locale, K("row.photos.addMore"));
        break;
      }
      if (row.meta?.kind === "none") {
        value = t(locale, K("row.photos.zero"));
        note = t(locale, K("row.photos.addMore"));
        break;
      }
      value = row.value !== null ? t(locale, K("row.photos.value"), { count: row.value }) : missing;
      note = t(locale, K("row.photos.note"));
      break;
    case "reviews":
      value = row.value !== null ? t(locale, K("row.reviews.value"), { value: row.value }) : missing;
      note = extra.replyNote ?? null;
      break;
    default:
      value = row.value ?? missing;
  }
  const action =
    row.action === null
      ? null
      : row.action.kind === "link"
        ? t(locale, K(row.id === "reviews" ? "action.openInbox" : row.id === "photos" ? "action.addOnGoogle" : row.id === "posts" ? "action.postIdeas" : "action.howTo"))
        : row.id === "booking" && row.meta?.kind === "none"
          ? t(locale, K("action.addLink"))
          : row.action.editor === "booking_partner"
            ? t(locale, K("action.managedBy"), { provider: row.meta?.provider ?? "" })
            : row.action.editor === "booking_steps"
              ? t(locale, K("action.turnOnBooking"))
              : row.action.editor === "services"
              ? t(locale, K("action.addServices"))
              : row.action.editor === "photos"
              ? t(locale, K("action.addPhotos"))
              : row.action.editor === "description" && row.meta?.short === "1"
              ? t(locale, K("action.writeWithPostAI"))
              : row.action.editor === "holiday"
              ? t(locale, K(row.status === "ok" ? "action.edit" : "action.setHolidays"))
              : t(locale, K(row.id === "messaging" ? "action.howToInline" : row.id === "customerDetails" ? "action.update" : row.status === "bad" ? "action.fix" : "action.edit"));
  return { label, value, note, action };
}

function ListingRowView({ row, props, live, open, onToggle, prefill, startHours = null, compareRequest = 0 }: { row: ListingRow; props: GoogleProfileTabProps; live: LiveValues; open: boolean; onToggle: (e: Editor) => void; prefill?: string[]; startHours?: StartHours; compareRequest?: number }) {
  const locale = useLocale();
  const gbpEdit = useGbpEdit();
  const replyNote =
    row.id === "reviews" && props.replyCounts && props.replyCounts.reviewsInWindow > 0
      ? t(locale, K("row.reviews.note"), { replied: props.replyCounts.replied, total: props.replyCounts.reviewsInWindow })
      : row.id === "reviews"
        ? t(locale, K("row.reviews.noteNone"))
        : null;
  const text = rowText(row, locale, { replyNote, live });
  // Booking: the page's read already has it (meta); only an unread row waits for the live read.
  const loading = (row.id === "description" || (row.id === "booking" && !row.meta)) && live[row.id].kind === "loading";
  const dot = STATUS_DOT[row.status];
  const strong = row.status === "bad";
  const actionBase = "inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-2.5 text-[12.5px] font-semibold";
  const actionCls = cn(actionBase, strong ? "border-ink bg-ink text-white" : "border-paper-line text-ink hover:border-ink-soft");
  const plainCls = cn(actionBase, "border-paper-line bg-white text-ink hover:border-ink-soft");
  const primaryCls = cn(actionBase, "border-ink bg-ink text-white");
  // Hours: "Compare" (the website and Google show different hours) beside "Edit".
  const [compareOpen, setCompareOpen] = useState(false);
  const compare = row.id === "hours" && props.hoursMismatch === true;
  useEffect(() => {
    if (compareRequest > 0 && compare) setCompareOpen(true);
  }, [compareRequest, compare]);
  return (
    <div id={`listing-${row.id}`} className="scroll-mt-24 border-t border-paper-line/70" data-testid={`listing-row-${row.id}`} data-status={row.status}>
      <div className="grid min-h-[44px] grid-cols-[24px_1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-[7px] text-[13px] sm:grid-cols-[24px_160px_1fr_auto]">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold", dot.cls)} aria-hidden>
          {dot.mark}
        </span>
        <span className="font-semibold">{text.label}</span>
        <span className="col-start-2 row-start-2 min-w-0 text-[13px] leading-snug text-ink-soft sm:col-start-auto sm:row-start-auto">
          {loading ? (
            <span data-testid={`listing-loading-${row.id}`} aria-label={t(locale, K("row.loading"))} className="block h-3.5 w-48 max-w-full animate-pulse rounded bg-paper-deep motion-reduce:animate-none" />
          ) : (
            <span className="break-words" title={row.id === "photos" && row.meta?.kind === "read" ? t(locale, K("row.photos.tooltip")) : undefined}>
              {text.value}
            </span>
          )}
          {text.note && <small className="mt-0.5 block text-[12px] text-ink-mute line-clamp-2">{text.note}</small>}
        </span>
        {/* Flush with the card's right padding: every row's buttons share one right edge. */}
        <span className="col-start-3 row-start-1 flex flex-wrap items-center justify-end gap-1.5 sm:col-start-auto sm:row-start-auto">
          {compare && (
            <button type="button" className={primaryCls} aria-expanded={compareOpen} data-testid="listing-action-compare" onClick={() => setCompareOpen(!compareOpen)}>
              {t(locale, compareOpen ? "dashboard.hoursChooser.hideShort" : "dashboard.hoursChooser.compareShort")}
            </button>
          )}
          {row.action?.kind === "link" &&
            (row.action.external ? (
              <a href={row.action.href} target="_blank" rel="noopener noreferrer" className={cn(actionCls, "inline-flex items-center gap-1")}>
                {text.action}
                <IconArrowUpRight size={13} aria-hidden />
              </a>
            ) : (
              <Link href={row.action.href} className={actionCls}>
                {text.action}
              </Link>
            ))}
          {row.action?.kind === "editor" && (
            <button
              type="button"
              className={compare ? plainCls : actionCls}
              aria-expanded={open}
              data-testid={`listing-action-${row.id}`}
              onClick={() => onToggle((row.action as { editor: Editor }).editor)}
            >
              {open ? t(locale, K("action.close")) : compare ? t(locale, K("action.edit")) : text.action}
            </button>
          )}
        </span>
      </div>
      {open && row.action?.kind === "editor" && (
        <div className="border-t border-[color:color-mix(in_srgb,var(--color-brass)_18%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_5%,white)] px-3 pb-3 pt-2.5 sm:pl-[51px]" data-testid={`listing-editor-${row.id}`}>
          <RowEditor editor={row.action.editor} businessId={props.businessId} suggested={gbpEdit.websiteSuggested ?? null} booking={props.booking ?? null} prefill={prefill} startHours={startHours} />
        </div>
      )}
      {/* "Your website and Google listing show different hours": the shared panel, from the row's "Compare". */}
      {compare && compareOpen && !open && (
        <div className="px-3 pb-2.5 sm:pl-[51px]" data-testid="listing-compare-hours">
          <HoursComparePanel businessId={props.businessId} onTab />
        </div>
      )}
      {/* After a choice, once a scan shows they match: "Hours match … ✓". */}
      {row.id === "hours" && props.hoursMismatch === false && !open && (
        <div className="px-3 pb-2 sm:pl-[51px] empty:hidden">
          <HoursMismatchChooser businessId={props.businessId} mismatch={false} onTab />
        </div>
      )}
    </div>
  );
}

/** A booking partner's button: read-only — no editor, no Approve / Undo,
 * no "changes to Google are off" banner (it doesn't apply). Case A: why
 * Google counts 0 bookings. */
function PartnerBookingPanel({ link, tracking }: { link: { uri: string; provider: string }; tracking: BookingTracking }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-1.5 text-[13px] text-ink" data-testid="booking-partner-panel">
      <a href={link.uri} target="_blank" rel="noopener noreferrer" className="w-fit break-all font-semibold underline decoration-brass underline-offset-2">
        {link.uri.replace(/^https?:\/\//, "")}
      </a>
      <p className="text-ink-soft">{t(locale, K("booking.partnerAdded"), { provider: link.provider })}</p>
      {tracking.kind === "partner_not_counted" && (
        <p data-testid="booking-not-counted" className="rounded-lg bg-white px-2.5 py-1.5 text-[12.5px] text-ink-soft">
          {t(locale, K("booking.notCountedA"), { provider: tracking.provider })}
        </p>
      )}
    </div>
  );
}

/** The existing editors, unchanged: their own preview → approve → read
 * back → undo, live-places lock and practice mode. */
function RowEditor({ editor, businessId, suggested, booking, prefill, startHours = null }: { editor: Editor; businessId: string; suggested: string | null; booking: BookingState | null; prefill?: string[]; startHours?: StartHours }) {
  if (editor === "holiday") return <HolidayHoursEditor businessId={businessId} />;
  if (editor === "services") return <ServicesEditor businessId={businessId} prefill={prefill} />;
  if (editor === "photos") return <PhotoUpload businessId={businessId} />;
  if (editor === "booking_partner" && booking && booking.link.kind === "partner") return <PartnerBookingPanel link={booking.link} tracking={booking.tracking} />;
  if (editor === "booking_steps" && booking && booking.tracking.kind === "turn_on") return <BookingStepsPanel businessId={businessId} provider={booking.tracking.provider} partnerId={booking.tracking.partnerId} still={booking.tracking.still} />;
  if (editor === "hours" || editor === "phone" || editor === "description") return <ProfileEditsOnGoogle businessId={businessId} fields={[editor]} orderLink={false} intro={false} startHours={editor === "hours" ? startHours : null} />;
  if (editor === "booking") return <ProfileEditsOnGoogle businessId={businessId} fields={[]} orderLink intro={false} />;
  if (editor === "website") return <WebsiteLinkFix businessId={businessId} suggested={suggested} autoLoad />;
  if (editor === "customer_details") return <CustomerDetailsGoogleEdit businessId={businessId} autoLoad openEditing />;
  return <GbpMessagingStep on={null} />;
}

// ---------------------------------------------------------------------------
// 6 Protection & changes
// ---------------------------------------------------------------------------

const GOOGLE_PROFILE_URL = "https://business.google.com/";
const SMALL_BTN = "inline-flex h-[26px] items-center rounded-md border px-2.5 text-[12px] font-semibold disabled:opacity-60";

/** Red banner at the top of the tab while Google's own edits are open. */
/** The banner at the top of the tab: the fields Google changed (never one
 * it only filled in that matches our scan), amber with "I know, that's
 * right" / "Review" — red with "Review" only for the name, the address or a
 * closed listing. */
export function GoogleEditsBanner({ businessId, saved, scan }: { businessId: string; saved: GoogleTabSaved | null; scan: { website?: string | null; phone?: string | null } }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const edits = bannerEdits(saved?.googleEdits?.open ?? [], scan);
  const status = saved?.businessStatus ?? null;
  const closed = status === "CLOSED_TEMPORARILY" || status === "CLOSED_PERMANENTLY";
  if (hidden || (edits.length === 0 && !closed)) return null;
  const serious = bannerSerious(edits.map((e) => e.field), status);
  const latest = edits.map((e) => e.detected_at).sort().pop();
  const date = latest ? formatShortDate(latest, locale).replace(/,? \d{4}$/, "") : "";
  const names = edits.map((e) => t(locale, K(`banner.field.${e.field}`)));
  const headline =
    edits.length === 0
      ? t(locale, K(status === "CLOSED_PERMANENTLY" ? "banner.closed" : "banner.closedTemp"))
      : edits.length === 1
        ? t(locale, K(PLURAL_FIELDS.includes(edits[0].field) ? "banner.onePlural" : "banner.one"), { field: names[0], date })
        : t(locale, K("banner.many"), { fields: joinFields(names, t(locale, K("banner.and"))), date });
  return (
    <div
      role={serious ? "alert" : "status"}
      data-testid="google-edits-banner"
      data-tone={serious ? "red" : "amber"}
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-3.5 py-2.5 text-[13px]",
        serious ? "border-red/30 bg-[color:color-mix(in_srgb,var(--color-red)_8%,white)] text-red" : "border-amber/30 bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] text-ink"
      )}
    >
      <div className="min-w-0">
        <b className={serious ? "text-red" : "text-ink"}>{headline}</b>
        <p className="text-[12px] text-ink-mute">{t(locale, K("banner.why"))}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!serious && (
          <BannerAccept
            businessId={businessId}
            ids={edits.map((e) => e.id)}
            busy={busy}
            onDone={() => {
              setHidden(true);
              router.refresh();
            }}
            setBusy={setBusy}
          />
        )}
        <a href="#others" className={cn("inline-flex h-[30px] items-center rounded-lg border px-3 text-[12.5px] font-semibold", serious ? "border-red bg-red text-white" : "border-ink bg-white text-ink")} data-testid="banner-review">
          {t(locale, K("banner.review"))}
        </a>
      </div>
    </div>
  );
}

function BannerAccept({ businessId, ids, busy, onDone, setBusy }: { businessId: string; ids: string[]; busy: boolean; onDone: () => void; setBusy: (b: boolean) => void }) {
  const locale = useLocale();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await keepAllGoogleVersions(businessId, ids).catch(() => null);
        setBusy(false);
        if (r?.status === "ok") onDone();
      }}
      className="inline-flex h-[30px] items-center rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper disabled:opacity-60"
      data-testid="banner-accept"
    >
      {t(locale, K("banner.accept"))}
    </button>
  );
}

const quoted = (v: string | null, locale: Locale) => (v ? `“${v}”` : t(locale, K("others.emptyValue")));

/** One of Google's own edits: Google's version vs the owner's, side by side
 * (components/gbp/CompareVersions.tsx). "Keep Google's version" changes
 * nothing on Google; "Keep your version" sends it back through the safety
 * flow when writes are allowed, otherwise shows the steps on Google. */
export function GoogleEditItem({ businessId, edit, canEdit, practice, website = null }: { businessId: string; edit: GoogleEditRow; canEdit: boolean; practice: boolean; website?: GoogleProfileTabProps["websiteHours"] }) {
  // Hours: Google's version vs the WEBSITE's (last scan), when the site's hours could be read.
  if (edit.field === "hours" && website?.week) return <GoogleHoursVsWebsite businessId={businessId} edit={edit} canEdit={canEdit} website={{ ...website, week: website.week }} />;
  return <GoogleEditVsOwner businessId={businessId} edit={edit} canEdit={canEdit} practice={practice} noSiteHours={edit.field === "hours"} />;
}

/** Section 6's hours card: Google's hours vs the website's, day by day.
 * "Keep Google's version" → how to update the website (unless it already
 * matches); "Keep website's version" → the hours editor with the website's
 * hours (writes allowed) or the steps on Google. */
function GoogleHoursVsWebsite({ businessId, edit, canEdit, website }: { businessId: string; edit: GoogleEditRow; canEdit: boolean; website: NonNullable<GoogleProfileTabProps["websiteHours"]> & { week: WeeklyHours } }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"choose" | "website" | "google">("choose");
  const google = codedToWeek(edit.google_value);
  const owner = codedToWeek(edit.owner_value);
  const siteMatchesGoogle = !!google && sameWeek(google, website.week);
  const ownerDiffers = !!owner && !(google && sameWeek(owner, google)) && !sameWeek(owner, website.week);
  const resolved = edit.resolution === "kept" || edit.resolution === "changed_back";
  async function keepGoogle() {
    setStage(siteMatchesGoogle ? "choose" : "website");
    setBusy(true);
    const r = await keepGoogleVersion(businessId, edit.id).catch(() => ({ status: "failed" }) as const);
    setBusy(false);
    if (r.status === "ok") router.refresh();
  }
  async function reopen() {
    setStage("choose");
    const r = await reopenGoogleEditAction(businessId, edit.id).catch(() => ({ status: "failed" }) as const);
    if (r.status === "ok") router.refresh();
  }
  return (
    <div className="border-t border-paper-line/60 py-2.5 first:border-t-0" data-testid="google-edit-hours">
      <CompareVersions
        question={t(locale, K("others.question"), { field: t(locale, K("protect.field.hours")).toLowerCase() })}
        versions={versionsOfHours(google, website.week, locale)}
        mineLabel={t(locale, "dashboard.compareVersions.website")}
        mineIcon="globe"
        mineFooter={
          ownerDiffers ? (
            <p className="text-[11.5px] text-ink-mute" data-testid="you-entered">
              {t(locale, K("others.youEntered"), { hours: shortWeek(owner, locale) })}
            </p>
          ) : null
        }
        googleButton={{ label: t(locale, K("others.keep")), note: t(locale, siteMatchesGoogle ? K("others.keepNote") : "dashboard.hoursChooser.keepGoogleNote"), onClick: keepGoogle, testId: "keep-google", disabled: busy }}
        mineButton={{ label: t(locale, "dashboard.compareVersions.keepWebsite"), note: t(locale, canEdit ? "dashboard.hoursChooser.keepWebsiteNoteWrite" : "dashboard.hoursChooser.keepWebsiteNoteGuide"), onClick: () => setStage("google"), testId: "keep-website", primary: true, disabled: busy }}
        chosen={resolved ? { text: t(locale, K("others.chosenGoogle")), at: edit.resolved_at ?? edit.detected_at, onChange: reopen } : stage === "google" ? { text: t(locale, "dashboard.hoursChooser.chosen.website"), at: new Date().toISOString(), onChange: () => setStage("choose") } : null}
      >
        {stage === "website" && <FixWebsite view={website} week={google} locale={locale} />}
        {stage === "google" && <FixGoogle businessId={businessId} view={{ canEdit }} week={website.week} own={false} onTab />}
      </CompareVersions>
    </div>
  );
}

function GoogleEditVsOwner({ businessId, edit, canEdit, practice, noSiteHours = false }: { businessId: string; edit: GoogleEditRow; canEdit: boolean; practice: boolean; noSiteHours?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"choose" | "confirm" | "guide">("choose");
  const [msg, setMsg] = useState<{ key: string; tone: "ok" | "warn" | "bad" } | null>(null);
  const label = t(locale, K(`protect.field.${edit.field}`));
  const versions = versionsOfEdit(edit.field, edit.google_value, edit.owner_value, locale);
  const resolved = edit.resolution === "kept" || edit.resolution === "changed_back";
  // Google filled in something the owner left empty: only "Change on Google" (sending "nothing" would clear it).
  const added = !edit.owner_value;
  const inApp = !added && canChangeBack(edit.field) && canEdit;
  async function keep() {
    setBusy(true);
    const r = await keepGoogleVersion(businessId, edit.id).catch(() => ({ status: "failed" }) as const);
    setBusy(false);
    if (r.status === "ok") router.refresh();
    else setMsg({ key: "others.actionFailed", tone: "bad" });
  }
  async function sendBack() {
    setBusy(true);
    const r = await changeGoogleEditBack(businessId, edit.id, practice ? "accept" : null).catch(() => ({ status: "error", error: "failed" }) as ChangeBackResult);
    setBusy(false);
    if (r.status === "sent" || r.status === "pending_review" || r.status === "no_change") {
      setMsg({ key: r.status === "sent" ? "others.back.sent" : r.status === "pending_review" ? "others.back.pending" : "others.back.noChange", tone: r.status === "pending_review" ? "warn" : "ok" });
      router.refresh();
    } else if (r.status === "editing_off" || r.status === "on_google" || r.status === "google_added") setStage("guide");
    else setMsg({ key: "others.actionFailed", tone: "bad" });
  }
  async function reopen() {
    if (edit.resolution === "changed_back") {
      document.getElementById("google-tab-made")?.scrollIntoView({ block: "start" });
      return;
    }
    const r = await reopenGoogleEditAction(businessId, edit.id).catch(() => ({ status: "failed" }) as const);
    if (r.status === "ok") router.refresh();
  }
  const mineLines = versions.kind === "days" ? versions.days.map((d) => `${d.label}: ${d.mine}`) : edit.owner_value ? [edit.owner_value] : [];
  return (
    <div className="border-t border-paper-line/60 py-2.5 first:border-t-0" data-testid={`google-edit-${edit.field}`}>
      <CompareVersions
        question={t(locale, K("others.question"), { field: label.toLowerCase() })}
        versions={versions}
        mineLabel={t(locale, K("others.yourVersion"))}
        mineFooter={noSiteHours ? <p className="text-[11.5px] text-ink-mute" data-testid="no-site-hours">{t(locale, K("others.noSiteHours"))}</p> : null}
        googleButton={{ label: t(locale, K("others.keep")), note: t(locale, K("others.keepNote")), onClick: keep, testId: "keep-google", disabled: busy }}
        mineButton={
          added
            ? { label: t(locale, K("others.changeOnGoogle")), note: t(locale, K("others.noteGuide")), onClick: () => setStage("guide"), testId: "change-back", primary: true, disabled: busy }
            : { label: t(locale, K("others.keepMine")), note: t(locale, K(inApp ? "others.noteWrite" : "others.noteGuide")), onClick: () => setStage(inApp ? "confirm" : "guide"), testId: "change-back", primary: true, disabled: busy }
        }
        chosen={resolved ? { text: t(locale, K(edit.resolution === "kept" ? "others.chosenGoogle" : "others.chosenMine")), at: edit.resolved_at ?? edit.detected_at, onChange: reopen } : null}
      >
        {!resolved && stage === "confirm" && (
          <div className="flex flex-col gap-1.5 rounded-lg bg-paper p-2.5 text-[12.5px]" data-testid="change-back-preview">
            <b>{t(locale, K("others.previewTitle"), { field: label.toLowerCase() })}</b>
            {versions.kind === "days" ? <HoursLines lines={mineLines} /> : <p className="text-[14px] font-semibold">{edit.owner_value}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={sendBack} className={cn(SMALL_BTN, "border-ink bg-ink text-paper")} data-testid="approve-change-back">
                {t(locale, K("others.approve"))}
              </button>
              <button type="button" disabled={busy} onClick={() => setStage("choose")} className={cn(SMALL_BTN, "border-paper-line bg-white text-ink")}>
                {t(locale, K("others.cancel"))}
              </button>
            </div>
            <p className="text-ink-mute">{t(locale, K("others.previewNote"))}</p>
          </div>
        )}
        {!resolved && stage === "guide" && (
          <div className="rounded-lg bg-paper p-2.5 text-[12.5px]" data-testid="change-back-guide">
            <b>{t(locale, K("others.guide.title"))}</b>
            {!canChangeBack(edit.field) && <p className="mt-0.5 text-ink-soft">{t(locale, K("others.guide.why"))}</p>}
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>{t(locale, K("others.guide.step1"))}</li>
              <li>{t(locale, K("others.guide.step2"), { field: label })}</li>
              <li>{added ? t(locale, K("others.guide.step3Added")) : versions.kind === "days" ? t(locale, K("others.guide.step3Hours")) : t(locale, K("others.guide.step3"), { value: edit.owner_value ?? "" })}</li>
            </ol>
            {versions.kind === "days" && !added && <HoursLines lines={mineLines} />}
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={GOOGLE_PROFILE_URL} target="_blank" rel="noopener noreferrer" className={cn(SMALL_BTN, "w-fit border-ink bg-ink text-paper")}>
                {t(locale, K("others.openOnGoogle"))}
              </a>
              {!added && <CopyLines lines={mineLines} />}
            </div>
          </div>
        )}
        {msg && (
          <p role="status" className={cn("text-[12.5px]", msg.tone === "ok" ? "text-green" : msg.tone === "warn" ? "text-amber" : "text-red")}>
            {t(locale, K(msg.key))}
          </p>
        )}
      </CompareVersions>
    </div>
  );
}

function HoursLines({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-1 text-[12.5px] text-ink">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function CopyLines({ lines }: { lines: string[] }) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  if (lines.length === 0) return null;
  return (
    <button type="button" onClick={() => void navigator.clipboard?.writeText(lines.join("\n")).then(() => setCopied(true), () => undefined)} className={cn(SMALL_BTN, "border-paper-line bg-white text-ink")} data-testid="copy-value">
      {t(locale, K(copied ? "others.copied" : "others.copy"))}
    </button>
  );
}

function CheckNow({ businessId, checkedAt }: { businessId: string; checkedAt: string | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "too_soon" | "failed">("idle");
  async function run() {
    setState("busy");
    const r = await checkGoogleEditsNow(businessId).catch(() => ({ status: "failed" }) as const);
    setState(r.status === "ok" ? "done" : r.status === "too_soon" ? "too_soon" : "failed");
    if (r.status === "ok") router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-paper-line/60 pt-2 text-[12.5px] text-ink-mute" data-testid="google-edits-check">
      <span>{state === "done" ? t(locale, K("others.checkedNow")) : checkedAt ? t(locale, K("others.lastChecked"), { time: formatMonthDayTime(checkedAt, locale, timeZone) }) : t(locale, K("others.notChecked"))}</span>
      <span className="flex items-center gap-2">
        {state === "too_soon" && <span className="text-amber">{t(locale, K("others.tooSoon"))}</span>}
        {state === "failed" && <span className="text-red">{t(locale, K("others.checkFailed"))}</span>}
        <button type="button" disabled={state === "busy"} onClick={run} className="font-semibold text-ink underline underline-offset-2 disabled:opacity-60" data-testid="check-now">
          {state === "busy" ? t(locale, K("others.checking")) : t(locale, K("others.checkNow"))}
        </button>
      </span>
    </div>
  );
}

function madeValueText(v: MadeValue | null | undefined, locale: Locale): string | null {
  if (!v) return null;
  if ("text" in v) return v.text;
  if ("added" in v) return t(locale, K("made.added"), { list: v.added.join(", ") });
  if ("photos" in v) return t(locale, K(v.photos === 1 ? "made.photosOne" : "made.photos"), { count: v.photos });
  return v.dates
    .map((d) => {
      const date = formatShortDate(`${d.date}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "");
      return d.closed ? t(locale, K("made.dateClosed"), { date }) : t(locale, K("made.dateOpen"), { date, open: timeText(d.open ?? undefined, locale), close: timeText(d.close ?? undefined, locale) });
    })
    .join(", ");
}

const MADE_SHOWN = 10;

function MadeRow({ businessId, c, practice, canEdit }: { businessId: string; c: MadeChange; practice: boolean; canEdit: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const value = madeValueText(c.value, locale);
  async function undo() {
    if (!c.batchId) return;
    setState("busy");
    const r = await undoMadeChange(businessId, c.batchId, practice ? "accept" : null).catch(() => ({ status: "failed" }) as const);
    if (r.status === "ok") router.refresh();
    else setState("failed");
  }
  return (
    <div className="flex flex-col border-t border-paper-line/60 py-2 text-[13px] first:border-t-0" data-testid="made-row">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-ink-soft">
          {c.practice && (
            <span className="mr-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--color-amber)_14%,white)] px-1.5 py-0.5 text-[10.5px] font-bold text-amber" data-testid="made-practice">
              {t(locale, K("made.practice"))}
            </span>
          )}
          <b className="text-ink">{t(locale, K(`made.kind.${c.kind}`))}</b>
          {value && <>: {value}</>} <span className="text-ink-mute">· {formatShortDate(c.at, locale)}</span>
        </span>
        <span className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap", c.status === "live" ? "font-semibold text-green" : c.status === "reviewing" || c.status === "undo" || c.status === "held" ? "text-amber" : c.status === "failed" || c.status === "rejected" ? "text-red" : "text-ink-mute")}>
          {c.status === "undo" ? t(locale, K(c.daysLeft === 1 ? "made.status.undoOne" : "made.status.undo"), { count: c.daysLeft }) : t(locale, K(`made.status.${c.status}`))}
          {c.status === "undo" && canEdit && c.batchId && (
            <button type="button" disabled={state === "busy"} onClick={undo} className={cn(SMALL_BTN, "border-paper-line text-ink")} data-testid="made-undo">
              {state === "busy" ? t(locale, K("made.undoing")) : t(locale, K("made.undo"))}
            </button>
          )}
        </span>
      </div>
      {state === "failed" && <p className="text-[12px] text-red">{t(locale, K("made.undoFailed"))}</p>}
    </div>
  );
}

function ProtectionSection(props: GoogleProfileTabProps) {
  const locale = useLocale();
  const [showAll, setShowAll] = useState(false);
  const saved = props.saved;
  const others = saved?.others ?? null;
  const edits = saved?.googleEdits ?? null;
  const canEdit = props.canEditGoogle === true;
  const status = saved?.businessStatus ?? null;
  const statusKey = status === "OPERATIONAL" ? "open" : status === "CLOSED_TEMPORARILY" ? "closedTemp" : status === "CLOSED_PERMANENTLY" ? "closed" : "unknown";
  const verified = props.extras?.verified === true;
  const made = saved?.made ?? [];
  const shown = showAll ? made : made.slice(0, MADE_SHOWN);
  const li = "flex items-start justify-between gap-3 border-t border-paper-line/60 py-2 text-[13px] first:border-t-0";
  // Open edits first, then the ones chosen in the last day (collapsed: "✓ You kept …").
  const shownEdits = [...(edits?.open ?? []), ...(edits?.recent ?? []).filter((r) => !(edits?.open ?? []).some((o) => o.field === r.field))];
  // Never "Unchanged" while a change is listed: between-scan changes + Google's open edits
  // (not one Google only filled in that matches our scan — that's info only).
  const scan = { website: props.listing.website, phone: props.listing.phone };
  const realOpen = (edits?.open ?? []).filter((e) => !isInfoOnly(e, scan));
  const openFields = realOpen.map((e) => (e.field === "title" ? "name" : e.field));
  const watched = watchedSummary(others?.fields ?? [], realOpen.map((e) => e.field));
  return (
    <SectionHead n={6} id="protection" title={t(locale, K("s6.title"))} meta={t(locale, K("s6.meta"))}>
      <div className="mt-3.5 grid gap-4 sm:grid-cols-2">
        <Box className={cn("scroll-mt-24 p-3.5", shownEdits.length > 0 && "sm:col-span-2")} id="others" data-testid="google-tab-others">
          <Eyebrow>{t(locale, K("others.title"))}</Eyebrow>
          <div className="mt-2">
            <div className={cn(li, shownEdits.length > 0 && "flex-col items-stretch")}>
              <span className="text-ink-soft">{t(locale, K("others.suggested"))}</span>
              {!edits || !edits.available ? (
                <span className="text-ink-mute">{t(locale, K("others.unknown"))}</span>
              ) : shownEdits.length === 0 ? (
                <b className="text-green">{t(locale, K("others.none"))} ✓</b>
              ) : (
                <div data-testid="google-edits-list">
                  {shownEdits.map((e) =>
                    isInfoOnly(e, scan) ? (
                      // Google filled in what the owner left empty, and it matches our scan: info only.
                      <p key={e.id} className="border-t border-paper-line/60 py-2 text-[13px] first:border-t-0" data-testid={`google-added-${e.field}`}>
                        <b>{t(locale, K(`protect.field.${e.field}`))}:</b> {e.google_value} <span className="text-ink-mute">· {t(locale, K("others.addedByGoogle"))}</span> <b className="text-green">{t(locale, K("others.looksRight"))} ✓</b>
                      </p>
                    ) : (
                      <GoogleEditItem key={e.id} businessId={props.businessId} edit={e} canEdit={canEdit} practice={props.practice} website={props.websiteHours ?? null} />
                    )
                  )}
                </div>
              )}
            </div>
            <div className={cn(li, watched.length > 0 && "flex-col items-stretch gap-1")}>
              <span className="text-ink-soft">{t(locale, K("others.fields"))}</span>
              {others === null && watched.length === 0 ? (
                <span className="text-ink-mute">{t(locale, K("others.unknownScan"))}</span>
              ) : watched.length === 0 ? (
                <b className="text-green">{t(locale, K("others.unchanged"))} ✓</b>
              ) : (
                <div data-testid="google-tab-others-changed">
                  <b className="text-amber" data-testid="watched-summary">
                    {t(locale, K("others.changedCount"), { count: watched.length, fields: watched.map((f) => t(locale, K(`protect.field.${f}`)).toLowerCase()).join(", ") })}
                  </b>
                  <ul className="mt-0.5 space-y-0.5">
                    {watched.map((f) => {
                      const ch = others?.changes?.find((c) => c.field === f);
                      return (
                        <li key={f} className="text-ink-soft">
                          <b className="text-ink">{t(locale, K(`protect.field.${f}`))}:</b>{" "}
                          {ch && (ch.from || ch.to) ? (
                            <>
                              {quoted(ch.from, locale)} → {quoted(ch.to, locale)}
                              {others?.at && <span className="text-ink-mute"> · {formatShortDate(others.at, locale)}</span>}
                            </>
                          ) : openFields.includes(f) ? (
                            t(locale, K("others.changedByGoogle"))
                          ) : (
                            t(locale, K("others.changedShort"))
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <div className={li}>
              <span className="text-ink-soft">{t(locale, K("others.status"))}</span>
              <b className={statusKey === "open" ? "text-green" : statusKey === "unknown" ? "text-ink-mute" : "text-red"} data-testid="listing-status">
                {t(locale, K(`others.statusValue.${statusKey}`))}
                {verified && <span className="font-semibold"> · {t(locale, K("others.verified"))}</span>}
              </b>
            </div>
          </div>
          {props.connected && edits?.available && <CheckNow businessId={props.businessId} checkedAt={edits.checkedAt} />}
          <p className="mt-2 text-[12px] text-ink-mute">{t(locale, K("others.note"))}</p>
        </Box>
        <Box className="p-3.5" data-testid="google-tab-made">
          <Eyebrow>{t(locale, K("made.title"))}</Eyebrow>
          <div className="mt-2">
            {made.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-mute">{t(locale, K("made.empty"))}</p>
            ) : (
              shown.map((c, i) => <MadeRow key={`${c.batchId ?? c.at}-${i}`} businessId={props.businessId} c={c} practice={props.practice} canEdit={canEdit} />)
            )}
          </div>
          {made.length > MADE_SHOWN && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 text-[12.5px] font-semibold text-ink underline underline-offset-2" data-testid="made-show-all">
              {showAll ? t(locale, K("made.showLess")) : t(locale, K("made.showAll"), { count: made.length })}
            </button>
          )}
        </Box>
      </div>
    </SectionHead>
  );
}
