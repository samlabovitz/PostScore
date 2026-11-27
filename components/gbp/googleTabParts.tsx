"use client";

// Shared parts of the Google pages (Day 25B step 2, docs/plans/day25a-spec.md
// §3): the props, the card look, section heads, the "On this page" menu, the
// Google-numbers sync state, the not-connected card and the ideas/recs both
// pages read. Used by components/gbp/GoogleResults.tsx (Growth → Google
// results), components/gbp/GoogleListingPage.tsx (Presence → Google listing)
// and the old Google Profile tab (components/gbp/GoogleProfileTab.tsx).

import type { NowMatchPrompts } from "@/lib/detailsMismatch.server";
import Link from "next/link";
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { syncGoogleNumbers } from "@/app/actions/gbpInsights";
import { ideaTypeOf, type Idea } from "@/lib/listingIdeas";
import type { WeeklyHours } from "@/lib/gbpProfileEdits";
import type { WebsiteBuilderId } from "@/lib/websiteBuilder";
import { gbpResultText } from "@/components/gbp/GbpResultMessage";
import { GBP_PROFILE_ANCHOR, gbpConnectHref, type GbpConnectResult } from "@/lib/gbpLanding";
import { googleWritesCopy, GOOGLE_WRITES_FOR_EVERYONE } from "@/lib/googleWritesLaunch";
import { t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import { activeJumpSection, JUMP_LINE_SLACK, JUMP_SECTIONS, jumpIdFromHash, type GoogleTabSaved, type BookingState, type JumpPart, type ListingExtras, type JumpSection, type JumpSectionId, type RowStatus } from "@/lib/googleProfileTab";
import type { CheckResult } from "@/lib/scoring";
import type { MediaPostsState } from "@/lib/gbpMediaPosts";
import { type InsightsState, sixMonthSpan, type InsightsMonth } from "@/lib/gbpInsights";
import type { GbpReplyCounts } from "@/lib/gbpReviewReplies";
import { cn } from "@/lib/utils";
import { type ActionEvent, type Rec } from "@/lib/googleRecommendations";
import { thisWeekKinds } from "@/components/gbp/ThisWeekList";
import { tabIdeasFor } from "@/lib/tabIdeas";

export const K = (key: string) => `dashboard.googleTab.${key}` as MessageKey;

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
  /** This week's saved post draft (lib/postDrafts.server.ts, written in the background) — shown at once, never
   * "Getting drafts ready…" when there is one. */
  savedPostDraft?: string | null;
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
  /** Day 25B step 3: the website and Google show the same hours now (the saved scan said they differ). */
  hoursMatchNow?: boolean;
  /** The business type (businesses.niche_id), for section 5's search-term → service maps. */
  nicheId?: string | null;
  /** Writes from PostScore allowed (practice, or GOOGLE_WRITES_LIVE_PLACES). */
  canEditGoogle?: boolean;
  /** Day 23B: after a PostScore change is live, "Your {field} now match…" (lib/detailsMismatch.ts). */
  nowMatch?: NowMatchPrompts;
  /** Day 23C: the owner's "how many become paying visits" (0–1); null: PostScore's default range. */
  visitShare?: number | null;
  /** Day 23C: what the owner did from PostScore, by day (lib/googleActions.server.ts). */
  actionEvents?: ActionEvent[];
}

/** Gold-on-navy and the mockup's soft tones, from the app's own colors. */
export const GOLD_LIGHT = "text-[color:color-mix(in_srgb,var(--color-brass)_55%,white)]";
export const NAVY_2 = "bg-[color:color-mix(in_srgb,var(--color-ink)_88%,white)]";
export const NAVY_LINE = "border-[color:color-mix(in_srgb,var(--color-ink)_70%,white)]";
export const CREAM = "bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)]";
export const STATUS_DOT: Record<RowStatus, { cls: string; mark: string }> = {
  ok: { cls: "bg-green text-white", mark: "✓" },
  warn: { cls: "bg-amber text-white", mark: "!" },
  bad: { cls: "bg-red text-white", mark: "✕" },
  neutral: { cls: "bg-paper-deep text-ink-mute", mark: "–" },
  soon: { cls: "bg-paper-deep text-ink-mute", mark: "…" },
};

/** Where the Google numbers stand: shown, loading (a sync is running),
 * failed (with "Try again"), or none (Google has nothing yet). */
export type SyncStatus = "ready" | "loading" | "failed" | "none";
export const SyncContext = createContext<{ status: SyncStatus; retry: () => void }>({ status: "ready", retry: () => undefined });

export function useSync(businessId: string, state: InsightsState | undefined): { status: SyncStatus; retry: () => void } {
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

// ---------------------------------------------------------------------------
// Not connected
// ---------------------------------------------------------------------------

export function NotConnectedCard({ businessId, needsReconnect, canStart, result, business }: GoogleProfileTabProps) {
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
        <li>• {t(locale, K("notConnected.since"))}</li>
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
export const MENU_TOP = "top-14 nav:top-0";
export const SCROLL_MT = "scroll-mt-[112px] nav:scroll-mt-14";
/** The "Sample data" pill, the same everywhere on the tab. */
export const SAMPLE_PILL = "rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_14%,white)] px-2 py-0.5 text-[10.5px] font-semibold text-brass";

/** `sections`: the page's own menu (the old tab's six by default); `labels`:
 * a page's own wording for an item, by its key. */
export function JumpMenu({ sample = false, sections = JUMP_SECTIONS, labels = {} }: { sample?: boolean; sections?: readonly JumpSection[]; labels?: Partial<Record<string, MessageKey>> }) {
  const locale = useLocale();
  const [active, setActive] = useState<JumpSectionId>(sections[0].id);
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
      const tops = sections.flatMap((s) => {
        const el = document.getElementById(s.id);
        return el ? [{ id: s.id, top: el.getBoundingClientRect().top }] : [];
      });
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActive(activeJumpSection(tops, line, atBottom, sections[0].id));
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
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) io?.observe(el);
    }
    // Pinned: the spot just above the menu has scrolled away.
    const pin = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 80), { threshold: 0 });
    if (sentinel.current) pin?.observe(sentinel.current);
    window.addEventListener("scroll", onScroll, { passive: true });
    for (const ev of ["wheel", "touchmove", "keydown"]) window.addEventListener(ev, release, { passive: true });
    // ?tab=google#protection: go there, that item highlighted.
    const fromHash = jumpIdFromHash(window.location.hash, sections);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- each page's menu is a constant
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
          {sections.map((s, i) => (
            <Fragment key={s.id}>
              {/* Thin lines between the three parts (after 3 and 5). */}
              {i > 0 && sections[i - 1].part !== s.part && <span aria-hidden className="h-5 w-px shrink-0 bg-paper-line" data-testid="google-tab-jump-divider" />}
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
                {t(locale, labels[s.key] ?? K(`jump.${s.key}`))}
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
export function PartHeader({ part }: { part: JumpPart }) {
  const locale = useLocale();
  return (
    <p className={cn("mt-5 flex flex-wrap items-baseline gap-x-1.5 border-t border-paper-line pt-2", SCROLL_MT)} id={`part-${part}`} data-testid={`google-tab-part-${part}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brass">{t(locale, K(`parts.${part}.label`))}</span>
      {part !== "edit" && <span className="text-[12.5px] text-ink-mute">· {t(locale, K(`parts.${part}.subtitle`))}</span>}
    </p>
  );
}

/** `first`: the page's first section (the new pages have no part headers);
 * by default, the first section of one of the old tab's parts. */
export function SectionHead({ n, id, title, meta, first, children }: { n: number; id: string; title: string; meta?: string; first?: boolean; children?: ReactNode }) {
  const top = first ?? JUMP_SECTIONS.find((s) => s.part === JUMP_SECTIONS.find((x) => x.id === id)?.part)?.id === id;
  return (
    // The first section of a part sits just under the part's header.
    <section id={id} className={cn(SCROLL_MT, top ? "mt-2" : "mt-8")} data-testid={`google-tab-${id}`}>
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
export function Box({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-paper-deep bg-white shadow-card", className)} {...rest} />;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-bold uppercase tracking-[0.14em] text-brass", className)}>{children}</div>;
}

export function SampleTag({ className }: { className?: string }) {
  const locale = useLocale();
  return <span className={cn("inline-block align-middle normal-case tracking-normal", SAMPLE_PILL, className)}>{t(locale, K("sample"))}</span>;
}

/** The Google numbers' state in words: loading, couldn't load (with
 * "Try again"), or Google has nothing yet. */
export function SyncMessage({ className, onDark = false }: { className?: string; onDark?: boolean }) {
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

export function ComingCard({ body, title, sync = false }: { body: string; title?: string; sync?: boolean }) {
  const locale = useLocale();
  return (
    <Box className="mt-3 flex flex-col gap-1 p-3.5" data-testid="google-tab-coming">
      {sync ? <SyncMessage className="text-[14px] font-semibold text-ink" /> : <p className="text-[14px] font-semibold text-ink">{title ?? t(locale, K("coming"))}</p>}
      <p className="text-[13px] text-ink-soft">{body}</p>
    </Box>
  );
}

export const monthName = (month: string, locale: Locale, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));

export function spanLabel(last: string, locale: Locale): string {
  const { from, to } = sixMonthSpan(last);
  const y = (m: string) => m.slice(0, 4);
  return y(from) === y(to) ? `${monthName(from, locale, "short")}–${monthName(to, locale, "short")} ${y(to)}` : `${monthName(from, locale, "short")} ${y(from)}–${monthName(to, locale, "short")} ${y(to)}`;
}

export const monthYear = (month: string, locale: Locale) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));

/** Section 5's ideas and the Day 23C recommendations, from the same real data. */
export function useTabIdeas(props: GoogleProfileTabProps): { ideas: Idea[]; recs: Rec[]; type: ReturnType<typeof ideaTypeOf> } {
  const timeZone = useTimeZone();
  return tabIdeasFor(props, timeZone, Date.now());
}

/** Section 1's "This week": the levers' to-dos (replies, photos, the post) and the answers. */
export function thisWeekRecs(recs: Rec[]): Rec[] {
  return thisWeekKinds(recs);
}
