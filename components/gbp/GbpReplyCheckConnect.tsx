"use client";

import Link from "next/link";
import { IconBrandGoogle, IconCircleCheck, IconAlertTriangle, IconCrown } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { GbpDisconnectButton } from "@/components/gbp/GbpDisconnectButton";
import { gbpConnectedText, gbpResultText } from "@/components/gbp/GbpResultMessage";
import { GBP_REPLY_CHECK_ANCHOR, gbpConnectHref, type GbpConnectResult } from "@/lib/gbpLanding";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** What the server decides for the Reviews-area connect. Null = don't show
 * it (GBP_CONNECT_PUBLIC off, or Premium — Premium connects from the
 * Google Profile page). */
export interface GbpReplyCheckState {
  connected: boolean;
  connectedAt: string | null;
  locationTitle: string | null;
  locationAddress: string | null;
  needsReconnect: boolean;
  /** Client ID, secret, encryption key and redirect URI are all set. */
  configured: boolean;
  /** ?gbp=… after a connect attempt. */
  result: GbpConnectResult | null;
  /** Where this box is — the owner comes back here after Google. */
  origin: "overview" | "reviews";
  business: { name: string | null; address: string | null };
}

/**
 * Free and Grow: connect Google only so the read-only "Replying to
 * reviews" check can count toward their score. Once connected, the status
 * and Disconnect live here too. Below: one Premium line (insights and
 * listing fixes are Premium, and not live yet).
 */
export function GbpReplyCheckConnect({ businessId, state }: { businessId: string; state: GbpReplyCheckState }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const { connected, connectedAt, configured, result, needsReconnect } = state;
  const connectedLine = gbpConnectedText(locale, state.locationTitle, state.locationAddress);
  const connectButton = (label: string) =>
    configured ? (
      <a href={gbpConnectHref(businessId, state.origin)} className="w-fit">
        <Button size="sm" variant="brass">
          <IconBrandGoogle size={14} aria-hidden />
          {label}
        </Button>
      </a>
    ) : (
      <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.gbpReplyCheck.notConfigured")}</p>
    );

  return (
    <div
      id={GBP_REPLY_CHECK_ANCHOR}
      data-testid="gbp-reply-check"
      className="scroll-mt-20 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_35%,white)] bg-paper p-4"
    >
      {result && (
        <p role="status" className={cn("mb-2.5 text-[13px] font-medium", result === "connected" ? "text-green" : "text-red")}>
          {gbpResultText(locale, result, state.business)}
        </p>
      )}
      {connected ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2">
            <IconCircleCheck size={17} aria-hidden className="mt-0.5 shrink-0 text-green" />
            <div className="min-w-0">
              <div className="break-words text-[13.5px] font-semibold text-ink">
                {connectedLine ?? t(locale, "dashboard.gbpReplyCheck.connected")}
              </div>
              {connectedAt && (
                <div className="text-[12px] text-ink-mute">
                  {t(locale, "dashboard.connectGbp.sinceDate", { date: formatShortDate(connectedAt, locale, timeZone) })}
                </div>
              )}
              <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">{t(locale, "dashboard.gbpReplyCheck.connectedBody")}</p>
            </div>
          </div>
          <GbpDisconnectButton businessId={businessId} />
        </div>
      ) : needsReconnect ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2">
            <IconAlertTriangle size={17} aria-hidden className="mt-0.5 shrink-0 text-amber" />
            <p className="text-[13px] leading-snug text-ink">{t(locale, "dashboard.gbp.reconnectBody")}</p>
          </div>
          {connectButton(t(locale, "dashboard.gbp.reconnect"))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2.5">
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
              <IconBrandGoogle size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-ink">{t(locale, "dashboard.gbpReplyCheck.title")}</h3>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{t(locale, "dashboard.gbpReplyCheck.body")}</p>
            </div>
          </div>
          {connectButton(t(locale, "dashboard.gbpReplyCheck.connect"))}
        </div>
      )}
      <p data-testid="gbp-premium-upsell" className="mt-3 flex items-start gap-1.5 border-t border-paper-line pt-2.5 text-[12px] leading-snug text-ink-soft">
        <IconCrown size={13} aria-hidden className="mt-0.5 shrink-0 text-brass" />
        <span>
          {t(locale, "dashboard.gbp.premiumUpsell")}{" "}
          <Link href={`/business/${businessId}/settings#compare-plans`} className="font-semibold text-ink underline-offset-2 hover:underline">
            {t(locale, "dashboard.gbp.comparePlans")}
          </Link>
        </span>
      </p>
    </div>
  );
}
