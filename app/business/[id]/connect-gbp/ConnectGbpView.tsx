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
import { t, useLocale, type Locale } from "@/lib/i18n";

function buildUnlocks(
  locale: Locale
): Array<{ icon: typeof IconEdit; title: string; body: string }> {
  return [
    {
      icon: IconEdit,
      title: t(locale, "dashboard.connectGbp.unlockEditableListingTitle"),
      body: t(locale, "dashboard.connectGbp.unlockEditableListingBody"),
    },
    {
      icon: IconClipboardCheck,
      title: t(locale, "dashboard.connectGbp.unlockCompletenessFixesTitle"),
      body: t(locale, "dashboard.connectGbp.unlockCompletenessFixesBody"),
    },
    {
      icon: IconClock,
      title: t(locale, "dashboard.connectGbp.unlockReviewRecencyTitle"),
      body: t(locale, "dashboard.connectGbp.unlockReviewRecencyBody"),
    },
    {
      icon: IconMessageCircle,
      title: t(locale, "dashboard.connectGbp.unlockReplyAssistantTitle"),
      body: t(locale, "dashboard.connectGbp.unlockReplyAssistantBody"),
    },
    {
      icon: IconChartBar,
      title: t(locale, "dashboard.connectGbp.unlockReplyRateStatsTitle"),
      body: t(locale, "dashboard.connectGbp.unlockReplyRateStatsBody"),
    },
    {
      icon: IconChartBar,
      title: t(locale, "dashboard.connectGbp.unlockInsightsLeadsTitle"),
      body: t(locale, "dashboard.connectGbp.unlockInsightsLeadsBody"),
    },
    {
      icon: IconFilePencil,
      title: t(locale, "dashboard.connectGbp.unlockPostsTrackingTitle"),
      body: t(locale, "dashboard.connectGbp.unlockPostsTrackingBody"),
    },
  ];
}

function DisconnectControl({ businessId }: { businessId: string }) {
  const router = useRouter();
  const locale = useLocale();
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
        {state === "working"
          ? t(locale, "dashboard.connectGbp.disconnecting")
          : t(locale, "dashboard.connectGbp.disconnect")}
      </Button>
      {state === "error" && (
        <span className="text-sm text-red">{t(locale, "dashboard.connectGbp.disconnectError")}</span>
      )}
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
  const locale = useLocale();
  const unlocks = buildUnlocks(locale);
  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          {t(locale, "dashboard.common.backTo", {
            name: businessName ?? t(locale, "dashboard.common.businessFallback"),
          })}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          {t(locale, "dashboard.connectGbp.pageTitle")}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">{t(locale, "dashboard.connectGbp.pageSubtitle")}</p>
      </div>

      {justConnected && (
        <Card className="flex items-center gap-3 border-green/30 bg-green/5 p-4">
          <IconCircleCheck size={20} className="shrink-0 text-green" />
          <p className="text-sm text-ink">{t(locale, "dashboard.connectGbp.justConnectedMessage")}</p>
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
              <div className="text-sm font-semibold text-ink">
                {t(locale, "dashboard.connectGbp.connectedHeading")}
              </div>
              <div className="text-[12.5px] text-ink-mute">
                {connectedAt
                  ? t(locale, "dashboard.connectGbp.sinceDate", {
                      date: new Intl.DateTimeFormat(locale, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(connectedAt)),
                    })
                  : t(locale, "dashboard.connectGbp.connectedFallback")}{" "}
                {t(locale, "dashboard.connectGbp.notWiredUpSuffix")}
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
            {unlocks.map((u) => (
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
              <div className="text-sm font-semibold text-ink">
                {t(locale, "dashboard.connectGbp.readyToConnectHeading")}
              </div>
              <p className="mt-0.5 max-w-md text-[12.5px] text-ink-mute">
                {oauthConfigured
                  ? t(locale, "dashboard.connectGbp.oauthConfiguredBody")
                  : t(locale, "dashboard.connectGbp.oauthNotConfiguredBody")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link href={`/business/${businessId}`} className="text-sm font-medium text-ink-soft hover:text-ink">
                {t(locale, "dashboard.connectGbp.skipForNow")}
              </Link>
              {oauthConfigured ? (
                <a href={`/api/gbp/connect?businessId=${businessId}`}>
                  <Button variant="brass">
                    <IconBrandGoogle size={15} />
                    {t(locale, "dashboard.common.connectGoogleBusinessProfile")}
                  </Button>
                </a>
              ) : (
                <Button variant="brass" disabled>
                  <IconBrandGoogle size={15} />
                  {t(locale, "dashboard.common.connectGoogleBusinessProfile")}
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
