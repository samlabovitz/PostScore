"use client";

// The Overview's Google connection notices (app/business/[id]/page.tsx):
// - Google stopped accepting PostScore's access (lib/gbpTokens.server.ts):
//   an amber banner until it's reconnected — what stops updating, and that
//   the score keeps the last Google data, with its date. Reconnect starts
//   Google's consent screen.
// - Just connected (?gbp=connected): "Google connected ✓ — your score
//   updated: 78 → 84" from the two latest snapshots (the callback saves
//   both — lib/gbpConnectedNote.ts), or "your score didn't change".
// Components only: this is a "use client" file, so the server can render
// them but never call anything else from it.

import { IconAlertTriangle, IconBrandGoogle, IconCircleCheck } from "@tabler/icons-react";
import { gbpConnectHref } from "@/lib/gbpLanding";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";

export function GoogleDisconnectedBanner({ businessId, premium, dataFrom }: { businessId: string; premium: boolean; dataFrom: string | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  return (
    <div
      role="status"
      data-testid="google-disconnected-banner"
      className="flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-amber)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] p-4 text-[13.5px] text-ink sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-2.5">
        <IconAlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-amber" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t(locale, "dashboard.notifications.google.disconnected")}</p>
          <p className="text-ink-soft">{t(locale, premium ? "dashboard.gbpConnection.banner.paused" : "dashboard.gbpConnection.banner.pausedBasic")}</p>
          <p className="text-ink-soft">
            {dataFrom ? t(locale, "dashboard.gbpConnection.banner.dataFrom", { date: formatShortDate(dataFrom, locale, timeZone) }) : t(locale, "dashboard.gbpConnection.banner.keeps")}
          </p>
        </div>
      </div>
      <a
        href={gbpConnectHref(businessId, "overview")}
        data-testid="google-reconnect"
        className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-ink bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper"
      >
        <IconBrandGoogle size={14} aria-hidden />
        {t(locale, "dashboard.notifications.google.reconnect")}
      </a>
    </div>
  );
}

/** `from` / `to`: the score just before and after connecting (null when unknown). */
export function GoogleConnectedNote({ from, to }: { from: number | null; to: number | null }) {
  const locale = useLocale();
  const text =
    from === null || to === null
      ? t(locale, "dashboard.gbpConnection.connected.plain")
      : from === to
        ? t(locale, "dashboard.gbpConnection.connected.same")
        : t(locale, "dashboard.gbpConnection.connected.changed", { from, to });
  return (
    <p role="status" data-testid="google-connected-note" className="flex items-center gap-2 rounded-xl border border-paper-deep bg-white p-3.5 text-[13.5px] font-semibold text-green">
      <IconCircleCheck size={17} aria-hidden className="shrink-0" />
      {text}
    </p>
  );
}
