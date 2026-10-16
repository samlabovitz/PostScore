"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LanguageSelector } from "@/components/LanguageSelector";
import { saveBusiness, saveWebsiteOnlyBusiness } from "@/app/actions/businesses";
import { DEFAULT_LOCALE, normalizeLocale, t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import type { PlaceLookupResult, PlaceCandidate, PlaceDetails } from "@/lib/google/places";
import type { SearchRoute } from "@/lib/google/businessSearch";
import { TradeTypeahead, tradePickToSaveFields, type TradePick } from "./TradeTypeahead";

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
/** The search API's answer: a plain lookup, plus (Day 2b) which search
 * found it and whether the website-only mode can be offered. */
type SearchResult = PlaceLookupResult & { route?: SearchRoute | null; websiteOnlyAvailable?: boolean };

/** The business the owner is linking a Google listing to (Day 2b). */
export interface AttachTarget {
  businessId: string;
  name: string | null;
}

function SaveControl({
  place,
  language,
  pick,
  attachTo,
}: {
  place: PlaceDetails;
  language: Locale;
  pick: TradePick | null;
  attachTo: AttachTarget | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function handleSave() {
    setState({ kind: "saving" });
    // normalizeLocale() runs again inside saveBusiness itself right before
    // the write — this call is just so a bad value never leaves the
    // client in the first place. tradePickToSaveFields is the exact
    // "picking a trade saves both fields; Something else saves nulls"
    // mapping — null for both means saveBusiness leaves the business
    // type to Google-category auto-detection, same as never having
    // selected a trade at all.
    const { businessTypeOverride, tradeId } = tradePickToSaveFields(pick);
    const result = await saveBusiness(place, normalizeLocale(language), businessTypeOverride, tradeId, attachTo?.businessId ?? null);
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

function DetailsView({
  place,
  language,
  onLanguageChange,
  pick,
  onPickChange,
  attachTo,
}: {
  place: PlaceDetails;
  language: Locale;
  onLanguageChange: (locale: Locale) => void;
  pick: TradePick | null;
  onPickChange: (pick: TradePick | null) => void;
  attachTo: AttachTarget | null;
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

      <TradeTypeahead place={place} locale={language} pick={pick} onPickChange={onPickChange} />

      <div className="mt-4 border-t border-paper-line pt-4">
        <SaveControl place={place} language={language} pick={pick} attachTo={attachTo} />
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
/** Day 2b: no Google listing found, but the owner gave a website —
 * score the website on its own, clearly labeled (never a PostScore). */
function WebsiteOnlyOffer({ name, location, websiteUrl }: { name: string; location: string; websiteUrl: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [language, setLanguage] = useState<Locale>(DEFAULT_LOCALE);
  const [state, setState] = useState<"idle" | "saving" | "invalid_url" | "not_enabled" | "unauthenticated" | { error: string }>("idle");

  async function handleSave() {
    setState("saving");
    const result = await saveWebsiteOnlyBusiness({ name, location, websiteUrl, language: normalizeLocale(language) });
    if (result.status === "saved") router.push(`/business/${result.businessId}`);
    else if (result.status === "error") setState({ error: result.message });
    else setState(result.status);
  }

  return (
    <Card className="flex flex-col items-start gap-3 p-5">
      <h3 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.intake.websiteOnly.heading")}</h3>
      <p className="text-sm text-ink-soft">{t(locale, "dashboard.intake.websiteOnly.body", { website: websiteUrl })}</p>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          {t(locale, "dashboard.intake.languageLabel")}
        </span>
        <div className="max-w-[200px]">
          <LanguageSelector value={language} onChange={setLanguage} />
        </div>
      </div>
      <Button type="button" variant="brass" onClick={handleSave} disabled={state === "saving"}>
        {state === "saving" ? t(locale, "dashboard.intake.websiteOnly.saving") : t(locale, "dashboard.intake.websiteOnly.button")}
      </Button>
      {state === "invalid_url" && <span className="text-sm text-red">{t(locale, "dashboard.intake.websiteOnly.invalidUrl")}</span>}
      {state === "not_enabled" && <span className="text-sm text-red">{t(locale, "dashboard.intake.websiteOnly.notEnabled")}</span>}
      {state === "unauthenticated" && <span className="text-sm text-red">{t(locale, "dashboard.intake.sessionExpiredError")}</span>}
      {typeof state === "object" && <span className="text-sm text-red">{state.error}</span>}
    </Card>
  );
}

const ROUTE_NOTE: Partial<Record<SearchRoute, MessageKey>> = {
  website_place_id: "dashboard.intake.foundVia.website_place_id",
  website_phone: "dashboard.intake.foundVia.website_phone",
  owner_name: "dashboard.intake.foundVia.owner_name",
  town_bias: "dashboard.intake.foundVia.town_bias",
};

export function AddBusinessSearch({ attachTo = null }: { attachTo?: AttachTarget | null }) {
  const locale = useLocale();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [showMore, setShowMore] = useState(false);
  // What the last search was run with — the website-only offer uses
  // exactly these, never values edited after the search.
  const [searched, setSearched] = useState<{ name: string; location: string; websiteUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [language, setLanguage] = useState<Locale>(DEFAULT_LOCALE);
  const [pick, setPick] = useState<TradePick | null>(null);

  async function runLookup(body: Record<string, string>) {
    setLoading(true);
    setResult(null);
    // A fresh lookup means a possibly different real business — any
    // trade picked for the previous listing shouldn't silently carry
    // over onto this one.
    setPick(null);
    try {
      const res = await fetch("/api/places/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as SearchResult;
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
    setSearched({ name: name.trim(), location: location.trim(), websiteUrl: websiteUrl.trim() });
    runLookup({ name: name.trim(), location: location.trim(), ownerName: ownerName.trim(), websiteUrl: websiteUrl.trim() });
  }

  function pickCandidate(candidate: PlaceCandidate) {
    runLookup({ placeId: candidate.placeId });
  }

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      {attachTo && (
        <Card className="border-brass/40 bg-brass/5 p-4 text-sm text-ink">
          {t(locale, "dashboard.intake.attachBanner", { name: attachTo.name ?? t(locale, "dashboard.overview.untitledBusiness") })}
        </Card>
      )}
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
        {/* Day 2b: optional extra ways to find a listing the plain
            search misses — used only when it finds nothing. */}
        <button
          type="button"
          onClick={() => setShowMore((open) => !open)}
          aria-expanded={showMore}
          className="mt-3 text-[13px] font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          {t(locale, "dashboard.intake.moreWaysToggle")}
        </button>
        {showMore && (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-[12.5px] text-ink-mute">{t(locale, "dashboard.intake.moreWaysHelp")}</p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <label className="mb-1 block text-[13px] font-medium text-ink-soft">{t(locale, "dashboard.intake.ownerNameLabel")}</label>
                <input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={t(locale, "dashboard.intake.ownerNamePlaceholder")}
                  autoComplete="name"
                  className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[13px] font-medium text-ink-soft">{t(locale, "dashboard.intake.websiteFieldLabel")}</label>
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder={t(locale, "dashboard.intake.websitePlaceholder")}
                  inputMode="url"
                  autoComplete="url"
                  className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
                />
              </div>
            </div>
          </div>
        )}
      </Card>

      {result && (
        <>
          <SectionHeading title={t(locale, "dashboard.intake.resultHeading")} />

          {result.status === "no_results" && (
            <Card className="flex flex-col gap-2 p-5 text-sm text-ink-soft">
              <span>{t(locale, "dashboard.intake.noMatchingBusiness")}</span>
              {!result.websiteOnlyAvailable && !attachTo && <span>{t(locale, "dashboard.intake.websiteOnly.hint")}</span>}
            </Card>
          )}

          {result.status === "no_results" && result.websiteOnlyAvailable && searched && !attachTo && (
            <WebsiteOnlyOffer name={searched.name} location={searched.location} websiteUrl={searched.websiteUrl} />
          )}

          {result.route && ROUTE_NOTE[result.route] && (
            <p className="text-[13px] text-ink-soft">
              {t(locale, ROUTE_NOTE[result.route]!, { location: searched?.location ?? "" })}
            </p>
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
                    {candidate.serviceArea && (
                      <div className="mt-1 text-[12px] font-medium text-brass">{t(locale, "dashboard.intake.serviceAreaTag")}</div>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {result.status === "found" && (
            <DetailsView
              place={result.place}
              language={language}
              onLanguageChange={setLanguage}
              pick={pick}
              onPickChange={setPick}
              attachTo={attachTo}
            />
          )}
        </>
      )}
    </div>
  );
}
