"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconArrowLeft,
  IconBrandGoogle,
  IconCircleCheck,
  IconAlertTriangle,
  IconEdit,
  IconClipboardCheck,
  IconClock,
  IconMessageCircle,
  IconChartBar,
  IconFilePencil,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { disconnectGbp } from "@/app/actions/gbp";

const UNLOCKS: Array<{ icon: typeof IconEdit; title: string; body: string }> = [
  {
    icon: IconEdit,
    title: "Live, editable listing",
    body: "Update your hours, phone, and other listing fields from PostScore instead of Google directly.",
  },
  {
    icon: IconClipboardCheck,
    title: "Profile-completeness fixes",
    body: "See exactly which listing fields are missing, and add each one straight to your action plan.",
  },
  {
    icon: IconClock,
    title: "Review recency",
    body: "Know how fresh your reviews really are, not just your total count.",
  },
  {
    icon: IconMessageCircle,
    title: "Individual reviews + AI reply assistant",
    body: "Read your actual reviews and get a drafted reply for each one, ready to post.",
  },
  {
    icon: IconChartBar,
    title: "Reply-rate stats",
    body: "Track how many of your reviews you've actually replied to.",
  },
  {
    icon: IconChartBar,
    title: "Insights + leads estimate",
    body: "Real views, calls, and clicks from your Google listing, and an estimated leads number built from them.",
  },
  {
    icon: IconFilePencil,
    title: "Google Posts tracking",
    body: "See what you've posted to Google and how it's landing.",
  },
];

function DisconnectControl({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function handleDisconnect() {
    setState("working");
    const result = await disconnectGbp(businessId);
    if (result.status === "ok") {
      router.refresh();
    } else {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="default" size="sm" onClick={handleDisconnect} disabled={state === "working"}>
        {state === "working" ? "Disconnecting..." : "Disconnect"}
      </Button>
      {state === "error" && <span className="text-sm text-red">Couldn&apos;t disconnect — try again.</span>}
    </div>
  );
}

export function ConnectGbpView({
  businessId,
  businessName,
  connected,
  connectedAt,
  justConnected,
  error,
  oauthConfigured,
}: {
  businessId: string;
  businessName: string | null;
  connected: boolean;
  connectedAt: string | null;
  justConnected: boolean;
  error: string | null;
  oauthConfigured: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          Back to {businessName ?? "business"}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          Connect your Google Business Profile
        </h1>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">
          Connecting lets PostScore read (and, for some fields, edit) your real Google Business
          Profile — on top of the public listing data we already score today.
        </p>
      </div>

      {justConnected && (
        <Card className="flex items-center gap-3 border-green/30 bg-green/5 p-4">
          <IconCircleCheck size={20} className="shrink-0 text-green" />
          <p className="text-sm text-ink">
            Connected. We&apos;re still finishing Google&apos;s review process for full API access —
            the features below unlock as each one goes live, not all at once.
          </p>
        </Card>
      )}

      {error && (
        <Card className="flex items-center gap-3 border-red/30 bg-red/5 p-4">
          <IconAlertTriangle size={20} className="shrink-0 text-red" />
          <p className="text-sm text-ink">{error}</p>
        </Card>
      )}

      {connected ? (
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green/10 text-green">
              <IconCircleCheck size={18} />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">Google Business Profile connected</div>
              <div className="text-[12.5px] text-ink-mute">
                {connectedAt
                  ? `Since ${new Date(connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
                  : "Connected."}{" "}
                Real listing/review/insights data isn&apos;t wired up yet — that&apos;s a later
                update, not something broken here.
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-paper-line pt-4">
            <DisconnectControl businessId={businessId} />
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 nav:grid-cols-2">
            {UNLOCKS.map((u) => (
              <Card key={u.title} className="flex items-start gap-3 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass/10 text-brass">
                  <u.icon size={16} />
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-ink">{u.title}</div>
                  <p className="mt-0.5 text-[12.5px] text-ink-mute">{u.body}</p>
                </div>
              </Card>
            ))}
          </div>

          <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-ink">Ready to connect?</div>
              <p className="mt-0.5 max-w-md text-[12.5px] text-ink-mute">
                {oauthConfigured
                  ? "You'll go to Google to approve access, then come back here. You can disconnect at any time."
                  : "Google Business Profile connection isn't configured in this environment yet — check back soon."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link href={`/business/${businessId}`} className="text-sm font-medium text-ink-soft hover:text-ink">
                Skip for now
              </Link>
              {oauthConfigured ? (
                <a href={`/api/gbp/connect?businessId=${businessId}`}>
                  <Button variant="brass">
                    <IconBrandGoogle size={15} />
                    Connect Google Business Profile
                  </Button>
                </a>
              ) : (
                <Button variant="brass" disabled>
                  <IconBrandGoogle size={15} />
                  Connect Google Business Profile
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
