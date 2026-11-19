"use client";

// Day 23 2d-3: Settings → "Your business details". Name, address, phone
// and hours: pre-filled from the listing as Google shows it now (until
// the owner confirms), editable, and saved only when the owner confirms —
// as "provided by you" (lib/ownerDetails.ts). Hours: regular (the week
// editor the Google Profile tab uses), by appointment only, or none.
// Once confirmed the card is a short summary with "Edit details"; it
// opens on load only while not confirmed, and closes again on Confirm.

import { useState } from "react";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { GoogleMapsLogo } from "@/components/google/GoogleMapsAttribution";
import { LiveUnavailableNote } from "@/components/LiveUnavailableNote";
import { WeekHoursEditor } from "@/components/hours/WeekHoursEditor";
import { saveOwnerDetails, type OwnerDetailsCard as Card } from "@/app/actions/ownerDetails";
import { closedWeek, hoursProblems, type WeeklyHours } from "@/lib/gbpProfileEdits";
import { OWNER_DETAIL_MAX, OWNER_MAX_RANGES, ownerHoursSummary, sameOwnerDetails, sanitizeOwnerDetails, type OwnerDetails, type OwnerHours } from "@/lib/ownerDetails";
import { announceSaved } from "@/lib/savedEvent";
import { withDevReason } from "@/lib/saveFailure";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const k = (key: string) => `dashboard.settings.details.${key}` as MessageKey;
const LABEL = "text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute";
const INPUT = "w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft";
const MODES = ["regular", "appointment", "none"] as const;

type Form = { name: string; address: string; phone: string; mode: OwnerHours["kind"]; week: WeeklyHours };

const toForm = (d: OwnerDetails): Form => ({ name: d.name, address: d.address, phone: d.phone, mode: d.hours.kind, week: d.hours.kind === "regular" ? d.hours.week : closedWeek() });
/** What Confirm sends: the week only when the hours are regular. */
const toInput = (f: Form) => ({ name: f.name, address: f.address, phone: f.phone, hours: f.mode === "regular" ? { kind: "regular", week: f.week } : { kind: f.mode } });

export function OwnerDetailsCard({ businessId, card }: { businessId: string; card: Card }) {
  const locale = useLocale();
  // Day 23B: from "Update your confirmed hours", the fields start on Google's version.
  const [form, setForm] = useState<Form>(toForm(card.suggested ?? card.details));
  const [confirmed, setConfirmed] = useState<OwnerDetails | null>(card.confirmedAt ? card.details : null);
  // Collapsed to the summary once confirmed (open when there's a suggestion to confirm).
  const [editing, setEditing] = useState(!card.confirmedAt || !!card.suggested);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "saving" } | { kind: "error"; message: MessageKey; reason?: string }>({ kind: "idle" });

  const current = sanitizeOwnerDetails(toInput(form));
  const hoursOk = form.mode !== "regular" || hoursProblems(form.week).length === 0;
  const upToDate = !!confirmed && !!current && hoursOk && sameOwnerDetails(current, confirmed);
  // Until the owner confirms, the values on screen are Google's.
  const prefilled = !confirmed && !card.noListing && !card.liveUnavailable;

  async function confirm() {
    setState({ kind: "saving" });
    const result = await saveOwnerDetails(businessId, toInput(form)).catch(() => ({ status: "error" as const, reason: "the server action failed" }));
    if (result.status === "ok") {
      setConfirmed(result.details);
      setForm(toForm(result.details));
      setEditing(false);
      setState({ kind: "idle" });
      announceSaved();
    } else if (result.status === "invalid") {
      setState({ kind: "error", message: k("nameRequired") });
    } else if (result.status === "invalid_hours") {
      setState({ kind: "error", message: k("invalidHours") });
    } else if (result.status === "not_enabled") {
      setState({ kind: "error", message: k("notEnabled"), reason: result.reason });
    } else {
      setState({ kind: "error", message: k("notSaved"), reason: "reason" in result ? result.reason : undefined });
    }
  }

  const field = (key: "name" | "address" | "phone", type = "text") => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={LABEL}>{t(locale, k(key))}</span>
      <input type={type} value={form[key]} maxLength={OWNER_DETAIL_MAX[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} data-testid={`owner-detail-${key}`} className={INPUT} />
    </label>
  );

  const confirmedLine = (
    <span data-testid="owner-details-confirmed" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-green">
      <IconCheck size={14} aria-hidden />
      {t(locale, k("statusConfirmed"))}
    </span>
  );

  if (confirmed && !editing) {
    return (
      <div data-testid="owner-details-summary" className="flex flex-col gap-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[14px] font-semibold text-ink">{confirmed.name}</p>
          {(confirmed.phone || confirmed.address) && <p className="text-[13px] text-ink-soft">{[confirmed.phone, confirmed.address].filter(Boolean).join(" · ")}</p>}
          <p className="text-[13px] text-ink-soft" data-testid="owner-details-hours-summary">
            {ownerHoursSummary(confirmed.hours, locale)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {confirmedLine}
          <Button size="sm" onClick={() => setEditing(true)} data-testid="edit-owner-details">
            <IconPencil size={14} aria-hidden />
            {t(locale, k("edit"))}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="owner-details" className="flex flex-col gap-3">
      {card.liveUnavailable && !confirmed && <LiveUnavailableNote />}
      {card.suggested && (
        <p data-testid="owner-details-suggested" className="rounded-lg bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-3 py-2 text-[12.5px] text-ink">
          {t(locale, k("suggested"))}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-[12.5px] leading-snug text-ink-soft">{t(locale, k(confirmed ? "intro" : prefilled ? "introPrefilled" : "introEmpty"))}</p>
        {prefilled && (
          <div className="pt-0.5" data-testid="owner-details-attribution">
            <GoogleMapsLogo />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("name")}
        {field("phone", "tel")}
        <div className="sm:col-span-2">{field("address")}</div>
      </div>
      <fieldset className="flex flex-col gap-2" data-testid="owner-detail-hours">
        <legend className={cn(LABEL, "mb-1.5")}>{t(locale, k("hours"))}</legend>
        <div role="radiogroup" aria-label={t(locale, k("hours"))} className="flex flex-wrap gap-x-4 gap-y-1.5">
          {MODES.map((mode) => (
            <label key={mode} className="inline-flex items-center gap-1.5 text-[13px] text-ink">
              <input type="radio" name={`hours-mode-${businessId}`} value={mode} checked={form.mode === mode} onChange={() => setForm({ ...form, mode })} data-testid={`hours-mode-${mode}`} />
              {t(locale, k(`hoursMode.${mode}`))}
            </label>
          ))}
        </div>
        {!confirmed && card.noGoogleHours && (
          <p className="text-[12px] text-ink-mute" data-testid="no-google-hours">
            {t(locale, k("noGoogleHours"))}
          </p>
        )}
        {form.mode === "appointment" && (
          <p className="text-[12.5px] text-ink-soft" data-testid="appointment-note">
            {t(locale, k("appointmentNote"))}
          </p>
        )}
        {form.mode === "regular" && <WeekHoursEditor value={form.week} onChange={(week) => setForm({ ...form, week })} maxRanges={OWNER_MAX_RANGES} />}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Button variant="brass" size="sm" onClick={confirm} disabled={upToDate || state.kind === "saving" || !form.name.trim() || !hoursOk} data-testid="confirm-owner-details">
          {state.kind === "saving" ? t(locale, k("saving")) : t(locale, k("confirm"))}
        </Button>
        {confirmed ? (
          // Back to the summary without saving.
          <button
            type="button"
            data-testid="cancel-owner-details"
            onClick={() => {
              setForm(toForm(confirmed));
              setState({ kind: "idle" });
              setEditing(false);
            }}
            className="text-[12.5px] font-medium text-ink-soft hover:text-ink"
          >
            {t(locale, k("cancel"))}
          </button>
        ) : (
          <span data-testid="owner-details-not-confirmed" className="text-[12.5px] font-medium text-ink-mute">
            {t(locale, k("statusNotConfirmed"))}
          </span>
        )}
      </div>
      {state.kind === "error" && (
        <p role="alert" className="text-[12px] text-amber">
          {withDevReason(t(locale, state.message), state.reason)}
        </p>
      )}
    </div>
  );
}
