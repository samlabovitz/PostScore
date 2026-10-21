"use client";

// The watermarked preview itself. The Website page opens this tab and posts
// the site it built (same origin only); until then it shows how to open it.
// A watermark ("Preview · Made with PostScore · Download with Grow") is
// repeated over the whole page and can't be clicked away; the footer says
// "© PostScore preview". There's no download here.

import { useEffect, useState } from "react";
import { IconArrowLeft, IconLock } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";
import { UpgradeButton } from "@/components/upgrade/UpgradeTrigger";

export const PREVIEW_READY = "postscore-preview-ready";
export const PREVIEW_HTML = "postscore-preview-html";

/** The slim bar above the site: back to the Website page (a plain link, so
 * it works in a new tab), what this is, and — on Free — "Download with
 * Grow", which opens the side-by-side plans box. Never under the watermark. */
function PreviewBar({ businessId, free }: { businessId: string; free: boolean }) {
  const locale = useLocale();
  return (
    <header data-testid="preview-bar" className="fixed inset-x-0 top-0 z-20 flex h-11 items-center gap-3 border-b border-paper-deep bg-white px-3 text-[13px] sm:px-4">
      <a href={`/business/${businessId}/website`} data-testid="preview-back" className="inline-flex shrink-0 items-center gap-1 font-semibold text-ink hover:text-brass">
        <IconArrowLeft size={15} aria-hidden />
        <span className="hidden sm:inline">{t(locale, "dashboard.free.web.previewBack")}</span>
        <span className="sm:hidden">{t(locale, "dashboard.free.web.previewBackShort")}</span>
      </a>
      <span className="min-w-0 flex-1 truncate text-center text-ink-soft">{t(locale, "dashboard.free.web.previewLabel")}</span>
      {free ? (
        <UpgradeButton feature="grow" testId="preview-download" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
          <IconLock size={13} aria-hidden className="text-brass" />
          {t(locale, "dashboard.free.web.previewDownload")}
        </UpgradeButton>
      ) : (
        <span className="w-4 shrink-0" />
      )}
    </header>
  );
}

export function StarterPreviewFrame({ title, businessId, free }: { title: string; businessId: string; free: boolean }) {
  const locale = useLocale();
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.opener) return;
      if (event.data?.type === PREVIEW_HTML && typeof event.data.html === "string") setHtml(event.data.html);
    };
    window.addEventListener("message", onMessage);
    window.opener?.postMessage({ type: PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const mark = t(locale, "dashboard.free.web.previewWatermark");
  return (
    <div className="flex min-h-screen flex-col bg-paper pt-11" data-testid="starter-preview">
      <PreviewBar businessId={businessId} free={free} />
      <div className="relative flex-1">
        {html ? (
          <iframe title={title} srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" className="block h-[calc(100vh-84px)] w-full border-0" />
        ) : (
          <p className="p-8 text-center text-sm text-ink-soft" data-testid="preview-waiting">
            {t(locale, "dashboard.free.web.previewWaiting")}
          </p>
        )}
        {/* The watermark: repeated across the site, light, and never in the
            way — pointer-events none, so the map and its links still work. */}
        <div aria-hidden="true" data-testid="preview-watermark" className="pointer-events-none absolute inset-0 overflow-hidden select-none">
          <div className="absolute -inset-[50%] flex rotate-[-24deg] flex-col justify-center gap-28">
            {Array.from({ length: 10 }, (_, row) => (
              <div key={row} className="flex gap-28 whitespace-nowrap" style={{ marginLeft: row % 2 ? 220 : 0 }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className="text-[15px] font-semibold uppercase tracking-[0.14em] text-ink/[0.07]">
                    {mark}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className="flex h-10 items-center justify-center border-t border-paper-deep bg-white text-[12px] font-medium text-ink-soft" data-testid="preview-footer">
        {t(locale, "dashboard.free.web.previewFooter")}
      </footer>
    </div>
  );
}
