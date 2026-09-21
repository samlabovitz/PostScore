"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LanguageSelector } from "@/components/LanguageSelector";
import { saveBusiness } from "@/app/actions/businesses";
import { DEFAULT_LOCALE, normalizeLocale, t, useLocale, type Locale } from "@/lib/i18n";
import type { PlaceLookupResult, PlaceCandidate, PlaceDetails } from "@/lib/google/places";

function Field({ label, value }: { label: string; value: string | null }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-0.5 border-b border-paper-line py-2.5 last:border-b-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">{label}</span>
      {value === null ? (
        <span className="text-sm italic text-ink-mute">{t(locale, "dashboard.common.notAvailable")}</span>
      ) : (
        <span className="text-sm text-ink">{value}</span>
      )}
    </div>
  );
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

/** The real "add a business" save step — the same saveBusiness() server
 * action every business in this app goes through. On success it routes
 * straight to the new business's real Overview page rather than leaving
 * the owner on a static confirmation. */
function SaveControl({ place, language }: { place: PlaceDetails; language: Locale }) {
  const router = useRouter();
  const locale = useLocale();
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function handleSave() {
    setState({ kind: "saving" });
    // normalizeLocale() runs again inside saveBusiness itself right before
    // the write — this call is just so a bad value never leaves the
    // client in the first place.
    const result = await saveBusiness(place, normalizeLocale(language));
    if (result.status === "saved") {
      setState({ kind: "saved" });
      router.push(`/business/${result.businessId}`);
    } else if (result.status === "unauthenticated") {
      setState({ kind: "unauthenticated" });
    } else {
      setState({ kind: "error", message: result.message });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="brass"
        onClick={handleSave}
        disabled={state.kind === "saving" || state.kind === "saved"}
      >
        {state.kind === "saved"
          ? t(locale, "dashboard.intake.savedOpening")
          : state.kind === "saving"
            ? t(locale, "dashboard.intake.saving")
            : t(locale, "dashboard.intake.addThisBusiness")}
      </Button>
      {state.kind === "unauthenticated" && (
        <span className="text-sm text-red">{t(locale, "dashboard.intake.sessionExpiredError")}</span>
      )}
      {state.kind === "error" && <span className="text-sm text-red">{state.message}</span>}
    </div>
  );
}

function DetailsView({ place, language, onLanguageChange }: {
  place: PlaceDetails;
  language: Locale;
  onLanguageChange: (locale: Locale) => void;
}) {
  const locale = useLocale();
  return (
    <Card className="p-5">
      <Field label={t(locale, "dashboard.intake.nameLabel")} value={place.name} />
      <Field label={t(locale, "dashboard.common.addressLabel")} value={place.formattedAddress} />
      <Field label={t(locale, "dashboard.common.phoneLabel")} value={place.phone} />
      <Field label={t(locale, "dashboard.common.websiteLabel")} value={place.website} />
      <Field
        label={t(locale, "dashboard.common.ratingLabel")}
        value={place.rating !== null ? `${place.rating.toFixed(1)} ★` : null}
      />
      <Field
        label={t(locale, "dashboard.common.reviewsLabel")}
        value={place.userRatingCount !== null ? String(place.userRatingCount) : null}
      />
      <Field label={t(locale, "dashboard.intake.categoryLabel")} value={place.primaryCategory} />

      <div className="flex flex-col gap-0.5 border-b border-paper-line py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          {t(locale, "dashboard.intake.languageLabel")}
        </span>
        <div className="mt-1 max-w-[200px]">
          <LanguageSelector value={language} onChange={onLanguageChange} />
        </div>
      </div>

      <div className="mt-4 border-t border-paper-line pt-4">
        <SaveControl place={place} language={language} />
      </div>
    </Card>
  );
}

/**
 * The real, production "add a business" flow: searches real Google
 * Places data (via /api/places/lookup, same route the internal
 * dev/places-lookup debug tool uses) and saves through the same
 * saveBusiness() server action every business in this app goes through.
 * No sample/demo business is ever offered as a shortcut — a brand-new
 * owner has to find their real listing, same as every returning owner
 * adding a second location.
 */
export function AddBusinessSearch() {
  const locale = useLocale();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlaceLookupResult | null>(null);
  const [language, setLanguage] = useState<Locale>(DEFAULT_LOCALE);

  async function runLookup(body: Record<string, string>) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/places/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as PlaceLookupResult;
      setResult(data);
    } catch {
      setResult({ status: "error", message: t(locale, "dashboard.intake.searchFailedError") });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !location.trim()) return;
    runLookup({ name: name.trim(), location: location.trim() });
  }

  function pickCandidate(candidate: PlaceCandidate) {
    runLookup({ placeId: candidate.placeId });
  }

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <SectionHeading title={t(locale, "dashboard.intake.findBusinessHeading")} />
      <Card className="p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              {t(locale, "dashboard.intake.businessNameFieldLabel")}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(locale, "dashboard.intake.businessNamePlaceholder")}
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              {t(locale, "dashboard.intake.locationFieldLabel")}
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t(locale, "dashboard.intake.locationPlaceholder")}
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <Button type="submit" variant="brass" disabled={loading || !name.trim() || !location.trim()}>
            {loading ? t(locale, "dashboard.intake.searching") : t(locale, "dashboard.intake.searchButton")}
          </Button>
        </form>
      </Card>

      {result && (
        <>
          <SectionHeading title={t(locale, "dashboard.intake.resultHeading")} />

          {result.status === "no_results" && (
            <Card className="p-5 text-sm text-ink-soft">{t(locale, "dashboard.intake.noMatchingBusiness")}</Card>
          )}

          {result.status === "error" && <Card className="p-5 text-sm text-red">{result.message}</Card>}

          {result.status === "multiple" && (
            <Card className="p-5">
              <p className="mb-3 text-sm text-ink-soft">
                {t(locale, "dashboard.intake.multipleMatches", { count: result.candidates.length })}
              </p>
              <div className="flex flex-col gap-2">
                {result.candidates.map((candidate) => (
                  <button
                    key={candidate.placeId}
                    type="button"
                    onClick={() => pickCandidate(candidate)}
                    className="rounded-lg border border-paper-deep px-3 py-2.5 text-left text-sm hover:border-ink-soft"
                  >
                    <div className="font-medium text-ink">{candidate.name}</div>
                    <div className="text-ink-mute">
                      {candidate.formattedAddress ?? t(locale, "dashboard.common.notAvailable")}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {result.status === "found" && (
            <DetailsView place={result.place} language={language} onLanguageChange={setLanguage} />
          )}
        </>
      )}
    </div>
  );
}
