"use client";

// Holiday hours and services on the Google Profile tab (Premium): read what
// Google has now, change one thing, Approve → read back → 7-day undo
// (app/actions/gbpListingFields.ts). With Google writes off for this
// business (not on GOOGLE_WRITES_LIVE_PLACES, not practice mode), the real
// values load and the owner gets the steps to do it on Google instead — never
// a locked form. Practice mode's fake Google never reaches Google.

import { useEffect, useState } from "react";
import { applyHolidayHours, applyServices, openHolidayHours, openServices, undoHolidayHours, undoServices, type FieldActionResult, type OpenHolidayHoursResult, type OpenServicesResult } from "@/app/actions/gbpListingFields";
import { specialFor, timeText, type GTime } from "@/lib/gbpListingFields";
import { formatShortDate, t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.googleTab.fields.${key}` as MessageKey;
const GOOGLE_BUSINESS_URL = "https://business.google.com/";
const btn = "inline-flex h-[30px] items-center rounded-lg border px-3 text-[12.5px] font-semibold disabled:opacity-60";

const dateText = (d: { year: number; month: number; day: number }, locale: Locale) => formatShortDate(`${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "");

function ResultLine({ r, onUndo }: { r: FieldActionResult | null; onUndo?: () => void }) {
  const locale = useLocale();
  if (!r) return null;
  const tone = r.status === "sent" ? "text-green" : r.status === "pending_review" || r.status === "no_change" ? "text-amber" : "text-red";
  const key = r.status === "sent" ? (r.verified ? "result.sent" : "result.unconfirmed") : r.status === "pending_review" ? "result.pending" : r.status === "no_change" ? "result.noChange" : r.status === "editing_off" ? "result.off" : r.status === "invalid" ? "result.invalid" : "result.failed";
  const undo = (r.status === "sent" || r.status === "pending_review") && r.undo;
  return (
    <p role={tone === "text-red" ? "alert" : "status"} data-testid="field-result" className={cn("text-[12.5px]", tone)}>
      {t(locale, K(key))}
      {undo && onUndo && (
        <>
          {" "}
          {t(locale, K("undoUntil"), { date: formatShortDate(undo.undoUntil, locale) })}{" "}
          <button type="button" onClick={onUndo} className="font-semibold text-ink underline underline-offset-2">
            {t(locale, K("undo"))}
          </button>
        </>
      )}
    </p>
  );
}

/** Off the live list: the steps on Google, never a locked form. */
function OnGoogleSteps({ steps }: { steps: string[] }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-1.5 text-[13px]" data-testid="field-guidance">
      <p className="text-ink-soft">{t(locale, K("readOnly"))}</p>
      <ol className="list-decimal space-y-0.5 pl-5">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer" className={cn(btn, "w-fit border-paper-line text-ink")}>
        {t(locale, K("openOnGoogle"))}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------

const parseTime = (v: string): GTime => {
  const [h, m] = v.split(":").map(Number);
  return { hours: h || 0, minutes: m || 0 };
};

export function HolidayHoursEditor({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const [view, setView] = useState<OpenHolidayHoursResult | null>(null);
  const [choice, setChoice] = useState<Record<string, { closed: boolean; open: string; close: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<FieldActionResult | null>(null);
  const load = () => openHolidayHours(businessId).then(setView).catch(() => setView({ status: "error", error: "failed" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);
  if (!view) return <p className="text-[13px] text-ink-soft">{t(locale, K("loading"))}</p>;
  if (view.status !== "ok") return <p className="text-[13px] text-red">{t(locale, K("loadFailed"))}</p>;
  if (view.holidays.length === 0) return <p className="text-[13px] text-ink-soft">{t(locale, K("noHolidays"))}</p>;
  if (!view.canEdit)
    return <OnGoogleSteps steps={[t(locale, K("holiday.step1")), t(locale, K("holiday.step2")), t(locale, K("holiday.step3"), { list: view.holidays.map((h) => `${t(locale, K(`holiday.${h.id}`))} (${dateText(h.date, locale)})`).join(", ") })]} />;
  async function approve(id: string) {
    const c = choice[id] ?? { closed: true, open: "10:00", close: "16:00" };
    setBusy(id);
    const r = await applyHolidayHours(businessId, id, c.closed ? { closed: true } : { closed: false, open: parseTime(c.open), close: parseTime(c.close) }).catch(() => ({ status: "error", error: "failed" }) as FieldActionResult);
    setResult(r);
    setBusy(null);
    void load();
  }
  async function undo() {
    if (!view || view.status !== "ok" || !view.undo) return;
    const r = await undoHolidayHours(businessId, view.undo.batchId).catch(() => ({ status: "error", error: "failed" }) as FieldActionResult);
    setResult(r);
    void load();
  }
  return (
    <div className="flex flex-col gap-2.5" data-testid="holiday-editor">
      {view.practice && <p className="text-[12px] text-amber">{t(locale, K("practice"))}</p>}
      {view.holidays.map((h) => {
        const set = specialFor(view.periods, h.date);
        const c = choice[h.id] ?? { closed: true, open: "10:00", close: "16:00" };
        return (
          <div key={h.id} className="flex flex-wrap items-center gap-2 text-[13px]" data-testid={`holiday-${h.id}`}>
            <b className="min-w-[150px]">
              {t(locale, K(`holiday.${h.id}`))} · {dateText(h.date, locale)}
            </b>
            <span className={cn("text-[12px]", set ? "text-green" : "text-amber")}>
              {set ? (set.closed ? t(locale, K("holiday.isClosed")) : t(locale, K("holiday.isOpen"), { open: timeText(set.openTime, locale), close: timeText(set.closeTime, locale) })) : t(locale, K("holiday.notSet"))}
            </span>
            <select value={c.closed ? "closed" : "open"} onChange={(e) => setChoice({ ...choice, [h.id]: { ...c, closed: e.target.value === "closed" } })} className="rounded-lg border border-paper-line bg-white px-2 py-1 text-[12.5px]">
              <option value="closed">{t(locale, K("holiday.closed"))}</option>
              <option value="open">{t(locale, K("holiday.open"))}</option>
            </select>
            {!c.closed && (
              <>
                <input type="time" value={c.open} onChange={(e) => setChoice({ ...choice, [h.id]: { ...c, open: e.target.value } })} className="rounded-lg border border-paper-line px-2 py-1 text-[12.5px]" aria-label={t(locale, K("holiday.opens"))} />
                <input type="time" value={c.close} onChange={(e) => setChoice({ ...choice, [h.id]: { ...c, close: e.target.value } })} className="rounded-lg border border-paper-line px-2 py-1 text-[12.5px]" aria-label={t(locale, K("holiday.closes"))} />
              </>
            )}
            <button type="button" disabled={busy !== null} onClick={() => approve(h.id)} data-testid={`approve-holiday-${h.id}`} className={cn(btn, "border-ink bg-ink text-paper")}>
              {t(locale, K("approve"))}
            </button>
          </div>
        );
      })}
      <p className="text-[12px] text-ink-mute">{t(locale, K("holiday.keeps"))}</p>
      <ResultLine r={result} onUndo={undo} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ServicesEditor({ businessId, prefill = [] }: { businessId: string; prefill?: string[] }) {
  const locale = useLocale();
  const [view, setView] = useState<OpenServicesResult | null>(null);
  const [entries, setEntries] = useState<Array<{ name: string; description: string }>>(prefill.length ? prefill.map((name) => ({ name, description: "" })) : [{ name: "", description: "" }]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FieldActionResult | null>(null);
  const load = () => openServices(businessId).then(setView).catch(() => setView({ status: "error", error: "failed" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);
  if (!view) return <p className="text-[13px] text-ink-soft">{t(locale, K("loading"))}</p>;
  if (view.status !== "ok") return <p className="text-[13px] text-red">{t(locale, K("loadFailed"))}</p>;
  const wanted = entries.filter((e) => e.name.trim());
  async function approve() {
    setBusy(true);
    const r = await applyServices(businessId, wanted).catch(() => ({ status: "error", error: "failed" }) as FieldActionResult);
    setResult(r);
    setBusy(false);
    if (r.status === "sent" || r.status === "pending_review") setEntries([{ name: "", description: "" }]);
    void load();
  }
  async function undo() {
    if (!view || view.status !== "ok" || !view.undo) return;
    setResult(await undoServices(businessId, view.undo.batchId).catch(() => ({ status: "error", error: "failed" }) as FieldActionResult));
    void load();
  }
  return (
    <div className="flex flex-col gap-2.5" data-testid="services-editor">
      {view.practice && <p className="text-[12px] text-amber">{t(locale, K("practice"))}</p>}
      <p className="text-[12.5px] text-ink-soft">{view.names.length ? t(locale, K("services.now"), { count: view.names.length, list: view.names.join(", ") }) : t(locale, K("services.none"))}</p>
      {!view.canEdit ? (
        <OnGoogleSteps steps={[t(locale, K("services.step1")), t(locale, K("services.step2")), ...(wanted.length ? [t(locale, K("services.step3"), { list: wanted.map((w) => w.name).join(", ") })] : [])]} />
      ) : (
        <>
          {entries.map((e, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input value={e.name} placeholder={t(locale, K("services.name"))} onChange={(ev) => setEntries(entries.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} className="w-56 rounded-lg border border-paper-line px-2.5 py-1.5 text-[13px]" data-testid="service-name" />
              <input value={e.description} placeholder={t(locale, K("services.description"))} onChange={(ev) => setEntries(entries.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)))} className="min-w-0 flex-1 rounded-lg border border-paper-line px-2.5 py-1.5 text-[13px]" />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEntries([...entries, { name: "", description: "" }])} className={cn(btn, "border-paper-line text-ink")}>
              {t(locale, K("services.another"))}
            </button>
            <button type="button" disabled={busy || wanted.length === 0} onClick={approve} data-testid="approve-services" className={cn(btn, "border-ink bg-ink text-paper")}>
              {t(locale, K("services.approve"), { count: wanted.length })}
            </button>
          </div>
          <p className="text-[12px] text-ink-mute">{t(locale, K("services.keeps"))}</p>
        </>
      )}
      <ResultLine r={result} onUndo={undo} />
    </div>
  );
}
