"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconPhotoOff,
  IconRefresh,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { SCREENSHOT_REFRESH_COOLDOWN_DAYS, type WebsiteAnalysis, type WebsiteAnalysisPage } from "@/lib/scoring";
import { refreshWebsiteScreenshots } from "@/app/actions/websiteScreenshots";

const COOLDOWN_MS = SCREENSHOT_REFRESH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days remaining until targetMs, rounded up so "available in 1
 * day" never flips to "available now" hours early — floored at 1 while
 * still in the future. */
function daysRemainingUntil(targetMs: number): number {
  return Math.max(1, Math.ceil((targetMs - Date.now()) / DAY_MS));
}

/** "Sep 11, 2026" — used only for the honest "Screenshots captured ..."
 * caption below, read from lastScreenshotRefreshAt (the real capture
 * date), never checkedAt (which updates on every re-scan regardless of
 * whether screenshots were touched — see saveBusiness's doc comment). */
function formatCaptureDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
      setState({ kind: "error", message: `Screenshots refresh available in ${days} day${days === 1 ? "" : "s"}.` });
    } else if (result.status === "no_website") {
      setState({ kind: "error", message: "This business has no website to screenshot." });
    } else if (result.status === "error") {
      setState({ kind: "error", message: result.message });
    } else {
      setState({ kind: "error", message: "Couldn't refresh screenshots — try again shortly." });
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 nav:items-end">
      <Button variant="default" size="sm" onClick={handleRefresh} disabled={isTooSoon || state.kind === "refreshing"}>
        <IconRefresh size={13} className={cn(state.kind === "refreshing" && "animate-spin")} />
        {state.kind === "refreshing" ? "Refreshing..." : "Refresh screenshots"}
      </Button>
      {isTooSoon && state.kind !== "error" && (
        <span className="text-[11.5px] text-ink-mute">
          Available in {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
        </span>
      )}
      {state.kind === "error" && <span className="text-[11.5px] text-red">{state.message}</span>}
    </div>
  );
}

function AdditionalPageThumbnail({
  page,
  onOpen,
}: {
  page: WebsiteAnalysisPage;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!page.screenshotUrl}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-paper-line text-left",
        page.screenshotUrl ? "hover:border-ink-mute" : "cursor-default"
      )}
    >
      {page.screenshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.screenshotUrl}
          alt={`Screenshot of the ${page.label} page`}
          className="h-20 w-full object-cover object-top"
        />
      ) : (
        <div className="flex h-20 w-full flex-col items-center justify-center gap-1 bg-paper text-ink-mute">
          <IconPhotoOff size={16} />
        </div>
      )}
      <div className="px-2 py-1.5">
        <div className="truncate text-[12px] font-medium text-ink">{page.label}</div>
        <div className="text-[11px] text-ink-mute">
          {page.screenshotUrl ? "Tap to view" : "Couldn't capture this page"}
        </div>
      </div>
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
              aria-label="Previous page"
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white transition-colors hover:bg-ink/80"
            >
              <IconChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % pages.length)}
              aria-label="Next page"
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white transition-colors hover:bg-ink/80"
            >
              <IconChevronRight size={18} />
            </button>
          </>
        )}
        {page.screenshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.screenshotUrl}
            alt={`Screenshot of the ${page.label} page`}
            className="w-full rounded-md"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md bg-paper py-24 text-center">
            <IconPhotoOff size={28} className="text-ink-mute" />
            <p className="text-sm text-ink-soft">We couldn&apos;t capture this page.</p>
          </div>
        )}
      </div>
      {pages.length > 1 && (
        <p className="mt-3 text-center text-[12px] text-ink-mute">
          {index + 1} of {pages.length}
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
}: {
  businessId: string;
  websiteAnalysis: WebsiteAnalysis | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const additionalPages = websiteAnalysis?.additionalPages ?? [];
  const hasAdditionalPages = additionalPages.length > 0;

  const lightboxPages: LightboxPage[] = websiteAnalysis
    ? [
        { label: "Homepage", screenshotUrl: websiteAnalysis.screenshotUrl },
        ...additionalPages.map((p) => ({ label: p.label, screenshotUrl: p.screenshotUrl })),
      ]
    : [];

  return (
    <div>
      <div className="mb-3 flex flex-col items-start justify-between gap-3 nav:flex-row nav:items-end">
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            Visual analysis
          </div>
          <p className="text-sm text-ink-soft">What customers actually see when they visit your live site.</p>
        </div>
        <RefreshScreenshotsControl
          businessId={businessId}
          lastScreenshotRefreshAt={websiteAnalysis?.lastScreenshotRefreshAt ?? null}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Card className="flex flex-col overflow-hidden p-0">
          {websiteAnalysis?.screenshotUrl ? (
            <>
              <button
                type="button"
                onClick={() => setLightboxIndex(0)}
                aria-label="View full-size homepage screenshot"
                className="block w-full text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={websiteAnalysis.screenshotUrl}
                  alt="Screenshot of the business's live website"
                  className="max-h-[440px] w-full border-b border-paper-line object-cover object-top"
                />
              </button>
              {hasAdditionalPages && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  aria-expanded={expanded}
                  className="flex items-center justify-center gap-1.5 border-b border-paper-line px-3 py-2 text-[12.5px] font-medium text-ink-soft hover:text-ink"
                >
                  {expanded
                    ? "Hide other pages"
                    : `See ${additionalPages.length} more page${additionalPages.length === 1 ? "" : "s"}`}
                  <IconChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} />
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
              <IconPhoto size={28} className="text-ink-mute" />
              <p className="text-sm text-ink-soft">
                We couldn&apos;t capture a preview of this site.
              </p>
              <p className="text-[12px] text-ink-mute">
                Some sites block automated screenshot tools, or a preview hasn&apos;t been captured
                yet — this doesn&apos;t affect your Website score.
              </p>
            </div>
          )}

          {hasAdditionalPages && expanded && (
            <div className="grid grid-cols-2 gap-3 p-4 nav:grid-cols-4">
              {additionalPages.map((page, i) => (
                <AdditionalPageThumbnail key={page.url} page={page} onOpen={() => setLightboxIndex(i + 1)} />
              ))}
            </div>
          )}
        </Card>
        {websiteAnalysis?.lastScreenshotRefreshAt && (
          <p className="px-0.5 text-[11.5px] text-ink-mute">
            Screenshots captured {formatCaptureDate(websiteAnalysis.lastScreenshotRefreshAt)}
          </p>
        )}
      </div>

      {lightboxIndex !== null && lightboxPages.length > 0 && (
        <ScreenshotLightbox
          pages={lightboxPages}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
