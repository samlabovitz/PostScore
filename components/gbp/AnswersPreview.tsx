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
import { detailLabel, detailPhrase, faqEntries, faqHtml, goodToKnowAnswers, ownerPriceFor, parsePrice, priceText, type AnswerFacts, type AnswerPart, type DetailPart } from "@/lib/googleAnswers";
import { applySpellingFix, spellingFlags, type SpellingFlag } from "@/lib/serviceSpelling";
import { descriptionProblems } from "@/lib/gbpProfileEdits";
import { goodToKnowText } from "@/lib/gbpPosts";
import { DESCRIPTION_TARGET } from "@/lib/googleRecommendations";
import { t, type MessageKey, useLocale } from "@/lib/i18n";
import { PostPreview, usePostDraft, W_BUTTON, W_BUTTON_SOFT, failedText } from "@/components/gbp/PostPreview";
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
  if (undone) return <p className="text-[12px] text-ink-soft">{t(locale, W("ans.undone"))}</p>;
  if (result.status === "invalid") return <p className="text-[12px] text-red">{t(locale, W("failed.generic"))}</p>;
  if (result.status === "spelling") return <p className="text-[12px] text-red" data-testid={`answers-spelling-${part}`}>{t(locale, W("spelling.blocked"))}</p>;
  if (result.status === "error") return <p className="text-[12px] text-red" data-testid={`answers-failed-${part}`}>{failedText(result.error, locale)}</p>;
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
    <p className="text-[12px] font-semibold text-green" data-testid={`answers-sent-${part}`}>
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

const sectionTitle = "text-[12px] font-bold uppercase tracking-[0.08em] text-ink-soft";

/** Premium: one preview for every missing answer, and "Apply to Google". */
export function AnswersPreview({ businessId, state, standaloneApply = true }: { businessId: string; state: AnswersState; standaloneApply?: boolean }) {
  const locale = useLocale();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state.status === "idle" || state.status === "loading") return <p className="text-[12.5px] text-ink-mute" data-testid="answers-loading">{t(locale, W("ans.loading"))}</p>;
  if (state.status === "failed" || !state.data) return <p className="text-[12.5px] text-ink-mute" data-testid="answers-failed">{t(locale, W("ans.failed"))}</p>;
  const d = state.data;
  const missing = d.plan?.missing ?? [];
  if (missing.length === 0) return <p className="text-[12.5px] text-ink-soft" data-testid="answers-none">{t(locale, W("ans.none"))}</p>;
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

  return (
    <div className="flex flex-col gap-3" data-testid="answers-preview">
      <p className="text-[12px] text-ink-mute">{t(locale, W("ans.why"))}</p>
      {missing.includes("description") && (
        <section className="flex flex-col gap-1" data-testid="answers-description">
          <h4 className={sectionTitle}>{t(locale, W("ans.desc.title"))}</h4>
          <p className="text-[12px] text-ink-mute">{t(locale, W("ans.desc.now"), { count: (d.listing.description ?? "").trim().length })}</p>
          <textarea value={state.description} onChange={(e) => state.setDescription(e.target.value)} rows={5} disabled={locked("description")} className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-[13px] outline-none focus:border-ink disabled:bg-paper" />
          <p className={cn("text-[11.5px]", state.description.trim().length < DESCRIPTION_TARGET ? "text-red" : "text-ink-mute")}>{t(locale, W("ans.desc.count"), { count: state.description.trim().length })}</p>
          {descriptionProblems(state.description).filter((p) => p !== "empty").map((p) => (
            <p key={p} className="text-[12px] text-red">{t(locale, `dashboard.gbpProfileEdits.description.problem.${p}` as MessageKey)}</p>
          ))}
          {!d.descriptionDraft && !d.listing.description && <p className="text-[12px] text-ink-mute">{t(locale, W("ans.desc.noDraft"))}</p>}
          <SpellingLines state={state} part="description" />
          {state.results?.description && <PartResultLine businessId={businessId} part="description" result={state.results.description} onUndone={() => undefined} />}
        </section>
      )}
      {missing.includes("services") && (
        <section className="flex flex-col gap-1" data-testid="answers-services">
          <h4 className={sectionTitle}>{t(locale, W("ans.services.title"))}</h4>
          <p className="text-[12px] text-ink-mute">{t(locale, W("ans.services.note"))}</p>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {state.services.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                {!s.listed && <input type="checkbox" checked={s.include} disabled={locked("services")} onChange={(e) => state.setService(i, { include: e.target.checked })} aria-label={t(locale, W("ans.services.include"))} />}
                {s.listed ? (
                  <span className="min-w-[8rem] flex-1 font-medium">{s.name}</span>
                ) : (
                  <input value={s.name} onChange={(e) => state.setService(i, { name: e.target.value })} disabled={locked("services")} placeholder={t(locale, W("ans.services.name"))} className="h-[28px] min-w-[8rem] rounded-md border border-paper-line px-2" />
                )}
                {!s.listed && <span className="rounded-full bg-paper px-1.5 text-[10.5px] font-bold text-brass">{t(locale, W("ans.services.new"))}</span>}
                {s.googlePrice !== null ? (
                  <span className="text-ink-mute">{t(locale, W("ans.services.onGoogle"), { price: priceText(s.googlePrice) })}</span>
                ) : (
                  <input value={s.price} onChange={(e) => state.setService(i, { price: e.target.value })} disabled={locked("services")} inputMode="decimal" placeholder={t(locale, W("ans.price"))} className={cn("h-[28px] w-28 rounded-md border px-2", s.price && parsePrice(s.price) === null ? "border-red" : "border-paper-line")} />
                )}
              </li>
            ))}
          </ul>
          <SpellingLines state={state} part="services" />
          {!locked("services") && (
            <button type="button" onClick={state.addService} className="w-fit text-[12px] font-semibold text-ink underline underline-offset-2">
              {t(locale, W("ans.services.add"))}
            </button>
          )}
          {state.results?.services && <PartResultLine businessId={businessId} part="services" result={state.results.services} onUndone={() => undefined} />}
        </section>
      )}
      {missing.includes("details") && (
        <section className="flex flex-col gap-1" data-testid="answers-details">
          <h4 className={sectionTitle}>{t(locale, W("ans.details.title"))}</h4>
          <p className="text-[12px] text-ink-mute">{t(locale, W("ans.details.needsYou"))}</p>
          {(d.plan?.details ?? []).map((part) => (
            <div key={part} className="flex flex-col gap-0.5">
              <p className="text-[12px] font-semibold">{t(locale, W(`ans.details.part.${part}`))}</p>
              {d.listing.details
                .filter((r) => r.part === part)
                .map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 py-0.5" data-testid="answers-detail-row">
                    <span className="min-w-[13rem] text-[15px]">{detailLabel(r.id, r.label, locale)}</span>
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
                          className={cn("inline-flex min-h-[44px] min-w-[72px] items-center justify-center gap-1 rounded-lg border-2 px-4 text-[15px] font-semibold", on ? "border-ink bg-ink text-paper" : "border-paper-line bg-white text-ink hover:border-ink")}
                        >
                          {on && <span aria-hidden>✓</span>}
                          {t(locale, W(`ans.${v}`))}
                        </button>
                      );
                    })}
                  </div>
                ))}
              {d.listing.details.every((r) => r.part !== part) && <p className="text-[12px] text-ink-mute">{t(locale, W("ans.details.notOffered"))}</p>}
            </div>
          ))}
          {state.results?.details && <PartResultLine businessId={businessId} part="details" result={state.results.details} onUndone={() => undefined} />}
        </section>
      )}
      {standaloneApply && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={apply} disabled={!d.canEdit || applying || state.ready.length === 0} className={W_BUTTON} data-testid="answers-apply">
            {applying ? t(locale, W("ans.applying")) : t(locale, W("ans.apply"))}
          </button>
          {missing.includes("details") && state.unanswered > 0 && !locked("details") ? (
            <span className="text-[12.5px] text-ink-soft" data-testid="answers-needs-details">{t(locale, W(state.ready.length ? "ans.answerToInclude" : "ans.answerToIncludeOnly"), { count: state.unanswered })}</span>
          ) : (
            state.needsYou.length > 0 && <span className="text-[12px] text-ink-mute">{t(locale, W("ans.skipped"), { list: state.needsYou.map((p) => t(locale, W(`ans.part.${p}`))).join(", ") })}</span>
          )}
        </div>
      )}
      {!d.canEdit && <p className="text-[12px] text-ink-mute">{t(locale, W("readOnly"))}</p>}
      {error && <p className="text-[12px] text-red" data-testid="answers-error">{error}</p>}
      <AnswersExtras businessId={businessId} state={state} premium />
    </div>
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
        <li key={flag.word} className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-red">{t(locale, W("spelling.didYouMean"), { word: flag.word, suggestion: flag.suggestion })}</span>
          <button type="button" onClick={() => state.fixFlag(part, flag)} className={W_BUTTON_SOFT} data-testid="spelling-fix">
            {t(locale, W("spelling.fix"), { suggestion: flag.suggestion })}
          </button>
          <button type="button" onClick={() => state.keepWord(flag.word)} className="text-[12px] font-semibold text-ink underline underline-offset-2" data-testid="spelling-keep">
            {t(locale, W("spelling.keep"), { word: flag.word })}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The optional "Good to know" post and the website FAQ. */
function AnswersExtras({ businessId, state, premium }: { businessId: string; state: AnswersState; premium: boolean }) {
  const locale = useLocale();
  const [open, setOpen] = useState<"post" | "faq" | null>(null);
  const facts = answerFacts(state);
  const language = state.data?.locale ?? locale;
  const gtk = facts ? goodToKnowText(facts.name, goodToKnowAnswers(facts, language), language) : null;
  const faq = facts ? faqHtml(faqEntries(facts, language), language) : "";
  return (
    <div className="flex flex-col gap-2 border-t border-paper-line/70 pt-2" data-testid="answers-extras">
      <div className="flex flex-wrap gap-2">
        {gtk && (
          <button type="button" onClick={() => setOpen(open === "post" ? null : "post")} aria-expanded={open === "post"} className={W_BUTTON_SOFT} data-testid="answers-gtk-open">
            {t(locale, W("ans.gtk.open"))}
          </button>
        )}
        <button type="button" onClick={() => setOpen(open === "faq" ? null : "faq")} aria-expanded={open === "faq"} className={W_BUTTON_SOFT} data-testid="answers-faq-open">
          {t(locale, W("ans.faq.open"))}
        </button>
      </div>
      {open === "post" && gtk && (premium ? <GoodToKnowPost businessId={businessId} text={gtk} /> : <CopyBlock text={gtk} rows={4} />)}
      {open === "faq" && (
        <div className="flex flex-col gap-1" data-testid="answers-faq">
          <p className="text-[12px] text-ink-mute">{t(locale, W("ans.faq.note"))}</p>
          {faq ? <CopyBlock text={faq} rows={10} /> : <p className="text-[12px] text-ink-mute">{t(locale, W("ans.faq.none"))}</p>}
        </div>
      )}
    </div>
  );
}

function GoodToKnowPost({ businessId, text }: { businessId: string; text: string }) {
  const state = usePostDraft(businessId, { day: null, auto: true, initialText: text });
  return <PostPreview businessId={businessId} state={state} kind="good_to_know" />;
}

/** Grow: the same drafts to copy into the Business Profile. */
export function AnswersCopy({ businessId, state }: { businessId: string; state: AnswersState }) {
  const locale = useLocale();
  const { load } = state;
  useEffect(() => load(), [load]);
  if (state.status === "idle" || state.status === "loading") return <p className="text-[12.5px] text-ink-mute" data-testid="answers-loading">{t(locale, W("ans.loading"))}</p>;
  if (state.status === "failed" || !state.data) return <p className="text-[12.5px] text-ink-mute" data-testid="answers-failed">{t(locale, W("ans.failed"))}</p>;
  const missing = state.data.plan?.missing ?? [];
  const priced = state.services.filter((s) => s.name && (s.googlePrice !== null || parsePrice(s.price) !== null));
  return (
    <div className="flex flex-col gap-2" data-testid="answers-copy">
      <p className="text-[12px] text-ink-soft">{t(locale, W("ans.grow.note"))}</p>
      {missing.includes("description") && state.description && (
        <>
          <p className={sectionTitle}>{t(locale, W("ans.desc.title"))}</p>
          <CopyBlock text={state.description} rows={5} />
        </>
      )}
      {missing.includes("services") && priced.length > 0 && (
        <>
          <p className={sectionTitle}>{t(locale, W("ans.services.title"))}</p>
          <CopyBlock text={priced.map((s) => `${s.name} — ${priceText((s.googlePrice ?? parsePrice(s.price))!)}`).join("\n")} rows={Math.min(8, priced.length + 1)} />
        </>
      )}
      <AnswersExtras businessId={businessId} state={state} premium={false} />
    </div>
  );
}
