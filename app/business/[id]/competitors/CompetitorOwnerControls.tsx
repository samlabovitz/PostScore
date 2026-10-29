"use client";

// The owner's own competitor choices, all plans (app/actions/competitorOverrides.ts):
// "Remove" with a reason on any competitor, "Removed by you" with Restore,
// and "Add a competitor" by searching Google by name.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";
import { addCompetitor, removeCompetitor, restoreCompetitor, searchCompetitorToAdd, type CompetitorSearchHit, type OverrideResult } from "@/app/actions/competitorOverrides";
import { REMOVE_REASONS, type CompetitorOverride, type RemoveReason } from "@/lib/competitorOverrides";
import { formatCount, t, tPlural, useLocale, type Locale, type MessageKey } from "@/lib/i18n";

const k = (key: string) => `dashboard.competitors.owner.${key}` as MessageKey;
const LINK = "text-[12px] font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline disabled:opacity-60";
const CHIP = "rounded-full border border-paper-deep bg-white px-2.5 py-0.5 text-[12px] font-medium text-ink hover:border-ink-mute disabled:opacity-60";

function failText(r: OverrideResult | { status: string }, locale: Locale): string {
  return t(locale, r.status === "not_enabled" ? k("notEnabled") : r.status === "limit" ? k("addLimit") : k("error"));
}

function milesText(meters: number | null, locale: Locale): string {
  if (meters === null) return "";
  const mi = meters / 1609.34;
  return t(locale, k("miles"), { miles: mi < 10 ? mi.toFixed(1) : String(Math.round(mi)) });
}

/** "Remove" → why? (Closed / Not really a competitor / Other). */
export function RemoveCompetitorButton({ businessId, placeId, name }: { businessId: string; placeId: string; name: string | null }) {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(reason: RemoveReason) {
    setBusy(true);
    setError(null);
    const r = await removeCompetitor(businessId, placeId, reason, name);
    setBusy(false);
    if (r.status === "ok") router.refresh();
    else setError(failText(r, locale));
  }

  if (!open) {
    return (
      <button type="button" data-testid="remove-competitor" className={LINK} onClick={() => setOpen(true)}>
        {t(locale, k("remove"))}
      </button>
    );
  }
  return (
    <span data-testid="remove-reasons" className="flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] text-ink-soft">{t(locale, k("why"))}</span>
      {REMOVE_REASONS.map((reason) => (
        <button key={reason} type="button" className={CHIP} disabled={busy} onClick={() => remove(reason)}>
          {t(locale, k(`reason.${reason}`))}
        </button>
      ))}
      <button type="button" className={LINK} disabled={busy} onClick={() => setOpen(false)}>
        {t(locale, "common.cancel")}
      </button>
      {error && <span className="w-full text-[12px] text-red">{error}</span>}
    </span>
  );
}

/** "Removed by you": each with its reason and Restore. */
export function RemovedByOwner({ businessId, removed }: { businessId: string; removed: CompetitorOverride[] }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (removed.length === 0) return null;
  return (
    <div data-testid="removed-by-owner" className="mt-4 rounded-xl border border-paper-line bg-paper px-4 py-3">
      <p className="text-[12.5px] font-semibold text-ink">{t(locale, k("removedHeading"))}</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] text-ink-soft">
        {removed.map((o) => (
          <li key={o.placeId} className="flex flex-wrap items-center gap-x-2">
            <span className="text-ink">{o.name ?? t(locale, "dashboard.competitors.unnamedListing")}</span>
            {o.reason && <span>· {t(locale, k(`reason.${o.reason}`))}</span>}
            <button
              type="button"
              className={LINK}
              disabled={busy !== null}
              onClick={async () => {
                setBusy(o.placeId);
                await restoreCompetitor(businessId, o.placeId);
                setBusy(null);
                router.refresh();
              }}
            >
              {t(locale, k("restore"))}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11.5px] text-ink-mute">{t(locale, k("removedNote"))}</p>
    </div>
  );
}

/** "Add a competitor": search Google by name (one search), pick one. */
export function AddCompetitor({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ kind: "idle" } | { kind: "searching" } | { kind: "hits"; hits: CompetitorSearchHit[] } | { kind: "message"; text: string; error?: boolean }>({ kind: "idle" });
  const [adding, setAdding] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setState({ kind: "searching" });
    const r = await searchCompetitorToAdd(businessId, query);
    if (r.status === "ok") setState(r.hits.length > 0 ? { kind: "hits", hits: r.hits } : { kind: "message", text: t(locale, k("noHits")) });
    else setState({ kind: "message", text: t(locale, r.status === "capped" ? k("capped") : k("error")), error: true });
  }

  async function add(hit: CompetitorSearchHit) {
    setAdding(hit.placeId);
    const r = await addCompetitor(businessId, hit.placeId);
    setAdding(null);
    if (r.status === "ok") {
      setState({ kind: "message", text: t(locale, k("added"), { name: hit.name }) });
      setQuery("");
      router.refresh();
    } else setState({ kind: "message", text: failText(r, locale), error: true });
  }

  return (
    <div data-testid="add-competitor" className="mt-4 rounded-xl border border-paper-line bg-white px-4 py-3">
      <p className="text-[12.5px] font-semibold text-ink">{t(locale, k("addHeading"))}</p>
      <p className="text-[12px] text-ink-mute">{t(locale, k("addHint"))}</p>
      <form onSubmit={search} className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(locale, k("addPlaceholder"))}
          aria-label={t(locale, k("addPlaceholder"))}
          className="min-w-0 flex-1 rounded-lg border border-paper-deep px-3 py-1.5 text-[13px] text-ink"
        />
        <button type="submit" disabled={state.kind === "searching" || query.trim().length < 2} className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
          <IconSearch size={13} aria-hidden />
          {state.kind === "searching" ? t(locale, k("searching")) : t(locale, k("search"))}
        </button>
      </form>
      {state.kind === "hits" && (
        <ul data-testid="add-competitor-hits" className="mt-2 flex flex-col gap-1.5">
          {state.hits.map((hit) => (
            <li key={hit.placeId} className="flex flex-wrap items-center justify-between gap-2 border-t border-paper-line pt-1.5 text-[12.5px]">
              <span className="min-w-0">
                <span className="font-medium text-ink">{hit.name}</span>
                <span className="text-ink-mute">
                  {" "}
                  {[hit.address, milesText(hit.distanceMeters, locale), hit.reviewCount !== null ? tPlural(locale, "dashboard.competitors.reviewCount", hit.reviewCount, { count: formatCount(hit.reviewCount, locale) }) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              {hit.alreadyListed ? (
                <span className="text-[12px] text-ink-mute">{t(locale, k("alreadyAdded"))}</span>
              ) : hit.tooFar ? (
                <span className="text-[12px] text-ink-mute">{t(locale, k("tooFar"))}</span>
              ) : (
                <button type="button" className={CHIP} disabled={adding !== null} onClick={() => add(hit)}>
                  {adding === hit.placeId ? t(locale, k("adding")) : t(locale, k("add"))}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {state.kind === "message" && <p className={state.error ? "mt-2 text-[12px] text-red" : "mt-2 text-[12px] text-ink-soft"}>{state.text}</p>}
    </div>
  );
}
