"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLock,
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconPhotoOff,
  IconRefresh,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button, buttonClasses } from "@/components/ui/Button";
import { UpgradeButton, UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { cn } from "@/lib/utils";
import { SCREENSHOT_REFRESH_COOLDOWN_DAYS, type WebsiteAnalysis } from "@/lib/scoring";
import { refreshWebsiteScreenshots } from "@/app/actions/websiteScreenshots";
import { screenshotFreshness, visibleAdditionalPages, visibleHomepageScreenshot, type GradedSite } from "@/lib/screenshotFreshness";
import { siteHost } from "@/lib/ownerWebsite";
import { formatShortDate, t, tPlural, useLocale, useTimeZone } from "@/lib/i18n";

const COOLDOWN_MS = SCREENSHOT_REFRESH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days remaining until targetMs, rounded up so "available in 1
 * day" never flips to "available now" hours early — floored at 1 while
 * still in the future. */
function daysRemainingUntil(targetMs: number): number {
  return Math.max(1, Math.ceil((targetMs - Date.now()) / DAY_MS));
}

/**
 * The one explicit way to force a fresh screenshot capture (see
 * refreshWebsiteScreenshots's own doc comment for why regular re-scans
 * never do this automatically). Eligibility is computed the same way
 * client-side (for the honest "available in N days" countdown) and
 * server-side (the actual enforcement) from the same
 * lastScreenshotRefreshAt + SCREENSHOT_REFRESH_COOLDOWN_DAYS — so the
 * button's disabled state is never just cosmetic, but a real server
 * rejection is still possible (e.g. clock skew) and shown honestly if it
 * happens.
 */
function RefreshScreenshotsControl({
  businessId,
  lastScreenshotRefreshAt,
}: {
  businessId: string;
  lastScreenshotRefreshAt: string | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "refreshing" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const nextAvailableMs = lastScreenshotRefreshAt
    ? new Date(lastScreenshotRefreshAt).getTime() + COOLDOWN_MS
    : null;
  const isTooSoon = nextAvailableMs !== null && nextAvailableMs > Date.now();
  const daysRemaining = isTooSoon ? daysRemainingUntil(nextAvailableMs!) : 0;

  async function handleRefresh() {
    setState({ kind: "refreshing" });
    const result = await refreshWebsiteScreenshots(businessId);
    if (result.status === "ok") {
      router.refresh();
      return;
    }
    if (result.status === "too_soon") {
      const days = daysRemainingUntil(new Date(result.nextAvailableAt).getTime());
      setState({ kind: "error", message: tPlural(locale, "dashboard.website.refreshAvailableInError", days) });
    } else if (result.status === "business_limit") {
      setState({ kind: "error", message: t(locale, "dashboard.website.screenshotBusinessLimit", { date: formatShortDate(result.nextAvailableAt, locale, timeZone) }) });
    } else if (result.status === "capped") {
      setState({ kind: "error", message: t(locale, "dashboard.website.screenshotsCapped") });
    } else if (result.status === "no_website") {
      setState({ kind: "error", message: t(locale, "dashboard.website.noWebsiteToScreenshot") });
    } else if (result.status === "error") {
      setState({ kind: "error", message: result.message });
    } else {
      setState({ kind: "error", message: t(locale, "dashboard.website.refreshErrorFallback") });
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 nav:items-end">
      <Button variant="default" size="sm" onClick={handleRefresh} disabled={isTooSoon || state.kind === "refreshing"}>
        <IconRefresh size={13} className={cn(state.kind === "refreshing" && "animate-spin")} />
        {state.kind === "refreshing"
          ? t(locale, "dashboard.website.refreshingScreenshots")
          : t(locale, "dashboard.website.refreshScreenshotsButton")}
      </Button>
      {isTooSoon && state.kind !== "error" && (
        <span className="text-[11.5px] text-ink-mute">
          {tPlural(locale, "dashboard.website.availableInDays", daysRemaining)}
        </span>
      )}
      {state.kind === "error" && <span className="text-[11.5px] text-red">{state.message}</span>}
    </div>
  );
}

/** One page in a simple browser frame: the top of the page, fading out at the bottom. */
function PageThumb({ label, src, onOpen }: { label: string; src: string | null; onOpen: () => void }) {
  const locale = useLocale();
  return (
    <button type="button" onClick={onOpen} disabled={!src} className="group flex w-[220px] shrink-0 snap-start flex-col gap-1.5 text-left nav:w-auto nav:min-w-0 nav:flex-1" data-testid="website-thumb">
      <span className="overflow-hidden rounded-lg border border-paper-deep bg-white shadow-card group-hover:border-ink-mute">
        <span className="flex h-5 items-center gap-1 border-b border-paper-line bg-paper px-2" aria-hidden>
          <i className="h-1.5 w-1.5 rounded-full bg-paper-deep" />
          <i className="h-1.5 w-1.5 rounded-full bg-paper-deep" />
          <i className="h-1.5 w-1.5 rounded-full bg-paper-deep" />
        </span>
        <span className="relative block h-36 overflow-hidden">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={t(locale, "dashboard.website.screenshotAlt", { label })} className="w-full object-cover object-top" />
          ) : (
            <span className="flex h-full items-center justify-center text-[12px] text-ink-mute">{t(locale, "dashboard.website.couldNotCapture")}</span>
          )}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
        </span>
      </span>
      <span className="px-0.5 text-[12.5px] font-medium text-ink-soft">{label}</span>
    </button>
  );
}

/** The homepage at a phone's size, in a phone frame. */
function PhoneThumb({ src, onOpen }: { src: string; onOpen: () => void }) {
  const locale = useLocale();
  return (
    <button type="button" onClick={onOpen} className="group flex w-[96px] shrink-0 snap-start flex-col gap-1.5 text-left" data-testid="website-thumb-phone">
      <span className="relative block h-[171px] overflow-hidden rounded-[14px] border-[3px] border-ink bg-white shadow-card group-hover:border-ink-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={t(locale, "dashboard.website.phoneAlt")} className="w-full object-cover object-top" />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
      </span>
      <span className="px-0.5 text-[12.5px] font-medium text-ink-soft">{t(locale, "dashboard.website.phoneLabel")}</span>
    </button>
  );
}

interface LightboxPage {
  label: string;
  screenshotUrl: string | null;
}

/**
 * The homepage screenshot plus every additional discovered page, in one
 * cycle — home first (index 0), then additionalPages in their existing
 * discovery-priority order (services/about/contact/menu), wrapping back
 * to home. A page whose capture failed stays in the cycle with
 * screenshotUrl: null rather than being skipped, so arrowing through
 * never silently jumps — it shows the same honest "couldn't capture"
 * state the thumbnail grid already uses.
 */
function ScreenshotLightbox({
  pages,
  index,
  onIndexChange,
  onClose,
}: {
  pages: LightboxPage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (pages.length < 2) return;
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + pages.length) % pages.length);
      else if (e.key === "ArrowRight") onIndexChange((index + 1) % pages.length);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, pages.length, onIndexChange]);

  const page = pages[index];
  if (!page) return null;

  return (
    <Modal open onClose={onClose} title={page.label} className="max-w-4xl">
      <div className="relative">
        {pages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onIndexChange((index - 1 + pages.length) % pages.length)}
              aria-label={t(locale, "dashboard.website.prevPageAriaLabel")}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white transition-colors hover:bg-ink/80"
            >
              <IconChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % pages.length)}
              aria-label={t(locale, "dashboard.website.nextPageAriaLabel")}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white transition-colors hover:bg-ink/80"
            >
              <IconChevronRight size={18} />
            </button>
          </>
        )}
        {page.screenshotUrl ? (
          <div className="max-h-[75vh] overflow-y-auto rounded-md" data-testid="screenshot-viewer-scroll">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.screenshotUrl}
              alt={t(locale, "dashboard.website.screenshotAlt", { label: page.label })}
              className="mx-auto w-full rounded-md"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md bg-paper py-24 text-center">
            <IconPhotoOff size={28} className="text-ink-mute" />
            <p className="text-sm text-ink-soft">{t(locale, "dashboard.website.lightboxCouldntCapture")}</p>
          </div>
        )}
      </div>
      {pages.length > 1 && (
        <p className="mt-3 text-center text-[12px] text-ink-mute">
          {t(locale, "dashboard.website.lightboxPageCounter", { current: index + 1, total: pages.length })}
        </p>
      )}
    </Modal>
  );
}

/**
 * "What customers actually see": a real screenshot of the live site
 * (when one could be captured), and up to ~4 other real discovered pages
 * alongside it, full-width — the itemized scoring findings that used to
 * live here moved to WebsiteScoreBreakdown, so the two views never show
 * the same numbers twice and this one is free to be purely visual.
 *
 * The homepage screenshot doubles as an expander for
 * websiteAnalysis.additionalPages — up to ~4 other real pages
 * (services/about/contact/menu) discovered and screenshotted during the
 * same scan (see lib/websiteAnalysis.ts's discoverKeyPages). Clicking any
 * screenshot (homepage or an additional page) opens ScreenshotLightbox
 * above, cycling through all of them in that same order.
 */
export function WebsiteVisualAnalysis({
  businessId,
  websiteAnalysis,
  siteUrl = null,
  site = null,
  locked = false,
  recheck = null,
}: {
  businessId: string;
  /** "Re-check my website" (with its "N of 2 left today"), beside "Refresh screenshots". */
  recheck?: React.ReactNode;
  websiteAnalysis: WebsiteAnalysis | null;
  /** Free: shown as is, but "Refresh screenshots" is a lock (promo box). */
  locked?: boolean;
  /** The site that was captured — named in the "open it yourself" note
   * when the capture showed our automated check an error page. */
  siteUrl?: string | null;
  /** The site PostScore grades (gradedWebsite), for matching the capture
   * to it — a capture of another site, or of a parked/broken listing
   * link, is never shown as theirs. */
  site?: GradedSite | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Step 2d: a capture whose stored status is 4xx/5xx is never shown,
  // and a stale one is never captioned "what customers see".
  const freshness = screenshotFreshness(websiteAnalysis, undefined, site);
  // Never a picture of a parked/broken listing link, or of another site.
  const hidden = freshness.kind === "broken_listing" || freshness.kind === "other_site";
  const additionalPages = hidden ? [] : visibleAdditionalPages(websiteAnalysis);
  const homepageScreenshotUrl = hidden ? null : visibleHomepageScreenshot(websiteAnalysis);

  // Home, then the pages we found (Services, About, Contact…): at most 4 frames.
  const lightboxPages: LightboxPage[] = websiteAnalysis
    ? [
        { label: t(locale, "dashboard.website.homepageLabel"), screenshotUrl: homepageScreenshotUrl },
        ...additionalPages.slice(0, 3).map((p) => ({ label: p.label, screenshotUrl: p.screenshotUrl })),
      ]
    : [];
  // The homepage at a phone's size (captured with the screenshots since Day 25B; absent until the next capture).
  const phoneScreenshotUrl = hidden ? null : (websiteAnalysis as { mobileScreenshotUrl?: string | null } | null)?.mobileScreenshotUrl ?? null;
  const viewerPages: LightboxPage[] = phoneScreenshotUrl ? [...lightboxPages, { label: t(locale, "dashboard.website.phoneLabel"), screenshotUrl: phoneScreenshotUrl }] : lightboxPages;

  return (
    <div>
      <div className="mb-3 flex flex-col items-start justify-between gap-3 nav:flex-row nav:items-end">
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.website.gradedSiteHeading")}
          </div>
          {/* "What customers actually see..." is a real claim ONLY a
              genuine screenshot backs up — never shown over the honest
              empty state below (Day 4 Part 2c: no screenshot must never
              be captioned as if one exists). */}
          {freshness.kind === "current" && (
            <p className="text-sm text-ink-soft">{t(locale, "dashboard.website.visualAnalysisSubtitle")}</p>
          )}
          {freshness.kind === "other_site" && (
            <p className="text-sm text-amber">{t(locale, "dashboard.website.screenshotOtherSite", { host: siteHost(freshness.siteUrl) })}</p>
          )}
          {(freshness.kind === "stale_unreachable" || freshness.kind === "stale_old") && (
            <p className="text-sm text-amber">
              {t(
                locale,
                freshness.kind === "stale_unreachable"
                  ? "dashboard.website.screenshotStaleUnreachable"
                  : "dashboard.website.screenshotStaleOld",
                { date: formatShortDate(freshness.capturedAt, locale, timeZone) }
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-3" data-testid="website-top-actions">
        {locked ? (
          // Free: a new capture is a paid call — the button is a lock.
          <div className="flex flex-col items-start gap-1.5 nav:items-end">
            <UpgradeButton feature="recheck" testId="shot-refresh-locked" className={buttonClasses("default", "sm")}>
              <IconLock size={13} aria-hidden className="text-brass" />
              {t(locale, "dashboard.website.refreshScreenshotsButton")}
            </UpgradeButton>
            <UpgradeTrigger feature="recheck" />
          </div>
        ) : (
          <RefreshScreenshotsControl
            businessId={businessId}
            lastScreenshotRefreshAt={websiteAnalysis?.lastScreenshotRefreshAt ?? null}
          />
        )}
        {recheck}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {homepageScreenshotUrl ? (
          // Day 25B: small framed pages (Home, then the pages we found) and the homepage at a phone's size; a click
          // opens the full page. Each frame fades at the bottom, so nothing looks cut off mid-text.
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 nav:mx-0 nav:px-0" data-testid="website-thumbnails">
            {lightboxPages.map((p, i) => (
              <PageThumb key={`${p.label}-${i}`} label={p.label} src={p.screenshotUrl} onOpen={() => setLightboxIndex(i)} />
            ))}
            {phoneScreenshotUrl && <PhoneThumb src={phoneScreenshotUrl} onOpen={() => setLightboxIndex(lightboxPages.length)} />}
          </div>
        ) : (
          <Card className="flex flex-col overflow-hidden p-0">
            {freshness.kind === "automated_error_page" ? (
              // Step 2d: never show a picture of an error page our automated
              // check was served — real customers may see the real page.
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                <IconPhotoOff size={28} className="text-ink-mute" />
                <p className="max-w-md text-sm text-ink-soft">
                  {t(locale, "dashboard.website.screenshotAutomatedErrorPage", { url: siteUrl ?? "" })}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                <IconPhoto size={28} className="text-ink-mute" />
                <p className="text-sm text-ink-soft">{t(locale, "dashboard.website.noPreviewCaptured")}</p>
                <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.website.noPreviewCapturedNote")}</p>
              </div>
            )}
          </Card>
        )}
        {websiteAnalysis?.lastScreenshotRefreshAt && (
          <p className="px-0.5 text-[11.5px] text-ink-mute">
            {t(locale, "dashboard.website.screenshotsCaptured", {
              date: formatShortDate(websiteAnalysis.lastScreenshotRefreshAt, locale, timeZone),
            })}
          </p>
        )}
      </div>

      {lightboxIndex !== null && viewerPages.length > 0 && (
        <ScreenshotLightbox
          pages={viewerPages}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
