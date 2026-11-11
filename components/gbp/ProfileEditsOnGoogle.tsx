"use client";

// Premium + Google connected (or practice mode): "Edit on Google" on the
// Google Profile tab — Hours, Phone, Description, and the "Order online" /
// "Booking link" card (components/gbp/OrderLinkOnGoogle.tsx). Each shows what Google
// has now (read live), opens an editor, and changes Google only on the
// owner's Approve (Beta): checked first (no overlapping hours, a real US
// number, Google's description rules), then read back — "Updated on
// Google ✓" only when Google shows it, a neutral wait while Google reviews
// it, a clear reason when refused. Each change can be undone for 7 days.
// Read-only (not on the live allow list): Approve and Undo are locked.
// Green for done, neutral or amber while waiting, red only for real failures.

import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconClock, IconFlask, IconLock, IconPlus, IconSparkles, IconX } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import {
  applyProfileEditAction,
  draftProfileDescription,
  openProfileEdits,
  undoProfileEditAction,
  type ApplyProfileEditActionResult,
  type ProfileEditsView,
} from "@/app/actions/gbpProfileEdits";
import {
  closedWeek,
  descriptionProblems,
  formatTime,
  hoursProblems,
  MAX_RANGES_PER_DAY,
  parseTimeInput,
  PROFILE_DESCRIPTION_MAX,
  timeInput,
  usPhone,
  WEEK_ORDER,
  type DayHours,
  type DescriptionProblem,
  type HoursProblem,
  type ProfileField,
  type WeeklyHours,
} from "@/lib/gbpProfileEdits";
import type { ProfileUndo } from "@/lib/gbpProfileEdits.server";
import { formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ApproveButton, LockedButton, TONE } from "@/components/gbp/googleEditBits";
import { OrderLinkOnGoogle } from "@/components/gbp/OrderLinkOnGoogle";

const K = (key: string) => `dashboard.gbpProfileEdits.${key}` as MessageKey;
type Outcome = "accept" | "refuse" | "hold";

/** "Monday" in the owner's language (Google's day numbers: 0 = Sunday). */
export function dayName(day: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + day)));
}

/** One line per day, Monday first: "Monday · 9:00 AM – 6:00 PM". */
export function weekLines(week: WeeklyHours | null, locale: Locale): string[] {
  if (!week) return [];
  return WEEK_ORDER.map((day) => {
    const d = week[day];
    const value =
      d.mode === "closed"
        ? t(locale, K("hours.closed"))
        : d.mode === "open24"
          ? t(locale, K("hours.open24"))
          : d.ranges.map((r) => `${formatTime(r.open, locale)} – ${formatTime(r.close, locale)}${r.close <= r.open && r.close !== 0 ? ` (${t(locale, K("hours.nextDayShort"))})` : ""}`).join(", ");
    return `${dayName(day, locale)} · ${value}`;
  });
}

/** The message after Approve or Undo: the real reason, with its tone. */
export function resultMessage(result: ApplyProfileEditActionResult, locale: Locale, undo = false): { text: string; tone: "done" | "waiting" | "neutral" | "failure" } {
  switch (result.status) {
    case "updated":
      return { text: t(locale, K(undo ? "undone" : "updated")), tone: "done" };
    case "pending_review":
      return { text: t(locale, K("pending")), tone: "waiting" };
    case "unconfirmed":
      return { text: t(locale, K("unconfirmed")), tone: "waiting" };
    case "no_change":
      return { text: t(locale, K("noChange")), tone: "neutral" };
    case "invalid":
      return { text: t(locale, K("error.invalid")), tone: "failure" };
    case "editing_off":
      return { text: t(locale, K("editingOff")), tone: "failure" };
    case "blocked":
      return { text: t(locale, K("error.blocked")), tone: "failure" };
    case "error":
      if (result.error === "rejected") return { text: t(locale, K("error.rejected")), tone: "failure" };
      if (result.error === "not_set_up" || result.error === "not_enabled") return { text: t(locale, K("error.notSetUp")), tone: "failure" };
      if (result.error === "undo_unverified") return { text: t(locale, K("unconfirmed")), tone: "waiting" };
      return { text: t(locale, `dashboard.gbpEdit.error.${result.error}` as MessageKey), tone: "failure" };
  }
}

// ---------------------------------------------------------------------------
// The hours editor
// ---------------------------------------------------------------------------

export function hoursProblemText(p: HoursProblem, locale: Locale): string {
  return `${dayName(p.day, locale)}: ${t(locale, K(`hours.problem.${p.problem}`))}`;
}

function HoursEditor({ value, onChange }: { value: WeeklyHours; onChange: (w: WeeklyHours) => void }) {
  const locale = useLocale();
  const problems = hoursProblems(value);
  const setDay = (day: number, d: DayHours) => onChange(value.map((x, i) => (i === day ? d : x)));
  return (
    <div className="flex flex-col gap-2" data-testid="hours-editor">
      {WEEK_ORDER.map((day) => {
        const d = value[day];
        const dayProblems = problems.filter((p) => p.day === day);
        return (
          <div key={day} className={cn("flex flex-col gap-1.5 rounded-lg border bg-white p-2.5", dayProblems.length ? "border-red/50" : "border-paper-deep")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-[13px] font-semibold text-ink">{dayName(day, locale)}</span>
              <select
                aria-label={dayName(day, locale)}
                value={d.mode}
                onChange={(e) => setDay(day, e.target.value === "open" ? { mode: "open", ranges: d.mode === "open" ? d.ranges : [{ open: 9 * 60, close: 17 * 60 }] } : { mode: e.target.value as "closed" | "open24" })}
                className="rounded-lg border border-paper-deep bg-white px-2 py-1 text-[13px] text-ink focus:border-brass focus:outline-none"
              >
                <option value="open">{t(locale, K("hours.open"))}</option>
                <option value="closed">{t(locale, K("hours.closed"))}</option>
                <option value="open24">{t(locale, K("hours.open24"))}</option>
              </select>
            </div>
            {d.mode === "open" && (
              <div className="flex flex-col gap-1.5 sm:pl-[104px]">
                {d.ranges.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink">
                    <input
                      type="time"
                      aria-label={`${dayName(day, locale)} — ${t(locale, K("hours.opens"))}`}
                      value={timeInput(r.open)}
                      onChange={(e) => {
                        const open = parseTimeInput(e.target.value);
                        if (open !== null) setDay(day, { mode: "open", ranges: d.ranges.map((x, j) => (j === i ? { ...x, open } : x)) });
                      }}
                      className="rounded-lg border border-paper-deep px-2 py-1"
                    />
                    <span aria-hidden>–</span>
                    <input
                      type="time"
                      aria-label={`${dayName(day, locale)} — ${t(locale, K("hours.closes"))}`}
                      value={timeInput(r.close)}
                      onChange={(e) => {
                        const close = parseTimeInput(e.target.value);
                        if (close !== null) setDay(day, { mode: "open", ranges: d.ranges.map((x, j) => (j === i ? { ...x, close } : x)) });
                      }}
                      className="rounded-lg border border-paper-deep px-2 py-1"
                    />
                    {r.close <= r.open && r.close !== r.open && <span className="text-[12px] text-ink-soft">{t(locale, K(r.close === 0 ? "hours.midnight" : "hours.nextDay"))}</span>}
                    {d.ranges.length > 1 && (
                      <button type="button" onClick={() => setDay(day, { mode: "open", ranges: d.ranges.filter((_, j) => j !== i) })} className="inline-flex items-center gap-0.5 text-[12px] font-medium text-ink-soft hover:text-ink">
                        <IconX size={12} aria-hidden />
                        {t(locale, K("hours.remove"))}
                      </button>
                    )}
                  </div>
                ))}
                {d.ranges.length < MAX_RANGES_PER_DAY && (
                  <button
                    type="button"
                    onClick={() => {
                      const last = d.ranges[d.ranges.length - 1];
                      const start = last ? Math.min(last.close + 60, 23 * 60) : 9 * 60;
                      setDay(day, { mode: "open", ranges: [...d.ranges, { open: start, close: Math.min(start + 120, 23 * 60 + 59) }] });
                    }}
                    className="inline-flex w-fit items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink"
                  >
                    <IconPlus size={13} aria-hidden />
                    {t(locale, K("hours.addRange"))}
                  </button>
                )}
              </div>
            )}
            {dayProblems.map((p, i) => (
              <p key={i} role="alert" className="text-[12.5px] text-red sm:pl-[104px]">
                {t(locale, K(`hours.problem.${p.problem}`))}
              </p>
            ))}
          </div>
        );
      })}
      <p className="text-[12px] text-ink-mute">{t(locale, K("hours.special"))}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One field
// ---------------------------------------------------------------------------

type FieldState = { kind: "idle" } | { kind: "editing" } | { kind: "busy"; what: "approve" | "undo" } | { kind: "confirm_undo" };

function FieldCard({
  businessId,
  field,
  view,
  outcome,
  onView,
}: {
  businessId: string;
  field: ProfileField;
  view: ProfileEditsView;
  outcome: Outcome;
  onView: (patch: Partial<ProfileEditsView>) => void;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [state, setState] = useState<FieldState>({ kind: "idle" });
  const [message, setMessage] = useState<ReturnType<typeof resultMessage> | null>(null);
  const [hours, setHours] = useState<WeeklyHours>(view.hours ?? closedWeek());
  const [phone, setPhone] = useState(view.phone ?? "");
  const [description, setDescription] = useState(view.description ?? "");
  const [drafting, setDrafting] = useState(false);
  const undo: ProfileUndo | undefined = view.undo[field];
  const pendingNow = view.pending.includes(field);

  const problems = useMemo<{ hours: HoursProblem[]; phone: boolean; description: DescriptionProblem[] }>(
    () => ({ hours: hoursProblems(hours), phone: usPhone(phone) === null, description: descriptionProblems(description) }),
    [hours, phone, description]
  );
  const invalid = field === "hours" ? problems.hours.length > 0 : field === "phone" ? problems.phone : problems.description.length > 0;

  function startEditing() {
    setMessage(null);
    setHours(view.hours ?? closedWeek());
    setPhone(view.phone ?? "");
    setDescription(view.description ?? "");
    setState({ kind: "editing" });
  }

  function applyResult(result: ApplyProfileEditActionResult, isUndo: boolean) {
    setMessage(resultMessage(result, locale, isUndo));
    if (result.status === "updated") {
      onView({ [field]: result.value.value, undo: { ...view.undo, [field]: result.undo ?? undefined }, pending: view.pending.filter((f) => f !== field) } as Partial<ProfileEditsView>);
      setState({ kind: "idle" });
    } else if (result.status === "pending_review" || result.status === "unconfirmed") {
      onView({ undo: { ...view.undo, [field]: result.undo ?? undefined }, pending: result.status === "pending_review" ? Array.from(new Set([...view.pending, field])) : view.pending });
      setState({ kind: "idle" });
    } else if (result.status === "no_change") {
      setState({ kind: "idle" });
    } else {
      // Refused or blocked: nothing changed, and the owner's edit stays open.
      setState(isUndo ? { kind: "idle" } : { kind: "editing" });
    }
  }

  async function approve() {
    setState({ kind: "busy", what: "approve" });
    setMessage(null);
    const value = field === "hours" ? hours : field === "phone" ? usPhone(phone) : description;
    const result = await applyProfileEditAction(businessId, field, value, view.practice ? outcome : null).catch(() => ({ status: "error", error: "failed" }) as const);
    applyResult(result, false);
  }

  async function runUndo() {
    if (!undo) return;
    setState({ kind: "busy", what: "undo" });
    setMessage(null);
    const result = await undoProfileEditAction(businessId, field, undo.batchId, view.practice ? outcome : null).catch(() => ({ status: "error", error: "failed" }) as const);
    applyResult(result, true);
    if (result.status === "updated" || result.status === "pending_review" || result.status === "unconfirmed") onView({ undo: { ...view.undo, [field]: undefined } });
  }

  async function draft() {
    setDrafting(true);
    setMessage(null);
    const result = await draftProfileDescription(businessId).catch(() => ({ status: "unavailable" }) as const);
    setDrafting(false);
    if (result.status === "ok") setDescription(result.text.slice(0, PROFILE_DESCRIPTION_MAX));
    else setMessage({ text: t(locale, K(result.status === "rules" ? "description.draftRules" : "description.draftUnavailable")), tone: "failure" });
  }

  const current =
    field === "hours" ? weekLines(view.hours, locale) : field === "phone" ? (view.phone ? [view.phone] : []) : view.description ? [view.description] : [];
  const editing = state.kind === "editing" || (state.kind === "busy" && state.what === "approve");

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5" data-testid={`edit-${field}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{t(locale, K(`field.${field}`))}</h3>
        {state.kind === "idle" && (
          <button type="button" data-testid={`edit-${field}-open`} onClick={startEditing} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft">
            {t(locale, K("edit"))}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t(locale, K("nowOnGoogle"))}</span>
        {current.length === 0 ? (
          <p className="text-[13.5px] text-ink-mute">{t(locale, K("notSet"))}</p>
        ) : (
          <ul className="flex flex-col gap-0.5 whitespace-pre-line text-[13.5px] leading-snug text-ink">
            {current.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      {pendingNow && state.kind !== "editing" && (
        <p data-testid={`pending-${field}`} role="status" className={cn("flex items-center gap-1.5 text-[13px]", TONE.waiting)}>
          <IconClock size={14} aria-hidden className="shrink-0" />
          {t(locale, K("pending"))}
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-3 rounded-xl border border-paper-deep bg-paper p-3">
          {field === "hours" && (
            <>
              {view.fromWebsite.hours && (
                <WebsiteOffer text={t(locale, K("websiteHint.hours"))} button={t(locale, K("useWebsite.hours"))} onUse={() => setHours(view.fromWebsite.hours!)} testId="use-website-hours" />
              )}
              <HoursEditor value={hours} onChange={setHours} />
            </>
          )}
          {field === "phone" && (
            <>
              {view.fromWebsite.phone && (
                <WebsiteOffer text={t(locale, K("websiteHint.phone"), { phone: view.fromWebsite.phone })} button={t(locale, K("useWebsite.phone"))} onUse={() => setPhone(view.fromWebsite.phone!)} testId="use-website-phone" />
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[12.5px] font-semibold text-ink">{t(locale, K("phone.label"))}</span>
                <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full max-w-xs rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink focus:border-brass focus:outline-none" />
              </label>
              {phone.trim() !== "" && problems.phone && <p role="alert" className="text-[12.5px] text-red">{t(locale, K("phone.invalid"))}</p>}
              <p data-testid="phone-warning" className={cn("text-[12.5px]", TONE.waiting)}>
                {t(locale, K("phone.warning"))}
              </p>
            </>
          )}
          {field === "description" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[12.5px] font-semibold text-ink">
                  {t(locale, K("description.label"))}
                  <span data-testid="description-counter" className={cn("tabular-nums font-medium", description.length > PROFILE_DESCRIPTION_MAX ? "text-red" : "text-ink-soft")}>
                    {t(locale, K("description.counter"), { count: description.length, max: PROFILE_DESCRIPTION_MAX })}
                  </span>
                </span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} className="w-full resize-y rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink focus:border-brass focus:outline-none" />
              </label>
              <button type="button" data-testid="draft-description" disabled={drafting} onClick={draft} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brass bg-brass px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-[#a5772a] disabled:opacity-60">
                <IconSparkles size={14} aria-hidden />
                {drafting ? t(locale, K("description.drafting")) : t(locale, K("description.draft"))}
              </button>
              {description.trim() !== "" &&
                problems.description.map((p) => (
                  <p key={p} role="alert" className="text-[12.5px] text-red">
                    {t(locale, K(`description.problem.${p}`))}
                  </p>
                ))}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <ApproveButton canEdit={view.canEdit} busy={state.kind === "busy"} disabled={invalid} onClick={approve} testId={`approve-${field}`} />
            <button type="button" disabled={state.kind === "busy"} onClick={() => setState({ kind: "idle" })} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink">
              {t(locale, K("cancel"))}
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && (
          <p data-testid={`message-${field}`} role={message.tone === "failure" ? "alert" : "status"} className={cn("flex items-center gap-1.5 text-[13px]", TONE[message.tone])}>
            {message.tone === "done" && <IconCheck size={14} aria-hidden />}
            {message.text}
          </p>
        )}
        {undo && state.kind !== "editing" && (
          <div className="flex flex-col gap-1.5">
            {state.kind === "confirm_undo" ? (
              <div role="alertdialog" className="flex flex-wrap items-center gap-2 rounded-lg border border-paper-deep bg-white p-2.5 text-[13px] text-ink">
                <span>{t(locale, K("undoConfirm"), { field: t(locale, K(`fieldLower.${field}`)) })}</span>
                {view.canEdit ? (
                  <button type="button" data-testid={`undo-${field}-yes`} onClick={runUndo} className="rounded-lg border border-ink bg-ink px-3 py-1 text-[13px] font-semibold text-paper">
                    {t(locale, K("undoYes"))}
                  </button>
                ) : (
                  <LockedButton label={t(locale, K("undoYes"))} testId={`undo-${field}-yes`} />
                )}
                <button type="button" onClick={() => setState({ kind: "idle" })} className="rounded-lg border border-paper-deep bg-white px-3 py-1 text-[13px] font-medium text-ink">
                  {t(locale, K("cancel"))}
                </button>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-soft">
                {t(locale, K("undoUntil"), { date: formatShortDate(undo.undoUntil, locale, timeZone) })}{" "}
                <button type="button" data-testid={`undo-${field}`} disabled={state.kind === "busy"} onClick={() => setState({ kind: "confirm_undo" })} className="font-semibold text-ink underline underline-offset-2">
                  {t(locale, K("undo"))}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function WebsiteOffer({ text, button, onUse, testId }: { text: string; button: string; onUse: () => void; testId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-paper-deep bg-white px-3 py-2 text-[13px] text-ink">
      <span>{text}</span>
      <button type="button" data-testid={testId} onClick={onUse} className="rounded-lg border border-paper-deep bg-white px-2.5 py-1 text-[12.5px] font-semibold text-ink hover:border-ink-soft">
        {button}
      </button>
    </div>
  );
}

/** The section once loaded — exported so tests can render it with a view. */
export function ProfileEditsBody({ businessId, initial }: { businessId: string; initial: ProfileEditsView }) {
  const locale = useLocale();
  const [view, setView] = useState(initial);
  const [outcome, setOutcome] = useState<Outcome>("accept");
  return (
    <div className="flex flex-col gap-3">
      {view.practice && (
        <div data-testid="profile-practice-banner" role="status" className="flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-amber)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] px-3 py-2.5 text-[13px] text-ink">
          <p className="flex items-center gap-2 font-semibold">
            <IconFlask size={16} aria-hidden />
            {t(locale, K("practiceBanner"))}
          </p>
          <label className="flex flex-wrap items-center gap-2 text-ink-soft">
            {t(locale, K("practiceBody"))}
            <select data-testid="practice-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} className="rounded-lg border border-paper-deep bg-white px-2 py-1 text-[13px] text-ink">
              {(["accept", "refuse", "hold"] as Outcome[]).map((o) => (
                <option key={o} value={o}>
                  {t(locale, K(`practiceOutcome.${o}`))}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!view.practice && !view.canEdit && (
        <p data-testid="profile-read-only" className="flex items-start gap-2 rounded-lg border border-paper-deep bg-paper px-3 py-2 text-[13px] leading-snug text-ink">
          <IconLock size={15} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
          {t(locale, K("readOnly"))}
        </p>
      )}
      {(["hours", "phone", "description"] as ProfileField[]).map((field) => (
        <FieldCard key={field} businessId={businessId} field={field} view={view} outcome={outcome} onView={(patch) => setView((v) => ({ ...v, ...patch }))} />
      ))}
      <OrderLinkOnGoogle businessId={businessId} outcome={outcome} />
      <p className="text-[12px] text-ink-mute">{t(locale, K("afterScan"))}</p>
    </div>
  );
}

export function ProfileEditsOnGoogle({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const [view, setView] = useState<ProfileEditsView | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  useEffect(() => {
    void (async () => {
      const result = await openProfileEdits(businessId).catch(() => ({ status: "error", error: "failed" }) as const);
      if (result.status === "ok") setView(result);
      else setError(result.status === "blocked" ? K("error.blocked") : result.status === "error" && result.error === "reconnect" ? "dashboard.gbpEdit.error.reconnect" : K("loadFailed"));
    })();
  }, [businessId]);

  return (
    <section id="edit-on-google" data-testid="profile-edits" className="flex scroll-mt-20 flex-col gap-3">
      <p className="text-[13px] leading-snug text-ink-soft">{t(locale, K("intro"))}</p>
      {view ? (
        <ProfileEditsBody businessId={businessId} initial={view} />
      ) : error ? (
        <p role="alert" className="text-[13px] text-red">
          {t(locale, error)}
        </p>
      ) : (
        <p className="text-[13px] text-ink-soft">{t(locale, K("loading"))}</p>
      )}
    </section>
  );
}
