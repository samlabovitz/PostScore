"use client";

// Day 23E: this week's Google post — self-contained (the section 1
// redesign moves it into "What to do this week").
// - usePostDraft: the week's draft (app/actions/gbpPosts.ts openPostDraft),
//   the owner's edits, the button and photo, and the latest post's state.
// - PostPreview (Premium): edit the text, choose the photo and the button,
//   "Write another", "Publish to Google" → "Waiting for Google" → "Live on
//   Google ✓ · View post ↗" (or "Google didn't accept this post"), and
//   "Remove from Google" for 7 days. Approve all publishes the same state.
// - PostDraftCopy (Grow): the same draft to copy (+ "Write another", 3 a week).
// Nothing is sent to Google except from "Publish to Google" or Approve all.

import { useCallback, useEffect, useRef, useState } from "react";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { openPostDraft, postStatusAction, publishPostAction, undoPostAction, writeAnotherPost, type LatestPost, type OpenPostDraftResult } from "@/app/actions/gbpPosts";
import { POST_MAX, STORY_TOPICS, postProblems, type PostCta, type PostKind, type PostOffer, type PostPhoto, type PostProblem, type PostTopic } from "@/lib/gbpPosts";
import { applySpellingFix, spellingFlags, type SpellingFlag } from "@/lib/serviceSpelling";
import { formatShortDate, t, type MessageKey, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const W = (key: string) => `dashboard.googleTab.w.${key}` as MessageKey;

/** Every action button: at least 44px tall, 14px text. */
export const W_BUTTON = "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-ink bg-ink px-4 text-[14px] font-semibold text-paper disabled:opacity-60";
export const W_BUTTON_SOFT = "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-paper-line bg-white px-4 text-[14px] font-semibold text-ink hover:border-ink disabled:opacity-60";

export interface PostDraftState {
  status: "idle" | "loading" | "ok" | "failed";
  text: string;
  setText: (v: string) => void;
  ctas: Array<{ type: PostCta; url: string | null }>;
  cta: PostCta;
  setCta: (v: PostCta) => void;
  photos: PostPhoto[];
  photoName: string | null;
  setPhotoName: (v: string | null) => void;
  /** Grow: "Write another" left this week; null: unlimited. */
  left: number | null;
  fallback: boolean;
  /** Premium on a connected listing (or practice mode). */
  publish: { canEdit: boolean; practice: boolean } | null;
  /** Can't go to Google today: one post a day, or the day's approval limit. */
  blockedToday: "posted_today" | "daily_cap" | null;
  setBlockedToday: (v: "posted_today" | "daily_cap" | null) => void;
  topic: PostTopic | null;
  /** An active coupon: the post is about it (a Google Offer post on Premium). */
  offer: PostOffer | null;
  /** "Did you mean 'balayage'?" — fix in one click or keep; nothing flagged is published. */
  flags: SpellingFlag[];
  fixFlag: (flag: SpellingFlag) => void;
  keep: string[];
  keepWord: (word: string) => void;
  /** A post about something real: written only from the owner's 1–2 facts. */
  fromFacts: (facts: string) => Promise<void>;
  latest: LatestPost | null;
  setLatest: (v: LatestPost | null) => void;
  another: () => Promise<void>;
  anotherBusy: boolean;
  anotherLimit: boolean;
  problems: PostProblem[];
  load: () => void;
}

/** The week's draft. `auto`: load at once (Premium's This week); otherwise on `load()`. */
export function usePostDraft(businessId: string, opts: { day: string | null; auto: boolean; initialText?: string | null; promoId?: string | null }): PostDraftState {
  const timeZone = useTimeZone();
  const [status, setStatus] = useState<PostDraftState["status"]>("idle");
  const [text, setText] = useState(opts.initialText ?? "");
  const [data, setData] = useState<Extract<OpenPostDraftResult, { status: "ok" }> | null>(null);
  const [cta, setCta] = useState<PostCta>("NONE");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestPost | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const [anotherBusy, setAnotherBusy] = useState(false);
  const [anotherLimit, setAnotherLimit] = useState(false);
  const [blockedToday, setBlockedToday] = useState<PostDraftState["blockedToday"]>(null);
  const [keep, setKeep] = useState<string[]>([]);
  const started = useRef(false);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setStatus("loading");
    openPostDraft(businessId, timeZone, opts.day, opts.promoId ?? null)
      .then((r) => {
        if (r.status !== "ok") return setStatus("failed");
        setData(r);
        if (!opts.initialText) setText(r.text);
        setFallback(!opts.initialText && r.fallback);
        setLeft(r.left);
        setCta(r.ctas[0]?.type ?? "NONE");
        setPhotoName(r.publish?.photos[0]?.name ?? null);
        setLatest(r.publish?.latest ?? null);
        setBlockedToday(r.publish?.blockedToday ?? null);
        setStatus("ok");
      })
      .catch(() => setStatus("failed"));
  }, [businessId, timeZone, opts.day, opts.initialText, opts.promoId]);

  useEffect(() => {
    if (opts.auto) load();
  }, [opts.auto, load]);

  const write = useCallback(async (facts: string | null) => {
    setAnotherBusy(true);
    try {
      const r = await writeAnotherPost(businessId, timeZone, opts.day, facts, opts.promoId ?? null);
      if (r.status === "ok") {
        setText(r.text);
        setFallback(r.fallback);
        setLeft(r.left);
      } else if (r.status === "limit") {
        setLeft(0);
        setAnotherLimit(true);
      }
    } finally {
      setAnotherBusy(false);
    }
  }, [businessId, timeZone, opts.day, opts.promoId]);
  const another = useCallback(() => write(null), [write]);
  const flags = spellingFlags(text, { services: data?.serviceNames ?? [], keep, prose: true, ownerTerms: data?.priceNames ?? [] });

  return {
    status,
    text,
    setText,
    ctas: data?.ctas ?? [{ type: "NONE", url: null }],
    cta,
    setCta,
    photos: data?.publish?.photos ?? [],
    photoName,
    setPhotoName,
    left,
    fallback,
    publish: data?.publish ? { canEdit: data.publish.canEdit, practice: data.publish.practice } : null,
    blockedToday,
    setBlockedToday,
    topic: data?.topic ?? null,
    offer: data?.offer ?? null,
    flags,
    fixFlag: (flag) => setText((x) => applySpellingFix(x, flag)),
    keep,
    keepWord: (word) => setKeep((k) => (k.includes(word) ? k : [...k, word])),
    fromFacts: (facts) => write(facts),
    latest,
    setLatest,
    another,
    anotherBusy,
    anotherLimit,
    problems: text.trim() ? postProblems(text) : ["empty"],
    load,
  };
}

/** Polls "Waiting for Google" every 15 s for up to 3 minutes. */
function usePostPolling(businessId: string, state: PostDraftState) {
  const { latest, setLatest } = state;
  const tries = useRef(0);
  useEffect(() => {
    if (!latest || latest.state !== "waiting" || tries.current >= 12) return;
    const id = setTimeout(() => {
      tries.current++;
      postStatusAction(businessId)
        .then((r) => {
          if (r.status === "ok" && r.latest && r.latest.batchId === latest.batchId) setLatest(r.latest);
        })
        .catch(() => undefined);
    }, 15_000);
    return () => clearTimeout(id);
  }, [businessId, latest, setLatest]);
}

export function PostStatusLine({ businessId, state }: { businessId: string; state: PostDraftState }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState(false);
  usePostPolling(businessId, state);
  const l = state.latest;
  if (removed) return <p className="text-[13px] text-ink-soft" data-testid="post-removed">{t(locale, W("post.removed"))}</p>;
  if (!l) return null;
  const remove = async () => {
    setBusy(true);
    setError(false);
    const r = await undoPostAction(businessId, l.batchId).catch(() => null);
    setBusy(false);
    if (r?.status === "undone") {
      setRemoved(true);
      state.setLatest(null);
    } else setError(true);
  };
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-paper px-3 py-2 text-[12.5px]" data-testid="post-status" data-state={l.state}>
      {l.state === "live" ? (
        <p className="font-semibold text-green">
          {t(locale, W("post.live"))}
          {l.searchUrl && (
            <>
              {" · "}
              <a href={l.searchUrl} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-brass underline-offset-2" data-testid="post-view">
                {t(locale, W("post.view"))}
              </a>
            </>
          )}
        </p>
      ) : l.state === "rejected" ? (
        <p className="font-semibold text-red">{t(locale, W("post.rejected"))}</p>
      ) : (
        <p className="font-semibold text-ink">{t(locale, W("post.waiting"))}</p>
      )}
      {l.undoUntil && l.state !== "rejected" && state.publish?.canEdit && (
        <p className="text-ink-mute">
          {t(locale, W("post.removeUntil"), { date: formatShortDate(l.undoUntil, locale, timeZone) })}{" "}
          <button type="button" onClick={remove} disabled={busy} className="font-semibold text-ink underline underline-offset-2" data-testid="post-remove">
            {t(locale, W("post.remove"))}
          </button>
        </p>
      )}
      {error && <p className="text-red">{t(locale, W("failed.generic"))}</p>}
    </div>
  );
}

function ProblemLines({ problems }: { problems: PostProblem[] }) {
  const locale = useLocale();
  const shown = problems.filter((p) => p !== "empty");
  if (shown.length === 0) return null;
  return (
    <ul className="text-[13px] text-red" data-testid="post-problems">
      {shown.map((p) => (
        <li key={p}>{t(locale, W(`post.problem.${p}`))}</li>
      ))}
    </ul>
  );
}

function AnotherButton({ state }: { state: PostDraftState }) {
  const locale = useLocale();
  if (state.left === 0 || state.anotherLimit) return <p className="text-[13px] text-ink-mute">{t(locale, W("post.limit"))}</p>;
  return (
    <button type="button" onClick={() => void state.another()} disabled={state.anotherBusy} className={cn(W_BUTTON_SOFT, "w-fit")} data-testid="post-another">
      {state.anotherBusy ? t(locale, W("post.writing")) : state.left === null ? t(locale, W("post.another")) : t(locale, W("post.anotherLeft"), { count: state.left })}
    </button>
  );
}

/** Premium: the editable preview with "Publish to Google". */
export function PostPreview({ businessId, state, kind = "week", standalonePublish = true }: { businessId: string; state: PostDraftState; kind?: PostKind; standalonePublish?: boolean }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state.status === "idle" || state.status === "loading") return <p className="text-[13px] text-ink-mute" data-testid="post-loading">{t(locale, W("post.loading"))}</p>;
  if (state.status === "failed") return <p className="text-[13px] text-ink-mute" data-testid="post-failed">{t(locale, W("post.failed"))}</p>;
  const canEdit = state.publish?.canEdit === true;
  const live = state.latest && state.latest.state !== "rejected";

  const publish = async () => {
    setPublishing(true);
    setError(null);
    const r = await publishPostAction(businessId, { text: state.text, cta: state.cta, photoName: state.photoName, kind, timeZone, promoId: state.offer?.promoId ?? null, keep: state.keep }).catch(() => null);
    setPublishing(false);
    if (!r) return setError(t(locale, W("failed.generic")));
    if (r.status === "published") return state.setLatest(r.latest);
    if (r.status === "posted_today") return state.setBlockedToday("posted_today");
    if (r.status === "invalid" || r.status === "spelling") return;
    if (r.status === "error" && r.error === "daily_cap") return state.setBlockedToday("daily_cap");
    if (r.status === "editing_off") return setError(t(locale, W("readOnly")));
    setError(failedText(r.status === "error" ? r.error : "", locale));
  };

  return (
    <div className="flex flex-col gap-4" data-testid={`post-preview-${kind}`}>
      {state.fallback && <p className="text-[13px] text-ink-mute">{t(locale, W("post.fallback"))}</p>}
      {state.offer && (
        <p className="rounded-lg bg-paper px-3 py-2.5 text-[13px] text-ink-soft" data-testid="post-offer">
          {t(locale, W(state.publish ? "post.offer.premium" : "post.offer.grow"), { offer: state.offer.offer, code: state.offer.code })}
        </p>
      )}
      {/* 1. The text */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink-soft">{t(locale, W("post.textLabel"))}</span>
        <textarea
          value={state.text}
          onChange={(e) => state.setText(e.target.value)}
          rows={5}
          maxLength={POST_MAX + 200}
          disabled={!!live}
          className="w-full rounded-lg border border-paper-line bg-white px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none focus:border-ink disabled:bg-paper"
          data-testid="post-text"
        />
        <span className={cn("text-[13px]", state.text.length > POST_MAX ? "text-red" : "text-ink-mute")}>{t(locale, W("post.count"), { count: state.text.length.toLocaleString(locale) })}</span>
      </label>
      <ProblemLines problems={state.problems} />
      <PostSpelling state={state} />
      {/* 2. The photo */}
      {state.publish && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-soft">{t(locale, W("post.photo"))}</span>
          <div className="flex flex-wrap gap-2.5" data-testid="post-photos">
            {state.photos.map((p) => (
              <button
                key={p.name}
                type="button"
                disabled={!!live}
                onClick={() => state.setPhotoName(p.name)}
                aria-pressed={state.photoName === p.name}
                className={cn("h-16 w-24 overflow-hidden rounded-lg border-2", state.photoName === p.name ? "border-ink" : "border-transparent opacity-80")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Google's own image, shown live, never saved */}
                <img src={p.thumb} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </button>
            ))}
            <button type="button" disabled={!!live} onClick={() => state.setPhotoName(null)} aria-pressed={state.photoName === null} className={cn("h-16 rounded-lg border-2 px-3 text-[13px] text-ink-soft", state.photoName === null ? "border-ink" : "border-paper-line")}>
              {t(locale, W("post.photo.none"))}
            </button>
          </div>
          {state.photoName === null && <p className="text-[13px] text-ink-mute">{t(locale, W("post.photo.tip"))}</p>}
        </div>
      )}
      {/* 3. The button */}
      {state.publish && !state.offer && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-soft">{t(locale, W("post.button"))}</span>
          <span className="flex flex-wrap items-center gap-2.5">
            <select value={state.cta} onChange={(e) => state.setCta(e.target.value as PostCta)} disabled={!!live} className="min-h-[44px] rounded-lg border border-paper-line bg-white px-3 text-[14px]" data-testid="post-cta">
              {state.ctas.map((c) => (
                <option key={c.type} value={c.type}>
                  {t(locale, W(`post.cta.${c.type}`))}
                </option>
              ))}
            </select>
            {state.cta === "CALL" && <span className="text-[13px] text-ink-mute">{t(locale, W("post.ctaNote.CALL"))}</span>}
          </span>
        </label>
      )}
      <PostStatusLine businessId={businessId} state={state} />
      {/* 4. Write another · Publish */}
      {!live && (
        <div className="flex flex-wrap items-center gap-2.5">
          <AnotherButton state={state} />
          {standalonePublish && state.publish && !state.blockedToday && (
            <button type="button" onClick={publish} disabled={!canEdit || publishing || state.problems.length > 0 || state.flags.length > 0} className={W_BUTTON} data-testid="post-publish">
              {publishing ? t(locale, W("post.publishing")) : t(locale, W("post.publish"))}
            </button>
          )}
          {state.publish && state.blockedToday && (
            <span className="text-[13px] font-semibold text-brass" data-testid="post-blocked-today">
              {t(locale, W(state.blockedToday === "posted_today" ? "tomorrow.posted" : "tomorrow.cap"))}
            </span>
          )}
        </div>
      )}
      {!live && !state.offer && <FactsBox state={state} />}
      {state.publish && !canEdit && <p className="text-[13px] text-ink-mute" data-testid="post-read-only">{t(locale, W("readOnly"))}</p>}
      {error && <p className="text-[13px] text-red" data-testid="post-error">{error}</p>}
    </div>
  );
}

/** Grow: the same draft to copy, plus "Write another" (3 a week). */
export function PostDraftCopy({ state }: { state: PostDraftState }) {
  const locale = useLocale();
  const { load } = state;
  useEffect(() => load(), [load]);
  if (state.status === "idle" || state.status === "loading") return <p className="text-[13px] text-ink-mute" data-testid="post-loading">{t(locale, W("post.loading"))}</p>;
  if (state.status === "failed") return <p className="text-[13px] text-ink-mute" data-testid="post-failed">{t(locale, W("post.failed"))}</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="post-copy">
      {state.offer && <p className="rounded-lg bg-paper px-3 py-2 text-[13px] text-ink-soft" data-testid="post-offer">{t(locale, W("post.offer.grow"), { offer: state.offer.offer, code: state.offer.code })}</p>}
      {!state.offer && <p className="text-[13px] text-ink-soft">{t(locale, W("post.grow.note"))}</p>}
      {/* A likely typo is fixed or kept before the text can be copied. */}
      <PostSpelling state={state} />
      {state.flags.length === 0 ? <CopyBlock text={state.text} rows={5} /> : <p className="whitespace-pre-wrap rounded-lg border border-paper-line bg-paper px-3 py-2 text-[13px]">{state.text}</p>}
      {!state.offer && <FactsBox state={state} />}
      <AnotherButton state={state} />
    </div>
  );
}

/** "Did you mean 'balayage'?" — fix in one click, or keep the word as written. */
function PostSpelling({ state }: { state: PostDraftState }) {
  const locale = useLocale();
  if (state.flags.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1" data-testid="post-spelling">
      {state.flags.map((flag) => (
        <li key={flag.word} className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-red">{t(locale, W("spelling.didYouMean"), { word: flag.word, suggestion: flag.suggestion })}</span>
          <button type="button" onClick={() => state.fixFlag(flag)} className={W_BUTTON_SOFT} data-testid="spelling-fix">
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

/** A post about something real: the owner's 1–2 facts, and PostAI writes only from those. */
function FactsBox({ state }: { state: PostDraftState }) {
  const locale = useLocale();
  const [facts, setFacts] = useState("");
  const [open, setOpen] = useState(false);
  const story = state.topic !== null && STORY_TOPICS.includes(state.topic);
  if (state.left === 0 || state.anotherLimit) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="post-facts">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-fit text-left text-[12.5px] font-semibold text-ink underline underline-offset-2" data-testid="post-facts-open">
          {t(locale, W(story ? `post.facts.open.${state.topic}` : "post.facts.open.default"))}
        </button>
      ) : (
        <>
          <p className="text-[13px] text-ink-soft">{t(locale, W("post.facts.note"))}</p>
          <textarea value={facts} onChange={(e) => setFacts(e.target.value)} rows={2} maxLength={300} placeholder={t(locale, W(story ? `post.facts.placeholder.${state.topic}` : "post.facts.placeholder.default"))} className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-[13px] outline-none focus:border-ink" data-testid="post-facts-text" />
          <button type="button" onClick={() => void state.fromFacts(facts)} disabled={state.anotherBusy || facts.trim().length < 8} className={cn(W_BUTTON_SOFT, "w-fit")} data-testid="post-facts-write">
            {state.anotherBusy ? t(locale, W("post.writing")) : t(locale, W("post.facts.write"))}
          </button>
        </>
      )}
    </div>
  );
}

/** Plain words for a failed send. */
export function failedText(error: string, locale: ReturnType<typeof useLocale>): string {
  if (error === "wait_minute" || error === "daily_cap" || error === "reconnect" || error === "photo_gone" || error === "rejected" || error === "offer_ended") return t(locale, W(`failed.${error}`));
  return t(locale, W("failed.generic"));
}
