"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { IconDownload, IconQrcode, IconTrendingUp } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { downloadDataUrl } from "@/lib/couponImage";
import { renderReviewSignPng } from "@/lib/reviewSignImage";
import { buildGoogleReviewUrl } from "@/lib/reviews";

/**
 * Always rendered for every business, regardless of rating or review
 * count — gated only on having a real place_id (see reviewUrl below).
 * A brand-new listing with zero reviews needs this more than anyone,
 * so it's never hidden behind a review-count threshold.
 */
export function GetMoreReviews({
  businessName,
  placeId,
}: {
  businessName: string;
  placeId: string | null;
}) {
  const reviewUrl = placeId ? buildGoogleReviewUrl(placeId) : null;

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!reviewUrl) return;
    let cancelled = false;
    QRCode.toDataURL(reviewUrl, {
      margin: 1,
      width: 400,
      color: { dark: "#14243f", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewUrl]);

  const [downloadState, setDownloadState] = useState<
    { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleDownload() {
    if (!qrDataUrl) return;
    setDownloadState({ kind: "working" });
    try {
      const png = await renderReviewSignPng({ businessName, qrDataUrl });
      downloadDataUrl(png, "review-us-sign.png");
      setDownloadState({ kind: "idle" });
    } catch (err) {
      setDownloadState({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not generate the image — try again.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
          <IconTrendingUp size={14} />
          Growth lever
        </div>
        <h2 className="mt-1.5 font-serif text-2xl font-bold text-ink">
          Get more reviews — your #1 growth lever
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
          No matter your score, more reviews bring in more customers. Make leaving one effortless.
        </p>
      </div>

      {!reviewUrl ? (
        <Card className="p-5 text-sm text-ink-soft">
          We don&apos;t have a Google place ID on file for this business yet, so we can&apos;t build
          a real review link. Re-save it from a fresh Google Places lookup to pick one up.
        </Card>
      ) : (
        <Card className="p-5">
          <div className="mb-5 font-serif text-lg font-semibold text-ink">Make it effortless</div>
          <div className="grid grid-cols-1 gap-6 nav:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="text-[13px] font-medium text-ink-soft">Shareable review link</div>
              <CopyBlock text={reviewUrl} rows={2} />
              <p className="text-[12px] text-ink-mute">
                Opens the real Google &quot;write a review&quot; screen for your listing. Text it to a
                customer, post it, or add it to a receipt or follow-up email — you send it yourself.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 border-t border-paper-line pt-5 nav:border-l nav:border-t-0 nav:pl-6 nav:pt-0">
              <div className="w-full text-[13px] font-medium text-ink-soft">Front-desk QR code</div>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Scan to leave a Google review" className="h-32 w-32" />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-paper text-ink-mute">
                  <IconQrcode size={28} />
                </div>
              )}
              <Button
                variant="brass"
                onClick={handleDownload}
                disabled={!qrDataUrl || downloadState.kind === "working"}
                className="w-full"
              >
                <IconDownload size={16} />
                {downloadState.kind === "working" ? "Generating..." : "Download"}
              </Button>
              {downloadState.kind === "error" && (
                <p className="text-[12px] text-red">{downloadState.message}</p>
              )}
              <p className="text-[12px] text-ink-mute">
                A print-ready sign for your counter or window — you print and place it yourself.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
