"use client";

// Fix plan (Premium, Google connected): this week's one-click items, as two clearly separate sends — never one
// button for everything (Nov 27: a single "Approve this week" sent 12 replies and a description on one click).
// - "Post {n} review replies": the confirm step names the reviewers ("Christine, Win, Kimberly + 26 more") with
//   "Read them first →"; then one reply at a time (the inbox's own action, read back from Google).
// - "Update your Google listing ({m})": the confirm step shows each change, before → after; then one sitting
//   (app/actions/approveAll.ts approveListingAll), each part with its own Undo.
// Every send has a confirm step with Cancel focused; on localhost a real send (not practice) also needs the
// business name typed (components/gbp/LocalWriteGuard.tsx).

import Link from "next/link";
import { useState } from "react";
import { approveListingAll } from "@/app/actions/approveAll";
import { answersReady } from "@/components/gbp/ApproveAll";
import { useLocalWriteGuard } from "@/components/gbp/LocalWriteGuard";
import { useAnswers, type AnswersState } from "@/components/gbp/AnswersPreview";
import type { WeekRepliesState } from "@/components/gbp/RepliesPreview";
import { W_BUTTON } from "@/components/gbp/PostPreview";
import { detailLabel } from "@/lib/googleAnswers";
import { replyFirstName } from "@/lib/reviewReplies";
import { reviewsHref } from "@/lib/routes";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";
import type { AnswersPayload } from "@/lib/googleAnswers.server";

/** "Christine, Win, Kimberly + 26 more": the first three first names (or "a customer"), then how many more. */
export function reviewerList(names: Array<string | null>, locale: Locale, shown = 3): string {
  const first = names.slice(0, shown).map((n) => replyFirstName(n) ?? (n?.trim() || (locale === "es" ? "un cliente" : "a customer")));
  const rest = names.length - first.length;
  return rest > 0 ? t(locale, "dashboard.fixPlan.send.namesMore", { names: first.join(", "), count: rest }) : first.join(", ");
}

export interface ListingChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

/** Each change the listing send makes, before → after (what Google has now, from the live read). */
export function listingChanges(listing: { description: string | null; services: Array<{ name: string; googlePrice: number | null }>; details: Array<{ id: string; label: string; current: boolean | null }> } | null, payload: AnswersPayload, locale: Locale): ListingChange[] {
  if (!listing) return [];
  const out: ListingChange[] = [];
  const money = (n: number | null) => (n === null ? "" : ` · $${n}`);
  if (payload.description) out.push({ key: "description", label: t(locale, "dashboard.fixPlan.send.description"), before: listing.description?.trim() || t(locale, "dashboard.fixPlan.send.empty"), after: payload.description });
  for (const s of payload.services ?? []) {
    const now = listing.services.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    out.push({ key: `service:${s.name}`, label: s.name, before: now ? `${t(locale, "dashboard.fixPlan.send.listed")}${money(now.googlePrice)}` : t(locale, "dashboard.fixPlan.send.notListed"), after: `${t(locale, "dashboard.fixPlan.send.listed")}${money(s.price)}` });
  }
  const yn = (v: boolean | null) => t(locale, v === null ? "dashboard.fixPlan.send.notSet" : v ? "dashboard.fixPlan.send.yes" : "dashboard.fixPlan.send.no");
  for (const [id, value] of Object.entries(payload.details ?? {})) {
    const row = listing.details.find((d) => d.id === id);
    out.push({ key: `detail:${id}`, label: detailLabel(id, row?.label, locale), before: yn(row?.current ?? null), after: yn(value) });
  }
  return out;
}

const CANCEL = "rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink";
const SEND = "rounded-lg border border-ink bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-paper disabled:opacity-50";

function Confirm({ title, children, sendLabel, onSend, onCancel, practice }: { title: string; children?: React.ReactNode; sendLabel: string; onSend: () => void; onCancel: () => void; practice: boolean }) {
  const locale = useLocale();
  const guard = useLocalWriteGuard(practice);
  return (
    <div role="alertdialog" aria-label={title} className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-paper/40 p-3" data-testid="send-confirm">
      <p className="text-[13.5px] font-semibold text-ink">{title}</p>
      {children}
      {guard.field}
      <div className="flex flex-wrap gap-2">
        {/* Cancel first and focused: Enter never sends by accident. */}
        <button type="button" autoFocus onClick={onCancel} className={CANCEL} data-testid="send-cancel">
          {t(locale, "dashboard.approveConfirm.cancel")}
        </button>
        <button type="button" disabled={!guard.ok} onClick={onSend} className={SEND} data-testid="send-go">
          {sendLabel}
        </button>
      </div>
    </div>
  );
}

export function SendToGoogle({ businessId, replies, answers, canEdit, practice }: { businessId: string; replies: WeekRepliesState | null; answers: AnswersState | null; canEdit: boolean; practice: boolean }) {
  const locale = useLocale();
  const [open, setOpen] = useState<"replies" | "listing" | null>(null);
  const [progress, setProgress] = useState<{ kind: "replies" | "listing"; done: number; of: number } | null>(null);
  const [result, setResult] = useState<{ kind: "replies" | "listing"; sent: number; failed: number } | null>(null);

  const replyIds = replies?.canPost ? Array.from(new Set(replies.ready)) : [];
  const replyNames = replyIds.map((id) => replies?.items.find((i) => i.reviewId === id)?.reviewer ?? null);
  const listingOn = answersReady(answers);
  const changes = listingOn && answers?.data ? listingChanges(answers.data.listing, answers.payload, locale) : [];
  const loading = [replies, answers].some((s) => s && (s.status === "idle" || s.status === "loading"));
  const busy = progress !== null;

  const postReplies = async () => {
    setOpen(null);
    setResult(null);
    const list = [...replyIds];
    let sent = 0;
    setProgress({ kind: "replies", done: 0, of: list.length });
    for (let i = 0; i < list.length; i++) {
      if (await replies!.post(list[i])) sent++;
      setProgress({ kind: "replies", done: i + 1, of: list.length });
    }
    setProgress(null);
    setResult({ kind: "replies", sent, failed: list.length - sent });
  };

  const updateListing = async () => {
    if (!answers) return;
    setOpen(null);
    setResult(null);
    setProgress({ kind: "listing", done: 0, of: changes.length });
    const r = await approveListingAll(businessId, { post: null, answers: answers.payload }).catch(() => null);
    setProgress(null);
    if (r?.status === "ok" && r.answers) {
      answers.setResults({ ...(answers.results ?? {}), ...r.answers });
      const parts = Object.values(r.answers);
      const ok = parts.filter((p) => p && (p.status === "sent" || p.status === "pending_review" || p.status === "no_change")).length;
      setResult({ kind: "listing", sent: ok, failed: parts.length - ok });
    } else setResult({ kind: "listing", sent: 0, failed: changes.length || 1 });
  };

  if (!canEdit || (replyIds.length === 0 && changes.length === 0 && !loading && !busy && !result)) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--color-brass)_35%,white)] bg-white p-4 shadow-card sm:p-5" data-testid="send-to-google">
      <div>
        <p className="text-[15px] font-semibold text-ink">{t(locale, "dashboard.fixPlan.approve.title")}</p>
        <p className="text-[13px] text-ink-mute">{t(locale, "dashboard.fixPlan.send.note")}</p>
        {practice && <p className="mt-1 text-[13px] font-semibold text-brass">{t(locale, "dashboard.googleTab.w.practice")}</p>}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {replyIds.length > 0 && (
          <button type="button" className={W_BUTTON} disabled={busy || loading} onClick={() => setOpen(open === "replies" ? null : "replies")} aria-expanded={open === "replies"} data-testid="send-replies" data-count={replyIds.length}>
            {progress?.kind === "replies" ? t(locale, "dashboard.googleReviews.all.posting", { done: progress.done, count: progress.of }) : tPlural(locale, "dashboard.fixPlan.send.replies", replyIds.length, { count: replyIds.length })}
          </button>
        )}
        {changes.length > 0 && (
          <button type="button" className={W_BUTTON} disabled={busy || loading} onClick={() => setOpen(open === "listing" ? null : "listing")} aria-expanded={open === "listing"} data-testid="send-listing" data-count={changes.length}>
            {progress?.kind === "listing" ? t(locale, "dashboard.fixPlan.send.sending") : t(locale, "dashboard.fixPlan.send.listing", { count: changes.length })}
          </button>
        )}
      </div>
      {open === "replies" && (
        <Confirm title={tPlural(locale, "dashboard.fixPlan.send.repliesConfirm", replyIds.length, { count: replyIds.length })} sendLabel={t(locale, "dashboard.fixPlan.send.post")} onSend={() => void postReplies()} onCancel={() => setOpen(null)} practice={practice}>
          <p className="text-[13px] text-ink" data-testid="send-reviewers">
            {reviewerList(replyNames, locale)}{" "}
            <Link href={reviewsHref(businessId, { hash: "reply-to-reviews" })} className="font-semibold underline decoration-brass underline-offset-2">
              {t(locale, "dashboard.fixPlan.send.readFirst")}
            </Link>
          </p>
        </Confirm>
      )}
      {open === "listing" && (
        <Confirm title={t(locale, "dashboard.fixPlan.send.listingConfirm")} sendLabel={t(locale, "dashboard.fixPlan.send.update")} onSend={() => void updateListing()} onCancel={() => setOpen(null)} practice={practice}>
          <ul className="flex flex-col gap-2" data-testid="send-changes">
            {changes.map((c) => (
              <li key={c.key} className="text-[13px]" data-testid="send-change">
                <p className="font-semibold text-ink">{c.label}</p>
                <p className="text-ink-mute line-through decoration-ink-mute/40">{c.before}</p>
                <p className="text-ink">→ {c.after}</p>
              </li>
            ))}
          </ul>
        </Confirm>
      )}
      {result && (
        <p className="text-[13px]" role="status" data-testid="send-result">
          <b className="text-green">{tPlural(locale, "dashboard.fixPlan.send.sent", result.sent, { count: result.sent })}</b>
          {result.failed > 0 && <span className="text-red"> {t(locale, "dashboard.fixPlan.send.failed", { count: result.failed })}</span>}
        </p>
      )}
    </section>
  );
}

/** Google listing page (Premium): "Fix all ({n})" — every listing change PostScore has ready (the description,
 * services and customer details it drafted), one confirm step showing each as before → after, Cancel focused, the
 * localhost name for a real send. The same editor and draft as each row's own button and Fix plan's listing send. */
export function FixAllListing({ businessId, canEdit, practice }: { businessId: string; canEdit: boolean; practice: boolean }) {
  const locale = useLocale();
  const answers = useAnswers(businessId, { auto: canEdit, suggest: [] });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const changes = canEdit && answersReady(answers) && answers.data ? listingChanges(answers.data.listing, answers.payload, locale) : [];
  if (!canEdit || (changes.length === 0 && !result)) return null;
  const run = async () => {
    setOpen(false);
    setBusy(true);
    const r = await approveListingAll(businessId, { post: null, answers: answers.payload }).catch(() => null);
    setBusy(false);
    if (r?.status === "ok" && r.answers) {
      answers.setResults({ ...(answers.results ?? {}), ...r.answers });
      const parts = Object.values(r.answers);
      const ok = parts.filter((p) => p && (p.status === "sent" || p.status === "pending_review" || p.status === "no_change")).length;
      setResult({ sent: ok, failed: parts.length - ok });
    } else setResult({ sent: 0, failed: changes.length || 1 });
  };
  return (
    <div className="flex w-full flex-col gap-2" data-testid="listing-fix-all">
      {changes.length > 0 && (
        <button type="button" className={`${W_BUTTON} w-fit`} disabled={busy} onClick={() => setOpen(!open)} aria-expanded={open} data-testid="listing-fix-all-button" data-count={changes.length}>
          {busy ? t(locale, "dashboard.fixPlan.send.sending") : t(locale, "dashboard.googlePages.listing.fixAll", { count: changes.length })}
        </button>
      )}
      {open && (
        <Confirm title={t(locale, "dashboard.fixPlan.send.listingConfirm")} sendLabel={t(locale, "dashboard.fixPlan.send.update")} onSend={() => void run()} onCancel={() => setOpen(false)} practice={practice}>
          <ul className="flex flex-col gap-2" data-testid="send-changes">
            {changes.map((c) => (
              <li key={c.key} className="text-[13px]" data-testid="send-change">
                <p className="font-semibold text-ink">{c.label}</p>
                <p className="text-ink-mute line-through decoration-ink-mute/40">{c.before}</p>
                <p className="text-ink">→ {c.after}</p>
              </li>
            ))}
          </ul>
        </Confirm>
      )}
      {result && (
        <p className="text-[13px]" role="status" data-testid="listing-fix-all-result">
          <b className="text-green">{tPlural(locale, "dashboard.fixPlan.send.sent", result.sent, { count: result.sent })}</b>
          {result.failed > 0 && <span className="text-red"> {t(locale, "dashboard.fixPlan.send.failed", { count: result.failed })}</span>}
        </p>
      )}
    </div>
  );
}
