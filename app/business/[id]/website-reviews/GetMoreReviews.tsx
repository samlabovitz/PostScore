"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { IconDownload, IconMessage2, IconQrcode, IconSend } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { downloadDataUrl } from "@/lib/couponImage";
import { renderReviewSignPng } from "@/lib/reviewSignImage";
import { buildGoogleReviewUrl } from "@/lib/reviews";

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
    <div className="flex flex-col gap-6">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
          <IconSend size={14} />
          Get more reviews
        </div>
        <h2 className="mt-1.5 font-serif text-2xl font-bold text-ink">
          The highest-impact thing you can do
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
          Every check above moves with your real rating and review count. Making it as easy as
          possible for a happy customer to leave one is the single biggest lever you have.
        </p>
      </div>

      {!reviewUrl ? (
        <Card className="p-5 text-sm text-ink-soft">
          We don&apos;t have a Google place ID on file for this business yet, so we can&apos;t build
          a real review link. Re-save it from a fresh Google Places lookup to pick one up.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 nav:grid-cols-2">
          <Card className="flex flex-col gap-4 p-5">
            <div className="text-[13px] font-medium text-ink-soft">Your review link</div>
            <CopyBlock text={reviewUrl} rows={2} />
            <p className="text-[12px] text-ink-mute">
              This opens the real Google &quot;write a review&quot; screen for your listing. Share it
              yourself — text it to a customer, post it, or add it to a receipt or follow-up email.
            </p>
          </Card>

          <Card className="flex flex-col items-center gap-4 p-5">
            <div className="w-full text-[13px] font-medium text-ink-soft">
              QR code for a front-desk sign
            </div>
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
              {downloadState.kind === "working" ? "Generating..." : "Download sign"}
            </Button>
            {downloadState.kind === "error" && (
              <p className="text-[12px] text-red">{downloadState.message}</p>
            )}
            <p className="text-[12px] text-ink-mute">
              A print-ready sign for your counter or window. PostScore doesn&apos;t post this or send
              it to anyone — you print and place it yourself.
            </p>
          </Card>
        </div>
      )}

      <Card className="flex items-start gap-3 p-4 opacity-70">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink-mute">
          <IconMessage2 size={16} />
        </span>
        <div>
          <div className="text-[13px] font-semibold text-ink">
            Auto-text customers after their visit
            <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-mute">
              Coming soon
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-mute">
            Automatically texting a review link after a visit needs a way to know who visited and
            when — we don&apos;t have that yet. For now, sharing the link or sign above is on you.
          </p>
        </div>
      </Card>
    </div>
  );
}
