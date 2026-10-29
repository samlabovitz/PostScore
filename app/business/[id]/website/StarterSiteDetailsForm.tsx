"use client";

// "Your business details" in the starter-site builder: name, type of
// business, address and phone, pre-filled from the Google listing as
// editable inputs. The owner checks or edits them and confirms; only
// confirmed details go on their own website, saved as "provided by you"
// (lib/starterSiteDetails.ts). Pre-fill + confirm is a gray area that's
// with legal counsel — see the compliance section of
// docs/product-structure.md.

import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { GoogleMapsLogo } from "@/components/google/GoogleMapsAttribution";
import { Button } from "@/components/ui/Button";
import { saveStarterSiteDetails } from "@/app/actions/starterSiteDetails";
import { withDevReason } from "@/lib/saveFailure";
import { DETAIL_FIELDS, DETAIL_MAX, type StarterSiteDetailFields } from "@/lib/starterSiteDetails";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DESIGNER_HELP, DESIGNER_INPUT, DESIGNER_LABEL } from "./DesignerSection";

const k = (key: string) => `dashboard.website.starter.details.${key}` as MessageKey;

export function StarterSiteDetailsForm({
  businessId,
  fields,
  onChange,
  confirmed,
  prefilled,
  onConfirmed,
  prefillLink = "",
}: {
  businessId: string;
  fields: StarterSiteDetailFields;
  onChange: (next: StarterSiteDetailFields) => void;
  /** The values on screen are the ones the owner confirmed. */
  confirmed: boolean;
  /** Nothing confirmed yet: the values are still Google's pre-fill. */
  prefilled: boolean;
  /** The owner confirmed these values (saved, or for this visit only). */
  onConfirmed: (fields: StarterSiteDetailFields) => void;
  /** The listing's ordering / booking link the link field started with. */
  prefillLink?: string;
}) {
  const locale = useLocale();
  const [state, setState] = useState<{ kind: "idle" } | { kind: "saving" } | { kind: "error"; message: MessageKey; reason?: string }>({ kind: "idle" });

  async function confirm() {
    setState({ kind: "saving" });
    const snapshot = fields;
    const result = await saveStarterSiteDetails(businessId, snapshot).catch(() => ({ status: "error" as const, message: "", reason: "the server action failed" }));
    if (result.status === "ok") {
      onConfirmed(snapshot);
      setState({ kind: "idle" });
    } else if (result.status === "not_enabled" || result.status === "error") {
      // Confirmed for this visit (preview and download) — just not remembered.
      onConfirmed(snapshot);
      setState({ kind: "error", message: k("notSaved"), reason: result.reason });
    } else {
      setState({ kind: "error", message: k(result.status === "invalid" ? "nameRequired" : "notSaved") });
    }
  }

  // Address full width (never cut off); name + type, then phone, side by
  // side on wider screens, stacked on a phone.
  const wide: Record<string, string> = { address: "sm:col-span-2", link: "sm:col-span-2" };

  return (
    <div data-testid="starter-details" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className={DESIGNER_HELP}>{t(locale, k(prefilled ? "introPrefilled" : "intro"))}</p>
        {/* Until confirmed, these are Google's details: the attribution as
            a quiet footnote under the helper text. */}
        {prefilled && (
          <div className="pt-0.5" data-testid="details-attribution">
            <GoogleMapsLogo />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DETAIL_FIELDS.map((field) => (
          <label key={field} className={cn("flex min-w-0 flex-col gap-1.5", wide[field])}>
            <span className={cn(DESIGNER_LABEL, "flex flex-wrap items-center gap-1.5")}>
              {t(locale, k(field))}
              {/* The owner typed their own link: theirs, not the listing's. */}
              {field === "link" && fields.link.trim() && fields.link.trim() !== prefillLink && (
                <span data-testid="link-added-by-you" className="rounded-full bg-paper-deep px-2 py-px text-[10.5px] font-semibold normal-case tracking-normal text-ink-soft">
                  {t(locale, "dashboard.memory.addedByYou")}
                </span>
              )}
            </span>
            <input
              type={field === "phone" ? "tel" : field === "link" ? "url" : "text"}
              value={fields[field]}
              maxLength={DETAIL_MAX[field]}
              onChange={(e) => onChange({ ...fields, [field]: e.target.value })}
              data-testid={`detail-${field}`}
              className={DESIGNER_INPUT}
            />
            {field === "link" && prefillLink && fields.link.trim() === prefillLink && <span className="text-[11.5px] text-ink-mute">{t(locale, k("linkHint"))}</span>}
          </label>
        ))}
      </div>
      {/* One row: Confirm on the left, the status on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Button variant="brass" size="sm" onClick={confirm} disabled={confirmed || state.kind === "saving" || !fields.name.trim()} data-testid="confirm-details">
          {state.kind === "saving" ? t(locale, k("saving")) : t(locale, k("confirm"))}
        </Button>
        {confirmed ? (
          <span data-testid="details-confirmed" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-green">
            <IconCheck size={14} aria-hidden />
            {t(locale, k("statusConfirmed"))}
          </span>
        ) : (
          <span data-testid="details-not-confirmed" className="text-[12.5px] font-medium text-ink-mute">
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
