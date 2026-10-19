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
  IconSearch,
  IconChartFunnel,
  IconArrowRight,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { disconnectGbp } from "@/app/actions/gbp";
import { formatShortDate, t, useLocale, useTimeZone, type Locale } from "@/lib/i18n";

function buildUnlocks(
  locale: Locale,
  businessId: string
): Array<{ icon: typeof IconEdit; title: string; body: string; preview?: { href: string; label: string } }> {
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
    {
      icon: IconSearch,
      title: t(locale, "dashboard.connectGbp.unlockSearchTermsTitle"),
      body: t(locale, "dashboard.connectGbp.unlockSearchTermsBody"),
    },
    {
      icon: IconChartFunnel,
      title: t(locale, "dashboard.connectGbp.unlockSearchDemandTitle"),
      body: t(locale, "dashboard.connectGbp.unlockSearchDemandBody"),
      preview: { href: `/business/${businessId}/search-demand`, label: t(locale, "dashboard.connectGbp.unlockSearchDemandPreview") },
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
  connectOpen,
}: {
  businessId: string;
  businessName: string | null;
  connected: boolean;
  connectedAt: string | null;
  justConnected: boolean;
  error: string | null;
  oauthConfigured: boolean;
  /** GBP_CONNECT_PUBLIC — false keeps the button disabled ("coming soon"). */
  connectOpen: boolean;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const unlocks = buildUnlocks(locale, businessId);
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
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {t(locale, "dashboard.connectGbp.pageTitle")}
          </h1>
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-paper">
            {t(locale, "dashboard.overview.connectPremiumPill")}
          </span>
        </div>
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
                      date: formatShortDate(connectedAt, locale, timeZone),
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
          {/* Nine cards: one per row on narrow screens, three per row from
              lg up, so the grid always fills evenly. Grid rows stretch, so
              each row's cards match in height. The lift on hover is
              motion-safe. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="connect-unlocks">
            {unlocks.map((u) => (
              <Card
                key={u.title}
                className="flex h-full items-start gap-3.5 p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(20,33,61,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
                  <u.icon size={17} />
                </span>
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{u.title}</div>
                  <p className="mt-1 text-[12.5px] leading-snug text-ink-mute">{u.body}</p>
                  {u.preview && (
                    <Link
                      href={u.preview.href}
                      className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline"
                    >
                      {u.preview.label}
                      <IconArrowRight size={13} aria-hidden />
                    </Link>
                  )}
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
              {!connectOpen ? (
                <div className="flex flex-col items-start gap-1.5 sm:items-end">
                  <Button variant="brass" disabled aria-describedby="connect-gbp-availability">
                    <IconBrandGoogle size={15} />
                    {t(locale, "dashboard.common.connectGoogleBusinessProfile")}
                  </Button>
                  <span id="connect-gbp-availability" className="text-[12px] text-ink-soft">
                    {t(locale, "dashboard.connectGbp.availableWithPremium")}
                  </span>
                </div>
              ) : oauthConfigured ? (
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
