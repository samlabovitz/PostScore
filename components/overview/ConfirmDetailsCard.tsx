"use client";

// Day 23 2d-5: the Overview's "Confirm your business details" card, after a
// business's first scan until the owner confirms (lib/confirmDetailsCard.ts).
// The details come pre-filled from the listing as Google shows it now;
// "Confirm" saves them as provided by the owner, "Edit" opens the Settings
// editor here (components/settings/OwnerDetailsCard.tsx), "Not now" hides
// the card until the next scan (the second time, for good). Scoring never
// reads them.

import { useState } from "react";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { GoogleMapsLogo } from "@/components/google/GoogleMapsAttribution";
import { LiveUnavailableNote } from "@/components/LiveUnavailableNote";
import { OwnerDetailsCard } from "@/components/settings/OwnerDetailsCard";
import { dismissConfirmDetails, saveOwnerDetails, type OwnerDetailsCard as Card } from "@/app/actions/ownerDetails";
import { ownerHoursSummary } from "@/lib/ownerDetails";
import { announceSaved } from "@/lib/savedEvent";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

const k = (key: string) => `dashboard.overview.confirmCard.${key}` as MessageKey;

export function ConfirmDetailsCard({ businessId, card }: { businessId: string; card: Card }) {
  const locale = useLocale();
  const [mode, setMode] = useState<"summary" | "editing" | "saving" | "saved" | "hidden">(card.liveUnavailable ? "editing" : "summary");
  const [failed, setFailed] = useState(false);
  const d = card.details;

  if (mode === "hidden") return null;

  async function confirm() {
    setMode("saving");
    setFailed(false);
    const result = await saveOwnerDetails(businessId, d).catch(() => ({ status: "error" as const }));
    if (result.status === "ok") {
      setMode("saved");
      announceSaved();
    } else {
      // The fields show what's off (a missing name, hours that don't add up).
      setFailed(true);
      setMode("editing");
    }
  }

  async function notNow() {
    setMode("hidden");
    await dismissConfirmDetails(businessId).catch(() => null);
  }

  return (
    <section data-testid="confirm-details-card" className="flex flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-[17px] font-semibold text-ink">{t(locale, "dashboard.overview.confirmDetails")}</h2>
        <p className="text-[13px] leading-snug text-ink-soft">{t(locale, k("body"))}</p>
      </div>

      {mode === "saved" ? (
        <p data-testid="confirm-details-saved" className="inline-flex items-center gap-1 text-[13px] font-semibold text-green">
          <IconCheck size={15} aria-hidden />
          {t(locale, k("saved"))}
        </p>
      ) : mode === "editing" ? (
        <>
          {failed && (
            <p role="alert" className="text-[12px] text-amber">
              {t(locale, "dashboard.settings.details.notSaved")}
            </p>
          )}
          <OwnerDetailsCard businessId={businessId} card={card} />
          <button type="button" onClick={notNow} data-testid="confirm-details-not-now" className="self-start text-[13px] font-medium text-ink-soft hover:text-ink">
            {t(locale, k("notNow"))}
          </button>
        </>
      ) : (
        <>
          {card.liveUnavailable && <LiveUnavailableNote />}
          <div data-testid="confirm-details-summary" className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-paper px-3.5 py-3">
            <p className="text-[14px] font-semibold text-ink">{d.name}</p>
            {(d.phone || d.address) && <p className="text-[13px] text-ink-soft">{[d.phone, d.address].filter(Boolean).join(" · ")}</p>}
            <p className="text-[13px] text-ink-soft">{ownerHoursSummary(d.hours, locale)}</p>
            <p className="pt-1.5 text-[12px] text-ink-mute">{t(locale, k("fromGoogle"))}</p>
            <div className="pt-0.5" data-testid="confirm-details-attribution">
              <GoogleMapsLogo />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="brass" size="sm" onClick={confirm} disabled={mode === "saving" || !d.name} data-testid="confirm-details-confirm">
              {mode === "saving" ? t(locale, "dashboard.settings.details.saving") : t(locale, k("confirm"))}
            </Button>
            <Button size="sm" onClick={() => setMode("editing")} disabled={mode === "saving"} data-testid="confirm-details-edit">
              <IconPencil size={14} aria-hidden />
              {t(locale, k("edit"))}
            </Button>
            <button type="button" onClick={notNow} disabled={mode === "saving"} data-testid="confirm-details-not-now" className="text-[13px] font-medium text-ink-soft hover:text-ink">
              {t(locale, k("notNow"))}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
