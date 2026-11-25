"use client";

// Day 23E: "Answer your customers' common questions" — self-contained (the
// section 1 redesign moves it into "What to do this week"). Google retired
// its Q&A API on Nov 3, 2025, so this never posts a Google Q&A: it fills in
// what Google itself answers from — the description, services with prices,
// customer details (parking, accessibility, payments).
// - useAnswers: what the listing has (app/actions/googleAnswers.ts), the
//   description draft, each service's price (only the owner's own
//   PostScore prices are offered — never invented), and the owner's
//   Yes / No for the details PostScore can't know.
// - AnswersPreview (Premium): one preview, "Apply to Google" (each part
//   through its existing editor, each with its own Undo). Approve all
//   sends the same payload.
// - AnswersCopy (Grow): the same drafts to copy.
// Both: an optional "Good to know" Google post and a copy-paste FAQ for the
// owner's website (with schema.org FAQPage markup).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { applyAnswersAction, openAnswers, type OpenAnswersResult } from "@/app/actions/googleAnswers";
import { undoProfileEditAction } from "@/app/actions/gbpProfileEdits";
import { undoServices } from "@/app/actions/gbpListingFields";
import { undoCustomerDetailsAction } from "@/app/actions/gbpCustomerDetails";
import type { AnswersPayload, AnswersResult, PartResult } from "@/lib/googleAnswers.server";
import { detailLabel, detailPhrase, faqEntries, faqHtml, ownerPriceFor, parsePrice, priceText, type AnswerFacts, type AnswerPart, type DetailPart } from "@/lib/googleAnswers";
import { applySpellingFix, spellingFlags, type SpellingFlag } from "@/lib/serviceSpelling";
import { descriptionProblems } from "@/lib/gbpProfileEdits";
import { qaPostText } from "@/lib/gbpPosts";
import { redraftDescription } from "@/app/actions/gbpPosts";
import { DESCRIPTION_TARGET } from "@/lib/googleRecommendations";
import { t, type MessageKey, useLocale, useTimeZone } from "@/lib/i18n";
import { DraftSteer, PostPreview, setDraftsLeft, useDraftsLeft, usePostDraft, W_BUTTON, W_BUTTON_SOFT, failedText } from "@/components/gbp/PostPreview";
import { draftsLeftAction } from "@/app/actions/gbpPosts";
import { cn } from "@/lib/utils";

const W = (key: string) => `dashboard.googleTab.w.${key}` as MessageKey;

interface ServiceEntry {
  name: string;
  /** Typed by the owner, or their PostScore price. */
  price: string;
  googlePrice: number | null;
  listed: boolean;
  include: boolean;
}

export interface AnswersState {
  status: "idle" | "loading" | "ok" | "failed";
  data: Extract<OpenAnswersResult, { status: "ok" }> | null;
  description: string;
  setDescription: (v: string) => void;
  services: ServiceEntry[];
  setService: (i: number, patch: Partial<ServiceEntry>) => void;
  addService: () => void;
  /** Attribute id → the owner's Yes / No / Skip; absent: not answered yet (nothing is chosen for them). */
  picks: Record<string, boolean | "skip">;
  setPick: (id: string, v: boolean | "skip" | null) => void;
  /** Detail questions in the missing parts not answered yet. */
  unanswered: number;
  /** Likely typos of service names, by part ("Did you mean…?"). */
  flags: Array<{ part: "description" | "services"; flag: SpellingFlag }>;
  fixFlag: (part: "description" | "services", flag: SpellingFlag) => void;
  keepWord: (word: string) => void;
  /** What "Apply" / Approve all would send now. */
  payload: AnswersPayload;
  ready: AnswerPart[];
  /** Missing, and nothing to send for it yet (e.g. details PostScore can't know). */
  needsYou: AnswerPart[];
  results: AnswersResult | null;
  setResults: (r: AnswersResult | null) => void;
  load: () => void;
}

export function useAnswers(businessId: string, opts: { auto: boolean; suggest: string[] }): AnswersState {
  const [status, setStatus] = useState<AnswersState["status"]>("idle");
  const [data, setData] = useState<AnswersState["data"]>(null);
  const [description, setDescription] = useState("");
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [picks, setPicks] = useState<Record<string, boolean | "skip">>({});
  const [keep, setKeep] = useState<string[]>([]);
  const [results, setResults] = useState<AnswersResult | null>(null);
  const started = useRef(false);
  const suggestKey = opts.suggest.join("|");

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setStatus("loading");
    openAnswers(businessId)
      .then((r) => {
        if (r.status !== "ok") return setStatus("failed");
        setData(r);
        setDescription(r.descriptionDraft ?? r.listing.description ?? "");
        const listed = r.listing.services.map((s) => {
          const own = ownerPriceFor(s.name, r.ownerPrices);
          return { name: s.name, price: s.googlePrice === null && own !== null ? String(own) : "", googlePrice: s.googlePrice, listed: true, include: true };
        });
        const have = new Set(listed.map((s) => s.name.toLowerCase()));
        const extra = [...suggestKey.split("|").filter(Boolean), ...r.ownerPrices.map((p) => p.service)]
          .filter((name, i, all) => !have.has(name.toLowerCase()) && all.findIndex((x) => x.toLowerCase() === name.toLowerCase()) === i)
          .slice(0, 8)
          .map((name) => {
            const own = ownerPriceFor(name, r.ownerPrices);
            return { name, price: own !== null ? String(own) : "", googlePrice: null, listed: false, include: true };
          });
        setServices([...listed, ...extra]);
        setStatus("ok");
      })
      .catch(() => setStatus("failed"));
  }, [businessId, suggestKey]);

  useEffect(() => {
    if (opts.auto) load();
  }, [opts.auto, load]);

  const missing = useMemo(() => data?.plan?.missing ?? [], [data]);
  // Spelling: the description and the services being added (the owner's own price list included), against common service names and the listing's own.
  const listedNames = useMemo(() => (data?.listing.services ?? []).map((x) => x.name), [data]);
  const priceNames = useMemo(() => (data?.ownerPrices ?? []).map((x) => x.service), [data]);
  const flags = useMemo(() => {
    const out: AnswersState["flags"] = [];
    if (missing.includes("description")) for (const f of spellingFlags(description, { services: listedNames, keep, prose: true, ownerTerms: priceNames })) out.push({ part: "description", flag: f });
    if (missing.includes("services"))
      for (const f of spellingFlags(services.filter((x) => !x.listed && x.include).map((x) => x.name).join(" · "), { services: listedNames, keep })) out.push({ part: "services", flag: f });
    return out;
  }, [missing, description, services, listedNames, priceNames, keep]);
  const flagged = (part: AnswerPart) => flags.some((f) => f.part === part);

  const detailRows = useMemo(() => (data?.listing.details ?? []).filter((d) => data?.plan?.details.includes(d.part)), [data]);
  const payload = useMemo<AnswersPayload>(() => {
    const out: AnswersPayload = {};
    if (missing.includes("description") && !flagged("description") && description.trim().length >= DESCRIPTION_TARGET && descriptionProblems(description).length === 0 && description.trim() !== (data?.listing.description ?? "").trim()) out.description = description.trim();
    if (missing.includes("services") && !flagged("services")) {
      const send = services.filter((s) => s.include && s.name.trim() && (s.listed ? s.googlePrice === null && parsePrice(s.price) !== null : true)).map((s) => ({ name: s.name.trim(), price: parsePrice(s.price) }));
      if (send.length) out.services = send;
    }
    const chosen = Object.fromEntries(detailRows.filter((d) => typeof picks[d.id] === "boolean").map((d) => [d.id, picks[d.id] as boolean]));
    if (missing.includes("details") && Object.keys(chosen).length) out.details = chosen;
    if (keep.length) out.keep = keep;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flagged() reads `flags`
  }, [missing, description, services, picks, data, flags, keep, detailRows]);
  const unanswered = detailRows.filter((d) => picks[d.id] === undefined).length;

  const ready = missing.filter((p) => payload[p] !== undefined && (!results?.[p] || results[p]!.status === "spelling"));
  const needsYou = missing.filter((p) => payload[p] === undefined && !(results?.[p] && "undoBatchId" in results[p]!));

  return {
    status,
    data,
    description,
    setDescription,
    services,
    setService: (i, patch) => setServices((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s))),
    addService: () => setServices((list) => [...list, { name: "", price: "", googlePrice: null, listed: false, include: true }]),
    picks,
    setPick: (id, v) =>
      setPicks((p) => {
        const next = { ...p };
        if (v === null) delete next[id];
        else next[id] = v;
        return next;
      }),
    unanswered,
    flags,
    fixFlag: (part, flag) => {
      if (part === "description") setDescription((d) => applySpellingFix(d, flag));
      else setServices((list) => list.map((x) => (x.listed ? x : { ...x, name: applySpellingFix(x.name, flag) })));
    },
    keepWord: (word) => setKeep((k) => (k.includes(word) ? k : [...k, word])),
    payload,
    ready,
    needsYou,
    results,
    setResults,
    load,
  };
}

/** The facts the FAQ and the "Good to know" post use: what's on Google plus what the owner is about to apply. */
export function answerFacts(s: AnswersState): AnswerFacts | null {
  if (!s.data) return null;
  const language = s.data.locale;
  // Natural words only — never Google's raw attribute ids.
  const yes = (part: DetailPart) => s.data!.listing.details.filter((d) => d.part === part && (typeof s.picks[d.id] === "boolean" ? s.picks[d.id] : d.current) === true).map((d) => detailPhrase(d.id, d.label, language));
  return {
    ...s.data.facts,
    parking: yes("parking"),
    accessibility: yes("accessibility"),
    payments: yes("payment"),
    services: s.services.filter((x) => x.name.trim() && (x.listed || x.include)).map((x) => ({ name: x.name.trim(), price: x.googlePrice ?? parsePrice(x.price) })),
  };
}

function PartResultLine({ businessId, part, result, onUndone }: { businessId: string; part: AnswerPart; result: PartResult; onUndone: () => void }) {
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState(false);
  if (undone) return <p className="text-[13px] text-ink-soft">{t(locale, W("ans.undone"))}</p>;
  if (result.status === "invalid") return <p className="text-[13px] text-red">{t(locale, W("failed.generic"))}</p>;
  if (result.status === "spelling") return <p className="text-[13px] text-red" data-testid={`answers-spelling-${part}`}>{t(locale, W("spelling.blocked"))}</p>;
  if (result.status === "error") return <p className="text-[13px] text-red" data-testid={`answers-failed-${part}`}>{failedText(result.error, locale)}</p>;
  const undo = async () => {
    if (!result.undoBatchId) return;
    setBusy(true);
    setError(false);
    const r = await (part === "description" ? undoProfileEditAction(businessId, "description", result.undoBatchId) : part === "services" ? undoServices(businessId, result.undoBatchId) : undoCustomerDetailsAction(businessId, result.undoBatchId)).catch(() => null);
    setBusy(false);
    if (r && (r.status === "sent" || r.status === "updated" || r.status === "pending_review" || r.status === "unconfirmed")) {
      setUndone(true);
      onUndone();
    } else setError(true);
  };
  return (
    <p className="text-[13px] font-semibold text-green" data-testid={`answers-sent-${part}`}>
      {t(locale, W(result.status === "pending_review" ? "ans.pending" : result.status === "no_change" ? "ans.noChange" : "ans.applied"))}
      {result.undoBatchId && (
        <>
          {" · "}
          <button type="button" onClick={undo} disabled={busy} className="text-ink underline underline-offset-2" data-testid={`answers-undo-${part}`}>
            {t(locale, W("ans.undo"))}
          </button>
        </>
      )}
      {error && <span className="ml-2 font-normal text-red">{t(locale, W("failed.generic"))}</span>}
    </p>
  );
}

const stepTitle = "text-[15px] font-semibold text-ink";

/** Step 2's rows: new services first, then the listed ones missing a price (at most 6); `all`: every service. */
export function serviceOrder<T extends { listed: boolean; googlePrice: number | null }>(services: T[], all: boolean): Array<{ s: T; i: number }> {
  const rows = services.map((s, i) => ({ s, i }));
  const fresh = rows.filter((r) => !r.s.listed);
  const noPrice = rows.filter((r) => r.s.listed && r.s.googlePrice === null);
  const priced = rows.filter((r) => r.s.listed && r.s.googlePrice !== null);
  return all ? [...fresh, ...noPrice, ...priced] : [...fresh, ...noPrice.slice(0, 6)];
}

/** One numbered step of the answers: its title, and "Already on your listing ✓" when nothing's missing there. */
function Step({ n, title, done, children, testId }: { n: number; title: string; done: boolean; children?: React.ReactNode; testId: string }) {
  const locale = useLocale();
  return (
    <section className="flex gap-3 border-t border-paper-line pt-4 first:border-t-0 first:pt-0" data-testid={testId}>
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", done ? "bg-[color:color-mix(in_srgb,var(--color-green)_14%,white)] text-green" : "bg-ink text-paper")}>{done ? "✓" : n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h4 className={stepTitle}>{title}</h4>
          {done && <span className="text-[13px] text-green">{t(locale, W("ans.step.done"))}</span>}
        </div>
        {!done && children}
      </div>
    </section>
  );
}

/** Premium: a simple step-by-step — 1) Description → 2) Services & prices → 3) Customer details — then one "Apply to Google". The optional "Good to know" post and website FAQ come after applying, as their own cards. */
export function AnswersPreview({ businessId, state, standaloneApply = true }: { businessId: string; state: AnswersState; standaloneApply?: boolean }) {
  const locale = useLocale();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (state.status === "idle" || state.status === "loading") return <p className="text-[13px] text-ink-mute" data-testid="answers-loading">{t(locale, W("ans.loading"))}</p>;
  if (state.status === "failed" || !state.data) return <p className="text-[13px] text-ink-mute" data-testid="answers-failed">{t(locale, W("ans.failedGoogle"))}</p>;
  const d = state.data;
  const missing = d.plan?.missing ?? [];
  if (missing.length === 0) return <p className="text-[15px] text-ink-soft" data-testid="answers-none">{t(locale, W("ans.none"))}</p>;
  const apply = async () => {
    setApplying(true);
    setError(null);
    const r = await applyAnswersAction(businessId, state.payload).catch(() => null);
    setApplying(false);
    if (!r) return setError(t(locale, W("failed.generic")));
    if (r.status === "ok") return state.setResults({ ...(state.results ?? {}), ...r.results });
    if (r.status === "editing_off") return setError(t(locale, W("readOnly")));
    setError(failedText(r.status === "wait" ? r.error : r.status === "error" ? r.error : "", locale));
  };
  const locked = (part: AnswerPart) => !!state.results?.[part] && !["error", "invalid", "spelling"].includes(state.results[part]!.status);
  const applied = Object.values(state.results ?? {}).some((r) => r && (r.status === "sent" || r.status === "pending_review" || r.status === "no_change"));
  const field = "w-full rounded-lg border border-paper-line bg-white px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:border-ink disabled:bg-paper";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4" data-testid="answers-preview">
        <p className="text-[13px] text-ink-mute">{t(locale, W("ans.why"))}</p>
        <Step n={1} title={t(locale, W("ans.desc.title"))} done={!missing.includes("description")} testId="answers-description">
          <OnGoogleNow description={d.listing.description} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-soft">{t(locale, W(locked("description") ? "ans.desc.yours" : "ans.desc.new"))}</span>
            <textarea value={state.description} onChange={(e) => state.setDescription(e.target.value)} rows={5} disabled={locked("description")} className={field} data-testid="answers-description-text" />
          </label>
          <p className={cn("text-[13px]", state.description.trim().length < DESCRIPTION_TARGET ? "text-red" : "text-ink-mute")}>{t(locale, W("ans.desc.count"), { count: state.description.trim().length })}</p>
          {descriptionProblems(state.description).filter((p) => p !== "empty").map((p) => (
            <p key={p} className="text-[13px] text-red">{t(locale, `dashboard.gbpProfileEdits.description.problem.${p}` as MessageKey)}</p>
          ))}
          {!d.descriptionDraft && !d.listing.description && <p className="text-[13px] text-ink-mute">{t(locale, W("ans.desc.noDraft"))}</p>}
          <SpellingLines state={state} part="description" />
          {!locked("description") && <DescriptionSteer businessId={businessId} state={state} />}
          {state.results?.description && <PartResultLine businessId={businessId} part="description" result={state.results.description} onUndone={() => undefined} />}
        </Step>
        <Step n={2} title={t(locale, W("ans.services.title"))} done={!missing.includes("services")} testId="answers-services">
          <p className="text-[13px] text-ink-mute">{t(locale, W("ans.services.note"))}</p>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2" data-testid="answers-service-list">
            {serviceOrder(state.services, showAll).map(({ s, i }) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-[14px]" data-testid="answers-service-row">
                {!s.listed && <input type="checkbox" checked={s.include} disabled={locked("services")} onChange={(e) => state.setService(i, { include: e.target.checked })} aria-label={t(locale, W("ans.services.include"))} className="h-5 w-5" />}
                {s.listed ? (
                  <span className="min-w-[8rem] flex-1">{s.name}</span>
                ) : (
                  <input value={s.name} onChange={(e) => state.setService(i, { name: e.target.value })} disabled={locked("services")} placeholder={t(locale, W("ans.services.name"))} className="min-h-[44px] min-w-[8rem] flex-1 rounded-lg border border-paper-line px-3 text-[14px]" />
                )}
                <ServiceMark s={s} />
                {s.googlePrice === null && (
                  <input value={s.price} onChange={(e) => state.setService(i, { price: e.target.value })} disabled={locked("services")} inputMode="decimal" placeholder={t(locale, W("ans.price"))} className={cn("min-h-[44px] w-40 rounded-lg border px-3 text-[14px]", s.price && parsePrice(s.price) === null ? "border-red" : "border-paper-line")} />
                )}
                <span className="basis-full text-[13px] text-ink-mute" data-testid="answers-service-google">
                  {s.listed ? t(locale, W("ans.services.onGoogle"), { price: s.googlePrice !== null ? priceText(s.googlePrice) : t(locale, W("ans.services.noPrice")) }) : t(locale, W("ans.services.notOnGoogle"))}
                </span>
              </li>
            ))}
          </ul>
          {!showAll && state.services.length > serviceOrder(state.services, false).length && (
            <button type="button" onClick={() => setShowAll(true)} className="inline-flex min-h-[44px] w-fit items-center text-[13px] font-semibold text-ink underline underline-offset-2" data-testid="answers-services-all">
              {t(locale, W("ans.services.showAll"), { count: state.services.filter((x) => x.listed).length })}
            </button>
          )}
          <SpellingLines state={state} part="services" />
          {!locked("services") && (
            <button type="button" onClick={state.addService} className={cn(W_BUTTON_SOFT, "w-fit")}>
              {t(locale, W("ans.services.add"))}
            </button>
          )}
          {state.results?.services && <PartResultLine businessId={businessId} part="services" result={state.results.services} onUndone={() => undefined} />}
        </Step>
        <Step n={3} title={t(locale, W("ans.details.title"))} done={!missing.includes("details")} testId="answers-details">
          <p className="text-[13px] text-ink-mute">{t(locale, W("ans.details.needsYou"))}</p>
          {(d.plan?.details ?? []).map((part) => (
            <div key={part} className="flex flex-col gap-2" data-testid={`answers-group-${part}`}>
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-soft">{t(locale, W(`ans.details.part.${part}`))}</p>
              {d.listing.details
                .filter((r) => r.part === part)
                .map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2" data-testid="answers-detail-row">
                    <span className="min-w-[13rem] flex-1 text-[14px]">{detailLabel(r.id, r.label, locale)}</span>
                    {(["yes", "no", "skip"] as const).map((v) => {
                      const value = v === "yes" ? true : v === "no" ? false : "skip";
                      const on = state.picks[r.id] === value;
                      return (
                        <button
                          key={v}
                          type="button"
                          disabled={locked("details")}
                          onClick={() => state.setPick(r.id, on ? null : value)}
                          aria-pressed={on}
                          className={cn("inline-flex min-h-[44px] min-w-[72px] items-center justify-center gap-1 rounded-lg border-2 px-4 text-[14px] font-semibold", on ? "border-ink bg-ink text-paper" : "border-paper-line bg-white text-ink hover:border-ink")}
                        >
                          {on && <span aria-hidden>✓</span>}
                          {t(locale, W(`ans.${v}`))}
                        </button>
                      );
                    })}
                  </div>
                ))}
              {d.listing.details.every((r) => r.part !== part) && <p className="text-[13px] text-ink-mute">{t(locale, W("ans.details.notOffered"))}</p>}
            </div>
          ))}
          {state.results?.details && <PartResultLine businessId={businessId} part="details" result={state.results.details} onUndone={() => undefined} />}
        </Step>
        {standaloneApply && (
          <div className="flex flex-wrap items-center gap-3 border-t border-paper-line pt-4">
            <button type="button" onClick={apply} disabled={!d.canEdit || applying || state.ready.length === 0} className={W_BUTTON} data-testid="answers-apply">
              {applying ? t(locale, W("ans.applying")) : t(locale, W("ans.apply"))}
            </button>
            {missing.includes("details") && state.unanswered > 0 && !locked("details") ? (
              <span className="text-[13px] text-ink-soft" data-testid="answers-needs-details">{t(locale, W(state.ready.length ? "ans.answerToInclude" : "ans.answerToIncludeOnly"), { count: state.unanswered })}</span>
            ) : (
              state.needsYou.length > 0 && <span className="text-[13px] text-ink-mute">{t(locale, W("ans.skipped"), { list: state.needsYou.map((p) => t(locale, W(`ans.part.${p}`))).join(", ") })}</span>
            )}
          </div>
        )}
        {!d.canEdit && <p className="text-[13px] text-ink-mute">{t(locale, W("readOnly"))}</p>}
        {error && <p className="text-[13px] text-red" data-testid="answers-error">{error}</p>}
      </div>
      {/* After applying: the two optional extras, as their own small cards. */}
      {applied && <AnswersExtras businessId={businessId} state={state} premium />}
    </div>
  );
}

/** What's on Google now, read live with the rest of the listing (never saved): the owner sees what
 * the new description replaces. */
export function OnGoogleNow({ description }: { description: string | null }) {
  const locale = useLocale();
  const text = (description ?? "").trim();
  return (
    <div className="flex flex-col gap-1" data-testid="answers-on-google">
      <span className="text-[13px] font-semibold text-ink-soft">{t(locale, W("ans.desc.onGoogle"))}</span>
      {text ? (
        <p className="whitespace-pre-wrap rounded-lg border border-paper-line bg-paper px-3.5 py-2.5 text-[14px] text-ink-soft" data-testid="answers-on-google-text">
          {text}
        </p>
      ) : (
        <p className="rounded-lg border border-paper-line bg-paper px-3.5 py-2.5 text-[14px] text-ink-mute">{t(locale, W("ans.desc.onGoogleNone"))}</p>
      )}
      {text && <span className="text-[13px] text-ink-mute">{t(locale, W("ans.desc.chars"), { count: text.length })}</span>}
    </div>
  );
}

/** "New" (not on Google yet) or "Changed" (a price added to a listed service); nothing when it stays as on Google. */
function ServiceMark({ s }: { s: ServiceEntry }) {
  const locale = useLocale();
  const changed = s.listed && s.googlePrice === null && parsePrice(s.price) !== null;
  if (s.listed && !changed) return null;
  return (
    <span className="rounded-full bg-paper px-2 py-0.5 text-[13px] font-semibold text-brass" data-testid={s.listed ? "answers-service-changed" : "answers-service-new"}>
      {t(locale, W(s.listed ? "ans.services.changed" : "ans.services.new"))}
    </span>
  );
}

/** "Draft another with PostAI" for the description: the same control and rules as the post's. */
function DescriptionSteer({ businessId, state }: { businessId: string; state: AnswersState }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const left = useDraftsLeft(businessId);
  const [busy, setBusy] = useState(false);
  const [limited, setLimited] = useState(false);
  const [failed, setFailed] = useState(false);
  // Grow's allowance before the first draft (Premium: null, unlimited).
  useEffect(() => {
    draftsLeftAction(businessId, timeZone)
      .then((r) => setDraftsLeft(businessId, r))
      .catch(() => undefined);
  }, [businessId, timeZone]);
  return (
    <>
      <DraftSteer
        // Each section of the answers box steers only itself: this one is the description.
        label={t(locale, W("steer.desc.label"))}
        placeholder={t(locale, W(state.data?.topic === "hair" ? "steer.desc.placeholder.hair" : "steer.desc.placeholder.default"))}
        busy={busy}
        left={left}
        limited={limited}
        testId="description-steer"
        onDraft={async (request) => {
          setBusy(true);
          setFailed(false);
          const r = await redraftDescription(businessId, request, timeZone).catch(() => null);
          setBusy(false);
          if (r?.status === "ok") {
            state.setDescription(r.text);
            setDraftsLeft(businessId, r.left);
          } else if (r?.status === "limit") setLimited(true);
          else setFailed(true);
        }}
      />
      {failed && <p className="text-[13px] text-red">{t(locale, W("post.failed"))}</p>}
    </>
  );
}

/** "Did you mean 'balayage'?" — one click fixes it; "Keep" leaves it as written. Nothing with a flag goes to Google. */
export function SpellingLines({ state, part }: { state: AnswersState; part: "description" | "services" }) {
  const locale = useLocale();
  const list = state.flags.filter((f) => f.part === part);
  if (list.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1" data-testid={`spelling-${part}`}>
      {list.map(({ flag }) => (
        <li key={flag.word} className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-red">{t(locale, W("spelling.didYouMean"), { word: flag.word, suggestion: flag.suggestion })}</span>
          <button type="button" onClick={() => state.fixFlag(part, flag)} className={W_BUTTON_SOFT} data-testid="spelling-fix">
            {t(locale, W("spelling.fix"), { suggestion: flag.suggestion })}
          </button>
          <button type="button" onClick={() => state.keepWord(flag.word)} className="text-[13px] font-semibold text-ink underline underline-offset-2" data-testid="spelling-keep">
            {t(locale, W("spelling.keep"), { word: flag.word })}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The optional "Good to know" post and the website FAQ. */
/** The optional "Good to know" Google post and the website FAQ: two small cards (after the answers are applied on Premium). */
function AnswersExtras({ businessId, state, premium }: { businessId: string; state: AnswersState; premium: boolean }) {
  const locale = useLocale();
  const [open, setOpen] = useState<"post" | "faq" | null>(null);
  const facts = answerFacts(state);
  const language = state.data?.locale ?? locale;
  // "Your questions, answered": the same confirmed pairs as the website FAQ.
  const entries = facts ? faqEntries(facts, language) : [];
  const gtk = qaPostText(entries, language);
  const faq = faqHtml(entries, language);
  const card = (id: "post" | "faq", title: string, body: string) => (
    <div className="flex flex-col gap-2.5 rounded-xl border border-paper-deep bg-white p-4 shadow-card" data-testid={`answers-extra-${id}`}>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="flex-1 text-[13px] text-ink-mute">{body}</p>
      <button type="button" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} className={cn(W_BUTTON_SOFT, "w-fit")} data-testid={id === "post" ? "answers-gtk-open" : "answers-faq-open"}>
        {t(locale, W(open === id ? "hide" : "ans.extra.open"))}
      </button>
    </div>
  );
  return (
    <div className="flex flex-col gap-3" data-testid="answers-extras">
      <p className="text-[13px] font-semibold text-ink-soft">{t(locale, W("ans.extra.title"))}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {gtk && card("post", t(locale, W("ans.qa.open")), t(locale, W("ans.extra.qa")))}
        {card("faq", t(locale, W("ans.faq.open")), t(locale, W("ans.extra.faq")))}
      </div>
      {open === "post" && gtk && <div className="rounded-xl border border-paper-line bg-white p-4">{premium ? <GoodToKnowPost businessId={businessId} text={gtk} /> : <CopyBlock text={gtk} rows={4} />}</div>}
      {open === "faq" && (
        <div className="flex flex-col gap-2 rounded-xl border border-paper-line bg-white p-4" data-testid="answers-faq">
          <p className="text-[13px] text-ink-mute">{t(locale, W("ans.faq.note"))}</p>
          {faq ? <CopyBlock text={faq} rows={10} /> : <p className="text-[13px] text-ink-mute">{t(locale, W("ans.faq.none"))}</p>}
        </div>
      )}
    </div>
  );
}

function GoodToKnowPost({ businessId, text }: { businessId: string; text: string }) {
  const state = usePostDraft(businessId, { day: null, auto: true, initialText: text, initialType: "qa" });
  return <PostPreview businessId={businessId} state={state} kind="qa" />;
}

/** Grow: the same drafts to copy into the Business Profile. */
export function AnswersCopy({ businessId, state }: { businessId: string; state: AnswersState }) {
  const locale = useLocale();
  const { load } = state;
  useEffect(() => load(), [load]);
  if (state.status === "idle" || state.status === "loading") return <p className="text-[13px] text-ink-mute" data-testid="answers-loading">{t(locale, W("ans.loading"))}</p>;
  if (state.status === "failed" || !state.data) return <p className="text-[13px] text-ink-mute" data-testid="answers-failed">{t(locale, W("ans.failedGoogle"))}</p>;
  const missing = state.data.plan?.missing ?? [];
  const priced = state.services.filter((s) => s.name && (s.googlePrice !== null || parsePrice(s.price) !== null));
  return (
    <div className="flex flex-col gap-2" data-testid="answers-copy">
      <p className="text-[13px] text-ink-soft">{t(locale, W("ans.grow.note"))}</p>
      {missing.includes("description") && state.description && (
        <>
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-soft">{t(locale, W("ans.desc.title"))}</p>
          <OnGoogleNow description={state.data.listing.description} />
          <p className="text-[13px] font-semibold text-ink-soft">{t(locale, W("ans.desc.new"))}</p>
          <CopyBlock text={state.description} rows={5} />
          <DescriptionSteer businessId={businessId} state={state} />
        </>
      )}
      {missing.includes("services") && priced.length > 0 && (
        <>
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-soft">{t(locale, W("ans.services.title"))}</p>
          <ul className="flex flex-col gap-1 text-[13px]" data-testid="answers-copy-services">
            {priced.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-2">
                <span className="text-ink">{s.name} — {priceText((s.googlePrice ?? parsePrice(s.price))!)}</span>
                <ServiceMark s={s} />
                <span className="text-ink-mute">{s.listed ? t(locale, W("ans.services.onGoogle"), { price: s.googlePrice !== null ? priceText(s.googlePrice) : t(locale, W("ans.services.noPrice")) }) : t(locale, W("ans.services.notOnGoogle"))}</span>
              </li>
            ))}
          </ul>
          {priced.some((s) => !s.listed || s.googlePrice === null) && <CopyBlock text={priced.filter((s) => !s.listed || s.googlePrice === null).map((s) => `${s.name} — ${priceText((s.googlePrice ?? parsePrice(s.price))!)}`).join("\n")} rows={Math.min(8, priced.length + 1)} />}
        </>
      )}
      <AnswersExtras businessId={businessId} state={state} premium={false} />
    </div>
  );
}
