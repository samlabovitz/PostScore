"use client";

// Day 23E: the Google Profile tab's "This week" (Premium) — self-contained
// (the section 1 redesign moves it into "What to do this week"). Each item
// says how many, what and when (lib/googleRecommendations.ts) and is
// either:
//   - Ready: PostScore has a draft (review replies, this week's post, the
//     answers) — "Preview / edit" opens it, and Approve all sends it;
//   - Needs you · {time}: only the owner can do it (their own photos,
//     details only they know) — the item's own button, never Approve all;
//   - done ✓.
// "All done this week ✓" once nothing ready is left.

import { useEffect, useState } from "react";
import { recText, RecPremiumButton } from "@/components/gbp/GoogleRecs";
import { AnswersPreview, useAnswers, type AnswersState } from "@/components/gbp/AnswersPreview";
import { ApproveAll, type ItemFailures } from "@/components/gbp/ApproveAll";
import { PostPreview, failedText, usePostDraft, type PostDraftState } from "@/components/gbp/PostPreview";
import { publishPostAction } from "@/app/actions/gbpPosts";
import { applyAnswersAction } from "@/app/actions/googleAnswers";
import { RepliesLine, useWeekReplies, type WeekRepliesState } from "@/components/gbp/RepliesPreview";
import type { Rec } from "@/lib/googleRecommendations";
import type { IdeaType } from "@/lib/listingIdeas";
import { t, type MessageKey, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { shortDate, weekdayName } from "@/components/gbp/GoogleRecs";
import { TierLineNote, useTierOrder } from "@/components/growth/TierPlanContext";

const W = (key: string) => `dashboard.googleTab.w.${key}` as MessageKey;

export type ItemState = "loading" | "ready" | "done" | "needs_you" | "tomorrow" | "failed";

/** Section 1's This week: the replies, photos, the post and the answers. */
export function thisWeekKinds(recs: Rec[]): Rec[] {
  return recs.filter((r) => r.kind === "replies" || r.kind === "photos" || r.kind === "posts" || r.kind === "answers");
}

export function repliesState(s: WeekRepliesState, failed = false): ItemState {
  if (s.status === "idle" || s.status === "loading") return "loading";
  if (s.status === "failed") return "needs_you";
  if (s.items.length === 0 || s.items.every((i) => i.sent === "sent")) return "done";
  if (s.ready.length > 0) return "ready";
  if (failed || s.items.some((i) => i.sent === "failed")) return "failed";
  return s.items.some((i) => i.sent === "sent") && s.items.every((i) => i.sent === "sent" || !i.include) ? "done" : "needs_you";
}

export function postState(s: PostDraftState, failed = false): ItemState {
  // A saved draft is ready to read while the rest loads: never "Getting drafts ready…" then.
  if (s.status === "idle" || s.status === "loading") return s.text ? "ready" : "loading";
  if (s.latest && s.latest.state !== "rejected") return "done";
  if (s.blockedToday) return "tomorrow";
  if (failed) return "failed";
  return s.status === "ok" && s.problems.length === 0 && s.flags.length === 0 && s.publish ? "ready" : "needs_you";
}

export function answersState(s: AnswersState, failed = false): ItemState {
  if (s.status === "idle" || s.status === "loading") return "loading";
  if (s.status === "failed" || !s.data) return "needs_you";
  if (!s.data.plan) return "done";
  if (failed) return "failed";
  if (s.ready.length > 0) return "ready";
  return s.needsYou.length > 0 || s.flags.length > 0 ? "needs_you" : "done";
}

/** Nothing left that can be sent now: "All done this week ✓" (what waits for tomorrow or for the owner stays listed underneath). */
export function allDoneThisWeek(states: ItemState[]): boolean {
  return states.length > 0 && !states.some((s) => s === "ready" || s === "loading");
}

/** "Needs you · 5 min": how long the owner's part takes. */
function needsMinutes(rec: Rec): number {
  switch (rec.kind) {
    case "photos":
      return 5;
    case "replies":
      return rec.plan.minutes;
    case "answers":
      return Math.max(1, rec.plan.details.length);
    default:
      return 5;
  }
}

function Badge({ state, minutes, tomorrow }: { state: ItemState; minutes: number; tomorrow?: string }) {
  const locale = useLocale();
  const soft = "bg-[color:color-mix(in_srgb,var(--color-brass)_14%,white)] text-brass";
  const cls = { loading: "bg-paper text-ink-mute", ready: "bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] text-green", done: "bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] text-green", needs_you: soft, tomorrow: soft, failed: "bg-[color:color-mix(in_srgb,var(--color-red)_10%,white)] text-red" }[state];
  const label =
    state === "loading"
      ? t(locale, W("preparing"))
      : state === "ready"
        ? t(locale, W("ready"))
        : state === "done"
          ? t(locale, W("doneMark"))
          : state === "tomorrow"
            ? (tomorrow ?? t(locale, W("tomorrow.cap")))
            : state === "failed"
              ? t(locale, W("failed.badge"))
              : t(locale, W("needsYou"), { time: t(locale, W("time.min"), { count: minutes }) });
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold", cls)} data-testid="week-badge" data-state={state}>
      {label}
    </span>
  );
}

/** One to-do: its title, one line of detail, its status pill and one button; its preview opens below it (one at a time). */
export function WeekItem({ rec, state, type, businessId, canEdit, children, failure, onRetry, tomorrow, open: openProp, onToggle, line }: { rec: Rec; state: ItemState; type: IdeaType | null; businessId: string; canEdit: boolean; children?: React.ReactNode; failure?: string | null; onRetry?: () => Promise<void>; tomorrow?: string; open?: boolean; onToggle?: () => void; /** In place of the button: one line (the replies' "8 of 10 ready · Review them →"). */ line?: React.ReactNode }) {
  const locale = useLocale();
  const [openSelf, setOpenSelf] = useState(false);
  const open = openProp ?? openSelf;
  const setOpen = (v: boolean) => (onToggle ? onToggle() : setOpenSelf(v));
  const [retrying, setRetrying] = useState(false);
  const x = itemText(rec, locale, type);
  return (
    <li id={weekAnchor(rec.kind)} className="flex scroll-mt-[112px] flex-col gap-3 border-t border-paper-line py-4 first:border-t-0 first:pt-1 last:pb-0 nav:scroll-mt-14 lg:gap-2 lg:py-2.5" data-testid={`week-${rec.kind}`} data-state={state}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-snug text-ink">{x.text}</p>
          {x.sub && <p className="mt-0.5 text-[13px] leading-snug text-ink-mute">{x.sub}</p>}
          <TierLineNote kind={rec.kind} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {/* The replies' line already says "drafted and ready": no "Ready" pill beside it. */}
          {!(line && state === "ready") && <Badge state={state} minutes={needsMinutes(rec)} tomorrow={tomorrow} />}
          {line ? (
            line
          ) : rec.kind === "photos" ? (
            // The owner's own photos: never "PostScore can do this for you".
            <a href="#edit-photos" className={ROW_BUTTON_SOLID} data-testid="week-upload-photos">
              {t(locale, W("photos.upload"))}
            </a>
          ) : children ? (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={ROW_BUTTON} data-testid={`week-toggle-${rec.kind}`}>
              {t(locale, W(open ? "hide" : "preview"))}
            </button>
          ) : (
            <RecPremiumButton rec={rec} businessId={businessId} canEdit={canEdit} className="h-11 px-4 text-[14px] lg:h-10 lg:px-3.5" />
          )}
        </div>
      </div>
      {state === "failed" && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-red" data-testid={`week-failed-${rec.kind}`}>
          {t(locale, W("failed.row"), { reason: failure ?? t(locale, W("failed.generic")) })}
          {onRetry && (
            <button
              type="button"
              disabled={retrying || !canEdit}
              onClick={async () => {
                setRetrying(true);
                await onRetry().finally(() => setRetrying(false));
              }}
              className={ROW_BUTTON}
              data-testid={`week-retry-${rec.kind}`}
            >
              {retrying ? t(locale, W("sending")) : t(locale, W("retry"))}
            </button>
          )}
        </p>
      )}
      {children && open && <div className="rounded-xl border border-paper-line bg-paper/40 p-4">{children}</div>}
    </li>
  );
}

/** A to-do's own anchor: "#this-week-post" opens the post preview (the Posts chip, the listing's Posts row). */
const ANCHOR: Partial<Record<Rec["kind"], string>> = { posts: "this-week-post", replies: "this-week-replies", answers: "this-week-answers", photos: "this-week-photos" };
export const weekAnchor = (kind: Rec["kind"]) => ANCHOR[kind] ?? `this-week-${kind}`;
export function kindFromHash(hash: string): Rec["kind"] | null {
  const id = hash.replace(/^#/, "");
  return (Object.entries(ANCHOR).find(([, a]) => a === id)?.[0] as Rec["kind"] | undefined) ?? null;
}

/** A row's button: 44px on phones; on desktop a secondary ("Preview / edit") is 36px, a primary ("Upload your photos") 40px. */
const ROW_BUTTON = "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-paper-line bg-white px-4 text-[14px] font-semibold text-ink hover:border-ink disabled:opacity-60 lg:min-h-[36px] lg:px-3";
const ROW_BUTTON_SOLID = "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-ink bg-ink px-4 text-[14px] font-semibold text-paper lg:min-h-[40px] lg:px-3.5";

/** The item's sentence; the post's and answers' in Day 23E words. */
export function itemText(rec: Rec, locale: ReturnType<typeof useLocale>, type: IdeaType | null): { text: string; sub: string | null } {
  if (rec.kind === "posts") {
    const base = recText(rec, locale, type);
    const text =
      rec.plan.weekday === null || rec.plan.date === null
        ? t(locale, W("post.item.week"))
        : t(locale, W("post.item.day"), { day: weekdayName(rec.plan.weekday, locale), date: shortDate(rec.plan.date, locale), busiest: t(locale, `dashboard.googleTab.s2.dayGroup.${rec.plan.busiest}` as MessageKey) });
    return { text, sub: base.sub };
  }
  return recText(rec, locale, type);
}

/** Section 1's "What to do this week" card: the title with Approve all at the top right, the levers as
 * status chips (`chips`), then one row per to-do — a preview opens under its row, one at a time. */
export function ThisWeekList({ businessId, recs, type, canEdit, practice, title, chips, savedPost = null }: { businessId: string; recs: Rec[]; type: IdeaType | null; canEdit: boolean; practice: boolean; title?: React.ReactNode; chips?: React.ReactNode; savedPost?: string | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  // Growth plan (Day 25B step 6): ranked by what each task does for the tier.
  const list = useTierOrder(thisWeekKinds(recs));
  const has = (k: Rec["kind"]) => list.some((r) => r.kind === k);
  const postRec = list.find((r): r is Extract<Rec, { kind: "posts" }> => r.kind === "posts");
  const answersRec = list.find((r): r is Extract<Rec, { kind: "answers" }> => r.kind === "answers");
  const day = postRec && postRec.plan.weekday !== null && postRec.plan.date ? `${weekdayName(postRec.plan.weekday, "en")}, ${shortDate(postRec.plan.date, "en")}` : null;
  const replies = useWeekReplies(businessId, { auto: has("replies") });
  // A saved draft shows at once (the background run wrote it); the rest of the post (photos, Google's state) loads.
  const post = usePostDraft(businessId, { day, auto: has("posts"), initialText: savedPost });
  const answers = useAnswers(businessId, { auto: has("answers"), suggest: answersRec?.plan.suggest ?? [] });
  const [failures, setFailures] = useState<ItemFailures>({});
  const [openKind, setOpenKind] = useState<Rec["kind"] | null>(null);
  // "#this-week-post" (and the others): open that to-do and bring it into view — on load, on a hash
  // change, and on a second tap of the same link (no hash change then).
  useEffect(() => {
    const open = (hash: string) => {
      const kind = kindFromHash(hash);
      if (!kind) return;
      setOpenKind(kind);
      requestAnimationFrame(() => document.getElementById(weekAnchor(kind))?.scrollIntoView({ block: "start" }));
    };
    open(window.location.hash);
    const onHash = () => open(window.location.hash);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (href && href.startsWith("#") && href === window.location.hash) open(href);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);
  if (list.length === 0 && !title) return null;
  const onFailure = (kind: keyof ItemFailures, reason: string | null) => setFailures((f) => ({ ...f, [kind]: reason ?? undefined }));

  const stateOf = (rec: Rec): ItemState =>
    rec.kind === "replies" ? repliesState(replies, !!failures.replies) : rec.kind === "posts" ? postState(post, !!failures.posts) : rec.kind === "answers" ? answersState(answers, !!failures.answers) : "needs_you";
  const states = list.map(stateOf);
  const allDone = allDoneThisWeek(states);
  const done = list.filter((_, i) => states[i] === "done");
  const rest = list.filter((_, i) => states[i] !== "done");

  // "Try again" on a row: that item alone, through its own action.
  const retry: Partial<Record<Rec["kind"], () => Promise<void>>> = {
    replies: async () => {
      for (const i of replies.items.filter((x) => x.sent === "failed")) await replies.post(i.reviewId);
      onFailure("replies", null);
    },
    posts: async () => {
      const r = await publishPostAction(businessId, { text: post.text, cta: post.cta, photoName: post.photoName, kind: "week", timeZone, promoId: post.offer?.promoId ?? null, keep: post.keep }).catch(() => null);
      if (r?.status === "published") {
        post.setLatest(r.latest);
        onFailure("posts", null);
      } else if (r?.status === "posted_today") {
        post.setBlockedToday("posted_today");
        onFailure("posts", null);
      } else onFailure("posts", r?.status === "error" ? failedText(r.error, locale) : t(locale, W("failed.generic")));
    },
    answers: async () => {
      const r = await applyAnswersAction(businessId, answers.payload).catch(() => null);
      if (r?.status === "ok") {
        answers.setResults({ ...(answers.results ?? {}), ...r.results });
        const bad = Object.values(r.results).find((p) => p && (p.status === "error" || p.status === "invalid" || p.status === "spelling"));
        onFailure("answers", bad ? (bad.status === "error" ? failedText(bad.error, locale) : t(locale, W("failed.generic"))) : null);
      } else onFailure("answers", r && r.status === "wait" ? failedText(r.error, locale) : t(locale, W("failed.generic")));
    },
  };

  const row = (rec: Rec) => {
    const state = stateOf(rec);
    // Replies live on Presence → Reviews (the one reply tool): here, one line with the count, no list.
    const child = rec.kind === "replies" ? null : rec.kind === "posts" ? <PostPreview businessId={businessId} state={post} showBlocked={false} /> : rec.kind === "answers" ? <AnswersPreview businessId={businessId} state={answers} /> : null;
    const tomorrow = rec.kind === "posts" && post.blockedToday === "posted_today" ? t(locale, W("tomorrow.posted")) : undefined;
    return (
      <WeekItem key={rec.kind} rec={rec} state={state} type={type} businessId={businessId} canEdit={canEdit} failure={failures[rec.kind as keyof ItemFailures]} onRetry={retry[rec.kind]} tomorrow={tomorrow} open={openKind === rec.kind} onToggle={() => setOpenKind(openKind === rec.kind ? null : rec.kind)} line={rec.kind === "replies" ? <RepliesLine businessId={businessId} state={replies} /> : undefined}>
        {child}
      </WeekItem>
    );
  };

  const heading = title ?? <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-brass">{t(locale, "dashboard.googleTab.rec.thisWeek")}</p>;
  return (
    <div className="flex flex-col gap-4 lg:gap-3" data-testid="google-tab-this-week" id="google-tab-this-week">
      {allDone || list.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {heading}
          {list.length > 0 && (
            <p className="text-[14px] font-bold text-green" data-testid="week-all-done">
              {t(locale, W("allDone"))}
            </p>
          )}
        </div>
      ) : (
        <ApproveAll businessId={businessId} title={heading} replies={has("replies") ? replies : null} post={has("posts") ? post : null} answers={has("answers") ? answers : null} canEdit={canEdit} practice={practice} failures={failures} onFailure={onFailure} />
      )}
      {chips}
      {allDone ? (
        <>
          {done.length > 0 && <ul>{done.map(row)}</ul>}
          {rest.length > 0 && (
            <>
              <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink-soft" data-testid="week-still-needs-you">
                {t(locale, W("stillNeedsYou"))}
              </p>
              <ul>{rest.map(row)}</ul>
            </>
          )}
        </>
      ) : (
        list.length > 0 && <ul>{list.map(row)}</ul>
      )}
    </div>
  );
}
