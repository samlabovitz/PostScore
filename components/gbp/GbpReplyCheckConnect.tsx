"use client";

import { IconBrandGoogle, IconCircleCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { GbpDisconnectButton } from "@/components/gbp/GbpDisconnectButton";
import { GBP_REPLY_CHECK_ANCHOR, type GbpConnectResult } from "@/lib/gbpLanding";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** What the server decides for the Reviews-area connect. Null = don't show
 * it (GBP_CONNECT_PUBLIC off, or Premium — Premium connects from the
 * Google Profile page). */
export interface GbpReplyCheckState {
  connected: boolean;
  connectedAt: string | null;
  /** Client ID, secret, encryption key and redirect URI are all set. */
  configured: boolean;
  /** ?gbp=… after a connect attempt. */
  result: GbpConnectResult | null;
}

/**
 * Free and Grow: connect Google only so the read-only "Replying to
 * reviews" check can count toward their score. Small, in the Reviews
 * area; once connected, the status and Disconnect live here too.
 */
export function GbpReplyCheckConnect({ businessId, state }: { businessId: string; state: GbpReplyCheckState }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const { connected, connectedAt, configured, result } = state;

  return (
    <div
      id={GBP_REPLY_CHECK_ANCHOR}
      data-testid="gbp-reply-check"
      className="scroll-mt-20 rounded-lg border border-paper-line bg-white px-3.5 py-3"
    >
      {result && (
        <p
          role="status"
          className={cn("mb-2 text-[12.5px] font-medium", result === "connected" ? "text-green" : "text-red")}
        >
          {t(locale, `dashboard.gbpResult.${result}`)}
        </p>
      )}
      {connected ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <IconCircleCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-green" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink">
                {t(locale, "dashboard.gbpReplyCheck.connected")}
                {connectedAt && (
                  <span className="font-normal text-ink-mute">
                    {" · "}
                    {t(locale, "dashboard.connectGbp.sinceDate", { date: formatShortDate(connectedAt, locale, timeZone) })}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{t(locale, "dashboard.gbpReplyCheck.connectedBody")}</p>
            </div>
          </div>
          <GbpDisconnectButton businessId={businessId} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <div className="text-[13px] font-semibold text-ink">{t(locale, "dashboard.gbpReplyCheck.title")}</div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{t(locale, "dashboard.gbpReplyCheck.body")}</p>
          </div>
          {configured ? (
            <a href={`/api/gbp/connect?businessId=${businessId}`} className="w-fit">
              <Button size="sm" variant="brass">
                <IconBrandGoogle size={14} aria-hidden />
                {t(locale, "dashboard.gbpReplyCheck.connect")}
              </Button>
            </a>
          ) : (
            <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.gbpReplyCheck.notConfigured")}</p>
          )}
        </div>
      )}
    </div>
  );
}
